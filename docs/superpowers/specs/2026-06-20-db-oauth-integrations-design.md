# Design — SQLite, Google Sign-in & Twilio SMS Morning Briefing

_Date: 2026-06-20 · Status: approved for spec review · Author: RM-desk session_

Lean slice: give the Advisory Workbench a small **SQLite** store, **Sign in with Google**
(identity only), and a **Twilio SMS morning briefing** at ~09:00 that reuses the existing
deterministic `/overview` briefing. That's the whole round. Calendar, Gmail, the per-RM
data layer / onboarding, a local LLM, and the docker deploy are **documented as deferred**
(§10), not built now.

This is the implementation-ready spec for **this round** → one implementation plan.

---

## 1. Goals & non-goals

**Goals (this round)**
- **SQLite** persistence for relationship-manager accounts + their phone + briefing prefs + a send log.
- **Sign in with Google** — identity only (`openid email profile`). No Calendar/Gmail scopes.
- **Twilio SMS briefing**: each signed-in RM saves a phone number; a scheduled ~09:00
  Europe/Zurich job texts them the morning briefing; plus an on-demand **"send me a test now"**.
- Briefing text from the **deterministic** `build_overview()` (no LLM needed).
- The seed demo keeps working **logged-out**, unchanged.

**Non-goals (this round — see §10 for the deferred backlog)**
- Postgres, Alembic, per-RM data isolation, onboarding / add-your-own-clients.
- Google Calendar / Gmail API calls (so: **no OAuth token vault** — we don't persist access/refresh tokens).
- Local LLM (Ollama) / Phoeniqs briefing prose.
- docker-compose + Caddy deploy on `swisshacks.keanuc.net`.
- Auto-sending anything (golden rule); the only outbound is the SMS **to the RM**.

---

## 2. Decisions

| Decision | Choice |
|---|---|
| Database | **SQLite** (`data/workbench.db`, git-ignored), SQLAlchemy 2.0 sync, `create_all` — no Alembic |
| Auth | **Google sign-in, identity scopes only** (`openid email profile`), via Authlib |
| Token storage | **None** — we don't call Google APIs post-login, so no access/refresh persistence |
| World model | **Unchanged** — global seed world; auth decides *who gets the SMS*, not *what's in it* |
| Briefing prose | **Deterministic** (`build_overview()["briefing"]` + top tasks); `BriefingComposer` interface keeps the LLM swap open for later |
| Scheduler | **APScheduler** in-process, single uvicorn worker; idempotent via `briefing_log` |

---

## 3. Architecture

```
  browser ──▶ Next.js frontend ──▶ FastAPI backend ──▶ SQLite (rm_user, briefing_log)
                  │  "Sign in with Google"   │
                  │                            ├─ Authlib ⇄ Google (identity only)
                  │                            ├─ session cookie (user_id, signed)
                  │                            └─ APScheduler ~09:00 ─▶ BriefingComposer
                  │                                                      └─▶ Twilio SMS ▶ RM phone
   seed demo (logged-out) works as today; build_overview() unchanged
```

Auth and the briefing are **additive** — bolted beside the existing app. `build_world()` /
`build_overview()` are untouched; the briefing just calls `build_overview(seed_world)`.

---

## 4. Data model (SQLite)

SQLAlchemy 2.0 declarative, `Base.metadata.create_all(engine)` on startup (no migration tool
for a 2-table hackathon store). Session-per-request dependency.

| Table | Purpose | Columns |
|---|---|---|
| `rm_user` | the signed-in relationship manager | `id` (uuid str, pk), `google_sub` (unique), `email`, `name`, `picture` (url, null), `phone_e164` (null), `briefing_hour` (int, default 9), `briefing_enabled` (bool, default false), `created_at` |
| `briefing_log` | sent-SMS audit + idempotency | `id` (pk), `user_id` (fk), `sent_date` (date), `body`, `twilio_sid` (null), `status`, `created_at`; **unique `(user_id, sent_date)`** |

That's it. No tokens, no captured-entry migration (capture stays on its current JSON path
this round), no client/holding tables (deferred).

---

## 5. Sign in with Google (identity only)

- **Authlib** (`authlib.integrations.starlette_client.OAuth`), Google provider, scopes
  `openid email profile` only.
- Routes:
  - `GET /auth/google/login` → redirect to Google consent.
  - `GET /auth/google/callback` → validate, read userinfo (`sub`, `email`, `name`, `picture`)
    → **upsert `rm_user`** by `google_sub` → set signed session cookie → redirect to frontend.
  - `GET /auth/me` → `{ id, email, name, picture, phone_e164, briefing_hour, briefing_enabled }` or `null`.
  - `POST /auth/logout` → clear session.
- **Session:** Starlette `SessionMiddleware` (httpOnly, `SameSite=Lax`, `secure` in prod),
  signed with `SESSION_SECRET`; stores only `user_id`. No Google tokens kept.
- `current_user` FastAPI dependency resolves the cookie → `rm_user | None`. Data routes are
  unchanged (still serve the seed world); only the new `/auth/*` and `/briefing/*` + the
  phone-settings route care about the user.

You provide `GOOGLE_CLIENT_ID/SECRET`; redirect URIs: `http://localhost:8000/auth/google/callback`
(dev) and the prod one when we deploy. Identity scopes are **non-sensitive** → the Google
consent screen needs no verification even outside Testing mode.

---

## 6. Phone capture + Twilio briefing

- **Settings:** `PUT /me/briefing` `{ phone_e164, briefing_hour, briefing_enabled }` → updates
  `rm_user`. Frontend: a small panel (only when signed in) to enter phone, pick the hour,
  toggle on.
- **Compose:** `BriefingComposer.compose(build_overview(seed_world))` → SMS text (≤ ~480 chars):
  the deterministic `briefing` sentence + the top 1–2 priority-task lines + a tiny tag line.
- **Scheduler:** APScheduler `BackgroundScheduler` (tz `Europe/Zurich`) started with the app.
  A single job runs hourly; on each tick it texts every `briefing_enabled` user whose
  `briefing_hour == now.hour` and who has no `briefing_log` row for today (idempotent).
  Single uvicorn worker so exactly one scheduler exists (documented run flag).
- **On-demand:** `POST /briefing/send-test` (auth required) → compose + send immediately to the
  current user's phone; returns the text + Twilio SID. **This is the demo trigger** — no waiting
  for 09:00.
- **Twilio:** official SDK, `TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER`. Trial accounts only
  text **verified** destination numbers — note in the runbook. Missing creds → the send routes
  return a clear 503 and the scheduler no-ops (the app still boots).

---

## 7. BriefingComposer (deterministic now, LLM later)

`backend/workbench/agents/briefing.py`:

```python
class BriefingComposer(Protocol):
    def compose(self, overview: dict) -> str: ...   # SMS-ready, <= ~480 chars
```

Ship `DeterministicComposer` (assembles from `overview["briefing"]` + top tasks — no model,
offline, never breaks). The interface keeps a future `PhoeniqsComposer` / `OllamaComposer`
a drop-in swap behind a `BRIEFING_COMPOSER` env flag (deferred, §10).

---

## 8. Frontend changes

- **Sidebar footer:** "Sign in with Google" button when logged-out; avatar + name + "Sign out"
  when logged-in.
- **Briefing settings panel** (signed-in only) — reachable from the sidebar or the Overview
  header: phone field (E.164 helper), hour picker, enable toggle, and **"Send me a test
  briefing"** button showing the resulting SMS text inline.
- New `api.ts` methods: `me()`, `updateBriefing()`, `sendTestBriefing()`; `login()`/`logout()`
  navigate to the `/auth/*` routes.
- Everything else (Overview, ClientView, …) unchanged.

---

## 9. Secrets / `.env` (update `.env.example`)

You provide: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
Generated/infra: `SESSION_SECRET` (random), `DATABASE_URL=sqlite:///./data/workbench.db`,
`BRIEFING_COMPOSER=deterministic`, `PUBLIC_BASE_URL`.
All git-ignored; `data/workbench.db` git-ignored.

---

## 10. Deferred backlog (designed earlier, not this round)

Kept for when we extend — each its own future spec → plan → build:
- **Per-RM data layer + Onboarding** — add your own clients/holdings/news; SQLite overlay on
  the seed world, per-RM isolation. (The earlier Postgres overlay design applies, on SQLite.)
- **Google Calendar** read → enrich "Meetings coming up" (needs `calendar.readonly` scope +
  token vault).
- **Gmail draft** → "Draft pre-meeting email" (draft, never send; needs `gmail.compose`).
- **LLM briefing** — Ollama (`qwen2.5:1.5b`-class) or Phoeniqs, behind `BRIEFING_COMPOSER`.
- **Deploy** — docker-compose + Caddy TLS on `swisshacks.keanuc.net`. With SQLite this is just
  backend + frontend + caddy (no DB container) + a volume for `workbench.db`.

---

## 11. Golden-rule alignment

- **Advisory only** — the only outbound is an SMS **to the RM**; nothing auto-executes or
  contacts a client.
- **Secrets** — session holds only `user_id`; no Google tokens stored; `.env` + `*.db` git-ignored.
- **Token discipline** — briefing is the cheap deterministic overview; no LLM call this round.
- **Resilience** — missing Twilio/Google creds degrade gracefully (clear errors, app still boots,
  seed demo unaffected).

---

## 12. Risks & open items

- **APScheduler × multiple workers** → duplicate sends. Mitigation: single worker + the
  `(user_id, sent_date)` unique constraint.
- **Twilio trial** texts only verified numbers until the account is upgraded.
- **SQLite write concurrency** — fine at this scale (one RM, occasional writes); WAL mode on.
- **Time zone** — schedule + "today" pinned to `Europe/Zurich`.
