"""News adapters (CLAUDE.md §6/§8). Seed fixtures by default (deterministic, demo-safe);
live Event Registry behind the same interface, cached to avoid burning quota."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import httpx

from ..config import CACHE_DIR, settings
from .base import Record


class NewsFixtureSource:
    name = "news_fixtures"

    def __init__(self, path: Path):
        self.path = Path(path)

    def fetch(self, query: Any = None) -> list[Record]:
        data = json.loads(self.path.read_text())
        out: list[Record] = []
        for n in data.get("news", []):
            out.append(Record(
                kind="news",
                source_type="news",
                source_id=n["id"],
                excerpt=(n.get("body") or "")[:240],
                payload=n,
            ))
        return out


class EventRegistrySource:
    """Live news + sentiment. Optional; only used when USE_LIVE=1 and NEWSAPI_KEY is set."""
    name = "event_registry"

    def __init__(self, keyword: str):
        self.keyword = keyword

    def fetch(self, query: Any = None) -> list[Record]:
        if not settings.news_enabled:
            return []
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # stable across processes (builtin hash() is per-process salted) so the quota cache survives restarts (#9)
        key = hashlib.sha1(self.keyword.encode()).hexdigest()[:16]
        cache = CACHE_DIR / f"news_{key}.json"
        if cache.exists():
            data = json.loads(cache.read_text())
        else:
            resp = httpx.post(
                f"{settings.news_url}/article/getArticles",
                json={
                    "apiKey": settings.news_key,
                    "keyword": self.keyword,
                    "keywordOper": "and",
                    "lang": "eng",
                    "articlesCount": 10,
                    "articlesSortBy": "date",
                    "resultType": "articles",
                    "dataType": ["news"],
                    "includeArticleSentiment": True,
                },
                timeout=30.0,
            )
            data = resp.json()
            cache.write_text(json.dumps(data))
        out: list[Record] = []
        for i, a in enumerate(((data.get("articles") or {}).get("results") or [])):
            out.append(Record(
                kind="news",
                source_type="news",
                source_id=str(a.get("uri") or f"news-{i}"),
                excerpt=(a.get("body") or "")[:240],
                payload={
                    "id": str(a.get("uri") or f"news-{i}"),
                    "title": a.get("title") or "",
                    "body": (a.get("body") or "")[:1200],
                    "source": (a.get("source") or {}).get("title") or "Unknown",
                    "url": a.get("url"),
                    "published_at": (a.get("dateTimePub") or a.get("dateTime") or "")[:10],
                    "sentiment": a.get("sentiment") or 0.0,
                    "issuer_name": None,
                    "issuer_isin": None,
                },
            ))
        return out
