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
    CashFlow,
    CIOStock,
    Fundamentals,
    Holding,
    InterestEdge,
    Mandate,
    MeetingLogEntry,
    NewsItem,
    PortfolioTransaction,
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
    # Transaction ledger + cash flows (HI4), by portfolio/strategy
    transactions: dict[str, list[PortfolioTransaction]] = field(default_factory=dict)
    cash_flows: dict[str, list[CashFlow]] = field(default_factory=dict)

    # Issuer reference data (fundamentals + dividends + insider), keyed by ISIN — context for
    # the portfolio view + dialogue, never matched (CLAUDE.md §2).
    fundamentals_by_isin: dict[str, Fundamentals] = field(default_factory=dict)

    # Meta graph
    interest_by_client: dict[str, list[InterestEdge]] = field(default_factory=dict)

    # per-world insights cache (lazy, §9) — keyed by client_id, bound to THIS world
    insights_cache: dict = field(default_factory=dict)

    # --- convenience lookups ---

    def portfolio_of(self, client_id: str) -> str:
        return self.clients.get(client_id, {}).get("portfolio", "")

    def holdings_for_client(self, client_id: str) -> list[Holding]:
        return self.holdings.get(self.portfolio_of(client_id), [])

    def transactions_for_client(self, client_id: str) -> list[PortfolioTransaction]:
        return self.transactions.get(self.portfolio_of(client_id), [])

    def cashflows_for_client(self, client_id: str) -> list[CashFlow]:
        return self.cash_flows.get(self.portfolio_of(client_id), [])

    def held_isins(self, client_id: str) -> set[str]:
        return {h.isin for h in self.holdings_for_client(client_id)}

    def holding_by_isin(self, client_id: str, isin: str):
        for h in self.holdings_for_client(client_id):
            if h.isin == isin:
                return h
        return None

    def client_topics(self, client_id: str) -> set[str]:
        return {e.topic for e in self.interest_by_client.get(client_id, [])}

    def fundamentals_for_client(self, client_id: str) -> list:
        """Fundamentals for the issuers this client actually holds (portfolio-view context)."""
        out = []
        for isin in self.held_isins(client_id):
            f = self.fundamentals_by_isin.get(isin)
            if f:
                out.append(f)
        return out

    def cio_by_industry(self, industry_group: str, rating: str | None = None) -> list[CIOStock]:
        out = [c for c in self.cio if c.industry_group == industry_group]
        if rating:
            out = [c for c in out if c.rating == rating]
        return out

    def cio_status_of(self, holding: Holding) -> tuple[str, str | None]:
        """Deviation status of a held name vs the CIO list (Portfolio Agent's core job):
        ("CASH", None) for a cash pseudo-position, ("OFF_LIST", None) when the name is no longer
        on the CIO list, else (rating, rating) for an on-list BUY/HOLD/SELL name."""
        if (holding.isin or "").lower().startswith("cash"):
            return "CASH", None
        cio = self.cio_by_isin.get(holding.isin)
        if cio is None:
            return "OFF_LIST", None
        return cio.rating, cio.rating

    def cio_deviations(self, client_id: str) -> list[Holding]:
        """Held names that have left the CIO list or been downgraded to SELL — the deviations the
        Portfolio Agent must flag ('assets no longer on the CIO list')."""
        return [h for h in self.holdings_for_client(client_id)
                if h.cio_status in ("OFF_LIST", "SELL")]
