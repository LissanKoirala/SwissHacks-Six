"""The three logical graphs, backed by plain in-memory objects (CLAUDE.md §3).

CRM graph (per client): meeting_logs + profiles.
News graph: news items, topic-tagged with sentiment.
Meta graph: the shared topic index — client interest edges are subscriptions, news tags are
classifications, a match is a shared topic node. Sector nodes live here too.
Portfolio graph: holdings, mandates, the CIO approved universe.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..models import (
    CIOStock,
    Holding,
    InterestEdge,
    Mandate,
    MeetingLogEntry,
    NewsItem,
    Profile,
)


@dataclass
class World:
    # client registry (from persona seeds): id -> {name, mandate, portfolio, style, headline}
    clients: dict[str, dict] = field(default_factory=dict)

    # CRM graph
    meeting_logs: dict[str, list[MeetingLogEntry]] = field(default_factory=dict)
    profiles: dict[str, Profile] = field(default_factory=dict)

    # News graph
    news: list[NewsItem] = field(default_factory=list)

    # Portfolio graph
    holdings: dict[str, list[Holding]] = field(default_factory=dict)   # by portfolio/strategy
    mandates: dict[str, Mandate] = field(default_factory=dict)         # by strategy
    cio: list[CIOStock] = field(default_factory=list)
    cio_by_isin: dict[str, CIOStock] = field(default_factory=dict)

    # Meta graph
    interest_by_client: dict[str, list[InterestEdge]] = field(default_factory=dict)

    # per-world insights cache (lazy, §9) — keyed by client_id, bound to THIS world
    insights_cache: dict = field(default_factory=dict)

    # --- convenience lookups ---

    def portfolio_of(self, client_id: str) -> str:
        return self.clients.get(client_id, {}).get("portfolio", "")

    def holdings_for_client(self, client_id: str) -> list[Holding]:
        return self.holdings.get(self.portfolio_of(client_id), [])

    def held_isins(self, client_id: str) -> set[str]:
        return {h.isin for h in self.holdings_for_client(client_id)}

    def holding_by_isin(self, client_id: str, isin: str):
        for h in self.holdings_for_client(client_id):
            if h.isin == isin:
                return h
        return None

    def client_topics(self, client_id: str) -> set[str]:
        return {e.topic for e in self.interest_by_client.get(client_id, [])}

    def cio_by_industry(self, industry_group: str, rating: str | None = None) -> list[CIOStock]:
        out = [c for c in self.cio if c.industry_group == industry_group]
        if rating:
            out = [c for c in out if c.rating == rating]
        return out
