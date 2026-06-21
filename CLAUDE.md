# CLAUDE.md — Advisory Workbench

> SwissHacks · SIX / Noumena / NTT DATA challenge: *The Next Generation of Wealth Advisory*.
> Rename the project if you pick a codename. This file is the single source of truth for how we build together — read it before starting any task, and update it when a contract changes.

---

## 1. What we're building

A workbench for a **relationship manager (RM)**. It builds a living client profile from CRM history, watches external information against that profile, and — within the client's fixed mandate — proposes asset-level changes plus a ready-to-use conversation. The RM always approves; the client always decides. The AI never advises the client directly and never places trades.

Two things the AI produces for the RM:
1. **Strategy proposal** — same-sector swaps within the mandate, limited to CIO-approved, sentiment-screened stocks.
2. **Dialogue suggestion** — conversation starters, mixing client-specific signals with light general-market context.

---

## 2. Golden rules (do not break these)

- **Advisory only.** The agent proposes; the RM approves; the client decides. Never auto-execute or auto-send anything. Every side-effectful step is gated by an explicit RM confirm.
- **Traceability.** Every profile fact, alert, and suggestion carries a pointer back to its source (CRM log line, news item, CIO list row). If you can't cite it, don't surface it. This is 25% of the score.
- **Token discipline.** Classify/embed **once** and cache. Matching is a cheap index lookup, never an LLM call per client. The expensive model runs only on the handful of real matches, lazily (when the RM opens the item). See §9.
- **Strategy stays inside the rails.** The agent may only choose among CIO-approved stocks; mandate sub-asset-class targets and the ±2.0pp drift rule are constraints, not suggestions.
- **General market info seeds dialogue, not strategy.** Macro/heuristic context (conflicts, big market moves) flows to the dialogue output only.
- **Secrets never get committed.** Keys live in `.env` (git-ignored). Update `.env.example` when you add one.

---

## 3. Architecture (the data model)

Three logical graphs. For the hack, back them with plain tables/objects — **don't stand up a separate graph DB unless we have spare time**; Noumena is available if we do.

- **CRM graph** — per client.
  - `meeting_log`: append-only, git-style. Immutable raw entries (markdown), each with `source`, `timestamp`, `modality`. Never edited, only appended.
  - `profile`: the current materialised view, rebuilt/updated from the log. Four facets:
    - `professional` — work context and professionally-linked interests
    - `interests` — personal/regular interests
    - `historical` — distilled behaviour & decision summary (derived digest, *not* the raw log)
    - `personality` — risk appetite, communication style, values/ethics flags
- **News graph** — ingested items, topic-tagged, with source and sentiment.
- **Meta graph** — the shared **topic index**. A client's interest edges = their subscription; a news item's tags = its classification. **A match is a shared topic node** (set intersection), not a stored broker rule and not an LLM call. Sector nodes also live here so swaps can be sector-constrained.

Flow, end to end:

```
capture (photo/voice/text) → markdown → meeting_log (immutable)
        → summarise → profile facets → interest edges (meta graph)

news/info sources → classify once (shared) → news graph tags (meta graph)

approved stocks (CIO) → sentiment + ethics labelling → labelled stocks

match = profile topics ∩ news/stock topics   (index, no LLM)
        → CRM agent reasons over: profile + matched signals + current portfolio + labelled stocks
        → STRATEGY proposal (approved, sentiment-aware)
        → DIALOGUE suggestion (+ general market context, discussion only)
        → RM approves / converses → client decides
```

---

## 4. Repo layout (proposed)

```
/                  CLAUDE.md, README, docker-compose.yml, .env.example
/backend           FastAPI app (Python) — agents, graph, API
  /ingestion         source adapters (see §6), normalisation
  /graph             node/edge models + persistence (CRM, news, meta)
  /agents            crm_agent, classifier, match, advisory, orchestrator
  /api               routes (the contract in §7)
/frontend          Next.js — dashboard, confirm gates
/data              seed datasets (the two xlsx workbooks) + fixtures
/cache             cached external responses (git-ignored)
/crm-graph         exploratory Python spike (graph build/export); fold into /backend when scaffolded
/demo              provided reference scaffolding (do not edit; reference only)
/docs              diagrams, persona notes
```

Default stack: **Python/FastAPI** backend (easy for xlsx, embeddings, LLM SDKs) + **Next.js** frontend (committed — Visual Design is 15% of the score). Postgres/Redis/MinIO are available via `docker compose` (see §5). The provided `/demo` is TypeScript/Express — use it to confirm credentials and as a calling reference, not as the app. The existing `/crm-graph` scripts are an early spike; migrate their logic under `/backend` rather than building the app around them.

---

## 5. Setup & commands

```bash
# 0. credentials — copy and fill in (SIX MCP, Event Registry, Phoeniqs)
cp .env.example .env

# 1. local infra (Postgres, Redis, MinIO, MailHog, PgAdmin)
docker compose up -d

# 2. backend
cd backend && pip install -r requirements.txt && uvicorn app:app --reload   # :8000

# 3. frontend
cd frontend && npm install && npm run dev                                    # :3000

# 4. classifier worker (news ingest + tag) — runs separately
cd backend && python -m agents.classifier --watch

# verify all integrations BEFORE building on them
curl localhost:8000/api/health/integrations
# or use the provided demo: cd demo && npm install && npm run dev → GET /api/analysis/integrations
```

**Everyone runs the integration health check in the first hour.** SIX has a limited token subscription (6 of 23 tools out of scope), Event Registry has quota, Phoeniqs has finite credits — find auth problems early, not at hour 40.

---

## 6. Data sources — where each datum comes from

**Design principle: one adapter per source, behind a common interface, swappable mock ↔ live.** Seed from the static workbooks first (deterministic, demo-safe), then layer live feeds. **Cache every live response** to `/cache` or Redis, keyed by request — re-runs and the demo must not burn quota or hit rate limits.

```python
# common shape every adapter implements
class Source:
    def fetch(self, query) -> list[Record]: ...   # live or mock behind same call
```

| Source | Tier | Used by | Notes |
|---|---|---|---|
| `SwissHacks CRM.xlsx` (4 clients, 3-yr logs) | seed/static | CRM stream | one tab per client → parse into `meeting_log` → profile |
| `SwissHacks Portfolio Construction.xlsx` | seed/static | Portfolio stream | mandates, CIO list (BUY/HOLD/SELL + swap candidates), transactions, cashflows. Balanced & Growth carry deliberate drift breaches |
| **SIX MCP / Web API** | live | Portfolio stream | prices, instruments, mandate valuation. IDs: `{Valor}_{MIC}` for listing tools (`end_of_day_snapshot`, etc.); Valor alone for instrument tools; ISIN for bonds. See `docs/SIX_MCP.md` |
| **Event Registry / Tenity MCP-News** | live | News stream | news + sentiment. Yahoo Finance / Google News also work |
| **Twitter / X** (optional) | live | News stream | extra signal source; behind the same adapter interface |
| **Phoeniqs** | live | classifier, advisory, capture | LLM **and** embeddings. The only LLM cost surface |

Decisions to lock hour 0:
- **Seed-first.** Wire the xlsx adapters before any live feed so the demo runs offline if a key dies.
- **One normalisation point.** All adapters emit the same `Record` shape; ingestion writes to the graph. Adding a source = one new adapter, nothing downstream changes.
- **Sentiment is labelled upstream, once per stock** (not re-derived inside the agent). Approved-stock sentiment comes from the news/sentiment feed, joined to the CIO list.

---

## 7. Shared contracts (freeze these early so we can parallelise)

These are the seams between streams. Agree them in the first hour; change only by updating this file and pinging the channel.

1. **Topic vocabulary** — a small controlled list (start with the personas' needs): `pharma`, `reforestation/palm-oil`, `governance/labour`, `us-tech-ai`, plus sector tags. CRM and News streams both write topic edges; they must use the same strings.
2. **Graph schema** — node and edge types for CRM / news / meta. Owned by the CRM stream, agreed by all.
3. **Adapter interface** — `Source.fetch()` shape above (§6).
4. **Agent API** — `GET /clients/{id}/insights` returns `{ client, matches[], strategy_proposal, dialogue_suggestion, additional_proposals[], reaction, life_events[], generated_at, llm_used }`, each item carrying `provenance`. Owned by Advisory/Orchestration stream.
5. **Provenance format** — `{ source_type, source_id, excerpt }` on every fact and suggestion.
6. **Worldview engine fields** — the client is modelled, not flattened to a topic set. Each `Match` carries `relevance` (a conviction-weighted 0–100 score with a cited component breakdown), `lens` (the news reframed through the client's own documented words), and `celebrate` (a genuine good-news flag). `ClientInsights` additionally carries `reaction` (the predicted client reaction to the primary proposal) and `life_events` (recent dated values-shifts). `relevance`/`lens`/`celebrate`/`life_events` are **deterministic and free** — computed at match time for every surface (incl. the overview); `reaction` is the only added strong-model call — lazy, on the opened client, cached per client (§9). All advisory-only and fully cited (§2). Lives in `backend/workbench/agents/worldview.py`.
7. **Client Digital Twin** — the deep, conversational face of the worldview engine (`backend/workbench/agents/twin.py`). `GET /clients/{id}/twin` → `ClientTwin` (a cited pre-mortem on the current proposal: `stance` receptive/mixed/likely_to_object + `score`/`confidence`, `drivers[]` each citing the log line behind it — value-alignment, risk-fit, framing and a recent life-event driver — plus `anticipated_objection`/`suggested_framing`). `POST /clients/{id}/twin/ask` → `TwinAskAnswer` (free-form RM question, predicted in the client's voice, grounded in cited facts). `POST /clients/{id}/twin/format` → `TwinFormatResult` (autoformat a draft into email/sms/whatsapp/talking_points/call_script). Deterministic core, LLM polishes phrasing only (§9); advisory-only — it reasons about the client to prep the RM, never contacts the client, never sends (§2). It reuses the engine's reaction as its offline framing fallback, so the two never disagree.

Until a contract is real, **publish a stub** (hard-coded JSON for one persona) so downstream streams aren't blocked.

---

## 8. Workstreams (one owner each — write your name in)

### A. External information / news input — Owner: ___
- Source adapters: Event Registry/Tenity, Twitter, Yahoo/Google News (common interface, §6).
- **Classify-once worker**: embed each item, tag against the topic vocabulary, write to news + meta graphs. Cheap model or embeddings — never per-client.
- **Stock sentiment + ethics labelling**: take the CIO approved list (from stream C), label each name with sentiment/ethics from the feed, expose as "labelled stocks".
- **General market info**: heuristic, all-clients macro digest (conflicts, big moves) for the dialogue output — one shared job, with a per-client cap so it doesn't dominate.
- Publishes: news graph tags, labelled stocks, market digest.

### B. CRM / client knowledge — Owner: ___
- Multimodal capture: photo (OCR), voice (STT), text → markdown.
- `meeting_log` (append-only) + **extract → stage → RM confirm** gate. Nothing reaches the live profile without confirmation.
- Parse `SwissHacks CRM.xlsx` → seed the four personas' logs and profiles.
- Profile facets (professional / interests / historical / personality) + interest edges into the meta graph.
- Owns the graph schema (§7.2) and topic vocabulary (§7.1) jointly with stream A.
- Publishes: CRM graph, profile, interest/topic edges.

### C. Portfolio / market data — Owner: ___
- SIX MCP adapter: prices, holdings, mandate valuation, drift vs ±2.0pp.
- Parse `SwissHacks Portfolio Construction.xlsx`: mandates, **CIO recommendation list + swap candidates**, transactions, cashflows.
- Approved-stocks provider → hand the CIO list to stream A for sentiment labelling.
- Same-sector swap logic constrained to the CIO universe.
- Publishes: current portfolio, approved-stock universe, swap candidates, sector nodes.

### D. Match + Advisory + Orchestration — Owner: ___
- Meta-graph topic index + **match** (set intersection, no LLM).
- **Advisory agent**: conflict check, strategy proposal (approved + sentiment-aware), dialogue suggestion. Strong model, lazy, cached per (client, item).
- Orchestrator + the `GET /clients/{id}/insights` API (§7.4).
- Consumer of A/B/C — start against their stubs.
- Publishes: the insights API.

### E. Dashboard / trust UX / demo — Owner: ___
- Frontend: client view, alerts, **dual-output panels** (strategy + dialogue), portfolio view.
- Trust UX: provenance click-through, confirm gates, "why this surfaced" tags.
- Demo story + `.pptx` (problem/solution, demo, core features, user journey).
- Renders stream D's API; nothing in here makes decisions.

---

## 9. Token budget rules

- **Classify/embed once, shared across all clients.** Cache the result on the item. Never re-classify per client.
- **Matching is free** — index intersection over the meta graph, no model call.
- **Strong model only on real matches, lazily** — run conflict-check + draft when the RM opens the alert, not speculatively. Cache the verdict per (client, item).
- **Cheap model (or embeddings) for tagging; strong model for the dialogue/strategy draft** — spend where the judges can see the output.
- Naive cost is O(clients × items); ours is (items classified once) + (real matches reasoned once).

---

## 10. Conventions

- Branches: `feat/<stream>-<thing>` (e.g. `feat/news-classifier`). Small PRs, merge often.
- Don't commit `.env`, `/cache`, large data dumps. Do commit the two seed workbooks under `/data`.
- Keep functions behind the §7 contracts; if you change a contract, update this file in the same PR.
- UK spelling in user-facing copy.

---

## 11. Demo plan

- **Vertical slice first: Schneider** (foundation funding a chronic-illness research field; trigger = a pharma firm shuts that research division). It exercises every box — CRM facet → topic → classified news → conflict surfaced → sentiment-screened swap → dialogue. Get this working end to end before fanning out.
- Then the other three personas (Huber / Räber / Ammann), each a different trigger, reusing the same pipeline.
- Judging weights: Creativity 25 · Trust & Explainability 25 · Feasibility 20 · Visual Design 15 · Presentation 15. The provenance + confirm-gate work directly serves the first two; the token discipline serves Feasibility.

---

## 12. Personas (test fixtures)

| Persona | Strategy | Trigger |
|---|---|---|
| Schneider | Balanced | pharma firm shuts research division for the foundation's disease |
| Huber | Defensive | consumer-goods firm announces palm-oil deforestation cut-off |
| Räber | Defensive | CIO suggests rebalancing blue chips → US AI stocks (averse to US tech) |
| Ammann | Growth | labour-exploitation scandal hits a portfolio consumer brand |