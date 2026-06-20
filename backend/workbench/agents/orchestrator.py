"""Orchestrator (CLAUDE.md §8.D). Consolidates match + advisory into the insights contract,
lazily and cached per client so the strong model runs only on real, opened matches (§9)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ..graph.store import World
from ..models import ClientInsights, ClientSummary
from .advisory import build_dialogue, build_opportunity_proposal, build_strategy
from .matcher import match_client
from .opportunities import build_opportunities


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _distinct_matches(matches, k: int = 3):
    """Top-K salient matches, deduped so several news items about the SAME holding/theme collapse
    to one (HI5). Keeps the highest-salience match per affected holding (or per topic+polarity when
    no holding is involved), so a client with two genuinely different triggers gets two proposals."""
    seen: set = set()
    out = []
    for m in matches:
        if m.affected_holding:
            key = ("holding", m.affected_holding.isin)
        else:
            topic = m.shared_topics[0].topic if m.shared_topics else m.news.id
            key = ("theme", m.polarity, topic)
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
        if len(out) >= k:
            break
    return out


def get_insights(world: World, client_id: str, *, refresh: bool = False) -> ClientInsights:
    # Cache is bound to THIS world instance, not a module global (#7): rebuilding the world
    # (refreshed seed / classifier re-run / a second create_app) never serves stale insights.
    cache = world.insights_cache
    if not refresh and client_id in cache:
        return cache[client_id]

    meta = world.clients.get(client_id, {})
    matches = match_client(world, client_id)
    distinct = _distinct_matches(matches, k=3)
    primary = distinct[0] if distinct else None

    strategy = None
    dialogue = None
    llm_used = False
    additional: list = []
    if primary is not None:
        strategy = build_strategy(world, client_id, primary)
        dialogue, llm_used = build_dialogue(world, client_id, primary)
        # Proposals for the other distinct salient matches (HI5) — only those with a real action.
        for m in distinct[1:]:
            sp = build_strategy(world, client_id, m)
            if sp.swaps:
                additional.append(sp)

    # Proactive (news-independent) opportunity: surface the single best-fitting unheld CIO BUY as a
    # sized, drift-checked, RM-approvable proposal — the mission's "personal asset selection 24/7",
    # not just a reaction to a trigger (DeepDive p.4). Deduped against names already proposed above.
    proposed_isins = {sw.buy_isin for sp in ([strategy] + additional) if sp for sw in sp.swaps}
    for opp in build_opportunities(world, client_id, limit=5):
        # Only a GENUINE positive fit (a desired value tag the client documented) earns a proactive
        # buy — never a name that merely *clears* the avoid screen, or we'd pitch US-tech AI to the
        # environmentalist. Skip names already involved in a match-driven proposal above.
        if not opp.get("alignment_topics") or opp.get("isin") in proposed_isins:
            continue
        op = build_opportunity_proposal(world, client_id, opp)
        if op and any(sw.action == "INCREASE" for sw in op.swaps):
            additional.append(op)
            break

    insights = ClientInsights(
        client=ClientSummary(
            client_id=client_id,
            name=meta.get("name", client_id),
            mandate=meta.get("mandate", ""),
            headline=meta.get("headline", ""),
            alert_count=len(matches),
        ),
        matches=matches,
        strategy_proposal=strategy,
        dialogue_suggestion=dialogue,
        additional_proposals=additional,
        generated_at=_now(),
        llm_used=llm_used,
    )
    cache[client_id] = insights
    return insights


def clear_cache(world: Optional[World] = None) -> None:
    if world is not None:
        world.insights_cache.clear()
