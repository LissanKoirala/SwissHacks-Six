"""Build the in-memory world from seed sources (CLAUDE.md §6 seed-first).

Wires the xlsx + fixture adapters through the one normalisation point (Record) into the three
graphs. Live feeds (SIX/Event Registry/Phoeniqs) layer on top only when USE_LIVE=1."""
from __future__ import annotations

import json

from concurrent.futures import ThreadPoolExecutor

from .config import DATA_DIR, WORKBOOK_DIR, settings
from .agents.classifier import label_cio, to_fundamentals, to_news_item
from .agents.profile_builder import build_profile
from .graph.store import World
from .ingestion.crm_xlsx import CRMWorkbookSource
from .ingestion.fundamentals import FundamentalsFixtureSource
from .ingestion.macro import MacroFixtureSource, MacroLiveSource
from .ingestion.market_signals import (
    AnalystFixtureSource,
    EarningsFixtureSource,
    ESGFixtureSource,
    FMPSignalLiveSource,
)
from .ingestion.news import EventRegistrySource, NewsFixtureSource
from .ingestion.portfolio_xlsx import PortfolioWorkbookSource
from .ingestion.sec_edgar import SecFilingFixtureSource, SecFilingLiveSource
from .ingestion.six_mcp import enrich_listing
from .models import (
    CashFlow,
    Holding,
    Mandate,
    MandateTarget,
    MeetingLogEntry,
    PortfolioTransaction,
    Provenance,
)


def _load_json(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text())


def build_world(use_live_news: bool = False) -> World:
    world = World()
    seeds = _load_json("persona_seeds.json")
    labels = _load_json("stock_labels.json").get("labels", {})

    sheet_to_client = {c["crm_sheet"]: c["client_id"] for c in seeds["clients"]}
    for c in seeds["clients"]:
        world.clients[c["client_id"]] = {
            "name": c["name"], "mandate": c["mandate"], "portfolio": c["portfolio"],
            "style": c.get("style", ""), "headline": c.get("headline", ""),
        }

    # --- CRM graph: meeting logs ---
    crm = CRMWorkbookSource(WORKBOOK_DIR / "SwissHacks CRM.xlsx", sheet_to_client)
    for rec in crm.fetch():
        p = rec.payload
        cid = p["client_id"]
        world.meeting_logs.setdefault(cid, []).append(MeetingLogEntry(
            id=rec.source_id, client_id=cid, timestamp=p["timestamp"], modality=p["modality"],
            contact=p["contact"], rm_name=p.get("rm_name"), note=p["note"],
            source=Provenance(source_type="crm_log", source_id=rec.source_id,
                              excerpt=rec.excerpt, timestamp=p["timestamp"]),
        ))

    # --- Portfolio graph: holdings, CIO universe, mandates ---
    pf = PortfolioWorkbookSource(WORKBOOK_DIR / "SwissHacks Portfolio Construction.xlsx")
    mandate_targets: dict[str, list[MandateTarget]] = {}
    for rec in pf.fetch():
        if rec.kind == "holding":
            p = rec.payload
            h = Holding(**p)
            # Carry the Sample Portfolio row's provenance onto the holding so the quantitative
            # surfaces (value, drift) are cited, not just the narrative ones (Trust, §7.5).
            h.provenance = Provenance(source_type="portfolio", source_id=rec.source_id,
                                      excerpt=rec.excerpt, timestamp=None)
            world.holdings.setdefault(p["portfolio"], []).append(h)
        elif rec.kind == "cio":
            stock = label_cio(rec, labels)
            world.cio.append(stock)
            world.cio_by_isin[stock.isin] = stock
        elif rec.kind == "mandate":
            p = rec.payload
            mandate_targets.setdefault(p["strategy"], []).append(MandateTarget(
                asset_class=p["asset_class"], sub_asset_class=p["sub_asset_class"],
                benchmark=p.get("benchmark"), target_pct=p["target_pct"], target_chf=p["target_chf"],
                provenance=Provenance(source_type="mandate", source_id=rec.source_id,
                                      excerpt=rec.excerpt),
            ))
        elif rec.kind == "transaction":
            p = rec.payload
            world.transactions.setdefault(p["portfolio"], []).append(PortfolioTransaction(
                provenance=Provenance(source_type="portfolio", source_id=rec.source_id,
                                      excerpt=rec.excerpt, timestamp=p.get("timestamp")),
                **p,
            ))
        elif rec.kind == "cash_flow":
            p = rec.payload
            world.cash_flows.setdefault(p["portfolio"], []).append(CashFlow(
                provenance=Provenance(source_type="portfolio", source_id=rec.source_id,
                                      excerpt=rec.excerpt, timestamp=p.get("timestamp")),
                **p,
            ))

    _finalise_mandates(world, mandate_targets)
    # Label every held name with its CIO-deviation status (BUY/HOLD/SELL/OFF_LIST/CASH) now that
    # the CIO universe is fully indexed — drives the standing deviation audit (Portfolio Agent).
    for hs in world.holdings.values():
        for h in hs:
            h.cio_status, h.cio_rating = world.cio_status_of(h)
    _enrich_holdings_live(world)

    # --- News graph: classify once ---
    # News + the additional free event-signal feeds (SEC filings, ESG, earnings, analyst, macro)
    # all flow through ONE pipeline (CLAUDE.md §6): each is classified once and matched the same
    # way; only provenance.source_type / signal_type records where it came from.
    news_recs = NewsFixtureSource(DATA_DIR / "news_fixtures.json").fetch()
    news_recs += SecFilingFixtureSource().fetch()
    news_recs += ESGFixtureSource().fetch()
    news_recs += EarningsFixtureSource().fetch()
    news_recs += AnalystFixtureSource().fetch()
    news_recs += MacroFixtureSource().fetch()      # market_digest → dialogue only (§2/#10)
    if use_live_news:
        for kw in ("palm oil deforestation", "Parkinson research", "labour supply chain", "AI infrastructure"):
            news_recs += EventRegistrySource(kw).fetch()
    if settings.sec_enabled:
        news_recs += SecFilingLiveSource().fetch()
    if settings.fmp_enabled:
        news_recs += FMPSignalLiveSource().fetch()
    if settings.macro_enabled:
        news_recs += MacroLiveSource().fetch()
    world.news = [to_news_item(r) for r in news_recs]

    # --- Issuer reference data: fundamentals + dividends + insider (context, never matched) ---
    for rec in FundamentalsFixtureSource().fetch():
        f = to_fundamentals(rec)
        world.fundamentals_by_isin[f.isin] = f

    # Risk metrics for risk-matched substitution (HI1): sector model offline, joined to
    # fundamentals where present; any live SIX values already set are preserved.
    _label_risk(world)

    # --- Profiles + meta graph (interest edges) ---
    for c in seeds["clients"]:
        cid = c["client_id"]
        profile = build_profile(c, world.meeting_logs.get(cid, []))
        world.profiles[cid] = profile
        world.interest_by_client[cid] = profile.interest_edges

    # --- RM Capture: replay persisted captures so they survive a restart ---
    # Non-persisting apply (no double-write); guarded so a bad file never crashes boot.
    try:
        from .agents.capture import replay_captures
        replay_captures(world)
    except Exception:
        pass

    return world


def _enrich_holdings_live(world: World) -> None:
    """Layer live SIX prices + symbology onto holdings (A+C), opt-in via USE_LIVE=1.

    Additive only: mutates the new live_* / identifier fields, never current_chf — the
    deterministic drift/valuation engine is untouched. Runs in parallel and is disk-cached
    (incl. negative results), so the one-time warm-up only ever happens once per listing.
    No-op (instant) when SIX is disabled, so the offline demo path is unaffected."""
    if not settings.six_enabled:
        return
    holdings = [h for hs in world.holdings.values() for h in hs]

    # De-dupe by listing so the same name across mandates is fetched once (the disk cache
    # would make repeats cheap anyway, but this also cuts cold-start network round-trips).
    by_listing: dict[tuple, list[Holding]] = {}
    for h in holdings:
        by_listing.setdefault((h.valor, h.mic), []).append(h)

    def _fetch(key: tuple) -> tuple:
        try:
            return key, enrich_listing(key[0], key[1])
        except Exception:
            return key, {}  # best-effort; never break the deterministic world

    # Modest concurrency: the SIX endpoint rate-limits bursts into empty responses, so a
    # smaller pool is both faster (fewer wasted retries) and more complete than a big one.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for key, fields in pool.map(_fetch, by_listing):
            for h in by_listing[key]:
                for k, v in fields.items():
                    setattr(h, k, v)


def _label_risk(world: World) -> None:
    """Attach risk metrics (hist_vol_30d, beta) + fundamentals (pe, div, mcap) to every CIO name
    and held name, for risk-matched substitution (HI1). The sector model fills what live SIX did
    not; values already populated (e.g. by a live SIX call) are left untouched."""
    from .risk import MODEL_LABEL, model_risk

    def apply(obj, isin: str, industry_group) -> None:
        if obj.hist_vol_30d is None:
            obj.hist_vol_30d, obj.beta = model_risk(industry_group, isin)
            obj.risk_source = MODEL_LABEL
        f = world.fundamentals_by_isin.get(isin)
        if f:
            if obj.pe_ratio is None:
                obj.pe_ratio = f.pe_ratio
            if obj.dividend_yield is None:
                obj.dividend_yield = f.dividend_yield
            if obj.market_cap is None:
                obj.market_cap = f.market_cap

    for c in world.cio:
        apply(c, c.isin, c.industry_group)
    for hs in world.holdings.values():
        for h in hs:
            if (h.isin or "").lower().startswith("cash"):
                continue
            apply(h, h.isin, h.industry_group)


def _finalise_mandates(world: World, mandate_targets: dict) -> None:
    for strat, targets in mandate_targets.items():
        holdings = world.holdings.get(strat, [])
        total = sum(h.current_chf for h in holdings) or 1.0
        by_sac: dict[str, float] = {}
        for h in holdings:
            by_sac[h.sub_asset_class] = by_sac.get(h.sub_asset_class, 0.0) + h.current_chf
        for t in targets:
            cur = by_sac.get(t.sub_asset_class, 0.0)
            t.current_chf = round(cur, 2)
            t.current_pct = round(cur / total * 100, 3)
            t.drift_pp = round(t.current_pct - t.target_pct, 3)
            t.breach = abs(t.drift_pp) > 2.0
        world.mandates[strat] = Mandate(name=strat, total_chf=round(total, 2), targets=targets)
