"""Runtime configuration. Secrets come from .env (git-ignored). Everything degrades gracefully
to deterministic/offline behaviour when keys are absent (CLAUDE.md §6 seed-first)."""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    # Load repo-root .env then backend/.env if present.
    _here = Path(__file__).resolve()
    for candidate in (_here.parents[2] / ".env", _here.parents[1] / ".env"):
        if candidate.exists():
            load_dotenv(candidate, override=False)
except Exception:  # python-dotenv optional
    pass

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
WORKBOOK_DIR = REPO_ROOT / "data"
CACHE_DIR = BACKEND_DIR / ".cache"


def _clean(v: str | None) -> str:
    v = (v or "").strip()
    if not v or v.startswith("your_"):
        return ""
    return v


class Settings:
    use_live = os.getenv("USE_LIVE", "0").strip() in ("1", "true", "True")

    phoeniqs_key = _clean(os.getenv("PHOENIQS_API_KEY"))
    phoeniqs_url = os.getenv("PHOENIQS_API_URL", "https://maas.phoeniqs.com/v1").strip()
    phoeniqs_model = os.getenv("PHOENIQS_MODEL", "inference-gpt-oss-120b").strip()

    six_token = _clean(os.getenv("SIX_MCP_TOKEN") or os.getenv("SIX_API_KEY"))
    six_url = os.getenv(
        "SIX_MCP_URL",
        "https://ca-mcpwebapi-tools.nicepebble-599ed11f.westeurope.azurecontainerapps.io/mcp",
    ).strip()

    news_key = _clean(os.getenv("NEWSAPI_KEY") or os.getenv("NEWSAI_API_KEY"))
    news_url = os.getenv("NEWSAI_API_URL", "https://eventregistry.org/api/v1").strip()

    # Google Flights via the ``flights`` (fli) library — no API key; can be slow on first load.
    live_flights = os.getenv("USE_LIVE_FLIGHTS", "0").strip() in ("1", "true", "True")

    @property
    def flights_enabled(self) -> bool:
        return self.live_flights

    @property
    def llm_enabled(self) -> bool:
        return self.use_live and bool(self.phoeniqs_key)

    @property
    def six_enabled(self) -> bool:
        return self.use_live and bool(self.six_token)

    @property
    def news_enabled(self) -> bool:
        return self.use_live and bool(self.news_key)


settings = Settings()
