"""SIX Financial Data — MCP adapter (CLAUDE.md §6). Optional live prices/valuation.

It is an MCP server (JSON-RPC over streamable-http), NOT REST. Responses arrive as plain JSON
or SSE-framed; tool results are tab-delimited tables. Listing tools take `{Valor}_{MIC}`.
Used only when USE_LIVE=1 and SIX_MCP_TOKEN is set; otherwise the workbook 'Current (CHF)' values
seed valuation deterministically."""
from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from ..config import CACHE_DIR, settings

# Venues the hackathon token actually prices. Empirically the dataset covers US + Nordic
# listings (XNYS/XNAS/XCSE/XMAD returned data); Swiss/Euro venues (XSWX, XETR, XLON, XAMS…)
# return an empty snapshot regardless. We only spend a (slow, flaky) network call on covered
# venues, and skip the rest outright — so the warm-up stays fast and we never claim a price we
# can't get. Extend this set if the token's coverage widens.
PRICED_MICS = {
    "XNYS", "XNAS", "XNGS", "XNMS", "ARCX", "BATS", "XASE",  # US
    "XCSE", "XSTO", "XHEL", "XICE", "XMAD",                   # Nordic + Madrid
}

# Fallback listing currency by venue, for when listing_base returns empty under load.
MIC_CCY = {
    "XNYS": "USD", "XNAS": "USD", "XNGS": "USD", "XNMS": "USD",
    "ARCX": "USD", "BATS": "USD", "XASE": "USD",
    "XCSE": "DKK", "XSTO": "SEK", "XHEL": "EUR", "XICE": "ISK", "XMAD": "EUR",
}


def _parse_payload(raw: str) -> dict:
    raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("data:"):
                body = line[5:].strip()
                if body and body != "[DONE]":
                    try:
                        return json.loads(body)
                    except Exception:
                        continue
    raise ValueError("[SIX] could not parse MCP response payload")


def _rows(result: dict) -> list[dict[str, str]]:
    content = (result.get("result") or {}).get("content") or []
    text = ""
    for c in content:
        if c.get("type") == "text" and c.get("text"):
            text = c["text"]
            break
    lines = [l for l in text.strip().split("\n") if l]
    if not lines:
        return []
    header = lines[0].split("\t")
    out = []
    for line in lines[1:]:
        cells = line.split("\t")
        out.append({header[i]: (cells[i] if i < len(cells) else "") for i in range(len(header))})
    return out


def call_tool(name: str, arguments: dict[str, Any]) -> Optional[dict]:
    """Invoke a SIX MCP tool. Returns the parsed JSON-RPC payload, or None on a transient
    failure (network/parse) — callers must treat None as 'unknown', NOT 'no data', so a blip
    during a parallel warm-up never gets poisoned into a negative cache."""
    if not settings.six_enabled:
        return None
    for attempt in range(2):  # one cheap retry smooths over warm-up bursts / SSE hiccups
        try:
            resp = httpx.post(
                settings.six_url,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    "Authorization": f"Bearer {settings.six_token}",
                },
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                      "params": {"name": name, "arguments": arguments}},
                timeout=30.0,
            )
            payload = _parse_payload(resp.text)
            if payload.get("error") or "result" not in payload:
                continue  # server-side/transient — retry once, else fall through to None
            return payload
        except Exception:
            continue
    return None


def _first(row: dict, *keys: str) -> str:
    """SIX flattens scalar Value objects inconsistently (e.g. `close.value` vs `value`
    depending on the field spec). Try each candidate column name."""
    for k in keys:
        v = row.get(k)
        if v not in (None, ""):
            return v
    return ""


def _fnum(s: str) -> Optional[float]:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def end_of_day_close(valor: str, mic: str) -> Optional[float]:
    """Latest EOD close for a listing, cached. Returns None if unavailable/unconfigured."""
    q = live_quote(valor, mic)
    return q.get("price") if q else None


def live_quote(valor: Optional[str], mic: Optional[str]) -> dict:
    """Latest EOD price for a listing as {price, currency, timestamp, change_pct, source}.

    Cached to disk, INCLUDING negative results: most non-US (e.g. Swiss XSWX) listings return
    no price in the hackathon dataset, so we persist `{}` to avoid re-hitting them every boot.
    Returns {} when unavailable/unconfigured."""
    if not settings.six_enabled or not valor or not mic:
        return {}
    # Don't even call for venues we know the token doesn't price — keeps the warm-up fast
    # and avoids polluting the cache with guaranteed-empty probes.
    if mic not in PRICED_MICS:
        return {}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"six_quote_{valor}_{mic}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text())
        except Exception:
            pass

    # The covered-venue snapshot is itself flaky (returns a valid-but-empty body under load),
    # so retry a few times before believing 'no data'. Only a genuinely empty result after all
    # attempts is negative-cached; a transient None is returned uncached for a later retry.
    out: dict = {}
    saw_response = False
    for _ in range(3):
        snap = call_tool("end_of_day_snapshot", {
            "mode": "execute",
            "listing_ids": [f"{valor}_{mic}"],
            "fields": ["close.value", "close.timestamp", "open.value"],
        })
        if snap is None:
            continue
        saw_response = True
        rows = _rows(snap)
        close = _fnum(_first(rows[0], "close.value", "value", "close")) if rows else None
        if close is None:
            continue  # valid-but-empty under load — try again
        ts = _first(rows[0], "close.timestamp", "timestamp")
        open_ = _fnum(_first(rows[0], "open.value", "open"))
        base = call_tool("listing_base", {
            "mode": "execute",
            "listing_ids": [f"{valor}_{mic}"],
            "fields": ["listingCurrency", "ticker"],
        })
        brows = _rows(base) if base else []
        out = {
            "price": round(close, 2),
            "currency": (_first(brows[0], "listingCurrency") if brows else "")
                        or MIC_CCY.get(mic),
            "timestamp": ts or None,
            "ticker": (_first(brows[0], "ticker") if brows else "") or None,
            "change_pct": (round((close - open_) / open_ * 100, 2)
                           if open_ not in (None, 0) else None),
            "source": "SIX EOD",
        }
        break
    if not saw_response:
        return {}  # never got a usable response — uncached, retry on a later boot
    cache.write_text(json.dumps(out))
    return out


def enrich_listing(valor: Optional[str], mic: Optional[str]) -> dict:
    """One-shot enrichment for a holding/candidate, flattened into model-ready kwargs (A+C).

    Surfaces the live SIX EOD price and the SIX-resolved exchange ticker from listing_base.
    NB: the hackathon token does NOT populate Bloomberg/CUSIP/SEDOL symbology, and
    instrument_markets coverage is patchy, so the exchange ticker is the one reliable
    SIX-sourced identifier we can show. Returns {} when off/unavailable."""
    if not settings.six_enabled:
        return {}
    out: dict = {}
    q = live_quote(valor, mic)
    if q.get("price") is not None:
        out["live_price"] = q["price"]
        out["live_ccy"] = q.get("currency")
        out["live_ts"] = q.get("timestamp")
        out["live_change_pct"] = q.get("change_pct")
        out["price_source"] = q.get("source")
    if q.get("ticker"):
        out["six_ticker"] = q["ticker"]
    return out
