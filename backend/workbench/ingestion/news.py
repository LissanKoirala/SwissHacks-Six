"""News adapters (CLAUDE.md §6/§8). Seed fixtures by default (deterministic, demo-safe);
live Event Registry + RSS feeds behind the same interface, cached to avoid burning quota."""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import httpx

from ..config import CACHE_DIR, settings
from .base import Record

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _force_refresh(query: Any) -> bool:
    if isinstance(query, dict):
        return bool(query.get("force_refresh"))
    return bool(query)


def _cache_is_fresh(path: Path, minutes: int) -> bool:
    if not path.exists():
        return False
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return False
    fetched_at = payload.get("fetched_at")
    if fetched_at is None:
        return False  # legacy cache without TTL — treat as stale
    return (time.time() - float(fetched_at)) < minutes * 60


def _iso_date_from_timestamp(raw: str) -> str:
    """Normalise API timestamps (ISO or date-only) to YYYY-MM-DD."""
    if not raw:
        return ""
    if _ISO_DATE.match(raw[:10]):
        return raw[:10]
    try:
        normalised = raw.replace("Z", "+00:00")
        return datetime.fromisoformat(normalised).astimezone(timezone.utc).date().isoformat()
    except ValueError:
        return ""


def _iso_date_from_feed_entry(entry: Any) -> str:
    """Parse RSS/Atom entry dates via feedparser structs or RFC 822 strings."""
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        st = entry.get(key)
        if st:
            try:
                return datetime(*st[:6], tzinfo=timezone.utc).date().isoformat()
            except (TypeError, ValueError):
                continue
    raw = entry.get("published") or entry.get("updated") or entry.get("created") or ""
    if raw:
        try:
            return parsedate_to_datetime(raw).astimezone(timezone.utc).date().isoformat()
        except (TypeError, ValueError, OSError):
            pass
    return _iso_date_from_timestamp(raw)


def _entries_have_valid_dates(entries: list[dict]) -> bool:
    if not entries:
        return True
    sample = entries[: min(5, len(entries))]
    return all(_ISO_DATE.match(e.get("published_at") or "") for e in sample)


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

    def __init__(self, keyword: str, *, cache_minutes: int | None = None):
        self.keyword = keyword
        self.cache_minutes = (
            cache_minutes if cache_minutes is not None else settings.news_cache_minutes
        )

    def fetch(self, query: Any = None) -> list[Record]:
        if not settings.news_enabled:
            return []
        force = _force_refresh(query)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # stable across processes (builtin hash() is per-process salted) so the quota cache survives restarts (#9)
        key = hashlib.sha1(self.keyword.encode()).hexdigest()[:16]
        cache = CACHE_DIR / f"news_{key}.json"
        data: dict
        if not force and _cache_is_fresh(cache, self.cache_minutes):
            data = json.loads(cache.read_text()).get("data") or {}
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
            cache.write_text(json.dumps({"fetched_at": time.time(), "data": data}))
        out: list[Record] = []
        for i, a in enumerate(((data.get("articles") or {}).get("results") or [])):
            pub_raw = a.get("dateTimePub") or a.get("dateTime") or ""
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
                    "published_at": _iso_date_from_timestamp(pub_raw),
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

        force = _force_refresh(query)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(self.url.encode()).hexdigest()[:16]
        cache_path = CACHE_DIR / f"rss_{key}.json"
        now = time.time()

        entries: list[dict] = []
        if not force and _cache_is_fresh(cache_path, self.cache_minutes):
            try:
                cached = json.loads(cache_path.read_text())
                entries = cached.get("entries", [])
                if not _entries_have_valid_dates(entries):
                    entries = []  # legacy cache stored truncated RFC822 dates — refetch
            except Exception:
                pass

        if not entries:
            # Fetch the feed bytes ourselves with a hard timeout. feedparser.parse(url) uses urllib
            # with NO timeout, so a slow/stalled publisher hangs the call indefinitely — and since
            # build_world only wraps each feed in try/except (a hang is not an exception), one dead
            # feed would block server startup forever. Best-effort: on any failure we skip this feed
            # and don't cache, so it simply retries next time without ever blocking boot.
            content = None
            try:
                resp = httpx.get(
                    self.url,
                    timeout=8.0,
                    follow_redirects=True,
                    headers={"User-Agent": "Mozilla/5.0 (AdvisoryWorkbench RSS reader)"},
                )
                resp.raise_for_status()
                content = resp.content
            except Exception:
                content = None
            if content is not None:
                feed = feedparser.parse(content)
                feed_title = feed.feed.get("title", self.url)
                for e in feed.entries[:20]:
                    body = ""
                    if e.get("content"):
                        body = e.content[0].get("value", "")
                    elif e.get("summary"):
                        body = e.summary
                    item_id = e.get("id") or e.get("link") or e.get("title") or ""
                    entries.append({
                        "id": f"rss:{hashlib.sha1(item_id.encode()).hexdigest()[:16]}",
                        "title": e.get("title", ""),
                        "body": body[:1200],
                        "source": feed_title,
                        "url": e.get("link", ""),
                        "published_at": _iso_date_from_feed_entry(e),
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
