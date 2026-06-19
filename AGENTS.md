# AGENTS.md

Guidance for AI coding agents working in this repository.

> **`CLAUDE.md` is the canonical source of truth for how we build.** Where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins — tell the human so it can be fixed. `README.md` is the upstream challenge brief (the problem), not a build spec.

## What this project is

SwissHacks 2026 challenge — **The Next Generation of Wealth Advisory** (SIX · Noumena Digital · NTT DATA).

We are building a **next-generation advisor dashboard** for relationship managers (RMs) in wealth management. In one place, an RM can:

1. **Read & interpret CRM notes** — parse raw conversation logs into a client's "investment DNA" (values, business context, family, personal priorities).
2. **Connect to portfolio & news** — link the client profile to current holdings and a live news feed.
3. **Surface relevant alerts** — match each client's DNA against the portfolio and incoming news to flag conflicts or opportunities.
4. **Generate a tailored message** — draft the RM's advisory note in the client's preferred style (data-driven vs. values-led).

The core product insight: **the investment strategy stays unchanged.** Personalisation happens at the **asset level** — within a client's mandate (Defensive / Balanced / Growth), AI flags holdings that conflict with the client's DNA and proposes a same-sector replacement that fits both the strategy and the person. The CIO recommendation list constrains the swap universe.

Read `README.md` for the full challenge brief, the four client personas (Schneider, Huber, Räber, Ammann) and their trigger events, judging criteria, and contacts.

## Non-negotiable rules

These are product and trust requirements, not style preferences. Do not violate them.

- **Human-in-the-loop, always.** The AI equips the RM with insights and *draft* proposals. It never advises the client directly and never auto-sends a message or places a trade. The RM recommends; the client decides and places the order. Every generated message/suggestion is a draft surfaced to the RM for approval.
- **Explainability is a feature, not a nice-to-have.** Every alert, swap suggestion, and drafted message must carry traceable reasoning and cite its sources (which CRM note, which news article, which CIO rating, which price). Trust & Explainability is 25% of the judging score — surface the "why," don't hide it.
- **Strategy stays fixed.** Only personalise at the asset level *within* the existing mandate. Proposed swaps must be same-sector and drawn from the CIO recommendation list; never change the client's overall strategy or sub-asset-class targets.
- **Never commit secrets.** API keys/tokens live in `.env` only (see `demo/.env.example`). Never hardcode or commit them.

## Architecture

Build toward the **multi-agent design** the challenge suggests:

- An **Orchestrator** that coordinates the specialised agents and consolidates output for the dashboard.
- **CRM Agent** — reads conversation logs, builds/maintains each client's profile (the four facets in `CLAUDE.md` §3; "investment DNA" is the same concept).
- **Portfolio Agent** — loads holdings, prices (via SIX), mandate targets, drift, and the CIO recommendation list.
- **News Agent** — classify-once worker: monitors news relevant to holdings and to the profile; scores relevance/sentiment (see `CLAUDE.md` §9 token discipline).
- **Advisory Agent** — produces **two** distinct outputs for the RM (per `CLAUDE.md` §1): a *strategy proposal* (same-sector, CIO-approved swaps) and a *dialogue suggestion* (conversation starters; general market context flows here only, never into strategy).

Keep agent boundaries clean and outputs structured (so reasoning/sources can be traced through to the UI). The match step (profile topics ∩ news/stock topics) is a cheap index lookup, not an LLM call — see `CLAUDE.md` §3/§9.

## Repo layout

```
README.md     # Full challenge brief — read this first
data/         # Provided workbooks (see below) — source of truth for clients & portfolios
demo/         # Runnable REFERENCE integration (TypeScript/Express). NOT the product.
docs/         # SIX MCP guide, Phoeniqs setup, web API notes, challenge decks
```

- **Stack is decided** (per `CLAUDE.md` §4): **Python/FastAPI** backend + **Next.js** frontend, laid out as `/backend` and `/frontend`. The `crm-graph/` Python scripts are an early spike to fold into `/backend`, not the app's structure.
- **`demo/` is a reference, not the foundation to extend.** Treat it as worked examples of how to call each provider. Reuse its patterns; don't feel bound to its structure.

## Provided data (`data/`)

- `SwissHacks CRM.xlsx` — three years of RM interaction logs for the four sample clients, one tab per client.
- `SwissHacks Portfolio Construction.xlsx` — three model mandates (Defensive / Balanced / Growth, each summing to CHF 10M): CIO sub-asset-class targets, current vs. target positions, the CIO recommendation list (BUY/HOLD/SELL + swap candidates), transaction history, and cash flows. Includes SIX (Valor + MIC) and Yahoo tickers.

Data conventions (from `README.md`): all amounts CHF; ISINs per ISO 6166; equities at historical closes, bonds at par (quantity = face value ÷ 100); summing BUY − SELL per ISIN gives the current position. `Current (CHF)` reflects post-rebalance drift; `Target (CHF)` is the rebalance allocation. Balanced and Growth carry deliberate ±2.0pp mandate-drift breaches for rebalancing scenarios.

## Integrations (patterns proven in `demo/`)

Configure everything through environment variables. See `demo/.env.example` for the canonical names.

### SIX Financial Data — MCP (streamable-http, JSON-RPC), *not* REST
- It is an MCP server: POST `{ jsonrpc, id, method: "tools/call", params: { name, arguments } }`. See `demo/src/backend/services/six.service.ts` and `docs/SIX_MCP.md` (tested guide to all 23 tools).
- Auth: `Authorization: Bearer <SIX_MCP_TOKEN>`. Accept header must include `application/json, text/event-stream` — responses may arrive as plain JSON **or** SSE-framed (`data: {...}`); parse both.
- Tool results are **tab-delimited tables** in the text content — parse into row objects keyed by header.
- Addressing: instrument tools take the **Valor**; listing tools (`end_of_day_snapshot`, `intraday_snapshot`, `end_of_day_history`, `listing_base`) take a listing id `{Valor}_{MIC}`. For bonds, resolve via `instrument_symbology` with the ISIN. 6 of the 23 tools are outside the hackathon token's subscription.

### Phoeniqs — LLM credits (OpenAI-compatible API)
- See `demo/src/backend/services/phoeniqs.service.ts` and `docs/Phoeniqs_AI.md`. Credits are provided — **do not bring your own LLM key.**
- Base URL `https://maas.phoeniqs.com/v1`, `POST /chat/completions`, `Authorization: Bearer <PHOENIQS_API_KEY>`. When you need structured output, instruct "ONLY minified JSON," use low temperature, and tolerate prose/markdown-fenced JSON when parsing (the demo extracts the first `{...}` block as a fallback).
- A `400 budget_exceeded` still means auth/endpoint are valid — surface it, don't treat it as a config error.

### News — Event Registry (NewsAPI.ai) / Tenity MCP-News
- See `demo/src/backend/services/newsai.service.ts`. `NEWSAPI_KEY`, base `https://eventregistry.org/api/v1`. Yahoo Finance and Google News also work as sources.

## Running the reference demo

```bash
cd demo && cp .env.example .env   # fill in Phoeniqs, SIX MCP, Event Registry keys
npm install && npm run dev        # http://localhost:3000
```

Endpoints: `POST /api/analysis/analyze` (stock analysis) and `GET /api/analysis/integrations` (health check — confirm credentials before building on top).

## Conventions

- Match the **demo's TypeScript style** when working in TS: typed service classes, `[Tag]`-prefixed log/error messages (e.g. `[SIX]`, `[Phoeniqs]`), explicit "not configured" guards, and graceful degradation when a provider/listing has no data.
- Keep secrets out of code; mask tokens in any logs or status UI (see `demo/src/backend/services/probe.ts`).
- Optimise for a convincing 48-hour demo: a working end-to-end story across the four personas beats unused breadth. Prioritise creativity, trust/explainability, feasibility, visual design, and presentation (the judged criteria) in that spirit.

## Before you start a build task

The stack and layout are set in `CLAUDE.md` §4 (Python/FastAPI `/backend` + Next.js `/frontend`). Read `CLAUDE.md` end to end before starting — it carries the golden rules, shared contracts (§7), and token-budget discipline (§9) this file does not repeat. Surface any assumption that isn't covered there before you scaffold.
