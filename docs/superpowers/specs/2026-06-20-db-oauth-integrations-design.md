# Design — Persistence, Google OAuth2, Integrations & Deployable Stack

_Date: 2026-06-20 · Status: approved for spec review · Author: RM-desk session_

Turns the Advisory Workbench from a single in-memory seed demo into a deployable,
multi-RM product: each relationship manager signs in with Google, keeps the 4 seed
personas **plus their own clients/holdings/news/notes** in Postgres, gets real
Calendar/Gmail integration, and receives a Twilio SMS morning briefing — all packaged
in docker-compose behind TLS on `swisshacks.keanuc.net`.

This is the umbrella architecture. Each phase (P0–P5) becomes its own
spec → plan → implementation cycle.

---

## 1. Goals & non-goals

**Goals**
- Postgres persistence as an **overlay** on the seed workbook (seed stays the immutable baseline).
- Each RM can **add their own data** (clients, holdings, news, CRM notes) — full graph, flows through every existing view.
- **Per-RM isolation**: a signed-in RM sees `seed ⊕ their own layer`; logged-out sees seed only.
- Real **Google OAuth2** (Testing mode) → Calendar (read) + Gmail (draft).
- **Phone + Twilio** → scheduled ~09:00 Europe/Zurich SMS morning briefing.
- **docker-compose + Caddy** TLS, deployable on `swisshacks.keanuc.net`.

**Non-goals (YAGNI for now)**
- Migrating the entire seed World into the DB (seed stays code/workbook-built).
- Multi-org / team sharing, RBAC beyond "owner".
- Auto-**sending** email (golden rule: Gmail drafts only, RM reviews).
- Inbound email → task ingestion and a full Kanban (noted as a later stretch, not in P0–P5 core).
- Mobile app, payments, real trade execution.

---

## 2. Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| Database | **PostgreSQL 16**, SQLAlchemy 2.0 (sync) + Alembic |
| Data model | **Overlay**: seed baseline + per-RM DB layer (`source='seed' \| 'user'`) |
| Data layer scope | **Full graph** — clients + holdings + news + CRM notes |
| Ownership | **Per-RM isolated** worlds |
| Google auth | **Real OAuth2**, Google "Testing" publishing mode (≤100 test users, no verification) |
| Auth requirement | **Optional** — seed demo works logged-out; sign-in unlocks the layer + integrations |
| Briefing prose | `BriefingComposer` interface: **deterministic default**, pluggable Phoeniqs / Ollama |
| TLS / proxy | **Caddy** (automatic Let's Encrypt) |

---

## 3. Architecture overview

```
                    ┌──────────── Caddy (TLS, swisshacks.keanuc.net) ───────────┐
   browser  ──────▶ │  /  → frontend (Next.js)   /api,/auth → backend (FastAPI)  │
                    └────────────────────────────────────────────────────────────┘
                                              │
        ┌─────────────────────────────────────┼───────────────────────────────┐
        │ backend (FastAPI)                    │                               │
        │   seed_world  (built once, immutable)│                               │
        │   world_for(user) = seed ⊕ DB-layer  │   APScheduler  ~09:00 cron    │
        │   current_user  (session cookie)     │      → BriefingComposer       │
        │   routes: clients/overview/... +     │      → Twilio SMS             │
        │           auth/* onboarding/* integrations/* briefing/*              │
        └───────┬───────────────┬──────────────┬───────────────┬──────────────┘
                │               │              │               │
           Postgres        Google APIs      Twilio          Ollama (optional,
        (users, tokens,   (OAuth, Calendar,  (SMS)          compose profile)
         user layer)       Gmail)
```

**Key shift:** today there is a single global `app.state.world`. We replace it with a
**per-RM world provider** (§5). Everything else (advisory, overview, risk timeline,
globe, capture) is unchanged because it already reads from a `World` object and binds
its caches to that object.

---

## 4. Data model (Postgres)

SQLAlchemy 2.0 declarative, Alembic migrations. All user-layer rows carry
`owner_user_id` and a `source` discriminator so the seed baseline is never mutated and a
user's layer can be reset independently.

| Table | Purpose | Key columns |
|---|---|---|
| `rm_user` | the authenticated relationship manager | `id` (uuid), `email` (unique), `name`, `google_sub` (unique), `phone_e164` (null), `briefing_hour` (int, default 9), `briefing_enabled` (bool), `created_at` |
| `oauth_token` | per-user Google tokens, **encrypted at rest** | `id`, `user_id` fk, `provider`='google', `access_token_enc`, `refresh_token_enc`, `scopes` (text[]), `expires_at`, `updated_at` |
| `added_client` | RM's own clients | `id`, `owner_user_id` fk, `client_id` (slug, unique per owner), `name`, `mandate`, `portfolio`, `style`, `headline`, `created_at` |
| `added_holding` | positions for an added (or seed) client | `id`, `owner_user_id`, `client_id`, `portfolio`, `issuer`, `isin`, `asset_class`, `sub_asset_class`, `industry_group`, `region`, `current_chf`, `target_chf`, `valor`, `mic` |
| `added_news` | RM-added signals | `id`, `owner_user_id`, `news_id`, `title`, `body`, `source`, `url`, `published_at`, `topics` (text[]), `sentiment_score`, `sentiment_label`, `issuer_name`, `issuer_isin`, `market_digest` |
| `captured_entry` | CRM notes — **migrates `data/captured_entries.json`** | `id`, `owner_user_id`, `client_id`, `entry_id` (unique), `payload` (jsonb — full MeetingLogEntry + applied edges/facets), `created_at` |
| `briefing_log` | sent-SMS audit + idempotency | `id`, `user_id`, `sent_date` (date), `channel`='sms', `body`, `twilio_sid`, `status`, `created_at`; unique `(user_id, sent_date)` |

**Encryption:** `TOKEN_ENC_KEY` (Fernet, `cryptography`) in env; tokens encrypted before
insert, decrypted on use. Never logged.

**Captured-entry migration:** captured entries become a **per-RM overlay**. On first boot,
any existing `data/captured_entries.json` is imported into `captured_entry` under a
**default demo user** created by the migration (so the old demo captures surface when that
user is signed in); the JSON write-through is retired. The seed baseline stays
workbook-only; per-user capture replay now reads from `captured_entry`.

---

## 5. Per-RM world provider

New module `backend/workbench/graph/world_provider.py`.

- `seed_world()` — builds the immutable baseline once (current `build_world()`), cached process-wide.
- `world_for(user_id: str | None) -> World`:
  - `None` (logged-out) → return the shared `seed_world()`.
  - otherwise → **copy-on-overlay**: shallow-copy the seed collections (`clients`,
    `holdings`, `news`, `meeting_logs`, `profiles`, `interest_by_client`), then merge the
    user's `added_*` + `captured_entry` rows on top. Mutations to a user world never touch
    seed or another user. Cached per `user_id` (invalidated on that user's mutations).
  - The per-world `insights_cache` already isolates lazy advisory results per RM for free.
- `invalidate(user_id)` — drop the cached world after an add/capture so the next read rebuilds.

**API wiring:** a FastAPI dependency `current_user` reads the signed session cookie →
`rm_user | None`. Every data route (`/clients`, `/overview`, `/clients/{id}/*`, …) gains
`world = Depends(get_world)` which resolves `world_for(current_user?.id)`. Logged-out
requests transparently get the seed world — no behavioural change for the demo.

Cost: 4 clients + ~200 holdings → a per-user shallow copy is microseconds; trivial.

---

## 6. Google OAuth2 (Authlib)

- Library: **Authlib** (`authlib.integrations.starlette_client`).
- Scopes: `openid email profile`, `https://www.googleapis.com/auth/calendar.readonly`,
  `https://www.googleapis.com/auth/gmail.compose`.
- Routes:
  - `GET /auth/google/login` → redirect to Google consent (`access_type=offline`,
    `prompt=consent` to guarantee a refresh token).
  - `GET /auth/google/callback` → exchange code → upsert `rm_user` (by `google_sub`) +
    store encrypted `oauth_token` → set signed session cookie (user_id only).
  - `GET /auth/me` → `{ user, connected_scopes }` or `null`.
  - `POST /auth/logout` → clear session.
- **Sessions:** Starlette `SessionMiddleware` (httpOnly, `secure`, `SameSite=Lax`, signed
  with `SESSION_SECRET`). The cookie holds only `user_id`; tokens live in Postgres.
- **Token refresh:** on Calendar/Gmail use, if `expires_at` is past, refresh via the
  stored refresh token and re-encrypt.
- **Testing mode:** the user (Keanu) creates a Google Cloud project, OAuth consent screen
  in Testing, adds himself as a test user, and supplies `GOOGLE_CLIENT_ID/SECRET`. Redirect
  URI registered: `https://swisshacks.keanuc.net/auth/google/callback` (+ a localhost one for dev).

Frontend: a "Sign in with Google" button in the sidebar; when signed in, shows the user +
a "Connected: Calendar, Gmail" state and unlocks Add-client / live integrations.

---

## 7. Integration adapters (CLAUDE.md §6 — one adapter, mock ↔ live)

Each implements the existing `Source` interface so a mock and the live call are
interchangeable, and **every live response is cached** (Redis or disk) keyed by request.

- **`ingestion/google_calendar.py`** — `fetch()` → the signed-in RM's events for the next
  14 days (Calendar API). **Enriches** the Overview "Meetings coming up": when connected,
  real events replace/augment the deterministic suggested slots; matched to a client by
  attendee email or title. Not connected → current deterministic behaviour, unchanged.
- **`ingestion/google_gmail.py`** — `create_draft(to, subject, body)` → a **Gmail draft**
  in the RM's mailbox (never sends). Powers the "Draft pre-meeting email" affordance with
  the post-session report summary. Golden-rule compliant.

---

## 8. Twilio morning briefing

- Phone captured into `rm_user.phone_e164` via a small settings panel; `briefing_hour`
  (default 9) + `briefing_enabled`.
- **Scheduler:** APScheduler `BackgroundScheduler` started with the FastAPI app, tz
  `Europe/Zurich`. A job per enabled user (or one job that loops users) fires at their
  hour, builds `world_for(user)` → `build_overview(world)` → `BriefingComposer.compose()` →
  Twilio SMS → write `briefing_log` (unique `(user_id, sent_date)` ⇒ idempotent; no double
  send). Run uvicorn **single-worker** so only one scheduler exists (documented).
- `POST /briefing/send-test` — fire the current user's briefing immediately (for the demo;
  don't wait for 09:00). Returns the composed text + Twilio SID.
- **Twilio SDK** with `TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER`. Trial caveat: SMS
  only to verified numbers — documented in the runbook.

---

## 9. BriefingComposer (deterministic → LLM)

Interface `backend/workbench/agents/briefing.py`:

```python
class BriefingComposer(Protocol):
    def compose(self, overview: dict) -> str: ...   # returns SMS-ready text (<= ~480 chars)
```

| Backend | How | Trade-off |
|---|---|---|
| **deterministic** (default) | returns `overview["briefing"]` (already templated by `_briefing()` in `overview.py` — no model) + the top 1–2 task lines | Offline, instant, never breaks. **This is why "deterministic" works: the briefing sentence already exists.** |
| **phoeniqs** | feed the structured overview to the sanctioned Phoeniqs LLM via the existing `agents/llm.py` seam → warm 2–3 sentence brief | No container; online; costs credits |
| **ollama** | `OLLAMA_URL` service (e.g. `qwen2.5:1.5b`) over HTTP | Self-hosted, no API cost; +~1–2 GB RAM, slower on a small VPS |

Selected by `BRIEFING_COMPOSER` env (`deterministic` \| `phoeniqs` \| `ollama`). Ship
deterministic first; the LLM is a config swap. **Sizing note:** `qwen2.5:1.5b` ≈ 1.0–1.5 GB
RAM (q4); `llama3.2:3b` ≈ 2.5–3 GB. Decide Ollama-vs-Phoeniqs at P5 based on VPS specs.

---

## 10. docker-compose & deployment

Services (`docker-compose.yml` at repo root):

| Service | Image / build | Notes |
|---|---|---|
| `db` | `postgres:16` | named volume `pgdata`; healthcheck |
| `backend` | build `./backend` | runs `alembic upgrade head` on boot, then uvicorn (1 worker) |
| `frontend` | build `./frontend` | `next build` → `next start`; `NEXT_PUBLIC_API_BASE=/api` |
| `ollama` | `ollama/ollama` | **profile `llm`** (opt-in); pulls model on first run |
| `proxy` | `caddy:2` | Caddyfile: auto-TLS for `swisshacks.keanuc.net`; `/`→frontend, `/api`+`/auth`→backend |

`Caddyfile`:
```
swisshacks.keanuc.net {
    handle /api/* { reverse_proxy backend:8000 }
    handle /auth/* { reverse_proxy backend:8000 }
    handle { reverse_proxy frontend:3000 }
}
```

**Runbook:** point DNS `A swisshacks.keanuc.net → VPS`; fill `.env`; register the OAuth
redirect URI; `docker compose up -d` (add `--profile llm` for Ollama). Caddy obtains the
cert automatically.

---

## 11. Secrets / `.env` checklist (update `.env.example`)

User-provided (Keanu):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- (existing) `PHOENIQS_*` if using the Phoeniqs composer

Generated/infra:
- `POSTGRES_USER/PASSWORD/DB`, `DATABASE_URL`
- `SESSION_SECRET` (random), `TOKEN_ENC_KEY` (Fernet)
- `PUBLIC_BASE_URL=https://swisshacks.keanuc.net`, `CADDY_ACME_EMAIL`
- `BRIEFING_COMPOSER=deterministic`, optional `OLLAMA_URL`, `OLLAMA_MODEL`

All git-ignored; nothing committed (CLAUDE.md §2).

---

## 12. Golden-rule alignment

- **Advisory only** — Gmail creates **drafts, never sends**; SMS goes to the **RM**, not the
  client; nothing auto-executes.
- **Traceability** — user-added entities keep `source` + provenance; captured entries keep the
  same provenance they do today.
- **Secrets** — tokens encrypted at rest; only `user_id` in the cookie; `.env` git-ignored.
- **Token discipline** — briefing built from the cheap deterministic overview; LLM only on the
  short prose, once per send.

---

## 13. Phase plan (each its own spec → plan → build)

| Phase | Deliverable | Acceptance |
|---|---|---|
| **P0** | DB foundation + compose skeleton | Postgres + SQLAlchemy/Alembic; `captured_entry` migration; `world_provider` scaffold (null-user ⇒ seed); compose (db+backend+frontend+caddy) live over HTTPS; seed demo + captures persist |
| **P1** | Google OAuth2 + sessions + token vault | Sign in (Testing mode); `/auth/me` returns user; tokens stored **encrypted**; logout works |
| **P2** | Per-RM data layer + **Onboarding** | Add client/holding/news → DB → appears in sidebar/overview/risk for **that RM only**; logged-out unaffected |
| **P3** | Calendar integration | Connected RM's real events enrich "Meetings coming up"; graceful fallback when not connected |
| **P4** | Phone + Twilio briefing | Phone capture; `POST /briefing/send-test` delivers SMS; scheduled 09:00 job fires once/day (idempotent); deterministic composer |
| **P5** | Gmail draft + LLM composer (+ stretch: inbound scan) | "Draft pre-meeting email" creates a Gmail draft; `BRIEFING_COMPOSER=phoeniqs\|ollama` polishes prose behind a flag |

---

## 14. Risks & open items

- **APScheduler + multiple workers** → duplicate sends. Mitigation: single uvicorn worker +
  `briefing_log` idempotency. If we scale, move to a dedicated scheduler container.
- **Google verification** — Testing mode caps at 100 test users and shows an "unverified app"
  screen; fine for the demo, not public launch.
- **Twilio trial** — only verified destination numbers until upgraded.
- **VPS sizing for Ollama** — confirm RAM before choosing Ollama over Phoeniqs (P5).
- **Branch base** — implementation rebases onto `main` (now includes the
  `external-data-sources` feeds, which P3+ can reuse for real SEC/earnings) and the overview
  feature once merged.
