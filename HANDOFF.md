# Morning handoff — Advisory Workbench

_Last updated: 2026-06-20 (overnight session). Read this before you touch the code._

This is a fast status + run guide for the team. The product is the **Advisory
Workbench** (RM desk). `CLAUDE.md` is the contract/source-of-truth; this file is
just "where are we right now."

---

## TL;DR

- **`main`** holds the full workbench (PR #1, **merged**): insights + dual-output
  strategy/dialogue, CRM graph network view, analytics, rendezvous, decision flow,
  the globe Investment Map.
- **`feat/risk-timeline`** (current branch, **3 commits, PR NOT opened/merged —
  held on purpose**) adds two new features + polish:
  1. **Risk Timeline** scrubber
  2. **RM Capture** (＋ Add Note): text / voice / photo → extract → stage → confirm
     + **guided "pseudo-interview" prompts**
- Both new tabs carry an amber **"TO TEST"** badge. **Do not open/merge the PR
  until the RM has tested and explicitly says to remove the markers.**
- Status: `pytest` **39 passed**, `tsc --noEmit` **clean**, browser-verified, console clean.

---

## Run it

Offline, no keys (seed data, `USE_LIVE=0`):

```bash
# backend  → http://localhost:8000
cd backend && ./.venv/bin/uvicorn app:app --port 8000
# frontend → http://localhost:3000
cd frontend && npm run dev
```

Backend is started **without `--reload`** in this session — after editing backend
Python you must restart uvicorn. Clients: `schneider`, `huber`, `raeber`, `ammann`.

Checks:
```bash
cd backend && ./.venv/bin/python -m pytest -q     # 39 passed
cd frontend && npx tsc --noEmit                    # clean
```

---

## What was built this session

### 1. Risk Timeline  (tab "Risk Timeline" · TO TEST)
Replays each client's CRM meeting log, scoring every entry against a de-risk /
risk-on lexicon into a **stepped risk-appetite line** vs the **mandate band**.
- Backend: `backend/workbench/agents/risk_timeline.py` → `GET /clients/{id}/risk-timeline`.
- Frontend: `frontend/app/components/RiskTimeline.tsx` (responsive SVG, true date axis,
  risk bands, dashed mandate baseline, signal-coloured dots).
- **Scrubber controls**: draggable slider + **Play** (autoplay, 1.3s/step) +
  media transport: **⏮ prev-major · ◀ prev · ▶ play · ▶ next · ⏭ next-major**
  ("major" = the milestone points). Bounds-disable; scrubbing pauses autoplay.
- State panel reconstructs appetite %, mandate-fit, the latest risk-moving note +
  provenance, "the desk learned here" (facet changes), and accrued edges/facets
  **as of the scrub date**.

### 2. RM Capture  (tab "＋ Add Note" · TO TEST)  — CLAUDE.md §8.B
Multimodal interaction capture with the **extract → stage → RM-confirm** gate.
- **Input**: Type, **🎙 Dictate** (browser Web Speech API), **📷 Photo** (tesseract.js
  OCR, in-browser, dynamic-imported). All fill one note box.
- **Guided capture** (new): a client-aware "pseudo-interview" — opener → *has
  {client}'s position on {their known topic} changed?* → risk → life → holdings →
  values → follow-up. Teleprompter stepper with Prev/Next, jump dots, "Answer
  aloud" (drives the mic) and "Add to note". Backend
  `build_capture_prompts` → `GET /clients/{id}/capture/prompts`;
  frontend `CaptureGuided.tsx`.
- **Extract** (read-only) → `POST /capture/extract`: detected topics, proposed
  interest-edges (editable polarity/facet) + facet statements, risk-timeline
  preview. **Confirm** (the only mutation) → `POST /capture/confirm`: appends one
  **immutable** `meeting_log` entry and materialises the RM-approved edges/facets
  into the live profile → flows into advisory, CRM graph, risk timeline.
- Persistence: write-through to `backend/data/captured_entries.json` (git-ignored),
  replayed on boot so captures survive a restart.
- Backend `agents/capture.py`; frontend `CaptureNote.tsx` + `CaptureStaged.tsx` +
  `CaptureGuided.tsx`.

### Also already on `main` (PR #1) from earlier
Decision Flow rotated to a **vertical** layered flow (no more horizontal scroll);
Investment Map globe now maps the **full news graph** as sentiment-coloured ambient
pulses ("World news") alongside the alert signal.

Contracts for the above: `docs/RISK_TIMELINE_CONTRACT.md`, `docs/CAPTURE_CONTRACT.md`.

---

## Needs a human (can't be verified headlessly)

- **🎙 Voice dictation** — needs a real mic + Chrome/Edge. Wired and renders, but
  the actual speech-to-text was not exercised. Please test on a laptop.
- **📷 Photo OCR** — needs an actual image upload. tesseract.js loads its worker
  from CDN, so it needs network at runtime. Test with a photo of a printed/handwritten note.

---

## Known caveats / half-finished

1. **Capture extraction polarity is per-note, not per-topic.** A note with mixed
   cues (e.g. "fund Parkinson's … *reduce* US tech") labels *all* detected topics
   the same polarity — so "US tech" can come out `opportunity` when it should be
   `conflict`. **Mitigation:** the staged panel's per-edge polarity/facet dropdowns
   let the RM fix it before confirm. **TODO:** scope polarity per topic/sentence.
2. **Proposed facet statements are naive** (first/second sentence; facet from a cue
   heuristic). RM edits them in the staged panel. Could be smarter.
3. **Risk lexicon over-matches routine ops words** ("cash", "liquidity" in admin
   notes count as de-risk). Transparent (every delta is cited) but worth tuning.
4. **No test yet for `build_capture_prompts`** (the guided-prompts endpoint). The
   extract/confirm paths are tested (`test_capture.py`); add a prompts test.
5. **Capture persistence is a JSON file**, not a DB — fine for the demo, resets only
   if you delete the file.
6. **Risk Timeline autoplay**: a dev-only React StrictMode timer can leave the
   playhead mid-timeline if you switch clients mid-autoplay. Cosmetic; clean in a
   production build.
7. **LLM polish path exists but is off** (`USE_LIVE=0`, no Phoeniqs key) —
   extraction is fully deterministic offline, which is what we want for the demo.

---

## TODO / next steps

- [ ] **RM sign-off testing** of Risk Timeline + Capture (incl. voice/photo on a real device).
- [ ] On sign-off: **remove the "TO TEST" badges** (one marked block in
      `frontend/app/components/ClientView.tsx`), then **push + open the PR** for
      `feat/risk-timeline` → `main` (merge on the word).
- [ ] Per-topic polarity in capture extraction (caveat #1).
- [ ] Add a pytest for `build_capture_prompts` (caveat #4).
- [ ] Optional: tune the risk lexicon (caveat #3); smarter facet proposals (#2).
- [ ] Optional: dedupe / richer store for captured entries (#5).

---

## Where things are

```
backend/workbench/
  agents/risk_timeline.py   risk scoring + timeline + score_note()
  agents/capture.py         extract / confirm / persistence / replay / prompts
  api/app.py                routes (capture POSTs + prompts/risk-timeline GETs)
frontend/app/components/
  RiskTimeline.tsx          scrubber + transport controls
  CaptureNote.tsx           capture input + lifecycle
  CaptureStaged.tsx         staged review (edges/facets/risk preview)
  CaptureGuided.tsx         guided "pseudo-interview" stepper
  ClientView.tsx            tabs (+ the temporary TO-TEST badge block)
docs/RISK_TIMELINE_CONTRACT.md, docs/CAPTURE_CONTRACT.md
```

Branch `feat/risk-timeline` @ `78480bc` · PR **held** pending RM sign-off.
