"""News ingestion — date normalisation and cache TTL."""
from __future__ import annotations

from workbench.ingestion.news import (
    EventRegistrySource,
    RSSFeedSource,
    _iso_date_from_feed_entry,
    _iso_date_from_timestamp,
)


def test_iso_date_from_timestamp_full_iso():
    assert _iso_date_from_timestamp("2026-06-21T14:30:00Z") == "2026-06-21"


def test_iso_date_from_timestamp_date_only():
    assert _iso_date_from_timestamp("2026-06-17") == "2026-06-17"


def test_iso_date_from_feed_entry_parsed():
    entry = {
        "published_parsed": (2026, 6, 21, 9, 0, 0),
        "published": "Sun, 21 Jun 2026 09:00:00 GMT",
    }
    assert _iso_date_from_feed_entry(entry) == "2026-06-21"


def test_iso_date_from_feed_entry_rfc822_not_truncated():
    """Regression: [:10] on RFC822 produced 'Sun, 21 Ju' and displayed as July."""
    entry = {
        "published": "Sun, 21 Jun 2026 09:00:00 GMT",
    }
    assert _iso_date_from_feed_entry(entry) == "2026-06-21"


def test_event_registry_cache_minutes_configured():
    src = EventRegistrySource("test keyword")
    assert src.cache_minutes >= 1


def test_rss_feed_cache_minutes_configured():
    src = RSSFeedSource("http://example.com/feed.xml")
    assert src.cache_minutes >= 1
