"""Open-graph / favicon link previews for provenance cards (cached, no API key)."""
from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import re
import socket
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import BaseModel, Field

from .config import CACHE_DIR

log = logging.getLogger(__name__)

_PREVIEW_CACHE = CACHE_DIR / "link_previews"
_USER_AGENT = "AdvisoryWorkbench/1.0 (+link-preview; hackathon-demo)"


class LinkPreview(BaseModel):
    url: str
    image_url: Optional[str] = None
    favicon_url: Optional[str] = None
    title: Optional[str] = None
    site_name: Optional[str] = None
    preview_kind: str = Field(
        default="favicon",
        description="thumbnail | favicon | none",
    )


def _cache_path(url: str) -> str:
    _PREVIEW_CACHE.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(url.encode()).hexdigest()[:24]
    return str(_PREVIEW_CACHE / f"{digest}.json")


def _read_cache(url: str) -> Optional[LinkPreview]:
    try:
        raw = json.loads(open(_cache_path(url), encoding="utf-8").read())
        return LinkPreview.model_validate(raw)
    except Exception:
        return None


def _write_cache(preview: LinkPreview) -> None:
    try:
        open(_cache_path(preview.url), "w", encoding="utf-8").write(preview.model_dump_json())
    except Exception as exc:
        log.debug("[link-preview] cache write failed: %s", exc)


def _normalise_url(raw: str) -> str:
    parsed = urlparse((raw or "").strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("url must be http(s) with a host")
    return parsed.geturl()


def _host_blocked(host: str) -> bool:
    host = (host or "").strip().lower().rstrip(".")
    if not host or host in {"localhost", "127.0.0.1", "0.0.0.0"}:
        return True
    if host.endswith(".local") or host.endswith(".internal"):
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
        ):
            return True
    return False


def _meta_content(html: str, *keys: str) -> Optional[str]:
    for key in keys:
        patterns = [
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)',
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(key)}["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, flags=re.I)
            if match:
                value = match.group(1).strip()
                if value:
                    return value
    return None


def _link_href(html: str, *rels: str) -> Optional[str]:
    for rel in rels:
        pattern = (
            rf'<link[^>]+rel=["\'][^"\']*{re.escape(rel)}[^"\']*["\'][^>]+href=["\']([^"\']+)'
        )
        match = re.search(pattern, html, flags=re.I)
        if match:
            return match.group(1).strip()
    return None


_MAX_REDIRECTS = 4


def _fetch_validated(start_url: str) -> Optional[httpx.Response]:
    """GET following redirects MANUALLY, re-validating the host on every hop so a public URL
    cannot 3xx-redirect into an internal address (SSRF via redirect). Returns the final 2xx
    response, or None if any hop is blocked / the chain is too long / the fetch fails.

    Note: `_host_blocked` resolves the host and rejects private/loopback/link-local/reserved IPs;
    re-running it per hop closes the redirect bypass. A narrow DNS-rebind TOCTOU window remains
    between resolve-and-validate and httpx's own connect — acceptable for this demo; a hardened
    deploy would pin the validated IP for the connection."""
    current = start_url
    with httpx.Client(
        timeout=8.0,
        follow_redirects=False,
        headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    ) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            parsed = urlparse(current)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                return None
            if _host_blocked(parsed.hostname):
                return None
            res = client.get(current)
            if res.is_redirect:
                location = res.headers.get("location")
                if not location:
                    return None
                current = urljoin(current, location)  # resolve relative redirects, re-check next loop
                continue
            return res
    return None  # too many redirects


def _google_favicon(host: str) -> str:
    return f"https://www.google.com/s2/favicons?domain={host}&sz=128"


def _abs_url(base: str, maybe_relative: Optional[str]) -> Optional[str]:
    if not maybe_relative:
        return None
    return urljoin(base, maybe_relative)


def unfurl_link(raw_url: str) -> LinkPreview:
    url = _normalise_url(raw_url)
    cached = _read_cache(url)
    if cached:
        return cached

    parsed = urlparse(url)
    favicon = _google_favicon(parsed.hostname or parsed.netloc)

    if _host_blocked(parsed.hostname or ""):
        preview = LinkPreview(
            url=url,
            favicon_url=favicon,
            preview_kind="favicon",
        )
        _write_cache(preview)
        return preview

    html = ""
    try:
        res = _fetch_validated(url)
        if res is None or res.status_code >= 400:
            preview = LinkPreview(url=url, favicon_url=favicon, preview_kind="favicon")
            _write_cache(preview)
            return preview
        content_type = (res.headers.get("content-type") or "").lower()
        if "html" not in content_type and "text/" not in content_type:
            preview = LinkPreview(
                url=url,
                favicon_url=favicon,
                preview_kind="favicon",
            )
            _write_cache(preview)
            return preview
        html = res.text[:250_000]
        final_url = str(res.url)
    except Exception as exc:
        log.info("[link-preview] fetch failed for %s: %s", url, exc)
        preview = LinkPreview(
            url=url,
            favicon_url=favicon,
            preview_kind="favicon",
        )
        _write_cache(preview)
        return preview

    image = (
        _meta_content(html, "og:image:secure_url", "og:image", "twitter:image", "twitter:image:src")
        or _abs_url(final_url, _link_href(html, "apple-touch-icon"))
    )
    icon = _abs_url(
        final_url,
        _link_href(html, "apple-touch-icon", "icon", "shortcut icon"),
    )
    title = _meta_content(html, "og:title", "twitter:title")
    if not title:
        title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, flags=re.I)
        if title_match:
            title = title_match.group(1).strip()
    site_name = _meta_content(html, "og:site_name")

    preview = LinkPreview(
        url=url,
        image_url=image,
        favicon_url=icon or favicon,
        title=title,
        site_name=site_name,
        preview_kind="thumbnail" if image else "favicon",
    )
    _write_cache(preview)
    return preview
