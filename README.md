# Advisory Workbench

> **SwissHacks 2026 · SIX · Noumena Digital · NTT DATA** — *The Next Generation of Wealth Advisory*

A workbench for a **relationship manager (RM)**. It builds a living client profile from CRM history, watches news against that profile, and — strictly within the client's fixed mandate — proposes **(a)** same-sector swaps drawn only from the CIO-approved list and **(b)** a ready-to-use dialogue. The RM approves; the client decides; the AI never advises the client directly and never places a trade.

Every alert, swap, and drafted message carries a pointer back to its source — the CRM log line, the news item, the CIO rating, the held position — so the RM can see exactly *why* something surfaced.

---

## Golden rules

1. **Advisory only.** The agent proposes; the RM approves; the client decides. Nothing auto-executes or auto-sends. The strategy never changes — personalisation happens at the *asset level* inside the existing mandate.
2. **Traceability / provenance.** Every fact, alert, and suggestion carries `{ source_type, source_id, excerpt }` back to its origin. If we can't cite it, we don't surface it. This is **25% of the score** — it is a feature, not a footnote.
3. **Token discipline.** Classify and embed **once**, cached on the item. Matching is a free index lookup (set intersection), never an LLM call per client. The strong model runs only on the handful of real matches, lazily, and the verdict is cached per client.

---

## Architecture

Three logical graphs, backed by plain in-memory tables (no separate graph DB):

- **CRM graph** — per client: an append-only `meeting_log` (immutable markdown entries) plus a materialised `profile` with four facets (professional / interests / historical / personality). The profile emits **interest edges** into the meta graph.
- **News graph** — ingested items, each topic-tagged with a source and sentiment, classified **once**.
- **Meta graph** — the shared **topic index**. A client's interest edges are their subscription; a news item's tags are its classification. Sector nodes also live here so swaps stay same-sector.

**A match is a shared topic node** — `client_topics ∩ news_topics`, a set intersection over the meta graph. No LLM, no stored broker rules.

```
capture / CRM.xlsx ──► meeting_log (immutable) ──► profile facets ──► interest edges ┐
                                                                                      │
news fixtures / Event Registry ──► classify once ──► news tags ───────────────────────┤
                                                                                      ▼
Portfolio.xlsx + CIO list ──► sentiment + ethics labels ──► labelled stocks      META GRAPH
                                                                                      │
                                   match = profile topics ∩ news/stock topics  ◄──────┘
                                   (index lookup — NO LLM)
                                              │
                                              ▼
                advisory agent reasons over profile + match + portfolio + CIO universe
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                        ▼
              STRATEGY proposal                          DIALOGUE suggestion
       (same-sector, CIO-approved swap)            (talking points + draft message
                                                      + light general-market context)
                                              │
                                              ▼
                            RM approves / converses ──► client decides
```

---

## Quickstart

The backend is **Python / FastAPI** (`backend/`, package `workbench`). The frontend is **Next.js** (`frontend/`).

> **Offline-first.** Everything runs on the two seed workbooks with **no API keys**. The classifier, matcher, and advisory agent all have deterministic fallbacks, so the full four-persona demo works fully offline. Keys only enable live feeds and LLM-written prose.

### Backend (`:8000`)

```bash
cd backend
python3 -m pip install -r requirements.txt
uvicorn app:app --reload
```

### Tests

```bash
cd backend
python3 -m pytest -q          # 15 passed
```

### Frontend (`:3000`)

```bash
cd frontend
npm install
npm run dev
```

### Enabling live feeds (optional)

```bash
cp .env.example .env          # then fill in keys
```

Set `USE_LIVE=1` and provide the relevant key to switch a source from seed to live:

| Variable          | Enables                                       | Default (blank)            |
|-------------------|-----------------------------------------------|----------------------------|
| `PHOENIQS_API_KEY`| LLM-written dialogue (Phoeniqs)               | deterministic drafts       |
| `SIX_MCP_TOKEN`   | live prices / mandate valuation (SIX MCP)     | workbook seed valuation    |
| `NEWSAPI_KEY`     | live news + sentiment (Event Registry)        | seed news fixtures         |

`USE_LIVE=0` (the default) forces fully offline, deterministic behaviour even if keys are present. Check status any time at `GET /api/health/integrations`.

---

## Demo personas

Four clients, four distinct triggers, one pipeline. Each currently surfaces **one** alert and a fully-cited proposal (all generated by the deterministic path — `llm_used: false`).

| Persona | Mandate | Trigger | Strategy action |
|---|---|---|---|
| **Hubertus Schneider** | Balanced | A pharma firm shuts the research division for the foundation's disease | **SWAP** Biogen Inc. → **Eli Lilly & Co.** (Health Care, drift-safe) — divest a holding that conflicts with his Parkinson's-research stance |
| **Marius Huber** | Defensive | A consumer-goods firm announces a palm-oil deforestation cut-off | **INCREASE** **Unilever PLC** (Consumer Staples, drift-safe) — surface a values-aligned opportunity, funded within the sleeve |
| **Eugen Räber** | Defensive | CIO suggests rebalancing blue chips → US AI stocks | **HOLD** + prefer tangible **ASML Holding N.V.** (Information Technology) — respect his logged aversion to speculative US tech; strategy unchanged |
| **Julian Ammann** | Growth | A labour-exploitation scandal hits a portfolio consumer brand | **SWAP** PDD Holdings Inc. → **Cie Financière Richemont** (Consumer Discretionary) — exit reputational risk for a same-sector CIO BUY |

Each proposal lists the constraints it checked (CIO-approved universe, same sector, sub-asset-class drift vs ±2.0pp) and cites the CRM lines, news item, portfolio holding, and CIO rating behind it.

---

## API

`GET /clients/{id}/insights` returns `{ client, matches[], strategy_proposal, dialogue_suggestion }`, each item carrying `provenance`.

| Method & path | Description |
|---|---|
| `GET /health` | liveness + world summary (clients, news count, CIO universe size) |
| `GET /api/health/integrations` | per-source status: configured / live / mode |
| `GET /clients` | all client summaries (name, mandate, headline, alert count) |
| `GET /clients/{id}` | profile facets, mandate, log count |
| `GET /clients/{id}/insights` | **the contract** — matches + strategy proposal + dialogue suggestion (`?refresh=1` to bypass cache) |
| `GET /clients/{id}/portfolio` | holdings, total CHF, mandate targets |
| `GET /clients/{id}/analytics` | allocation (asset class / sub-asset class drift / sector), figures, top holdings, per-region exposure + alert-linked risk (for the charts + globe) |
| `GET /clients/{id}/graph` | the CRM knowledge graph (RM → household → people → interactions → themes) for the Network view |
| `GET /clients/{id}/log` | the append-only meeting log |
| `GET /news` | the classified news graph |

Reference payloads for all four personas live in `docs/api_samples/`.

---

## Repo layout

```
/                  README.md, CLAUDE.md, AGENTS.md, .env.example
/backend           FastAPI app (Python, package `workbench`)
  app.py             entry point — `uvicorn app:app`
  workbench/
    config.py          settings + graceful offline degradation
    topics.py          controlled topic vocabulary + sector nodes + keyword classifier
    models.py          Pydantic models (Provenance, Profile, NewsItem, Match, …)
    seed.py            build_world(): wires the three graphs from the workbooks
    ingestion/         crm_xlsx, portfolio_xlsx, news (fixture + Event Registry), six_mcp
    graph/             World store (CRM / news / meta)
    agents/            classifier, matcher, profile_builder, advisory, orchestrator, llm
    api/               FastAPI routes (the insights contract)
  data/              seed fixtures (news, persona seeds, stock labels)
  tests/             pytest suite (pipeline + API)
/frontend          Next.js dashboard (App Router + Tailwind)
/data              the two provided workbooks (CRM, Portfolio Construction)
/docs              SIX MCP guide, Phoeniqs setup, challenge decks, api_samples/
/demo              provided TypeScript/Express reference integration (do not edit)
```

---

## What's mocked vs live (honesty note)

- **Seed-first by design.** The CRM and Portfolio workbooks, the news fixtures, and the CIO stock labels are the deterministic source of truth. The demo runs end to end with zero keys and zero network calls.
- **Live behind the same interface.** Each source has a live adapter (Phoeniqs LLM, SIX MCP valuation, Event Registry news) that switches on only when `USE_LIVE=1` and the matching key is set. Swapping mock ↔ live is one flag; nothing downstream changes.
- **The advisory agent's prose** is deterministic by default; with a Phoeniqs key it upgrades the dialogue draft to LLM-written copy (`llm_used` flips to `true`). The *strategy logic* — swap selection, sector and drift constraints — stays deterministic and rule-bound either way.
- **The frontend** (`frontend/`, Next.js 14 + Tailwind) renders the insights API across six tabs: **Advisory** (alert cards with "why this surfaced" + the dual strategy/dialogue panels), **Portfolio** (holdings + drift table), **Analytics** (allocation donut, mandate-drift chart, sector + figure cards — recharts), **Investment Map** (a 3D **cobe** globe of geographic exposure with alert-linked, cited region risks), **CRM Network** (the force-directed knowledge graph), and **Profile**. Provenance click-through and RM confirm gates throughout. It builds clean (`npm run build`) and reads the backend at `:8000`; it makes no decisions of its own. Screenshots in `docs/screenshots/`.

### Provenance & explainability

This is the part the judges weigh most (25%). Every surfaced item is a `Provenance` record — `{ source_type, source_id, excerpt, url?, timestamp? }`. A single swap proposal cites the **CRM lines** that establish the client's stance, the **news item** that triggered it, the **portfolio holding** it affects, and the **CIO rating** of the replacement — and lists the **constraints it checked** (CIO universe, same sector, ±2.0pp drift). Nothing reaches the RM without a citation, and nothing reaches the client without the RM.

---

*UK spelling throughout. `CLAUDE.md` is the canonical build spec; this README is the project overview.*
