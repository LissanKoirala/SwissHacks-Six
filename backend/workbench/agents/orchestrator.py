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
from .worldview import detect_life_events, predict_reaction


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
    reaction = None
    llm_used = False
    additional: list = []
    if primary is not None:
        strategy = build_strategy(world, client_id, primary)
        dialogue, llm_used = build_dialogue(world, client_id, primary)
        # Reaction Simulator (#3): forecast how the client reacts to the primary proposal so the RM
        # is prepared — strong model lazily on the opened match (§9), grounded fallback otherwise.
        reaction, r_llm = predict_reaction(world, client_id, primary)
        llm_used = llm_used or r_llm
        # Proposals for the other distinct salient matches (HI5) — only those with a real action.
        for m in distinct[1:]:
            sp = build_strategy(world, client_id, m)
            if sp.swaps:
                additional.append(sp)

    # Life-event-aware timing (#5): deterministic scan of dated facets/edges vs today — surfaced as
    # a banner even when there is no news match, so the desk notices the human moment.
    life_events = detect_life_events(world, client_id)

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
        reaction=reaction,
        life_events=life_events,
        generated_at=_now(),
        llm_used=llm_used,
    )
    cache[client_id] = insights
    return insights


def get_overview_insights(world: World, client_id: str) -> ClientInsights:
    """LLM-free insights for the desk overview / morning briefing (CLAUDE.md §9).

    The overview and SMS briefing only need the client summary + grounded matches — never the
    strong-model dialogue prose. Building those here keeps the strong model LAZY: it runs only when
    the RM actually opens a client (full `get_insights`), not speculatively for every desk refresh.
    Reuses a full cached entry if one already exists; otherwise computes just the cheap, deterministic
    parts (matching is a free index intersection) and does NOT poison the cache, so a later open still
    builds the real proposal + dialogue."""
    cached = world.insights_cache.get(client_id)
    if cached is not None:
        return cached

    meta = world.clients.get(client_id, {})
    matches = match_client(world, client_id)
    # Life-event timing is deterministic and free (§9) — surface it on the LLM-free overview too, so
    # the human moment shows even for a client with no news match today. Reaction stays None here:
    # it is the one strong-model call and runs only when the RM opens the client (full get_insights).
    life_events = detect_life_events(world, client_id)
    return ClientInsights(
        client=ClientSummary(
            client_id=client_id,
            name=meta.get("name", client_id),
            mandate=meta.get("mandate", ""),
            headline=meta.get("headline", ""),
            alert_count=len(matches),
        ),
        matches=matches,
        strategy_proposal=None,
        dialogue_suggestion=None,
        additional_proposals=[],
        reaction=None,
        life_events=life_events,
        generated_at=_now(),
        llm_used=False,
    )


def clear_cache(world: Optional[World] = None) -> None:
    if world is not None:
        world.insights_cache.clear()
        world.twin_cache.clear()
