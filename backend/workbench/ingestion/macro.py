"""Macro / FX digest adapter (CLAUDE.md §8: general market info seeds DIALOGUE, never strategy).

Emits Record(kind="news", source_type="macro") with market_digest=True, so these items reach the
dialogue's market-context block but are excluded from the matcher (§2/#10).

Seed-first: fixtures (data_sources.json) drive the demo. The live path uses Frankfurter (ECB
reference rates) — FREE, NO key — to turn a real recent FX move into one digest line; an optional
FRED key can layer in rates later. Cached to disk; disabled → fixtures only.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import CACHE_DIR, DATA_DIR, settings
from .base import Record


def _load_section(key: str) -> list[dict]:
    data = json.loads((DATA_DIR / "data_sources.json").read_text())
    return data.get(key, [])


class MacroFixtureSource:
    name = "macro_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        out: list[Record] = []
        for m in _load_section("macro"):
            out.append(Record(
                kind="news",
                source_type="macro",
                source_id=m["id"],
                excerpt=(m.get("body") or m.get("title") or "")[:240],
                payload={**m, "market_digest": True, "issuer_name": None,
                         "issuer_isin": None, "signal_type": "macro"},
            ))
        return out


class MacroLiveSource:
    """One live FX digest line from Frankfurter (ECB rates), cached. Keyless; best-effort."""
    name = "macro_live"

    def fetch(self, query: Any = None) -> list[Record]:
        if not settings.macro_enabled:
            return []
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache = CACHE_DIR / "macro_eurchf_latest.json"
        try:
            if cache.exists():
                data = json.loads(cache.read_text())
            else:
                resp = httpx.get(f"{settings.macro_url}/latest",
                                 params={"base": "EUR", "symbols": "CHF,USD"}, timeout=12.0)
                data = resp.json()
                cache.write_text(json.dumps(data))
        except Exception:
            return []
        rates = data.get("rates") or {}
        date = data.get("date", "")
        chf = rates.get("CHF")
        if chf is None:
            return []
        body = (f"ECB reference rate EUR/CHF at {chf:.4f} (EUR/USD {rates.get('USD', float('nan')):.4f}) "
                f"as of {date}. Franc levels relevant to Swiss-franc mandates and hedging.")
        return [Record(
            kind="news", source_type="macro", source_id=f"macro-eurchf-{date}",
            excerpt=body[:240],
            payload={
                "id": f"macro-eurchf-{date}",
                "title": f"EUR/CHF at {chf:.4f} (ECB reference, {date})",
                "body": body, "source": "Macro Desk · ECB/Frankfurter",
                "url": "https://www.ecb.europa.eu/stats/eurofxref/",
                "published_at": date, "sentiment": 0.0,
                "issuer_name": None, "issuer_isin": None,
                "market_digest": True, "signal_type": "macro",
            },
        )]
