"""Advisory agent (CLAUDE.md §1/§8.D). Produces the two outputs for the RM, strictly inside the
rails: (1) a STRATEGY proposal — same-sector, CIO-approved, sentiment-screened swaps; (2) a
DIALOGUE suggestion — style-matched talking points + a ready draft, with light general-market
context. Strong model only here, lazily; deterministic fallback keeps it offline-testable (§9).

The rails are COMPUTED, not asserted: same_sector and drift_safe are derived from the actual
sectors and mandate targets, so the golden-rule guarantees (§2) have teeth."""
from __future__ import annotations

from typing import Optional

from ..graph.store import World
from ..models import (
    CIOStock,
    DialogueSuggestion,
    GoodNewsBriefing,
    Holding,
    Match,
    Provenance,
    Statement,
    StrategyProposal,
    SubstitutionMetrics,
    SwapProposal,
)
from ..topics import topic_label
from ..ingestion.six_mcp import live_quote
from . import llm


def _buy_quote(valor: Optional[str], mic: Optional[str]) -> dict:
    """Live SIX price of a BUY candidate, as SwapProposal kwargs (B). Empty when off/unavailable."""
    q = live_quote(valor, mic)
    if not q.get("price"):
        return {}
    return {"buy_live_price": q["price"], "buy_live_ccy": q.get("currency"),
            "buy_live_ts": q.get("timestamp")}

# Topic -> (value tags we want in a swap target, tags that disqualify, fallback sector)
TOPIC_PREFERENCES = {
    "neuro-research": (["neuro-research-commitment"], ["neuro-research-retreat"], "Health Care"),
    "esg-deforestation": (["deforestation-leader", "reforestation-commitment"], [], "Consumer Staples"),
    "labour-governance": (["clean-governance", "supply-chain-transparency"],
                          ["labour-risk", "supply-chain-governance-risk"], "Consumer Discretionary"),
    "us-tech-ai": (["tangible-hardware", "ai-infrastructure"],
                   ["ai-hype-risk", "us-mega-cap-software"], "Information Technology"),
}


def _topic_labels(match: Match) -> str:
    return ", ".join(dict.fromkeys(topic_label(t.topic) for t in match.shared_topics))


def _prefs_for_match(match: Match):
    desired: list[str] = []
    avoid: list[str] = []
    sector = None
    for tm in match.shared_topics:
        d, a, s = TOPIC_PREFERENCES.get(tm.topic, ([], [], None))
        desired += d
        avoid += a
        sector = sector or s
    return list(dict.fromkeys(desired)), list(dict.fromkeys(avoid)), sector


def _drift_after_swap(world: World, client_id: str, sell_sac: Optional[str],
                      buy_sac: Optional[str], amount: float) -> "tuple[bool, list[str]]":
    """Compute the post-swap mandate drift for the affected sub-asset-class sleeves (#3).
    Value-neutral swap: -amount from the sold sleeve, +amount into the bought sleeve."""
    mand = world.mandates.get(world.portfolio_of(client_id))
    if amount <= 0 or not mand:
        return True, ["Drift-neutral (no net value change to any sleeve)."]
    if sell_sac and sell_sac == buy_sac:
        return True, [f"Same sub-asset-class ({sell_sac}) — drift-neutral within the ±2.0pp band."]
    total = mand.total_chf or 1.0
    by = {t.sub_asset_class: t for t in mand.targets}
    ok = True
    notes: list[str] = []
    for sac, delta in ((sell_sac, -amount), (buy_sac, +amount)):
        if not sac:
            continue
        t = by.get(sac)
        if not t:
            ok = False
            notes.append(f"{sac}: sleeve target not found — verify drift with the RM.")
            continue
        new_drift = (t.current_chf + delta) / total * 100 - t.target_pct
        within = abs(new_drift) <= 2.0
        ok = ok and within
        notes.append(f"{sac}: post-swap drift {new_drift:+.2f}pp "
                     f"({'within' if within else 'BREACHES'} the ±2.0pp band).")
    return ok, notes


def select_swap_candidate(
    world: World, client_id: str, industry_group: str,
    desired: list[str], avoid: list[str], exclude_isin: Optional[str],
    same_sub_asset_class: Optional[str], target_vol: Optional[float] = None,
    also_exclude: Optional[set] = None, target_mcap: Optional[float] = None,
) -> Optional[CIOStock]:
    import math

    held = world.held_isins(client_id)
    blocked = {exclude_isin} | (also_exclude or set())
    candidates = [c for c in world.cio_by_industry(industry_group, "BUY") if c.isin not in blocked]
    if not candidates:
        return None

    def score(c: CIOStock) -> float:
        s = 0.0
        tags = set(c.value_tags)
        s += 2.0 * len(tags & set(desired))
        s -= 4.0 * len(tags & set(avoid))
        if same_sub_asset_class and c.sub_asset_class == same_sub_asset_class:
            s += 1.5
        if c.sentiment:
            s += c.sentiment.score
        # Risk-matched substitution (HI2 / Ammann 'at similar risk'): prefer the BUY name whose
        # volatility is closest to the name being sold, so the swap keeps the risk profile.
        if target_vol is not None and c.hist_vol_30d is not None:
            s -= 2.0 * abs(c.hist_vol_30d - target_vol)
        # Sub-sector/scale proximity tie-breaker: when the sold name's size is known, gently prefer
        # a replacement of comparable market cap so the swap reads as a like-for-like peer (a
        # mid-cap goes to a mid-cap), not a jump across the sector. Small weight — breaks ties,
        # never overrides the values/risk fit above.
        if target_mcap and c.market_cap:
            s -= 0.4 * abs(math.log10(c.market_cap) - math.log10(target_mcap))
        if c.isin in held:
            s += 0.25
        return s

    candidates.sort(key=score, reverse=True)
    best = candidates[0]
    if set(best.value_tags) & set(avoid):  # never swap into a disqualified name
        return None
    return best


def _buy_sleeve_drift_after(world: World, client_id: str, sell_sac: Optional[str],
                            buy_sac: Optional[str], amount: float) -> Optional[float]:
    """Post-swap drift (pp) of the BUY sleeve — 0-delta when the swap is within the same sleeve."""
    mand = world.mandates.get(world.portfolio_of(client_id))
    if not mand or not buy_sac:
        return None
    total = mand.total_chf or 1.0
    t = next((x for x in mand.targets if x.sub_asset_class == buy_sac), None)
    if not t:
        return None
    delta = amount if sell_sac != buy_sac else 0.0
    return round((t.current_chf + delta) / total * 100 - t.target_pct, 3)


def _substitution_metrics(world: World, client_id: str, sold: Holding, cand: CIOStock,
                          amount: float) -> SubstitutionMetrics:
    """Build the side-by-side sold-vs-replacement comparison (HI2)."""
    sell_cio = world.cio_by_isin.get(sold.isin)
    sent_sell = sell_cio.sentiment.score if (sell_cio and sell_cio.sentiment) else None
    sent_buy = cand.sentiment.score if cand.sentiment else None
    vol_sell, vol_buy = sold.hist_vol_30d, cand.hist_vol_30d
    # Cite every side of the comparison: the sold name's portfolio row, the bought name's CIO row,
    # and the risk source — so each metric in the side-by-side is clickable (Trust, §2/§7.5).
    sub_prov: list[Provenance] = []
    if sold.provenance:
        sub_prov.append(sold.provenance)
    sub_prov.append(cand.provenance)
    rsrc = cand.risk_source or sold.risk_source
    if rsrc:
        sub_prov.append(Provenance(
            source_type="fundamentals", source_id=f"risk:{cand.isin}",
            excerpt=f"Volatility/beta for the substitution comparison sourced from {rsrc}.",
        ))
    return SubstitutionMetrics(
        sell_issuer=sold.issuer, buy_issuer=cand.issuer,
        vol_sell=vol_sell, vol_buy=vol_buy,
        vol_delta=(round(vol_buy - vol_sell, 4) if vol_sell is not None and vol_buy is not None else None),
        beta_sell=sold.beta, beta_buy=cand.beta,
        pe_sell=sold.pe_ratio, pe_buy=cand.pe_ratio,
        sentiment_sell=sent_sell, sentiment_buy=sent_buy,
        sentiment_delta=(round(sent_buy - sent_sell, 3)
                         if sent_sell is not None and sent_buy is not None else None),
        sector_match=bool(sold.industry_group) and cand.industry_group == sold.industry_group,
        sub_asset_class_match=(sold.sub_asset_class == cand.sub_asset_class),
        drift_pp_after=_buy_sleeve_drift_after(world, client_id, sold.sub_asset_class,
                                               cand.sub_asset_class, amount),
        value_tags_sell=list(sell_cio.value_tags) if sell_cio else [],
        value_tags_buy=list(cand.value_tags),
        risk_source=rsrc,
        provenance=sub_prov,
    )


def _find_laggard(world: World, client_id: str, industry_group: Optional[str],
                  sub_asset_class: Optional[str], exclude_isin: str) -> Optional[Holding]:
    """A held, same-sector, same-sleeve name with no aligned leadership signal — the source of
    funds for rewarding a leader without growing the sleeve (#4, drift-neutral)."""
    best = None
    best_sent = 999.0
    for h in world.holdings_for_client(client_id):
        if h.isin == exclude_isin or h.industry_group != industry_group:
            continue
        if sub_asset_class and h.sub_asset_class != sub_asset_class:
            continue
        cio = world.cio_by_isin.get(h.isin)
        sent = cio.sentiment.score if (cio and cio.sentiment) else 0.0
        tags = set(cio.value_tags) if cio else set()
        if {"deforestation-leader", "reforestation-commitment", "neuro-research-commitment"} & tags:
            continue  # don't trim another leader
        if sent < best_sent:
            best_sent = sent
            best = h
    return best


def _size_overweight(world: World, client_id: str, buy_sac: Optional[str],
                     position_chf: float) -> "tuple[float, Optional[str]]":
    """Largest drift-safe overweight of `buy_sac` fundable by deploying idle cash, capped to a
    modest step (≤25% of the position). Returns (amount_chf, funding_sub_asset_class). This is the
    Huber path: an additive BUY/overweight — NOT a swap — that keeps the ±2.0pp mandate band.
    Returns (0.0, None) when no drift-safe headroom exists (caller falls back to HOLD)."""
    mand = world.mandates.get(world.portfolio_of(client_id))
    if not mand or position_chf <= 0:
        return 0.0, None
    total = mand.total_chf or 1.0
    by_sac = {t.sub_asset_class: t for t in mand.targets}
    buy_t = by_sac.get(buy_sac)
    cash_t = next((t for t in mand.targets
                   if "cash" in (t.sub_asset_class or "").lower()
                   or "money market" in (t.sub_asset_class or "").lower()), None)
    # Room in the buy sleeve before a +2.0pp breach; cash deployable before cash breaches -2.0pp.
    buy_room = ((2.0 - buy_t.drift_pp) / 100 * total) if buy_t else position_chf
    cash_room = ((cash_t.drift_pp + 2.0) / 100 * total) if cash_t else 0.0
    amount = min(position_chf * 0.25, max(0.0, buy_room), max(0.0, cash_room))
    if amount <= 0:
        return 0.0, None
    return round(amount, 2), (cash_t.sub_asset_class if cash_t else None)


def build_strategy(world: World, client_id: str, match: Match) -> StrategyProposal:
    desired, avoid, fallback_sector = _prefs_for_match(match)
    affected = match.affected_holding
    swaps: list[SwapProposal] = []
    constraints: list[str] = ["Universe limited to CIO-approved names (BUY-rated targets only)."]
    prov: list[Provenance] = list(match.why)

    if match.polarity == "conflict" and affected is not None:
        sector = affected.industry_group or fallback_sector or ""
        cand = select_swap_candidate(world, client_id, sector, desired, avoid,
                                     affected.isin, affected.sub_asset_class,
                                     target_vol=affected.hist_vol_30d,
                                     target_mcap=affected.market_cap)
        cio_row = world.cio_by_isin.get(affected.isin)
        sell_view = f" (CIO: {cio_row.rating})" if cio_row else ""
        if cand:
            same_sector = bool(affected.industry_group) and cand.industry_group == affected.industry_group
            amount = round(affected.current_chf, 2)
            drift_safe, drift_notes = _drift_after_swap(
                world, client_id, affected.sub_asset_class, cand.sub_asset_class, amount)
            sub = _substitution_metrics(world, client_id, affected, cand, amount)
            constraints.append(f"Same sector: {sector}." if same_sector
                               else f"Sector check: sell {affected.industry_group} → buy {cand.industry_group}.")
            if sub.vol_delta is not None:
                constraints.append(
                    f"Risk-matched: sold vol {sub.vol_sell:.0%} → buy vol {sub.vol_buy:.0%} "
                    f"({sub.vol_delta:+.1%} delta, {sub.risk_source}).")
            constraints += drift_notes
            swaps.append(SwapProposal(
                action="SWAP",
                sell_isin=affected.isin, sell_issuer=affected.issuer,
                buy_isin=cand.isin, buy_issuer=cand.issuer,
                industry_group=cand.industry_group,
                same_sector=same_sector,
                amount_chf=amount,
                drift_safe=drift_safe,
                substitution=sub,
                **_buy_quote(cand.valor, cand.mic),
                rationale=(
                    f"Divest {affected.issuer}{sell_view}: the trigger directly violates the client's "
                    f"documented stance on {_topic_labels(match)}. Reinvest CHF {affected.current_chf:,.0f} "
                    f"into {cand.issuer} (CIO BUY), a same-sector name labelled "
                    f"{', '.join(cand.value_tags) or 'sentiment-positive'} — keeps the sector weight, upgrades "
                    f"the values fit at comparable risk."
                ),
                provenance=prov + [cand.provenance],
            ))
        else:
            swaps.append(SwapProposal(
                action="DIVEST", sell_isin=affected.isin, sell_issuer=affected.issuer,
                industry_group=affected.industry_group, same_sector=True,
                amount_chf=round(affected.current_chf, 2), drift_safe=False,
                rationale=(f"Flag {affected.issuer} for divestment — violates the client's stance. No "
                           f"same-sector BUY-rated replacement clears the values screen; raise with the RM."),
                provenance=prov,
            ))

    elif match.polarity == "opportunity" and affected is not None:
        cio_row = world.cio_by_isin.get(affected.isin)
        rating = cio_row.rating if cio_row else "—"
        # Spec (Huber): flag the values-aligned name as a BUY / overweight — explicitly NOT a swap.
        # Deploy idle cash into the leader, sized to stay within the ±2.0pp mandate band.
        amount, fund_sac = _size_overweight(world, client_id, affected.sub_asset_class,
                                            affected.current_chf)
        if amount > 0:
            drift_safe, drift_notes = _drift_after_swap(
                world, client_id, fund_sac, affected.sub_asset_class, amount)
            constraints.append(
                f"Overweight funded by deploying idle {fund_sac or 'cash'} — no holding is sold, so this is an "
                f"additive BUY (not a swap) that keeps the same strategy and sleeve within mandate."
            )
            constraints += drift_notes
            swaps.append(SwapProposal(
                action="INCREASE",
                buy_isin=affected.isin, buy_issuer=affected.issuer,
                industry_group=affected.industry_group, same_sector=True,
                amount_chf=amount, drift_safe=drift_safe,
                **_buy_quote(affected.valor, affected.mic),
                rationale=(
                    f"{affected.issuer} (CIO: {rating}) just demonstrated exactly the leadership this client "
                    f"rewards on {_topic_labels(match)}. Overweight by CHF {amount:,.0f} from idle cash — a "
                    f"values-aligned BUY recommendation that keeps the strategy and sleeve within mandate."
                ),
                provenance=prov + ([cio_row.provenance] if cio_row else []),
            ))
        else:
            constraints.append("Already at the sleeve target with no drift-safe headroom; surface as a values "
                               "win to discuss and hold.")
            swaps.append(SwapProposal(
                action="HOLD", buy_isin=affected.isin, buy_issuer=affected.issuer,
                industry_group=affected.industry_group, same_sector=True,
                amount_chf=0.0, drift_safe=True,
                rationale=(f"{affected.issuer} (CIO: {rating}) acted on {_topic_labels(match)} — exactly what "
                           f"this client rewards. Hold and celebrate; no drift-safe overweight is available now."),
                provenance=prov + ([cio_row.provenance] if cio_row else []),
            ))

    elif match.polarity == "conflict":
        # A recommended/market direction the client is averse to — no held name involved.
        sector = fallback_sector or "Information Technology"
        cand = select_swap_candidate(world, client_id, sector, desired, avoid, None, None)
        constraints.append("Respects the client's explicit, logged aversion — strategy stays unchanged.")
        swaps.append(SwapProposal(
            action="HOLD", same_sector=True, drift_safe=True, industry_group=sector,
            rationale=(
                "Do NOT execute the rotation as recommended: it sells down the defensive staples/healthcare "
                "the client explicitly values to buy exactly the abstract US tech/AI exposure he has repeatedly "
                "rejected. Keep the defensive allocation."
            ),
            provenance=prov,
        ))
        if cand:
            constraints.append(f"If sector exposure is mandated: prefer tangible {sector} ({cand.issuer}).")
            swaps.append(SwapProposal(
                action="SWAP", buy_isin=cand.isin, buy_issuer=cand.issuer,
                industry_group=sector, same_sector=True, amount_chf=0.0, drift_safe=True,
                **_buy_quote(cand.valor, cand.mic),
                rationale=(
                    f"If the mandate forces {sector} exposure, route it through {cand.issuer} (CIO BUY) — the "
                    f"tangible-hardware name the client explicitly respects — rather than abstract US mega-cap "
                    f"software. Labelled: {', '.join(cand.value_tags) or 'sentiment-positive'}."
                ),
                provenance=prov + [cand.provenance],
            ))

    else:  # neutral / informational — route to dialogue, propose no trade
        constraints.append("Informational only — surfaced for the conversation, no portfolio action proposed.")

    # A 'Good News Briefing' on opportunity matches (Huber): the positive, values-aligned framing
    # the RM phones the client with, distinct from a market-dip alert.
    good_news = None
    if match.polarity == "opportunity":
        good_news = GoodNewsBriefing(
            headline=match.headline,
            why_authentic=(
                f"An authentic, documented match: this client has told us they want to hear when names they "
                f"hold show real leadership on {_topic_labels(match)} — not just when markets fall."
            ),
            action_summary=(swaps[0].rationale if swaps
                            else "Hold and celebrate; no drift-safe overweight is available right now."),
            provenance=prov + ([match.affected_holding.provenance]
                               if match.affected_holding and match.affected_holding.provenance else []),
        )

    return StrategyProposal(
        client_id=client_id,
        headline=match.headline,
        polarity=match.polarity,
        swaps=swaps,
        constraints_checked=constraints,
        good_news_briefing=good_news,
        provenance=prov,
    )


# --- style-aware deterministic drafting (so personalisation survives offline, USE_LIVE=0) -----
# Each persona's documented style maps to a tone; the tone shapes the opener even when the LLM is
# off. Keyword-detected from the style string so it degrades gracefully for any future client.

def _tone(style: str) -> str:
    s = (style or "").lower()
    if any(k in s for k in ("empath", "mission", "human stake", "purpose")):
        return "empathetic"
    if any(k in s for k in ("values-led", "proud", "celebrate", "magnificent")):
        return "values"
    if any(k in s for k in ("conservative", "reassur", "boring", "quiet", "calm")):
        return "conservative"
    if any(k in s for k in ("analytical", "data-driven", "sharp", "risk")):
        return "analytical"
    return "professional"


def _styled_opener(tone: str, polarity: str, *, surname: str, news, affected,
                   topic_labels: str) -> str:
    """A deterministic opener in the client's voice. (tone, polarity) → a tailored lead, so the
    fallback draft is genuinely personalised — not one generic template for everyone."""
    issuer = (news.issuer_name or "a company you hold")
    title = news.title
    lead = (title.split(",")[0].lower() if title else "made a notable move")

    if polarity == "opportunity":
        by_tone = {
            "values": (f"Dear {surname}, I'm calling with the kind of news you asked me never to keep "
                       f"to a quarterly review: {issuer} has just {lead}. This is real leadership on "
                       f"{topic_labels} — exactly the impact your capital is meant to back, and worth "
                       f"celebrating together."),
            "empathetic": (f"Dear {surname}, a hopeful development I wanted you to hear from me first: "
                           f"{issuer} has just {lead}. It speaks directly to the cause closest to you, "
                           f"and to why we hold this name."),
            "analytical": (f"Dear {surname}, a positive, on-thesis development: {issuer} has just {lead}. "
                           f"It strengthens the {topic_labels} case for a name you already hold — the "
                           f"numbers and the next step are below."),
            "conservative": (f"Dear {surname}, a quietly encouraging update — nothing to action in haste: "
                             f"{issuer} has just {lead}, which reinforces {topic_labels} for a holding you "
                             f"already own."),
        }
        return by_tone.get(tone,
            f"Dear {surname}, good news on a name you hold: {issuer} has just {lead} — aligned with "
            f"your interest in {topic_labels}.")

    if polarity == "conflict" and affected is not None:
        by_tone = {
            "empathetic": (f"Dear {surname}, I owe you an early call on something that touches what matters "
                           f"most to you: {title}. Because it affects a holding of yours, I've already lined "
                           f"up a same-sector, CIO-approved option so your strategy holds and the values fit "
                           f"is restored."),
            "analytical": (f"Dear {surname}, flagging a live reputational/operational risk on a current "
                           f"holding: {title}. I've prepared a same-sector, CIO-approved substitution at "
                           f"comparable risk — the substitution metrics are attached."),
            "values": (f"Dear {surname}, one of your holdings has acted against the standards you hold it "
                       f"to: {title}. I've found a same-sector, CIO-approved replacement that puts your "
                       f"capital back on the right side of {topic_labels}."),
            "conservative": (f"Dear {surname}, a measured heads-up on a holding — no need for alarm: {title}. "
                             f"I've prepared a same-sector, CIO-approved alternative so we can keep the "
                             f"portfolio steady while addressing it."),
        }
        return by_tone.get(tone,
            f"Dear {surname}, a development needs your attention: {title}. It touches a current holding, so "
            f"I've prepared a same-sector, CIO-approved option that keeps your strategy intact.")

    if polarity == "conflict":
        by_tone = {
            "conservative": (f"Dear {surname}, before we act on the latest CIO tactical update I want to flag "
                             f"that it runs against the quiet, low-volatility approach you've asked me to "
                             f"protect. My recommendation is to hold course — here is the reasoning, plainly."),
            "analytical": (f"Dear {surname}, the latest CIO tactical update points into {topic_labels}, which "
                           f"your mandate is explicitly positioned against. I'd hold course; the rationale and "
                           f"a tangible alternative are below."),
        }
        return by_tone.get(tone,
            f"Dear {surname}, before we act on the latest CIO tactical update I want to flag that it runs "
            f"against the approach you've consistently asked us to protect. My recommendation is to hold "
            f"course; here is my reasoning.")

    return (f"Dear {surname}, a quick note on a development relevant to your interests: {title}. "
            f"Nothing needs to change in the portfolio — I simply thought it worth sharing.")


def _market_context(world: World, limit: int = 2) -> list[Statement]:
    out: list[Statement] = []
    for n in world.news:
        if n.market_digest:  # explicit flag, not inferred (#10)
            out.append(Statement(text=f"{n.title}.", provenance=n.provenance))
        if len(out) >= limit:
            break
    return out


def build_dialogue(world: World, client_id: str, match: Match) -> "tuple[DialogueSuggestion, bool]":
    seed = world.clients.get(client_id, {})
    style = seed.get("style", "Professional and concise.")
    profile = world.profiles.get(client_id)
    name = profile.name if profile else client_id
    parts = name.split()
    surname = parts[-1] if parts else (name or "there")

    points: list[Statement] = []
    points.append(Statement(text=match.headline, provenance=match.news.provenance))
    for tm in match.shared_topics[:2]:
        points.append(Statement(
            text=f"Connects to what {name} told us about {topic_label(tm.topic)}.",
            provenance=tm.client_provenance,
        ))
    if match.affected_holding:
        h = match.affected_holding
        points.append(Statement(
            text=f"Directly affects a current holding: {h.issuer} (CHF {h.current_chf:,.0f}).",
            provenance=Provenance(source_type="portfolio", source_id=f"{h.portfolio}:{h.isin}",
                                  excerpt=f"{h.issuer} held in the {h.portfolio} mandate."),
        ))
        # Reference context (fundamentals/dividends/insider) — cited, never a trade signal.
        f = world.fundamentals_by_isin.get(h.isin)
        if f:
            bits: list[str] = []
            if f.pe_ratio is not None:
                bits.append(f"P/E {f.pe_ratio:.1f}")
            if f.dividend_yield:
                bits.append(f"{f.dividend_yield:.1f}% dividend yield")
            if f.next_ex_dividend:
                bits.append(f"next ex-dividend {f.next_ex_dividend}")
            if f.insider_summary:
                bits.append(f.insider_summary.rstrip(".").lower())
            if bits:
                points.append(Statement(
                    text=f"Context on {h.issuer}: {'; '.join(bits)}.",
                    provenance=f.provenance,
                ))

    market_context = _market_context(world)

    opener = _styled_opener(
        _tone(style), match.polarity, surname=surname, news=match.news,
        affected=match.affected_holding, topic_labels=_topic_labels(match) or "your priorities",
    )

    draft = opener
    draft_source = "template"
    llm_used = False
    if llm.llm_available():
        prose = llm.chat(
            system=(
                "You are drafting a short note FROM a Swiss relationship manager TO their private-banking "
                "client, for the RM to review and send. Advisory only: never instruct the client to trade, "
                "never place trades. Match the client's communication style exactly. 90-140 words, warm, "
                "specific, UK spelling. Do not invent facts beyond those given."
            ),
            user=(
                f"Client: {name}\nStyle: {style}\n\nSituation: {match.headline}\n"
                f"Talking points: {[p.text for p in points]}\n"
                f"Proposed (for RM, not the client to execute): a same-sector, CIO-approved adjustment.\n\n"
                f"Write the note. Open in the tone implied by the style; here is a style-matched draft to "
                f"improve on, not copy:\n{opener}"
            ),
            max_tokens=320,
        )
        if prose:
            draft = prose.strip()
            draft_source = "llm"
            llm_used = True

    return DialogueSuggestion(
        client_id=client_id,
        style=style,
        talking_points=points,
        draft_message=draft,
        draft_source=draft_source,
        market_context=market_context,
        provenance=[p.provenance for p in points],
    ), llm_used
