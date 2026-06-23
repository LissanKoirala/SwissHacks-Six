"""Market-signal adapters (CLAUDE.md §6): ESG controversy labels, earnings results, and analyst
rating/price-target changes. All three are issuer-level event signals, so — like SEC filings —
they flow through the SAME pipeline as news (classify-once → match), each carrying its true origin
in provenance.source_type.

Seed-first: fixtures (data_sources.json) drive the demo. The live path uses one free Financial
Modeling Prep key (ESG/earnings/analyst endpoints), cached to disk (#9). Disabled → fixtures only.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx

from ..config import CACHE_DIR, DATA_DIR, settings
from .base import Record


def _load_section(key: str) -> list[dict]:
    data = json.loads((DATA_DIR / "data_sources.json").read_text())
    return data.get(key, [])


def _records(section: str, source_type: str) -> list[Record]:
    out: list[Record] = []
    for item in _load_section(section):
        out.append(Record(
            kind="news",
            source_type=source_type,
            source_id=item["id"],
            excerpt=(item.get("body") or item.get("title") or "")[:240],
            payload={**item, "signal_type": source_type},
        ))
    return out


class ESGFixtureSource:
    """ESG controversy / sustainability-leadership signals (e.g. Sustainalytics-style)."""
    name = "esg_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        return _records("esg", "esg")


class EarningsFixtureSource:
    """Earnings results — beat/miss vs consensus, sentiment from the surprise."""
    name = "earnings_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        return _records("earnings", "earnings")


class AnalystFixtureSource:
    """Analyst rating changes + price targets."""
    name = "analyst_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        return _records("analyst", "analyst")


def _fmp_get(path: str, params: dict) -> Any:
    """Cached GET against Financial Modeling Prep. Returns None on any failure (best-effort)."""
    if not settings.fmp_enabled:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{path}|{sorted(params.items())}".encode()).hexdigest()[:16]
    cache = CACHE_DIR / f"fmp_{key}.json"
    try:
        if cache.exists():
            return json.loads(cache.read_text())
        resp = httpx.get(f"{settings.fmp_url}/{path.lstrip('/')}",
                         params={**params, "apikey": settings.fmp_key}, timeout=12.0)
        data = resp.json()
        cache.write_text(json.dumps(data))
        return data
    except Exception:
        return None


class FMPSignalLiveSource:
    """Live ESG/earnings/analyst pulls for the watched issuers (USE_LIVE=1 + FMP_API_KEY).

    Best-effort: returns whatever it can and never raises. The fixtures remain the demo baseline;
    this layers live corroboration on top when a key is present.
    """
    name = "fmp_signals_live"

    # (symbol, issuer, isin) — FMP keys on US-style symbols; extend for broader coverage.
    WATCH = [
        ("NVDA", "NVIDIA Corporation", "US67066G1040"),
        ("BIIB", "Biogen Inc.", "US09062X1037"),
        ("PDD", "PDD Holdings Inc.", "US7223041028"),
    ]

    def fetch(self, query: Any = None) -> list[Record]:
        if not settings.fmp_enabled:
            return []
        out: list[Record] = []
        for sym, issuer, isin in self.WATCH:
            grades = _fmp_get("grades", {"symbol": sym}) or []
            if isinstance(grades, dict):
                grades = grades.get("data", grades.get("grades", []))
            for i, g in enumerate(grades[:1]):
                fid = f"analyst-{sym}-{g.get('date','')}"
                out.append(Record(
                    kind="news", source_type="analyst", source_id=fid, excerpt=str(g)[:240],
                    payload={
                        "id": fid,
                        "title": f"{issuer}: {g.get('gradingCompany','An analyst')} "
                                 f"{g.get('previousGrade','')}→{g.get('newGrade','')}",
                        "body": f"{g.get('gradingCompany','')} moved {issuer} from "
                                f"{g.get('previousGrade','')} to {g.get('newGrade','')}.",
                        "source": "FMP · Analyst Ratings",
                        "url": f"https://financialmodelingprep.com/financial-summary/{sym}",
                        "published_at": str(g.get("date", ""))[:10],
                        "sentiment": 0.0,
                        "issuer_name": issuer, "issuer_isin": isin, "signal_type": "analyst",
                    },
                ))
        return out
