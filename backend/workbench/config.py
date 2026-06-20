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

    stt_provider = (os.getenv("STT_PROVIDER", "elevenlabs").strip().lower() or "elevenlabs")
    elevenlabs_key = _clean(os.getenv("ELEVENLABS_API_KEY"))
    elevenlabs_stt_model = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v1").strip() or "scribe_v1"

    ocr_provider = (os.getenv("OCR_PROVIDER", "phoeniqs").strip().lower() or "phoeniqs")
    phoeniqs_ocr_model = os.getenv("PHOENIQS_OCR_MODEL", "inference-deepseek-ocr").strip() or "inference-deepseek-ocr"

    # --- Additional free data sources (CLAUDE.md §6: one adapter per source, all seed-first) ---
    # SEC EDGAR: free, NO key. The fair-access policy only asks for a User-Agent identifying the
    # caller (name + email). data.sec.gov serves 8-K/full-text/Form 4 as JSON at up to 10 req/s.
    sec_user_agent = os.getenv(
        "SEC_USER_AGENT", "Advisory Workbench (contact: rm@advisory-workbench.example)"
    ).strip()
    sec_url = os.getenv("SEC_API_URL", "https://data.sec.gov").strip()
    sec_fts_url = os.getenv("SEC_FTS_URL", "https://efts.sec.gov/LATEST/search-index").strip()

    # Financial Modeling Prep (free tier): ESG controversy ratings, earnings calendar/results,
    # analyst ratings + price targets, fundamentals + dividends. One key, several adapters.
    fmp_key = _clean(os.getenv("FMP_API_KEY"))
    fmp_url = os.getenv("FMP_API_URL", "https://financialmodelingprep.com/api/v3").strip()

    # Macro/FX digest. Frankfurter (ECB rates) needs NO key; FRED key is optional enrichment.
    fred_key = _clean(os.getenv("FRED_API_KEY"))
    macro_url = os.getenv("MACRO_API_URL", "https://api.frankfurter.dev/v1").strip()

    @property
    def stt_enabled(self) -> bool:
        if self.stt_provider == "elevenlabs":
            return bool(self.elevenlabs_key)
        # phoeniqs path not wired yet — see transcribe.py
        return False

    @property
    def ocr_enabled(self) -> bool:
        if self.ocr_provider == "phoeniqs":
            return bool(self.phoeniqs_key)
        return False

    @property
    def llm_enabled(self) -> bool:
        return self.use_live and bool(self.phoeniqs_key)

    @property
    def six_enabled(self) -> bool:
        return self.use_live and bool(self.six_token)

    @property
    def news_enabled(self) -> bool:
        return self.use_live and bool(self.news_key)

    @property
    def sec_enabled(self) -> bool:
        # No key required, but gated on USE_LIVE so the default demo stays fully offline.
        return self.use_live and bool(self.sec_user_agent)

    @property
    def fmp_enabled(self) -> bool:
        return self.use_live and bool(self.fmp_key)

    @property
    def macro_enabled(self) -> bool:
        # Frankfurter needs no key; gated on USE_LIVE only.
        return self.use_live


settings = Settings()
