"""Publisher logo resolution — map news source labels to domains and fetch favicons."""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

import httpx

_PLACEHOLDER_HOSTS = frozenset(
    {"example.com", "example.org", "example.net", "localhost", "127.0.0.1"}
)

# Exact source labels from fixtures + common wire names.
_SOURCE_DOMAINS: dict[str, str] = {
    "bloomberg": "bloomberg.com",
    "reuters": "reuters.com",
    "reuters health": "reuters.com",
    "neue zürcher zeitung": "nzz.ch",
    "neue zuricher zeitung": "nzz.ch",
    "nzz": "nzz.ch",
    "financial times": "ft.com",
    "the financial times": "ft.com",
    "ft": "ft.com",
    "economic times": "economictimes.indiatimes.com",
    "the economic times": "economictimes.indiatimes.com",
    "the good men project": "goodmenproject.com",
    "good men project": "goodmenproject.com",
    "yahoo finance": "finance.yahoo.com",
    "google news": "news.google.com",
    "bbc news": "bbc.co.uk",
    "bbc": "bbc.co.uk",
    "the guardian": "theguardian.com",
    "guardian": "theguardian.com",
    "wall street journal": "wsj.com",
    "wsj": "wsj.com",
    "cnbc": "cnbc.com",
    "marketwatch": "marketwatch.com",
    "ap news": "apnews.com",
    "associated press": "apnews.com",
    "event registry": "eventregistry.org",
    "newsapi.ai": "eventregistry.org",
}

# Substring hints for live-feed source names (checked in order).
_DOMAIN_HINTS: tuple[tuple[str, str], ...] = (
    ("bloomberg", "bloomberg.com"),
    ("reuters", "reuters.com"),
    ("financial times", "ft.com"),
    ("zürcher", "nzz.ch"),
    ("zurich", "nzz.ch"),
    (" nzz", "nzz.ch"),
    ("economic times", "economictimes.indiatimes.com"),
    ("good men project", "goodmenproject.com"),
    ("yahoo", "finance.yahoo.com"),
    ("wsj", "wsj.com"),
    ("wall street journal", "wsj.com"),
    ("cnbc", "cnbc.com"),
    ("bbc", "bbc.co.uk"),
    ("guardian", "theguardian.com"),
    ("marketwatch", "marketwatch.com"),
)


def _normalise_host(host: str) -> str:
    host = (host or "").strip().lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def resolve_publisher_domain(source: str, article_url: Optional[str] = None) -> Optional[str]:
    """Best domain for a publisher mark — prefer source label over placeholder article URLs."""
    label = (source or "").strip().lower()
    if label in _SOURCE_DOMAINS:
        return _SOURCE_DOMAINS[label]

    for hint, domain in _DOMAIN_HINTS:
        if hint in label:
            return domain

    if article_url:
        try:
            host = _normalise_host(urlparse(article_url).hostname or "")
            if host and host not in _PLACEHOLDER_HOSTS:
                return host
        except Exception:
            pass

    return None


def publisher_logo_urls(source: str, article_url: Optional[str] = None) -> list[str]:
    domain = resolve_publisher_domain(source, article_url)
    if not domain:
        return []
    return [
        f"https://logo.clearbit.com/{domain}",
        f"https://www.google.com/s2/favicons?domain={domain}&sz=256",
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        f"https://{domain}/favicon.ico",
    ]


def fetch_publisher_logo(source: str, article_url: Optional[str] = None) -> tuple[Optional[bytes], Optional[str]]:
    """Return (image bytes, content-type) for the first working publisher logo URL."""
    for url in publisher_logo_urls(source, article_url):
        try:
            resp = httpx.get(
                url,
                follow_redirects=True,
                timeout=10.0,
                headers={"User-Agent": "AdvisoryWorkbench/1.0 (+publisher-logo)"},
            )
            ctype = (resp.headers.get("content-type") or "").lower()
            if resp.status_code == 200 and ctype.startswith("image") and len(resp.content) > 64:
                return resp.content, ctype.split(";")[0]
        except Exception:
            continue
    return None, None
