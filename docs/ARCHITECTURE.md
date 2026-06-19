# Architecture — Advisory Workbench

> SwissHacks · SIX / Noumena / NTT DATA · *The Next Generation of Wealth Advisory*.
> A workbench for a **relationship manager (RM)**. It builds a living client profile from CRM
> history, watches external information against that profile, and — strictly within the client's
> fixed mandate — proposes asset-level changes plus a ready-to-use conversation. The AI proposes;
> the RM approves; the client decides. The AI never advises the client directly and never trades.

This document describes the system **as built**. The backend is a Python/FastAPI app under
`backend/workbench/`, serving the insights contract at `http://localhost:8000`. Every module
cited below exists on disk; line-level behaviour matches the live API samples in
`docs/api_samples/`.

---

## 1. The data model: three logical graphs + a portfolio graph

Per CLAUDE.md §3 we back the graphs with plain in-memory objects (no separate graph DB). All four
live inside a single dataclass, `World` (`graph/store.py`), assembled once at boot by
`seed.build_world()` and held on `app.state.world`.

### 1.1 CRM graph — per client (`graph/store.py`: `meeting_logs`, `profiles`)

- **`meeting_log`** — append-only, immutable. One `MeetingLogEntry` per raw RM interaction
  (`models.py`), each carrying its own `Provenance` (`source_type="crm_log"`). Built by
  `ingestion/crm_xlsx.py` (`CRMWorkbookSource`) from `SwissHacks CRM.xlsx`, one tab per client.
  Schneider alone seeds **26** log entries (`/clients/schneider` → `log_count: 26`).
- **`profile`** — the materialised four-facet view, rebuilt from the log by
  `agents/profile_builder.py` (`build_profile`). Facets: `professional`, `interests`,
  `historical`, `personality` (the `FacetName` literal in `models.py`). Every facet `Statement`
  and every `InterestEdge` carries a pointer back to the log line that justifies it — the
  `_provenance()` helper resolves a quote's date to the exact `MeetingLogEntry.id`
  (e.g. `schneider#2026-01-22#20`).

### 1.2 News graph (`graph/store.py`: `news`)

A flat list of `NewsItem` (`models.py`), each topic-tagged with sentiment. Produced by the
**classify-once** worker `agents/classifier.py` (`to_news_item`) from records emitted by
`ingestion/news.py`. Seed mode reads `news_fixtures.json` (`NewsFixtureSource`); live mode layers
Event Registry on top behind the same interface (`EventRegistrySource`). Classification is the
deterministic keyword pass in `topics.classify_text()` — never an LLM call.

### 1.3 Meta graph — the shared topic index (`graph/store.py`: `interest_by_client`; `topics.py`)

The seam that makes matching free. The controlled vocabulary lives in `topics.py`
(`TOPIC_VOCAB`): `esg-deforestation`, `neuro-research`, `labour-governance`, `us-tech-ai`, plus
the `SECTORS` list (sector nodes, so swaps stay same-sector). Two kinds of edge meet on a topic
node:

- a **client interest edge** (`InterestEdge`) = that client's *subscription* to a topic, with a
  `polarity` (`opportunity` = wants more; `conflict` = wants to avoid) and its CRM provenance;
- a **news tag** = a news item's *classification* (its `topics[]`).

**A match is a shared topic node** — the set intersection of the two — not a stored broker rule
and not an LLM call.

### 1.4 Portfolio graph (`graph/store.py`: `holdings`, `mandates`, `cio`, `cio_by_isin`)

Built by `ingestion/portfolio_xlsx.py` (`PortfolioWorkbookSource`) from
`SwissHacks Portfolio Construction.xlsx`:

- **`holdings`** — current positions per strategy (`Holding`), each with `industry_group`,
  `sub_asset_class` and `current_chf` (post-rebalance drift values from the workbook).
- **`mandates`** — sub-asset-class targets per strategy (`Mandate` / `MandateTarget`).
  `seed._finalise_mandates()` computes `current_pct`, `drift_pp = current_pct − target_pct`, and
  `breach = |drift| > 2.0pp`. The Balanced mandate carries the deliberate breach the brief plants:
  *Foreign (Dev. Markets)* target 34.5%, current 36.701%, **drift +2.201pp → breach**.
- **`cio` / `cio_by_isin`** — the CIO approved universe (`CIOStock`), the *only* swap universe.
  `agents/classifier.label_cio()` joins each name to its sentiment + ethics `value_tags` from
  `stock_labels.json` (the "labelled stocks" of CLAUDE.md §8).

---

## 2. End-to-end flow

```
 CAPTURE                          CLASSIFY-ONCE                     APPROVED UNIVERSE
 (photo/voice/text)               (shared, cheap)                  (CIO list)
        │                               │                                │
        ▼                               ▼                                ▼
 ingestion/crm_xlsx.py           ingestion/news.py               ingestion/portfolio_xlsx.py
 CRMWorkbookSource ──► Record    NewsFixture/EventRegistry        PortfolioWorkbookSource ──► Record
        │                          ──► Record                          (kind = cio)
        ▼                               │                                │
  meeting_log (immutable)              ▼                                ▼
        │                       agents/classifier.py            agents/classifier.py
        ▼                       to_news_item()                  label_cio()  (+ stock_labels.json)
 agents/profile_builder.py      topics.classify_text()                 │
 build_profile()                      │                                ▼
        │                             ▼                          labelled stocks
        ▼                       news graph: NewsItem             (CIOStock + sentiment + value_tags)
 profile facets  +  interest          │  topics[]                      │
 edges (META graph)                   │                                │
        │  client topics ∩ ───────────┘                                │
        ▼                                                              │
 ┌──────────────────────────────────────────────────────┐            │
 │  agents/matcher.py  match_client()                     │            │
 │  shared topic node = MATCH   (set intersection, NO LLM)│            │
 │  → Match{ polarity, news, shared_topics[], why[],      │            │
 │           affected_holding }                           │            │
 └──────────────────────────────────────────────────────┘            │
        │  primary (highest-salience) match                            │
        ▼                                                              ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  agents/advisory.py   (strong model, LAZY, only on the opened match)   │
 │   build_strategy() ─► STRATEGY proposal   (CIO-approved, same-sector,  │
 │                         drift-checked swaps — inside the rails)        │
 │   build_dialogue() ─► DIALOGUE suggestion (style-matched draft +       │
 │                         light general-market context)                 │
 └──────────────────────────────────────────────────────────────────────┘
        │
        ▼
 agents/orchestrator.py  get_insights()  ── cached per client ──►  api/app.py
        │                                       GET /clients/{id}/insights
        ▼
 RM reviews → approves / edits / converses  →  CLIENT decides   (human-in-the-loop gate)
```

Reading the boxes in order:

1. **Capture → meeting_log → profile.** Adapters normalise raw RM interactions to `Record`;
   ingestion appends immutable `MeetingLogEntry` rows; `build_profile` distils them into the four
   facets and emits **interest edges** into the meta graph. (Live multimodal capture — OCR/STT —
   lands at the same `Record` seam; for the demo the log is seeded from the workbook.)
2. **News → classify once → tags.** Each item is embedded/keyword-classified **once**, shared
   across all clients, and tagged with sentiment. No per-client work here.
3. **CIO list → labelled stocks.** The approved universe is joined to sentiment + ethics labels
   once, at boot.
4. **Match = profile topics ∩ news topics.** `match_client()` intersects each client's interest
   topics with each news item's tags. A hit becomes a fully-cited `Match` carrying *both* sides'
   provenance, the affected holding (if the news issuer ISIN is held), and a salience rank
   (conflicts touching a held position first).
5. **Advisory → strategy + dialogue.** Only the **primary** match is reasoned over.
   `build_strategy` proposes same-sector, CIO-approved, drift-checked swaps; `build_dialogue`
   drafts a style-matched note plus light market context. The strong model (Phoeniqs) runs here,
   lazily; a deterministic fallback keeps everything offline-testable.
6. **RM approves.** The orchestrator assembles `ClientInsights`; the API renders it; the RM is the
   gate. Nothing auto-executes, nothing auto-sends.

### Worked example — the Schneider vertical slice

`neuro-research` interest edge (CRM: *"our private wealth is now a weapon to save Chloe… core
healthcare and pharma holdings to actively support… brain disease research"*, `schneider#2026-01-22#20`)
∩ news tag `neuro-research` (*"Biogen to wind down neurodegenerative research division"*,
`news-biogen-neuro-shutdown`, sentiment −0.62 BEARISH). Biogen is a **held** name
(`Balanced:US09062X1037`, CHF 101,097), so `polarity = conflict` with an `affected_holding`. The
advisory agent proposes **SWAP Biogen → Eli Lilly & Co.** (`US5324571083`, CIO **BUY**, same
sector *Health Care*, same sub-asset-class *Foreign (Dev. Markets)* → `drift_safe: true`) and an
empathetic draft note. Every line of that output cites a CRM log id, a news id, a portfolio row, or
a CIO list row.

---

## 3. Token discipline (CLAUDE.md §9)

The naive design costs **O(clients × items)** — re-read every client against every item with a
model. Ours is **(items classified once) + (real matches reasoned once)**. Three rules enforce it,
each visible in the code:

| Rule | Where | Cost |
|---|---|---|
| **Classify / embed once, shared** | `classifier.to_news_item` → `topics.classify_text` | one cheap pass per news item, *not* per client. Sentiment + CIO `value_tags` are likewise labelled once at boot (`label_cio`). |
| **Matching is free** | `matcher.match_client` | pure set intersection over the meta graph. **No model call.** Runs for every client on every request. |
| **Strong model only on real matches, lazily, cached** | `orchestrator.get_insights` → `advisory.build_dialogue` → `llm.chat` | only the **primary** match is drafted, and only when the RM opens the client; the result is cached per client in `orchestrator._cache`. |

`llm.py` is the **only** LLM cost surface in the codebase (`llm_available()` gates on
`settings.llm_enabled`). When no Phoeniqs key is present or `USE_LIVE=0`, every agent falls back to
a deterministic draft — so the whole pipeline runs, end to end, with **zero tokens spent**
(`/api/health/integrations` then reports `mode: "deterministic fallback"`). For a demo of N clients
and M news items, the model is invoked at most **once per opened client**, never N×M times.

---

## 4. Provenance & traceability (CLAUDE.md §2, §7.5)

Traceability is 25% of the score, so it is structural, not cosmetic. The contract is one model,
`Provenance` (`models.py`):

```python
Provenance{ source_type, source_id, excerpt, url?, timestamp? }
# source_type ∈ crm_log | news | cio_list | portfolio | mandate | market_digest
```

**If you can't cite it, it isn't surfaced.** Provenance is attached at the *source* and carried,
unbroken, all the way to the API response:

- **Created at ingestion** — every `Record` carries a `source_type` and `source_id`; the seed step
  wraps each into a `Provenance` (e.g. `MeetingLogEntry.source`, `NewsItem.provenance`,
  `CIOStock.provenance`).
- **Carried through match** — a `TopicMatch` holds *both* `client_provenance` (the interest
  edge / log line) and `news_provenance` (the news tag), so a match can show *why this surfaced for
  this client*. `Match.why` additionally appends a `portfolio` provenance when a held name is
  affected (*"Holds Biogen Inc. (US09062X1037) — CHF 101,097 in the Balanced mandate."*).
- **Carried through advisory** — `SwapProposal.provenance` re-uses `match.why` and appends the
  target's `cio_list` row; `DialogueSuggestion` cites each talking point's own source and the
  `market_digest`/news items behind its market context.
- **Rendered verbatim** — `api/app.py` `model_dump()`s the pydantic objects, so the UI receives
  the exact `{source_type, source_id, excerpt, url, timestamp}` to render a click-through
  "why this surfaced" trail. (See any `docs/api_samples/insights_*.json` — every `why[]`,
  `provenance[]` and `shared_topics[]` is fully populated.)

Because provenance is a *required* field on the source models, an un-cited fact simply cannot be
constructed — the contract makes the golden rule mechanical.

---

## 5. Adapter interface — mock ↔ live swappability (CLAUDE.md §6)

Every source implements one shape (`ingestion/base.py`):

```python
@dataclass
class Record:                      # the single normalisation point
    kind: str                      # meeting_log | news | holding | cio | mandate | price
    source_type: str               # maps to Provenance.source_type
    source_id: str
    payload: dict
    excerpt: str = ""

class Source(Protocol):
    name: str
    def fetch(self, query=None) -> list[Record]: ...
```

Adding a source = one new adapter; **nothing downstream changes**, because ingestion writes to the
graph at this one normalisation point. The implemented adapters:

| Adapter (`ingestion/`) | Tier | Emits `Record.kind` | Live behind same interface |
|---|---|---|---|
| `crm_xlsx.CRMWorkbookSource` | **seed** | `meeting_log` | multimodal capture (OCR/STT) would emit the same `Record` |
| `portfolio_xlsx.PortfolioWorkbookSource` | **seed** | `holding`, `cio`, `mandate` | — |
| `news.NewsFixtureSource` | **seed** | `news` | swapped for `news.EventRegistrySource` when `USE_LIVE=1` + key |
| `news.EventRegistrySource` | **live** | `news` | Event Registry / Tenity MCP-News; cached to `.cache/` |
| `six_mcp` (`call_tool`, `end_of_day_close`) | **live** | prices/valuation | SIX MCP (JSON-RPC, SSE or JSON, tab-delimited tables); cached |

**Seed-first** is the default and the demo-safe path. `Settings` (`config.py`) gates every live
feed: `use_live` plus a present key flips `*_enabled` on; absent a key, each source degrades
gracefully to its deterministic seed (workbook valuation for SIX, fixtures for news, deterministic
draft for the LLM). Live responses are **cached** (`.cache/`) keyed by request, so re-runs and the
demo never burn quota. The health endpoint reports the exact mode each integration is running in.

---

## 6. Module map (quick reference)

```
backend/workbench/
  models.py                 # frozen shared contracts (§7) — Provenance, Match, Strategy, Dialogue
  topics.py                 # controlled topic vocab + sector nodes + classify_text()
  config.py                 # Settings: USE_LIVE + key gating, graceful degradation
  seed.py                   # build_world(): adapters → Record → the four graphs
  graph/store.py            # World dataclass: CRM / News / Meta / Portfolio graphs + lookups
  ingestion/
    base.py                 # Record + Source protocol (the one normalisation point)
    crm_xlsx.py             # SwissHacks CRM.xlsx  → meeting_log records
    portfolio_xlsx.py       # SwissHacks Portfolio Construction.xlsx → holdings/cio/mandate
    news.py                 # NewsFixtureSource (seed) | EventRegistrySource (live)
    six_mcp.py              # SIX MCP adapter (live prices/valuation), cached
  agents/
    classifier.py           # classify-once: to_news_item(), label_cio()  — no per-client LLM
    profile_builder.py      # build_profile(): four facets + interest edges, each cited
    matcher.py              # match_client(): set intersection, NO LLM, salience-ranked
    advisory.py             # build_strategy() + build_dialogue(): the two RM outputs, in-rails
    llm.py                  # Phoeniqs wrapper — the ONLY LLM cost surface; deterministic fallback
    orchestrator.py         # get_insights(): assemble + cache per client (lazy strong model)
  api/app.py                # FastAPI routes (the §7.4 insights contract + profile/portfolio/health)
```

### API surface (no `/api` prefix except health)

```
GET /clients                  → [{client_id, name, mandate, headline, alert_count}]
GET /clients/{id}             → {profile:{facets, interest_edges}, mandate, log_count}
GET /clients/{id}/insights    → {client, matches[], strategy_proposal, dialogue_suggestion,
                                  generated_at, llm_used}
GET /clients/{id}/portfolio   → {portfolio, total_chf, mandate:{targets[]}, holdings[]}
GET /clients/{id}/log         → [meeting log entries]
GET /news                     → [news items]
GET /health                   → {status, clients[], news_items, cio_universe}
GET /api/health/integrations  → {use_live, probes[]}   # mode per integration
```
