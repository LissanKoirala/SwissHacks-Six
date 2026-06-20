"""Build the in-memory world from seed sources (CLAUDE.md §6 seed-first).

Wires the xlsx + fixture adapters through the one normalisation point (Record) into the three
graphs. Live feeds (SIX/Event Registry/Phoeniqs) layer on top only when USE_LIVE=1."""
from __future__ import annotations

import json

from .config import DATA_DIR, WORKBOOK_DIR
from .agents.classifier import label_cio, to_news_item
from .agents.profile_builder import build_profile
from .graph.store import World
from .ingestion.crm_xlsx import CRMWorkbookSource
from .ingestion.news import EventRegistrySource, NewsFixtureSource
from .ingestion.portfolio_xlsx import PortfolioWorkbookSource
from .models import Holding, Mandate, MandateTarget, MeetingLogEntry, Provenance


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
            world.holdings.setdefault(p["portfolio"], []).append(Holding(**p))
        elif rec.kind == "cio":
            stock = label_cio(rec, labels)
            world.cio.append(stock)
            world.cio_by_isin[stock.isin] = stock
        elif rec.kind == "mandate":
            p = rec.payload
            mandate_targets.setdefault(p["strategy"], []).append(MandateTarget(
                asset_class=p["asset_class"], sub_asset_class=p["sub_asset_class"],
                benchmark=p.get("benchmark"), target_pct=p["target_pct"], target_chf=p["target_chf"],
            ))

    _finalise_mandates(world, mandate_targets)

    # --- News graph: classify once ---
    news_recs = NewsFixtureSource(DATA_DIR / "news_fixtures.json").fetch()
    if use_live_news:
        for kw in ("palm oil deforestation", "Parkinson research", "labour supply chain", "AI infrastructure"):
            news_recs += EventRegistrySource(kw).fetch()
    world.news = [to_news_item(r) for r in news_recs]

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
