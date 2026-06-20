"""Phoeniqs LLM wrapper (CLAUDE.md §9: the only LLM cost surface).

Strong model ONLY on real matches, lazily, cached per (client, item). When no key / USE_LIVE=0,
callers fall back to deterministic drafts so everything stays testable offline."""
from __future__ import annotations

import json
import re
from typing import Optional

import httpx

from ..config import settings


def llm_available() -> bool:
    return settings.llm_enabled


def chat(system: str, user: str, *, temperature: float = 0.3, max_tokens: int = 700) -> Optional[str]:
    """Return assistant text, or None if LLM is disabled or the call fails. Never raises."""
    if not settings.llm_enabled:
        return None
    try:
        resp = httpx.post(
            f"{settings.phoeniqs_url}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.phoeniqs_key}",
            },
            json={
                "model": settings.phoeniqs_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=60.0,
        )
        data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content") or None
    except Exception:
        return None


def chat_json(system: str, user: str, **kw) -> Optional[dict]:
    """Chat expecting minified JSON; tolerates prose/markdown-fenced JSON (demo fallback)."""
    txt = chat(system, user + "\n\nReturn ONLY minified JSON.", temperature=0.1, **kw)
    if not txt:
        return None
    try:
        return json.loads(txt)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", txt)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None
