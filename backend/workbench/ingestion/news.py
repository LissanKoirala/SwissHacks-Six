"""News adapters (CLAUDE.md §6/§8). Seed fixtures by default (deterministic, demo-safe);
live Event Registry + RSS feeds behind the same interface, cached to avoid burning quota."""
from __future__ import annotations

import hashlib
import json
import time
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


class RSSFeedSource:
    """Fetch a single RSS/Atom feed. No API key required; cached for RSS_CACHE_MINUTES (default 15)
    to get fresh items without hammering the publisher. Gated on USE_LIVE=1 like other live feeds."""
    name = "rss_feed"

    def __init__(self, url: str, *, cache_minutes: int | None = None):
        self.url = url
        self.cache_minutes = cache_minutes if cache_minutes is not None else settings.rss_cache_minutes

    def fetch(self, query: Any = None) -> list[Record]:
        try:
            import feedparser
        except ImportError:
            return []

        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(self.url.encode()).hexdigest()[:16]
        cache_path = CACHE_DIR / f"rss_{key}.json"
        now = time.time()

        entries: list[dict] = []
        if cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text())
                if now - cached.get("fetched_at", 0) < self.cache_minutes * 60:
                    entries = cached.get("entries", [])
            except Exception:
                pass

        if not entries:
            feed = feedparser.parse(self.url)
            feed_title = feed.feed.get("title", self.url)
            for e in feed.entries[:20]:
                body = ""
                if e.get("content"):
                    body = e.content[0].get("value", "")
                elif e.get("summary"):
                    body = e.summary
                pub = (e.get("published") or e.get("updated") or "")[:10]
                item_id = e.get("id") or e.get("link") or e.get("title") or ""
                entries.append({
                    "id": f"rss:{hashlib.sha1(item_id.encode()).hexdigest()[:16]}",
                    "title": e.get("title", ""),
                    "body": body[:1200],
                    "source": feed_title,
                    "url": e.get("link", ""),
                    "published_at": pub,
                })
            try:
                cache_path.write_text(json.dumps({"entries": entries, "fetched_at": now}))
            except Exception:
                pass

        out: list[Record] = []
        for e in entries:
            out.append(Record(
                kind="news",
                source_type="rss",
                source_id=e["id"],
                excerpt=(e.get("body") or "")[:240],
                payload={
                    "id": e["id"],
                    "title": e["title"],
                    "body": e.get("body", ""),
                    "source": e["source"],
                    "url": e["url"],
                    "published_at": e["published_at"],
                    "sentiment": None,
                    "issuer_name": None,
                    "issuer_isin": None,
                },
            ))
        return out
