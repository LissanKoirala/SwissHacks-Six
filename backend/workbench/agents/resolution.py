"""On-demand resolution drafts for map holding popovers (§9: lazy, cached per match).

Deterministic strategy (CIO-approved substitution) is computed first; the configured Phoeniqs
model optionally polishes the RM-facing summary using full portfolio, CRM, and news context.
Never instructs the client to trade."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ..graph.store import World
from ..models import Match, StrategyProposal, SwapProposal
from ..topics import topic_label
from . import llm
from .advisory import build_strategy
from .matcher import match_client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _find_match_strict(world: World, client_id: str, match_id: str) -> Match | None:
    """Resolve exactly one match — never fall back to the first salient match."""
    for m in match_client(world, client_id):
        if m.id == match_id:
            return m
    return None


def _clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _portfolio_context(
    world: World, client_id: str, match: Match, holding_isin: Optional[str] = None,
) -> str:
    """Holdings, mandate drift, and CIO universe from SwissHacks Portfolio Construction.xlsx."""
    portfolio = world.portfolio_of(client_id)
    mandate = world.mandates.get(portfolio)
    focus = world.holding_by_isin(client_id, holding_isin) if holding_isin else None
    lines = [
        "Source workbook: SwissHacks Portfolio Construction.xlsx",
        f"Mandate sleeve: {portfolio}",
    ]
    if focus:
        lines.append(
            f"FOCUS HOLDING (tile the RM opened): {focus.issuer} | {focus.isin} | "
            f"CHF {focus.current_chf:,.0f} | {focus.industry_group or '—'}"
        )
    if mandate:
        lines.append(f"Total CHF {mandate.total_chf:,.0f}")
        for t in mandate.targets:
            breach = " — DRIFT BREACH" if t.breach else ""
            lines.append(
                f"  {t.sub_asset_class}: target {t.target_pct:.1f}% "
                f"({t.target_chf:,.0f} CHF) · current {t.current_pct:.1f}% "
                f"({t.current_chf:,.0f} CHF) · drift {t.drift_pp:+.1f}pp{breach}"
            )

    holdings = sorted(world.holdings_for_client(client_id), key=lambda h: -h.current_chf)
    lines.append(f"Current holdings ({len(holdings)}):")
    for h in holdings:
        cio = world.cio_by_isin.get(h.isin)
        rating = cio.rating if cio else "OFF_LIST"
        flag = ""
        if focus and h.isin == focus.isin:
            flag = " ← FOCUS HOLDING"
        elif match.affected_holding and h.isin == match.affected_holding.isin:
            flag = " ← TRIGGER HOLDING"
        lines.append(
            f"  {h.issuer} | {h.isin} | CHF {h.current_chf:,.0f} | "
            f"{h.industry_group or '—'} | CIO {rating}{flag}"
        )

    sector = (match.affected_holding.industry_group if match.affected_holding else None)
    buys = [c for c in world.cio if c.rating == "BUY"]
    if sector:
        sector_buys = [c for c in buys if c.industry_group == sector]
        lines.append(f"CIO BUY names in {sector} ({len(sector_buys)}):")
        for c in sector_buys[:12]:
            tags = ", ".join(c.value_tags) if c.value_tags else "—"
            lines.append(f"  {c.issuer} | {c.isin} | tags: {tags}")
    else:
        lines.append(f"CIO BUY universe ({len(buys)} names, top 12 by listing order):")
        for c in buys[:12]:
            lines.append(f"  {c.issuer} | {c.isin} | {c.industry_group or '—'}")

    return "\n".join(lines)


def _crm_context(world: World, client_id: str, match: Match) -> str:
    """CRM meeting log + matched client excerpts from SwissHacks CRM.xlsx."""
    topics = {st.topic for st in match.shared_topics}
    topic_labels = {topic_label(t).lower() for t in topics}
    logs = sorted(world.meeting_logs.get(client_id, []), key=lambda e: e.timestamp)

    lines = ["Source workbook: SwissHacks CRM.xlsx"]
    for st in match.shared_topics:
        lines.append(
            f"Client stance on {topic_label(st.topic)} ({st.client_provenance.source_id}): "
            f"\"{_clip(st.client_provenance.excerpt, 500)}\""
        )

    matched_logs = []
    for entry in logs:
        note = (entry.note or "").lower()
        if any(t in note or lbl in note for t in topics for lbl in topic_labels):
            matched_logs.append(entry)

    if matched_logs:
        lines.append(f"Relevant CRM log entries ({len(matched_logs)}):")
        for entry in matched_logs[-10:]:
            lines.append(
                f"  [{entry.timestamp}] {entry.modality} · {entry.contact}: "
                f"\"{_clip(entry.note, 420)}\""
            )
    else:
        lines.append("Recent CRM log entries (no direct topic hit — last 8):")
        for entry in logs[-8:]:
            lines.append(
                f"  [{entry.timestamp}] {entry.modality}: \"{_clip(entry.note, 320)}\""
            )

    profile = world.profiles.get(client_id)
    if profile:
        for facet in ("personality", "interests", "professional", "historical"):
            for s in profile.facets.get(facet, [])[:3]:
                lines.append(f"Profile {facet}: \"{_clip(s.text, 240)}\"")

    return "\n".join(lines)


def _news_context(world: World, match: Match) -> str:
    """Trigger article + full current news graph."""
    news = match.news
    lines = [
        "=== Trigger news (this match) ===",
        f"ID: {news.id}",
        f"Title: {news.title}",
        f"Source: {news.source} · {news.published_at}",
        f"Sentiment: {news.sentiment.label} ({news.sentiment.score:+.2f})",
        f"Topics: {', '.join(news.topics)}",
        f"Excerpt: \"{_clip(news.provenance.excerpt, 600)}\"",
    ]
    for st in match.shared_topics:
        lines.append(
            f"News angle on {topic_label(st.topic)}: "
            f"\"{_clip(st.news_provenance.excerpt, 500)}\""
        )

    lines.append(f"=== All current news ({len(world.news)} items) ===")
    for n in sorted(world.news, key=lambda x: x.published_at, reverse=True):
        lines.append(
            f"- [{n.published_at}] {n.source} | {n.sentiment.label} | "
            f"{n.title} | topics: {', '.join(n.topics)}"
        )
        if n.provenance.excerpt:
            lines.append(f"  \"{_clip(n.provenance.excerpt, 180)}\"")
    return "\n".join(lines)


def _build_llm_user_prompt(
    world: World,
    client_id: str,
    match_id: str,
    match: Match,
    strategy: StrategyProposal,
    swap: Optional[SwapProposal],
    holding_isin: Optional[str] = None,
) -> str:
    swap_facts = "No swap computed — explain hold / review path."
    if swap:
        swap_facts = (
            f"Action: {swap.action}\n"
            f"Sell: {swap.sell_issuer or '—'} ({swap.sell_isin or '—'})\n"
            f"Buy: {swap.buy_issuer or '—'} ({swap.buy_isin or '—'})\n"
            f"Amount CHF: {swap.amount_chf:,.0f}\n"
            f"Same sector: {swap.same_sector}\n"
            f"Drift safe: {swap.drift_safe}\n"
            f"Rationale: {swap.rationale}\n"
        )
        if swap.substitution:
            sub = swap.substitution
            if sub.vol_sell is not None and sub.vol_buy is not None:
                swap_facts += (
                    f"Vol: {sub.vol_sell:.0%} → {sub.vol_buy:.0%} "
                    f"(delta {sub.vol_delta:+.1%})\n"
                )

    client_name = world.clients.get(client_id, {}).get("name", client_id)
    focus_line = f"HOLDING_ISIN: {holding_isin}\n" if holding_isin else ""
    return (
        f"MATCH_ID: {match_id}\n"
        f"{focus_line}"
        f"CLIENT: {client_name} ({client_id})\n"
        f"HEADLINE: {match.headline}\n"
        f"POLARITY: {match.polarity}\n\n"
        f"=== PORTFOLIO ===\n{_portfolio_context(world, client_id, match, holding_isin)}\n\n"
        f"=== CRM ===\n{_crm_context(world, client_id, match)}\n\n"
        f"=== NEWS ===\n{_news_context(world, match)}\n\n"
        f"=== DETERMINISTIC CIO PROPOSAL (keep this action; explain it) ===\n"
        f"Constraints: {strategy.constraints_checked}\n"
        f"{swap_facts}\n\n"
        "Draft a 2-4 sentence RM-facing resolution for THIS specific match only. "
        "Reference the CRM stance vs the news clash where relevant. "
        "Same-sector, CIO-approved substitution when a swap is proposed. "
        "JSON keys: summary (string)."
    )


def _swap_line(swap: SwapProposal) -> str:
    if swap.action == "SWAP" and swap.sell_issuer and swap.buy_issuer:
        return f"Swap {swap.sell_issuer} → {swap.buy_issuer} (CHF {swap.amount_chf:,.0f})"
    if swap.action == "INCREASE" and swap.buy_issuer:
        return f"Overweight {swap.buy_issuer} by CHF {swap.amount_chf:,.0f}"
    if swap.action == "DIVEST" and swap.sell_issuer:
        return f"Divest {swap.sell_issuer} (CHF {swap.amount_chf:,.0f})"
    if swap.action == "HOLD":
        return "Hold course — no trade recommended"
    return swap.rationale or "Review with the RM"


def _primary_swap(swaps: list[SwapProposal]) -> Optional[SwapProposal]:
    """Prefer an actionable swap over a thematic hold-only line."""
    for s in swaps:
        if s.action != "HOLD" or s.sell_isin or s.buy_isin or (s.amount_chf or 0) > 0:
            return s
    return swaps[0] if swaps else None


def _template_summary(match: Match, strategy: StrategyProposal, swap: Optional[SwapProposal]) -> str:
    if swap is None:
        return strategy.headline
    line = _swap_line(swap)
    if swap.action == "HOLD" and not swap.sell_isin and not swap.buy_isin:
        return f"{match.headline} {line}."
    if match.polarity == "conflict":
        return (
            f"{line}. {swap.rationale} "
            f"Same-sector, CIO-approved — keeps the mandate intact while addressing the values clash."
        )
    if match.polarity == "opportunity":
        return f"{line}. {swap.rationale}"
    return f"{strategy.headline} {swap.rationale}"


def _llm_summary(
    world: World,
    client_id: str,
    match_id: str,
    match: Match,
    strategy: StrategyProposal,
    swap: Optional[SwapProposal],
    holding_isin: Optional[str] = None,
) -> tuple[str, bool]:
    """Return (summary, llm_used). Falls back to template if the model is unavailable."""
    user = _build_llm_user_prompt(
        world, client_id, match_id, match, strategy, swap, holding_isin,
    )
    system = (
        "You draft a concise resolution note FOR a Swiss private-bank relationship manager "
        "reviewing an advisory-only proposal tied to ONE specific news match. UK spelling. "
        "Never instruct the client to trade; the RM approves and the client decides. "
        "Use ONLY facts from the prompt — portfolio workbook, CRM log, news feed, and the "
        "deterministic CIO proposal. Do not reuse language from other clients or matches. "
        "When HOLDING_ISIN is set, explain how the proposal applies to that specific position."
    )
    payload = llm.chat_json(system, user, max_tokens=480)
    if payload and payload.get("summary"):
        return str(payload["summary"]).strip(), True

    prose = llm.chat(system, user + "\n\nReply with the summary prose only (no JSON).", max_tokens=480)
    if prose:
        return prose.strip(), True
    return _template_summary(match, strategy, swap), False


def suggest_resolution(
    world: World,
    client_id: str,
    match_id: str,
    *,
    holding_isin: Optional[str] = None,
    refresh: bool = False,
) -> dict:
    """Lazy resolution for one match: deterministic substitution + optional LLM summary."""
    match_id = (match_id or "").strip()
    if not match_id:
        raise ValueError("unknown match")
    holding_isin = (holding_isin or "").strip() or None

    key = (client_id, match_id, holding_isin or "")
    if not refresh and key in world.resolution_cache:
        cached = world.resolution_cache[key]
        if cached.get("match_id") == match_id and cached.get("holding_isin") == holding_isin:
            return cached

    match = _find_match_strict(world, client_id, match_id)
    if match is None:
        raise ValueError("unknown match")

    strategy = build_strategy(world, client_id, match)
    swap = _primary_swap(strategy.swaps)
    summary, llm_used = _llm_summary(
        world, client_id, match_id, match, strategy, swap, holding_isin,
    )

    result = {
        "client_id": client_id,
        "match_id": match_id,
        "holding_isin": holding_isin,
        "summary": summary,
        "source": "llm" if llm_used else "template",
        "llm_used": llm_used,
        "strategy_proposal": strategy.model_dump(),
        "generated_at": _now(),
    }
    world.resolution_cache[key] = result
    return result
