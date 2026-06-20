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

    # Text-to-speech for the conversational capture voice. ElevenLabs reuses the STT
    # key; falls back to the browser's speechSynthesis when unset. "Rachel" is a
    # default public voice id.
    tts_provider = (os.getenv("TTS_PROVIDER", "elevenlabs").strip().lower() or "elevenlabs")
    elevenlabs_tts_model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5").strip() or "eleven_turbo_v2_5"
    elevenlabs_voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM").strip() or "21m00Tcm4TlvDq8ikWAM"

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

    # --- Auth (Google sign-in, identity only), sessions & persistence (spec §4–§6) ---
    google_client_id = _clean(os.getenv("GOOGLE_CLIENT_ID"))
    google_client_secret = _clean(os.getenv("GOOGLE_CLIENT_SECRET"))
    google_redirect_uri = os.getenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback"
    ).strip()
    session_secret = os.getenv("SESSION_SECRET", "dev-insecure-change-me").strip() or "dev-insecure-change-me"
    session_https_only = os.getenv("SESSION_HTTPS_ONLY", "0").strip() in ("1", "true", "True")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip() or "http://localhost:3000"
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'workbench.db'}").strip()

    # Google Workspace (Gmail read/draft + Calendar read/add). Sensitive/restricted scopes —
    # fine in Testing mode for added test users. Stored tokens are Fernet-encrypted at rest.
    google_scopes = os.getenv(
        "GOOGLE_SCOPES",
        "openid email profile "
        "https://www.googleapis.com/auth/gmail.readonly "
        "https://www.googleapis.com/auth/gmail.compose "
        "https://www.googleapis.com/auth/calendar.events",
    ).strip()
    token_enc_key = _clean(os.getenv("TOKEN_ENC_KEY"))

    # --- Twilio SMS morning briefing (spec §6–§8) ---
    twilio_account_sid = _clean(os.getenv("TWILIO_ACCOUNT_SID"))
    twilio_auth_token = _clean(os.getenv("TWILIO_AUTH_TOKEN"))
    twilio_from_number = _clean(os.getenv("TWILIO_FROM_NUMBER"))
    briefing_composer = (os.getenv("BRIEFING_COMPOSER", "deterministic").strip().lower() or "deterministic")
    briefing_tz = os.getenv("BRIEFING_TZ", "Europe/Zurich").strip() or "Europe/Zurich"
    scheduler_enabled = os.getenv("SCHEDULER_ENABLED", "1").strip() in ("1", "true", "True")

    # Google Flights via the ``flights`` (fli) library — no API key; can be slow on first load.
    live_flights = os.getenv("USE_LIVE_FLIGHTS", "0").strip() in ("1", "true", "True")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def gmail_scope(self) -> bool:
        return "gmail" in self.google_scopes

    @property
    def calendar_scope(self) -> bool:
        return "calendar" in self.google_scopes

    @property
    def workspace_enabled(self) -> bool:
        # Gmail/Calendar API calls need the encryption key to store tokens at rest.
        return self.google_enabled and bool(self.token_enc_key) and (self.gmail_scope or self.calendar_scope)

    @property
    def twilio_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)

    @property
    def stt_enabled(self) -> bool:
        if self.stt_provider == "elevenlabs":
            return bool(self.elevenlabs_key)
        # phoeniqs path not wired yet — see transcribe.py
        return False

    @property
    def tts_enabled(self) -> bool:
        if self.tts_provider == "elevenlabs":
            return bool(self.elevenlabs_key)
        return False

    @property
    def ocr_enabled(self) -> bool:
        if self.ocr_provider == "phoeniqs":
            return bool(self.phoeniqs_key)
        return False

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
