# RM Capture — port contract

Authoritative spec for **multimodal CRM capture** (CLAUDE.md §8.B): the RM adds a
new interaction note by **text**, **voice** (dictation), or **photo** (OCR); the
backend **extracts** candidate signals; the RM reviews/edits a **staged** preview;
on **confirm** the immutable `meeting_log` gets one appended entry AND the
RM-approved topics/interest-edges/facet updates materialise into the live profile —
so the note flows into advisory, the CRM graph, and the risk timeline.

**Golden rules (do not break):** Advisory only — the agent *proposes*, the RM
*confirms*. Nothing mutates state until the confirm endpoint. The meeting log is
**append-only / immutable** (never edit or delete existing entries). Every
materialised fact carries provenance back to the new log entry (§2 traceability).
Deterministic + offline-first (the app runs with `USE_LIVE=0`, no keys); an LLM
pass is optional polish only, never required.

Stack: FastAPI backend `backend/workbench/`, Next.js 14 / React 18 / Tailwind
**light** theme `frontend/`. Reuse `Provenance`, the `card`/`chip`/`accent`/`ink`
tokens. Client ids: `schneider`, `huber`, `raeber`, `ammann`.

---

## 1. Endpoints (the app's first POSTs)

Wire in `backend/workbench/api/app.py` next to the existing routes, lazily
importing the builder so the app still boots mid-edit. Validate inputs at the
boundary (pydantic request models in `models.py` or `agents/capture.py`).

```python
@app.post("/clients/{client_id}/capture/extract")
def capture_extract(client_id: str, req: CaptureExtractRequest):
    if client_id not in world.clients:
        raise HTTPException(404, "unknown client")
    from ..agents.capture import extract_draft
    return extract_draft(world, client_id, req)

@app.post("/clients/{client_id}/capture/confirm")
def capture_confirm(client_id: str, req: CaptureConfirmRequest):
    if client_id not in world.clients:
        raise HTTPException(404, "unknown client")
    from ..agents.capture import confirm_capture
    return confirm_capture(world, client_id, req)
```

### Request models (`models.py`)

```python
class CaptureExtractRequest(BaseModel):
    note: str                       # raw text (typed, dictated, or OCR'd)
    modality: str = "File Note"     # Physical Meeting / Phone Call / Video Call / Email / Lunch / File Note / Physical Event
    contact: str = ""               # who the RM spoke with
    rm_name: str = ""
    date: str = ""                  # ISO yyyy-mm-dd; default = server today if empty

class ProposedEdge(BaseModel):
    topic: str                      # MUST be a TOPIC_VOCAB key
    topic_label: str
    facet: str                      # professional / interests / historical / personality
    polarity: str                   # opportunity / conflict / neutral
    rationale: str                  # short why, quotes the cue
    selected: bool = True           # default-on; RM can deselect/edit

class ProposedFacet(BaseModel):
    facet: str
    text: str
    selected: bool = True

class CaptureConfirmRequest(BaseModel):
    note: str                       # final (RM-edited) note text
    modality: str
    contact: str = ""
    rm_name: str = ""
    date: str = ""
    edges: list[ProposedEdge] = []  # only the RM-kept ones (selected) are applied
    facets: list[ProposedFacet] = []
```

Reject empty `note` (422). Cap `note` length (e.g. 5000 chars). `topic` must be a
known vocab key; drop unknown topics on confirm.

## 2. Builder `backend/workbench/agents/capture.py`

`extract_draft(world, client_id, req) -> dict` — **read-only, no mutation**:
- Normalise the note (trim; collapse whitespace). Default `date` to server today
  (`date.today().isoformat()`) when blank.
- **Detect topics**: `from ..topics import classify_text, TOPIC_VOCAB`;
  `classify_text(note)` → topic keys; map to `{topic, topic_label}` via
  `TOPIC_VOCAB[key].label`.
- **Proposed interest edges**: one per detected topic. Polarity from a small
  deterministic cue scan of the note:
  - conflict cues: avoid, penalise, penalize, divest, exit, betrayal, against,
    refuse, dump, exposed, scandal, unacceptable, never, hypocrisy, red line,
    zero tolerance, won't hold, drop
  - opportunity cues: support, fund, reward, want more, increase, celebrate,
    proud, back, champion, prioritise, prioritize, commit, passionate, believe
    in, double down, magnificent
  - conflict wins if both present; else opportunity; else neutral.
  - facet guess: personality if values/risk words (averse, tolerance, values,
    ethics, betrayal, principle); professional if work words (CEO, business,
    company, enterprise, board, firm); historical if action words (transferred,
    withdrew, endowment, capital call, bought, sold, deposit); else interests.
  - rationale: short, quoting the matched cue/keyword.
- **Proposed facet statement(s)**: 1–2 concise candidates — the note's first
  sentence trimmed (and a second if clearly distinct). facet = the dominant facet
  guess. RM edits the text.
- **Risk-signal preview**: reuse the risk lexicon —
  `from .risk_timeline import score_note` (or the DE_RISK/RISK_ON lists; expose a
  small helper there if needed) — return `{delta, direction, signals:[{term,direction}]}`
  so the RM sees how this note will nudge the risk timeline.
- **Modality icon**: reuse `graph.crm_graph.MEDIUM_ICON` for a glyph.

Return shape:
```jsonc
{
  "client_id": "schneider",
  "note": "…normalised…",
  "date": "2026-06-20",
  "modality": "Lunch",
  "modality_icon": "🍽️",
  "contact": "Hubertus Schneider",
  "rm_name": "Sarah Keller",
  "detected_topics": [ { "topic": "neuro-research", "label": "Neurodegenerative research" } ],
  "proposed_edges": [ { "topic": "...", "topic_label": "...", "facet": "personality", "polarity": "opportunity", "rationale": "...", "selected": true } ],
  "proposed_facets": [ { "facet": "interests", "text": "...", "selected": true } ],
  "risk_preview": { "delta": -0.06, "direction": "down", "signals": [ { "term": "protect", "direction": "down" } ] },
  "preview_entry_id": "schneider#2026-06-20#27"   // what the appended id WILL be
}
```

`confirm_capture(world, client_id, req) -> dict` — **the only mutation** (the RM gate):
1. Build a `MeetingLogEntry(id=next_id, client_id, timestamp=date, modality,
   contact, rm_name, note, source=Provenance(source_type="crm_log",
   source_id=next_id, excerpt=note[:200], timestamp=date))`. `next_id` =
   `f"{client_id}#{date}#{len(existing)+1}"` (or a `cap` marker — but keep it
   parseable). **Append** to `world.meeting_logs[client_id]` (create list if absent).
2. For each kept (`selected`) edge whose `topic` is a valid vocab key: append an
   `InterestEdge(client_id, topic, facet, polarity, weight=1.0,
   provenance=<the new entry's Provenance>)` to **both**
   `world.interest_by_client[client_id]` and the client's
   `world.profiles[client_id].interest_edges`.
3. For each kept facet: append a `Statement(text, provenance=<new entry prov>)`
   to `world.profiles[client_id].facets[facet]` (create the list if absent).
4. **Invalidate insights**: `world.insights_cache.pop(client_id, None)` (and if the
   cache is global, `world.insights_cache.clear()`), so new edges flow into the
   next `/insights`.
5. **Persist (write-through)**: append the confirmed payload (client_id + all
   fields) to `backend/data/captured_entries.json` (a JSON list; create if
   missing). This file is git-ignored.
6. Return `{ "ok": true, "entry_id": next_id, "applied": { "edges": N, "facets": M },
   "log_count": len(world.meeting_logs[client_id]) }`.

### Replay on startup (persistence)

In `backend/workbench/seed.py` `build_world(...)`, AFTER the seed profiles are
built, load `backend/data/captured_entries.json` (if present) and replay each
confirmed payload through the same `confirm_capture` logic (factor the apply step
so seed and the endpoint share it) so captures survive a server restart. Guard
with try/except — a malformed file must never crash boot.

Add `backend/data/captured_entries.json` to `.gitignore`.

### Test `backend/tests/test_capture.py`

- `extract` on a crafted note (e.g. a Schneider note mentioning "Parkinson's" +
  "fund") returns `detected_topics` incl. `neuro-research`, a proposed edge with
  polarity `opportunity`, and a non-empty `risk_preview`.
- `confirm` grows `world.meeting_logs[cid]` by 1, the appended entry is immutable
  (same id/text on re-read), a materialised interest edge appears in
  `world.interest_by_client[cid]`, and a subsequent `/clients/{cid}/log` includes
  the new entry. Use the FastAPI `TestClient`. Keep the test's writes from
  polluting the repo (use a temp captured file or clean up) — at minimum don't
  assert against a committed file.

---

## 3. Frontend

### Types `frontend/lib/types.ts`
Add `CaptureDraft`, `ProposedEdge`, `ProposedFacet`, `RiskPreview`,
`CaptureConfirm`, `CaptureResult` mirroring §2 (reuse `Provenance`).

### API `frontend/lib/api.ts`
Add POST helpers (the api object only has GET `get<T>` today — add a `post<T>`):
```ts
captureExtract(id: string, body: CaptureExtractBody): Promise<CaptureDraft>
captureConfirm(id: string, body: CaptureConfirm): Promise<CaptureResult>
```
POST with `headers: {"Content-Type":"application/json"}`, `body: JSON.stringify(...)`.

### Component `frontend/app/components/CaptureNote.tsx`
`export function CaptureNote({ clientId, onSaved }: { clientId: string; onSaved?: () => void })`,
`"use client"`. Light theme only. Flow:

1. **Input row** — three modes filling one note `<textarea>`:
   - **Type** (default).
   - **🎙 Dictate** — Web Speech API (`window.webkitSpeechRecognition ||
     window.SpeechRecognition`). Feature-detect; if unsupported, hide/disable the
     mic with a tooltip. Start/stop toggling; append interim+final transcript into
     the textarea. Needs no key.
   - **📷 Photo** — file input (image). On select, OCR **in the browser** via
     `tesseract.js` (**dynamic import inside the handler**, never at module top, to
     keep it out of SSR/the main bundle): `const { default: Tesseract } = await
     import("tesseract.js"); const { data } = await Tesseract.recognize(file, "eng")`.
     Show a progress/“reading…” state; on done append `data.text` to the textarea.
     If OCR fails, surface a friendly message and let the RM type — never block.
   - Metadata: a **modality** `<select>` (Physical Meeting / Phone Call / Video
     Call / Email / Lunch / File Note / Physical Event), **contact** text, **date**
     (defaults to today via `new Date().toISOString().slice(0,10)`), optional rm.
2. **Extract** button → `api.captureExtract` → render the **staged** panel:
   - A clear **"Nothing is saved yet — review, then confirm"** banner (golden rule).
   - Detected-topic chips; the normalised note; the **risk preview** (delta +
     direction, coloured like the risk timeline).
   - **Proposed interest edges**: each a row with a checkbox (selected), the
     topic label, an editable **polarity** (opportunity/conflict/neutral) and
     **facet** select, and the rationale. RM can deselect or change.
   - **Proposed facets**: each a checkbox + editable text + facet select.
3. **Confirm & append** button → `api.captureConfirm` with the final note +
   only the selected/edited edges & facets → success state showing the new entry
   id and an "applied N edges / M facets" summary; call `onSaved?.()`. Offer a
   "Capture another" reset. Show errors inline (422 etc).

Reuse `Provenance` where useful; keep it focused (< 800 lines, small helpers).
Install `tesseract.js` (frontend dep) and dynamic-import it. Note in a small print
line that dictation needs Chrome/Edge and OCR runs locally in the browser.

### Tab `frontend/app/components/ClientView.tsx`
Add `"capture"` to the `Tab` union; add a tab button labelled **"＋ Add Note"** as
the **last** tab; render `{tab === "capture" && <CaptureNote clientId={clientId} />}`.
Import `CaptureNote`.

---

## 4. Done = verified

- `pytest` green (incl. new test); `tsc --noEmit` clean; `npm install tesseract.js`
  succeeded and the dynamic import type-checks.
- TestClient smoke: `extract` then `confirm` on a Schneider note → `log_count`
  increments, a new interest edge is present, `/insights` reflects the cleared
  cache.
- Browser: the **＋ Add Note** tab renders; typing a note → Extract shows the
  staged panel → Confirm appends; the new entry then appears in the **Log**, the
  **CRM Network**, and the **Risk Timeline** (it is a dated, scored log line).
  Dictate + Photo buttons render and degrade gracefully. Console clean.
