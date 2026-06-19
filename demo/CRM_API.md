# CRM Agent API

A grounded, queryable layer over the relationship-manager notes in
`data/SwissHacks CRM.xlsx`. It turns free-text client notes into **structured,
cited facts** an agent can pull to drive portfolio analysis and compliance.

**Provenance contract:** every derived fact (constraint, liquidity event,
compliance finding) carries `provenance` — the source note `interactionId`,
`date`, and a **verbatim quote**. An agent never has to trust an unsourced
claim; it can cite exactly which client instruction it acted on.

## Data pipeline

```
data/*.xlsx ──(crm-graph/export_data.py)──▶ src/backend/crm-graph/data/{crm,portfolios,cio}.json ──▶ services
```

Re-run after editing the workbooks:

```bash
python3 crm-graph/export_data.py
```

## Extraction = rules + LLM (hybrid)

- **Rules** (`crm.service.ts → RULES`) always run — deterministic, offline-safe,
  fully cited. This is the floor and needs no API key.
- **LLM enrichment** (Phoeniqs) runs when `PHOENIQS_API_KEY` is set: refines the
  summary / risk posture and may add constraints. Each LLM constraint is
  re-grounded against the notes (`source: "llm"`, with provenance), and the
  response is cached per client. If the key is absent or the call fails, the
  endpoint silently returns the rules-only profile (`llmEnriched: false`).

## Endpoints (`/api/crm`)

| Method & path | Purpose |
|---|---|
| `GET /clients` | List client households (mandate, contact counts, date range). |
| `GET /clients/:id` | Full client record + every raw interaction. |
| `GET /clients/:id/profile` | **Structured, cited profile** — constraints, preferences, themes, liquidity events, risk posture. `?enrich=false` forces rules-only. |
| `GET /search?q=` | Keyword search across all notes; returns matches with client, date, snippet. |
| `GET /clients/:id/compliance` | Cross-check the client's constraints against portfolio holdings. `?portfolio=Defensive\|Balanced\|Growth` overrides the client's mandate to stress-test. |

`:id` accepts the slug (`raeber`, `schneider`, `huber`, `ammann`) or the family name.

## Example agent flow

```bash
# 1. Pull the grounded constraints for a client
curl -s localhost:3000/api/crm/clients/raeber/profile | jq '.data.constraints[].text'

# 2. Check their assigned portfolio for violations (each finding is cited)
curl -s localhost:3000/api/crm/clients/raeber/compliance | jq '.data.violations'   # 0 — Defensive aligns

# 3. Stress-test: what if this conservative client were on Growth?
curl -s "localhost:3000/api/crm/clients/raeber/compliance?portfolio=Growth" \
  | jq '{violations, exposureAtRiskCHF, top: .data.findings[0]}'
# -> 27 violations, CHF 4.67M at risk; flags NVIDIA/crypto ETPs against
#    "block any high-beta speculative asset classes" (cited, 2023-10-05)
```

## How compliance decides

Only **HARD** `EXCLUSION`/`RISK` constraints with concrete `signals` can flag a
holding. A holding is matched when its `industry` is in the constraint's
signals, or via special markers (`crypto` → ETP/Bitcoin/Ethereum; `speculative`
/ `high-beta` → IT-sector equities & crypto). Industry-level matches against a
HARD rule are `VIOLATION`; soft rules are `WATCH`. Sector heuristics (e.g.
flagging an ESG laggard by industry) are intentionally conservative — the LLM
layer is where per-issuer adjudication can be added.
