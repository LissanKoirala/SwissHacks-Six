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
    # Extra allowed CORS origins for prod (comma-separated, exact scheme+host, no trailing slash),
    # e.g. "https://billionaire.lissan.dev". Localhost is always allowed via a regex.
    cors_origins = os.getenv("CORS_ORIGINS", "").strip()

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
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

    # Per-client email for the Workspace (filter the RM's inbox/calendar to one client, draft to
    # them). For live testing with ONE real Gmail, set WORKSPACE_TEST_BASE=you@gmail.com and each
    # client resolves to a plus-address you@gmail.com+<client_id> → you+<client_id>@gmail.com, all
    # landing in that one inbox. Per-client override: CLIENT_EMAIL_<CLIENT_ID> (e.g.
    # CLIENT_EMAIL_SCHNEIDER). Falls back to the address on file in persona_seeds.json.
    workspace_test_base = _clean(os.getenv("WORKSPACE_TEST_BASE"))

    # --- Twilio SMS morning briefing (spec §6–§8) ---
    twilio_account_sid = _clean(os.getenv("TWILIO_ACCOUNT_SID"))
    twilio_auth_token = _clean(os.getenv("TWILIO_AUTH_TOKEN"))
    twilio_from_number = _clean(os.getenv("TWILIO_FROM_NUMBER"))
    briefing_composer = (os.getenv("BRIEFING_COMPOSER", "deterministic").strip().lower() or "deterministic")
    briefing_tz = os.getenv("BRIEFING_TZ", "Europe/Zurich").strip() or "Europe/Zurich"
    scheduler_enabled = os.getenv("SCHEDULER_ENABLED", "1").strip() in ("1", "true", "True")

    # 24/7 news watch (the News Agent's live tick). Opt-in: polls the live feeds every
    # NEWS_WATCH_MINUTES and surfaces freshly-matched items as breaking alerts. Off by default so
    # the offline/seed demo and tests are untouched.
    news_watch_enabled = os.getenv("NEWS_WATCH_ENABLED", "0").strip() in ("1", "true", "True")
    news_watch_minutes = int(os.getenv("NEWS_WATCH_MINUTES", "10").strip() or "10")

    # Google Flights via the ``flights`` (fli) library — no API key; can be slow on first load.
    live_flights = os.getenv("USE_LIVE_FLIGHTS", "0").strip() in ("1", "true", "True")

    # --- The Front Door: inbound email ingestion (CLAUDE.md §6 one-adapter-per-source) ---
    # Provider is swappable; everything runs on seed email fixtures with NO credentials. Drop in
    # IMAP creds (any mailbox: Gmail app-password, Outlook, Fastmail…) later and flip USE_LIVE=1.
    #   EMAIL_PROVIDER = imap | fixture
    #   IMAP: EMAIL_IMAP_HOST, EMAIL_IMAP_PORT(=993), EMAIL_IMAP_USER, EMAIL_IMAP_PASSWORD,
    #         EMAIL_IMAP_FOLDER(=INBOX), EMAIL_IMAP_SSL(=1)
    email_provider = (os.getenv("EMAIL_PROVIDER", "fixture").strip().lower() or "fixture")
    email_imap_host = _clean(os.getenv("EMAIL_IMAP_HOST"))
    email_imap_port = int(os.getenv("EMAIL_IMAP_PORT", "993").strip() or "993")
    email_imap_user = _clean(os.getenv("EMAIL_IMAP_USER"))
    email_imap_password = _clean(os.getenv("EMAIL_IMAP_PASSWORD"))
    email_imap_folder = os.getenv("EMAIL_IMAP_FOLDER", "INBOX").strip() or "INBOX"
    email_imap_ssl = os.getenv("EMAIL_IMAP_SSL", "1").strip() in ("1", "true", "True")
    # How many recent messages to pull per live scan (keeps the demo snappy + cheap).
    email_scan_limit = int(os.getenv("EMAIL_SCAN_LIMIT", "25").strip() or "25")

    # --- Gmail via OAuth (EMAIL_PROVIDER=gmail) — the "proper Google auth" path -------------------
    # No app password / no IMAP toggle: a teammate runs `python -m workbench.ingestion.gmail_oauth`
    # ONCE to authorise the account, which writes a token file (refresh token). Then set
    # EMAIL_PROVIDER=gmail + USE_LIVE=1 and the backend pulls the inbox over the Gmail API, read-only.
    # Credentials are filled in later — these are just the knobs (nothing secret lives in the repo).
    gmail_client_id = _clean(os.getenv("GMAIL_OAUTH_CLIENT_ID"))
    gmail_client_secret = _clean(os.getenv("GMAIL_OAUTH_CLIENT_SECRET"))
    gmail_refresh_token = _clean(os.getenv("GMAIL_OAUTH_REFRESH_TOKEN"))
    # Where the OAuth helper stores/reads the token (refresh token + scopes). Git-ignored.
    gmail_token_file = os.getenv("GMAIL_TOKEN_FILE", "").strip() or str(DATA_DIR.parent / ".gmail_token.json")
    # Gmail search query the scan uses (Gmail syntax). Defaults to unread workbench-tagged mail.
    gmail_query = os.getenv("GMAIL_QUERY", "subject:[workbench] is:unread").strip()

    # --- INSTANT push: Gmail watch → Pub/Sub → webhook (EMAIL_PROVIDER=gmail) ---------------------
    # With these set, Gmail notifies the backend the moment mail arrives (no polling). Needs a
    # public HTTPS webhook (POST /gmail/push) and a Pub/Sub topic — see docs/DEPLOY.md. Without
    # them, the backend falls back to the interval poller. Filled in by a teammate at deploy time.
    gmail_pubsub_topic = _clean(os.getenv("GMAIL_PUBSUB_TOPIC"))  # projects/<proj>/topics/<topic>
    gmail_watch_labels = [s.strip() for s in os.getenv("GMAIL_WATCH_LABELS", "INBOX").split(",") if s.strip()]
    # Only ingest pushed messages whose subject contains this marker ("" = ingest all). Mirrors the
    # poll query's subject gate so push and poll behave the same.
    gmail_subject_filter = os.getenv("GMAIL_SUBJECT_FILTER", "[workbench]").strip()
    # Shared secret echoed in the webhook URL (?token=...) so only Pub/Sub can post to /gmail/push.
    gmail_push_token = _clean(os.getenv("GMAIL_PUSH_TOKEN"))

    # --- The Front Door: autonomous poller (turns pull-based intake into a live trigger) ---
    # A background loop re-scans the inbox + news/risk watch on an interval so new mail and material
    # world events open tasks on their own — no manual POST needed. On by default so it just works;
    # set FRONT_DOOR_POLL=0 to disable. Advisory only: it CREATES + DRAFTS; sign-off gate untouched.
    front_door_poll = os.getenv("FRONT_DOOR_POLL", "1").strip() in ("1", "true", "True")
    # Floor at 15s so a typo can't spin a hot loop.
    front_door_poll_seconds = max(15, int(os.getenv("FRONT_DOOR_POLL_SECONDS", "60").strip() or "60"))

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

    @property
    def email_configured(self) -> bool:
        """Live mail credentials are present for the chosen provider (independent of USE_LIVE)."""
        if self.email_provider == "imap":
            return bool(self.email_imap_host and self.email_imap_user and self.email_imap_password)
        if self.email_provider == "gmail":
            return self.gmail_configured
        return False

    @property
    def gmail_configured(self) -> bool:
        """Gmail OAuth is ready: either a saved token file, or client+refresh-token env vars."""
        import os as _os
        if self.gmail_token_file and _os.path.exists(self.gmail_token_file):
            return True
        return bool(self.gmail_client_id and self.gmail_client_secret and self.gmail_refresh_token)

    @property
    def gmail_push_enabled(self) -> bool:
        """Instant push is wired: Gmail provider live + a Pub/Sub topic to watch."""
        return (self.email_enabled and self.email_provider == "gmail"
                and bool(self.gmail_pubsub_topic))

    @property
    def email_enabled(self) -> bool:
        """Pull live mail only when USE_LIVE=1 AND creds exist; otherwise seed fixtures."""
        return self.use_live and self.email_configured

    @property
    def poll_enabled(self) -> bool:
        """Run the autonomous Front Door poller."""
        return self.front_door_poll


settings = Settings()
