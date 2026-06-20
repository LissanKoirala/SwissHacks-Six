# Risk Timeline — port contract

Authoritative spec for the **Risk Timeline scrubber**: a per-client tool that
replays the CRM meeting log chronologically and shows how the client's **risk
appetite** evolved, scored against a lexicon, every move cited to the log line
behind it, with the **mandate fit** (appetite vs the mandate's risk band) tracked
over time. Advisory-only, fully grounded (CLAUDE.md §2: if you can't cite it,
don't surface it). Deterministic — no LLM, no per-client model call (§9).

Stack reminder: FastAPI backend at `backend/workbench/`, Next.js 14 / React 18 /
Tailwind **light** theme at `frontend/`. Reuse the `Provenance` trust primitive
and the `card`/`chip`/`accent`/`ink` tokens. Components self-fetch by `clientId`.

Run: backend `cd backend && ./.venv/bin/uvicorn app:app --port 8000`;
frontend `cd frontend && npm run dev` (:3000). Client ids: `schneider`, `huber`,
`raeber`, `ammann`.

---

## 1. Endpoint

`GET /clients/{client_id}/risk-timeline` → `RiskTimeline` (404 `unknown client`
if not in `world.clients`). Wire it in `backend/workbench/api/app.py` next to the
existing `/rendezvous`, `/decision`, `/globe` routes, lazily importing the
builder so the app still boots if the module is mid-edit:

```python
@app.get("/clients/{client_id}/risk-timeline")
def client_risk_timeline(client_id: str):
    if client_id not in world.clients:
        raise HTTPException(404, "unknown client")
    from ..agents.risk_timeline import build_risk_timeline
    return _dump(build_risk_timeline(world, client_id))
```

## 2. Builder

`backend/workbench/agents/risk_timeline.py` → `build_risk_timeline(world, client_id) -> dict`.

Data sources already on `world`:
- `world.meeting_logs[client_id]` → `list[MeetingLogEntry]` (id, timestamp,
  modality, contact, note, source: Provenance). The raw, immutable, dated
  history — **sort ascending by timestamp**.
- `world.clients[client_id]` → `{name, mandate, ...}` (mandate ∈ Defensive /
  Balanced / Growth).
- `world.interest_by_client[client_id]` → `list[InterestEdge]` (each has
  `provenance.timestamp`, `facet`, `polarity`). For facet/edge accrual counts.
- Profile facets: rebuild via `world` or read the profile; each `Statement` has
  `provenance.timestamp`. (If a profile accessor isn't handy, count interest
  edges by date — that is enough for `edges_known`; `facets_known` may be 0.)

### Risk scoring (deterministic lexicon)

Risk axis is `0.0` (max-defensive) … `1.0` (max risk-on). Mandate baseline:

```
BASELINE = {"Defensive": 0.30, "Balanced": 0.55, "Growth": 0.78}
```

Two term lists, matched case-insensitively as word-ish substrings on the note:

```
DE_RISK (dir "down", w -0.06 each): averse, cautious, caution, conservative,
  defensive, preserve, preservation, protect, protection, nervous, worried,
  anxious, divest, reduce, trim, exit, de-risk, derisk, drawdown, hedge,
  stability, stable, safety, safe, secure, withdraw, liquidity, cash, sell,
  concerned, uneasy, wary

RISK_ON (dir "up", w +0.06 each): aggressive, growth, opportunity, opportunistic,
  increase, add to, overweight, speculative, leverage, ambitious, conviction,
  reinvest, equity sleeve, expand, bullish, upside, venture, double down,
  high-conviction, appetite for, comfortable with risk, buy
```

Per log entry, in date order:
- Find the **distinct** matched terms. Each → a signal `{term, direction, weight}`.
- `delta = clamp(sum(weights), -0.18, +0.18)` (cap so one chatty note can't swing
  the whole line).
- `risk_score = clamp(prev_score + delta, 0.05, 0.95)`; `prev_score` starts at the
  mandate baseline. Carry forward when `delta == 0`.
- `direction`: `"up"` if `delta > 0.001`, `"down"` if `< -0.001`, else `"flat"`.
- `risk_relevant = bool(signals)`.

### Mandate fit

`band = {lo: baseline-0.12, hi: baseline+0.12, label: mandate}`.
Per point: `mandate_gap = round(risk_score - baseline, 3)`;
`mandate_fit`: `"aligned"` if `lo <= risk_score <= hi`, `"cautious-drift"` if
below `lo`, `"risk-on-drift"` if above `hi`.

### Accrual at each date

`edges_known` = count of interest edges with `provenance.timestamp <= point.date`.
`facets_known` = count of facet statements with `timestamp <= point.date` (0 if
not readily available). `facet_changes` = list of `{facet, text}` whose timestamp
== this entry's date (so scrubbing shows "the desk learned X here"); `[]` if none.

### Milestones

Up to 4: the entries with the largest `abs(delta)` (kind `"spike"`), plus any
point where `mandate_fit` changed from the previous point (kind `"crossing"`),
plus the first point (kind `"start"`). Dedupe by point id.

### Output shape (snake_case, JSON)

```jsonc
{
  "client_id": "schneider",
  "client_name": "Hubertus Schneider",
  "mandate": "Balanced",
  "baseline": 0.55,
  "band": { "lo": 0.43, "hi": 0.67, "label": "Balanced" },
  "bands": [
    { "id": "defensive", "label": "Defensive", "lo": 0.0,  "hi": 0.40 },
    { "id": "balanced",  "label": "Balanced",  "lo": 0.40, "hi": 0.66 },
    { "id": "growth",    "label": "Growth",    "lo": 0.66, "hi": 1.0  }
  ],
  "start_date": "2023-04-10",
  "end_date": "2026-05-19",
  "points": [
    {
      "id": "schneider#2025-06-18#7",
      "date": "2025-06-18",
      "modality": "Phone Call",
      "contact": "Sarah Keller",
      "note_excerpt": "Reinvested global bond coupons back into the core equity sleeve…",  // <= ~160 chars
      "risk_score": 0.61,
      "delta": 0.06,
      "direction": "up",
      "risk_relevant": true,
      "signals": [ { "term": "reinvest", "direction": "up", "weight": 0.06 } ],
      "mandate_gap": 0.06,
      "mandate_fit": "aligned",
      "edges_known": 1,
      "facets_known": 3,
      "facet_changes": [],
      "provenance": { "source_type": "crm_log", "source_id": "schneider#…", "excerpt": "…", "timestamp": "2025-06-18" }
    }
    // … one per log entry, chronological
  ],
  "milestones": [ { "point_id": "…", "label": "Defunding-betrayal warning", "kind": "spike" } ],
  "current": { /* same fields as a point: the state at end_date */ }
}
```

`provenance` per point = the entry's own `source` Provenance (already on
`MeetingLogEntry`). Keep every excerpt short.

### Test

`backend/tests/test_risk_timeline.py`: for each of the 4 clients assert the
endpoint shape — `points` non-empty and date-ascending, every `risk_score` in
`[0.05, 0.95]`, `points[0].risk_score == baseline ± first delta`, at least one
`risk_relevant` point, `mandate_fit` ∈ the 3 labels, and the response round-trips
through the FastAPI `TestClient` with HTTP 200. Mirror the style of the existing
`test_*` files.

---

## 3. Frontend

### Types — `frontend/lib/types.ts`

Add `RiskBand`, `RiskSignal`, `RiskPoint`, `RiskTimeline` interfaces mirroring the
shape above (reuse the existing `Provenance` interface; `FacetName`-ish strings
are plain `string`). `mandate_fit` is a union
`"aligned" | "cautious-drift" | "risk-on-drift"`; `direction` is
`"up" | "down" | "flat"`.

### API — `frontend/lib/api.ts`

Add `riskTimeline(id: string): Promise<RiskTimeline>` hitting
`/clients/${id}/risk-timeline`, matching the existing `decision`/`globe` methods.

### Component — `frontend/app/components/RiskTimeline.tsx`

`export function RiskTimeline({ clientId }: { clientId: string })`, `"use client"`,
self-fetches via `api.riskTimeline`. Light theme only. Behaviour:

- **Scrubber chart** (SVG, responsive width via `ResizeObserver` like
  `DecisionFlow`): x = time (true date scale from `start_date`..`end_date`),
  y = risk `0..1` inverted. Draw the three `bands` as faint horizontal tints
  (defensive = slate/sky, balanced = amber, growth = emerald). Draw the mandate
  `baseline` as a dashed reference line and shade the `band` lo..hi softly.
  Plot the `risk_score` line+area: **solid** up to the playhead date, **faint**
  after. Event dots at each point — risk-relevant dots larger and coloured by
  `direction` (up = emerald, down = rose, flat = slate); click a dot to move the
  playhead there.
- **Playhead**: a vertical marker controlled by a `<input type="range">` over the
  point indices (aria-labelled) PLUS a Play/Pause button that auto-advances the
  index (~700ms/step, stop at the end). Respect `prefers-reduced-motion` (no
  autoplay loop). Clicking a dot sets the index.
- **State panel** ("As of {date}"): the appetite `risk_score` as a percent + band
  label, a `mandate_fit` chip (aligned = emerald, cautious-drift = sky,
  risk-on-drift = amber) with the signed `mandate_gap`, the latest risk-moving
  event's `note_excerpt` with its `Provenance`, the matched `signals` as chips,
  and `edges_known`/`facets_known` counts. Everything reflects the playhead date,
  not the latest — that is the whole point of scrubbing.
- A small **milestones** strip (clickable → jump playhead).

Reuse `Provenance` / `ProvenanceList` from `./Provenance` and the `card`/`chip`
classes. No dark shell, no new heavy deps (SVG only; no chart lib needed —
Recharts is available if it genuinely helps, but hand-rolled SVG keeps the
playhead control precise).

### Tab — `frontend/app/components/ClientView.tsx`

Add `"risk"` to the `Tab` union; add a tab button labelled **"Risk Timeline"**
immediately after **"Analytics"**; render `{tab === "risk" && <RiskTimeline clientId={clientId} />}`.
Import `RiskTimeline`.

---

## 4. Done = verified

- `pytest` green (incl. the new test); `tsc --noEmit` clean.
- `curl localhost:8000/clients/schneider/risk-timeline` returns the shape, points
  date-ascending, scores in range.
- All four clients render the tab; scrubbing updates the state panel; console clean.
