"""Wikipedia / Wikimedia image resolution for Rendezvous thumbnails.

Wikimedia requires a descriptive User-Agent (otherwise HTTP 403). We try EN + DE
Wikipedia, several title normalisations, then a lightweight search fallback.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional
from urllib.parse import quote

import httpx

_WIKI_HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "SwissHacks-AdvisoryWorkbench/1.0 "
        "(wealth-advisory demo; https://github.com/swisshacks)"
    ),
}


def _slug(title: str) -> str:
    return quote(title.strip().replace(" ", "_"), safe="/%!")


# Airport display names that differ from the Wikipedia article with a hero image.
_CITY_ALIASES: dict[str, list[str]] = {
    "new york": ["New York City"],
    "newark": ["Newark, New Jersey", "New York City"],
    "washington": ["Washington, D.C."],
    "milan (linate)": ["Milan"],
    "london (gatwick)": ["London"],
    "buenos aires": ["Buenos Aires"],
    "são paulo": ["São Paulo"],
    "zürich": ["Zurich"],
}


def _title_variants(query: str) -> list[str]:
    q = " ".join(query.split()).strip()
    out: list[str] = []
    for candidate in (
        q,
        re.split(r"\s+[·—–-]\s+", q, maxsplit=1)[0].strip(),
        re.sub(
            r"\s+(tour|walk|visit|viewing|lunch|dinner|morning|afternoon|evening|private tour)$",
            "",
            q,
            flags=re.I,
        ).strip(),
    ):
        if candidate and candidate not in out:
            out.append(candidate)
    for alt in _CITY_ALIASES.get(q.lower(), []):
        if alt not in out:
            out.append(alt)
    return out


def _best_image(data: dict) -> Optional[str]:
    orig = (data.get("originalimage") or {}).get("source")
    if orig:
        return orig
    thumb = (data.get("thumbnail") or {}).get("source")
    if thumb:
        # Prefer a slightly larger thumb when URL uses /NNNpx-
        return re.sub(r"/\d+px-", "/640px-", thumb)
    return None


def _page_url(data: dict) -> Optional[str]:
    desktop = (data.get("content_urls") or {}).get("desktop") or {}
    return desktop.get("page")


@lru_cache(maxsize=256)
def _summary(lang: str, title: str) -> tuple[str, Optional[str], Optional[str], bool]:
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{_slug(title)}"
    try:
        with httpx.Client(timeout=8.0, headers=_WIKI_HEADERS) as client:
            r = client.get(url)
            if r.status_code == 200:
                data = r.json()
                if data.get("type") == "disambiguation":
                    return "", None, None, False
                return (
                    (data.get("extract") or "")[:420],
                    _best_image(data),
                    _page_url(data),
                    True,
                )
    except Exception:
        pass
    return "", None, None, False


@lru_cache(maxsize=256)
def _search_image(lang: str, query: str) -> tuple[Optional[str], Optional[str]]:
    api = f"https://{lang}.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": 3,
    }
    try:
        with httpx.Client(timeout=8.0, headers=_WIKI_HEADERS) as client:
            r = client.get(api, params=params)
            if r.status_code != 200:
                return None, None
            hits = (r.json().get("query") or {}).get("search") or []
            for hit in hits:
                title = hit.get("title")
                if not title:
                    continue
                _, img, page_url, ok = _summary(lang, title)
                if ok and (img or page_url):
                    return img, page_url
    except Exception:
        pass
    return None, None


def _lookup_variant(variant: str) -> tuple[Optional[str], Optional[str], bool]:
    """Return (image_url, page_url, found) for one title variant."""
    fallback_text = ""
    fallback_url: Optional[str] = None
    fallback_ok = False

    for lang in ("en", "de"):
        text, img, page_url, ok = _summary(lang, variant)
        if not ok:
            continue
        if img:
            return img, page_url, True
        if text and not fallback_ok:
            fallback_text, fallback_url, fallback_ok = text, page_url, True

    if fallback_ok:
        return None, fallback_url, True
    return None, None, False


def wikipedia_lookup(title: str) -> tuple[Optional[str], Optional[str]]:
    """Return (image_url, page_url) for the best matching Wikipedia page."""
    for variant in _title_variants(title):
        img, page_url, ok = _lookup_variant(variant)
        if ok and (img or page_url):
            return img, page_url

    for lang in ("en", "de"):
        img, page_url = _search_image(lang, title)
        if img or page_url:
            return img, page_url

    return None, None


def wikipedia_page(title: str) -> tuple[str, Optional[str], bool]:
    """Return (extract, image_url, found) for the best matching page."""
    fallback_text = ""
    fallback_ok = False

    for variant in _title_variants(title):
        for lang in ("en", "de"):
            text, img, _, ok = _summary(lang, variant)
            if not ok:
                continue
            if img:
                return text, img, True
            if text and not fallback_ok:
                fallback_text, fallback_ok = text, True

    for lang in ("en", "de"):
        img, _ = _search_image(lang, title)
        if img:
            text, _, _ = _summary(lang, title.split("·")[0].strip())
            return text or fallback_text, img, True

    if fallback_ok:
        return fallback_text, None, True
    return "", None, False


def wikipedia_image(title: str) -> Optional[str]:
    img, _ = wikipedia_lookup(title)
    return img


def wikipedia_link(title: str) -> Optional[str]:
    _, url = wikipedia_lookup(title)
    return url
