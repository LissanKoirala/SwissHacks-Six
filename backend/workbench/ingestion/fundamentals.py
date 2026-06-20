"""Fundamentals + dividends + insider adapter (CLAUDE.md §6).

Reference data, NOT an event signal: it enriches the portfolio view and seeds dialogue, but it
never enters the match pipeline (§2: general info feeds dialogue, not strategy). Emits one
Record(kind="fundamentals") per issuer, keyed by ISIN, with the issuer's Form-4 insider trades
(also free via SEC EDGAR) nested in and summarised.

Seed-first: fixtures (data_sources.json) drive the demo. The live path uses one free Financial
Modeling Prep key (ratios + dividend calendar), cached to disk; disabled → fixtures only.
"""
from __future__ import annotations

import json
from typing import Any

from ..config import DATA_DIR
from .base import Record


def _load_section(key: str) -> list[dict]:
    data = json.loads((DATA_DIR / "data_sources.json").read_text())
    return data.get(key, [])


def _summarise_insider(trades: list[dict]) -> str | None:
    if not trades:
        return None
    net = sum((t.get("value_usd") or 0) * (1 if t.get("transaction") == "BUY" else -1) for t in trades)
    if net > 0:
        return "Net insider buying in recent Form 4 filings."
    if net < 0:
        return "Net insider selling in recent Form 4 filings."
    return "Mixed insider activity in recent Form 4 filings."


class FundamentalsFixtureSource:
    """Per-issuer fundamentals + dividends, joined with Form-4 insider trades by ISIN."""
    name = "fundamentals_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        insider_by_isin: dict[str, list[dict]] = {}
        for t in _load_section("insider"):
            insider_by_isin.setdefault(t["isin"], []).append(t)

        out: list[Record] = []
        for f in _load_section("fundamentals"):
            trades = insider_by_isin.get(f["isin"], [])
            out.append(Record(
                kind="fundamentals",
                source_type="fundamentals",
                source_id=f["isin"],
                excerpt=(f"{f['issuer']}: P/E {f.get('pe_ratio','—')}, "
                         f"dividend yield {f.get('dividend_yield','—')}%.")[:240],
                payload={**f, "insider_trades": trades,
                         "insider_summary": _summarise_insider(trades)},
            ))
        return out
