"""SEC EDGAR adapter (CLAUDE.md §6). Corporate filings as event signals that flow through the
SAME pipeline as news: 8-K/6-K material events are emitted as Record(kind="news",
source_type="sec_filing") so the classify-once worker tags them and the matcher surfaces them.

Seed-first: fixtures (data_sources.json) drive the demo. The live path hits data.sec.gov /
efts.sec.gov — FREE, no API key; the SEC fair-access policy only asks for a User-Agent that
identifies the caller. Every live response is cached to disk (#9) so re-runs never re-hit the API.
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


class SecFilingFixtureSource:
    """Deterministic 8-K/6-K material events from the seed fixtures (demo-safe)."""
    name = "sec_filings_fixture"

    def fetch(self, query: Any = None) -> list[Record]:
        out: list[Record] = []
        for f in _load_section("sec_filings"):
            out.append(Record(
                kind="news",
                source_type="sec_filing",
                source_id=f["id"],
                excerpt=(f.get("body") or "")[:240],
                payload={**f, "signal_type": "sec_filing"},
            ))
        return out


class SecFilingLiveSource:
    """Live SEC filings for the watched issuers via the EDGAR *submissions* API, keyed by CIK.

    Querying by CIK (not fuzzy full-text) keeps results precise — only the exact company's recent
    8-K/6-K filings, never unrelated names. Only runs when USE_LIVE=1 (no key needed). Best-effort
    and cached: any failure returns [] so the deterministic fixture world is never broken. These
    live filings are emitted with neutral sentiment, so they enrich the feed without inventing
    matches — the curated fixture filings remain the demo's matching evidence.
    """
    name = "sec_filings_live"

    # Demo issuers → SEC CIK + the material-event forms to surface. Extend for broader coverage.
    WATCH = [
        {"issuer": "Biogen Inc.", "isin": "US09062X1037", "cik": "0000875045", "forms": {"8-K"}},
        {"issuer": "PDD Holdings Inc.", "isin": "US7223041028", "cik": "0001737806", "forms": {"6-K"}},
    ]
    MAX_PER_ISSUER = 2

    def fetch(self, query: Any = None) -> list[Record]:
        if not settings.sec_enabled:
            return []
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        headers = {"User-Agent": settings.sec_user_agent, "Accept": "application/json"}
        out: list[Record] = []
        for w in self.WATCH:
            cik10 = w["cik"].zfill(10)
            cache = CACHE_DIR / f"sec_submissions_{cik10}.json"
            try:
                if cache.exists():
                    data = json.loads(cache.read_text())
                else:
                    resp = httpx.get(f"{settings.sec_url}/submissions/CIK{cik10}.json",
                                     headers=headers, timeout=12.0)
                    data = resp.json()
                    cache.write_text(json.dumps(data))
            except Exception:
                continue  # best-effort; the fixture filing for this issuer still seeds the demo
            recent = (data.get("filings") or {}).get("recent") or {}
            forms = recent.get("form") or []
            accns = recent.get("accessionNumber") or []
            docs = recent.get("primaryDocument") or []
            dates = recent.get("filingDate") or []
            descs = recent.get("primaryDocDescription") or []
            taken = 0
            for i, form in enumerate(forms):
                if taken >= self.MAX_PER_ISSUER or form not in w["forms"]:
                    continue
                accn = accns[i] if i < len(accns) else ""
                doc = docs[i] if i < len(docs) else ""
                date = dates[i] if i < len(dates) else ""
                desc = (descs[i] if i < len(descs) else "") or f"Form {form}"
                cik_int = str(int(w["cik"]))
                url = (f"https://www.sec.gov/Archives/edgar/data/{cik_int}/"
                       f"{accn.replace('-', '')}/{doc}")
                fid = f"sec-live-{accn or f'{cik10}-{i}'}"
                title = f"{w['issuer']} — Form {form} filed {date}: {desc}"
                out.append(Record(
                    kind="news", source_type="sec_filing", source_id=fid, excerpt=title[:240],
                    payload={
                        "id": fid, "title": title, "body": title,
                        "source": f"SEC EDGAR · Form {form}", "url": url,
                        "published_at": date, "sentiment": 0.0,
                        "issuer_name": w["issuer"], "issuer_isin": w["isin"],
                        "signal_type": "sec_filing",
                    },
                ))
                taken += 1
        return out
