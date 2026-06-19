"""Orchestrator (CLAUDE.md §8.D). Consolidates match + advisory into the insights contract,
lazily and cached per client so the strong model runs only on real, opened matches (§9)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ..graph.store import World
from ..models import ClientInsights, ClientSummary
from .advisory import build_dialogue, build_strategy
from .matcher import match_client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_insights(world: World, client_id: str, *, refresh: bool = False) -> ClientInsights:
    # Cache is bound to THIS world instance, not a module global (#7): rebuilding the world
    # (refreshed seed / classifier re-run / a second create_app) never serves stale insights.
    cache = world.insights_cache
    if not refresh and client_id in cache:
        return cache[client_id]

    meta = world.clients.get(client_id, {})
    matches = match_client(world, client_id)
    primary = matches[0] if matches else None

    strategy = None
    dialogue = None
    llm_used = False
    if primary is not None:
        strategy = build_strategy(world, client_id, primary)
        dialogue, llm_used = build_dialogue(world, client_id, primary)

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
        generated_at=_now(),
        llm_used=llm_used,
    )
    cache[client_id] = insights
    return insights


def clear_cache(world: Optional[World] = None) -> None:
    if world is not None:
        world.insights_cache.clear()
