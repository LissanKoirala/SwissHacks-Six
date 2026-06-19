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
    if not settings.six_enabled:
        return None
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
            timeout=45.0,
        )
        return _parse_payload(resp.text)
    except Exception:
        return None


def end_of_day_close(valor: str, mic: str) -> Optional[float]:
    """Latest EOD close for a listing, cached. Returns None if unavailable/unconfigured."""
    if not settings.six_enabled or not valor or not mic:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"six_eod_{valor}_{mic}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text()).get("close")
        except Exception:
            pass
    res = call_tool("end_of_day_snapshot", {
        "mode": "execute",
        "listing_ids": [f"{valor}_{mic}"],
        "fields": ["close.value", "close.timestamp"],
    })
    if not res:
        return None
    rows = _rows(res)
    if not rows:
        return None
    try:
        close = float(rows[0].get("close.value") or rows[0].get("close") or "")
    except (TypeError, ValueError):
        return None
    cache.write_text(json.dumps({"close": close}))
    return close
