# Demo — Advisory Workbench

> SwissHacks · SIX / Noumena / NTT DATA · *The Next Generation of Wealth Advisory*.
> A 5-minute live walkthrough + a slide-by-slide deck outline mapped to the judged criteria.
> All facts below are pulled from the live API (`http://localhost:8000`) and match
> `docs/api_samples/*.json` exactly.

**One-line pitch.** The strategy never changes. We personalise *at the asset level*, inside the
client's fixed mandate: the workbench reads three years of CRM notes into a living client profile,
watches the news against it, and — when something the client actually told us collides with a name
they actually hold — hands the RM a same-sector, CIO-approved, drift-safe swap **and** a ready-to-send
note. The RM approves; the client decides. Every line cites its source.

---

## 1. Five-minute live demo

### Setup (before the room, 0:00)

- Backend running at `:8000`, frontend at `:3000`.
- Open the **client list** (`GET /clients`): four cards, each with a one-line headline and
  `alert_count: 1`. Note out loud that the system is running in **deterministic / offline mode**
  (`/api/health/integrations` → all probes `mode: "…fallback / seed…"`) — *"no tokens spent, fully
  reproducible; flip one env var and the same adapters go live."* This pre-empts the feasibility
  question.

### Act 1 — Schneider, the vertical slice (1:00 → 3:00)

This persona exercises **every box** in the pipeline. Spend half your demo here.

1. **The person.** Open Schneider (Balanced mandate). Read the profile: *automotive-supply CEO,
   but since his daughter Chloe's early-onset Parkinson's diagnosis his decisions are
   purpose-driven.* The profile is built from **26 CRM log entries** — point at the
   `personality` facet quote: *"My automotive business means nothing if I cannot save my
   daughter."*
2. **The stance, in his words.** Show the `neuro-research` interest edge, cited to two log lines:
   *"our private wealth is now a weapon to save Chloe… I want our core healthcare and pharma
   holdings to actively support… brain disease research"* (`schneider#2026-01-22#20`) and *"if a
   company we own ever abandons or defunds Parkinson's research… flag them immediately for
   divestment"* (`schneider#2026-03-05#22`).
3. **The trigger.** Open the alert: *"Biogen to wind down neurodegenerative research division,
   pivot to higher-margin therapeutics"* (Reuters Health, sentiment **−0.62 BEARISH**). Click the
   **"why this surfaced"** trail: shared topic node `neuro-research` (Neurodegenerative research) —
   his CRM edge **∩** the news tag. *"This is a set intersection, not an LLM guess — that's why it's
   cheap and that's why it's explainable."*
4. **The conflict.** The match is `polarity: conflict` **with an affected holding** — he *holds*
   Biogen: `Balanced:US09062X1037`, **CHF 101,097**. The `why[]` shows all four sources: two CRM
   lines, the news item, the portfolio row.
5. **The strategy proposal (Output 1).** **SWAP Biogen → Eli Lilly & Co.** (`US5324571083`).
   Walk the constraints panel — these are *checked*, not asserted:
   - *Universe limited to CIO-approved names (BUY-rated targets only)* — Eli Lilly is a CIO **BUY**.
   - *Same sector: Health Care.*
   - *Sub-asset-class matched (drift-neutral): Foreign (Dev. Markets) → Foreign (Dev. Markets)* →
     `drift_safe: true`.
   - Target labelled `neuro-research-commitment, metabolic-leader`. *"We keep the sector weight,
     upgrade the values fit, and stay inside ±2.0pp."*
6. **The dialogue suggestion (Output 2).** A draft note in his **empathetic, mission-driven**
   style, leading with the human stake, with light market context appended (SMI steady; bond
   yields easing) that is clearly tagged "discussion, not strategy."
7. **The gate.** Highlight the **RM confirm** control. *"Nothing here executed. Nothing sent. The
   AI proposed; the RM approves; the client decides."*

### Act 2 — the other three, each a different shape (3:00 → 4:30)

Same pipeline, three deliberately different outputs — this is where breadth lands fast.

- **Huber — a positive opportunity (not a fire).** Defensive mandate. *"Unilever cuts off all
  palm-oil suppliers tied to deforestation, launches reforestation foundation"* (NZZ, **+0.71
  BULLISH**). Topic `esg-deforestation` ∩ his edge *"call me when a company I own actually does
  something magnificent for the planet."* `polarity: opportunity` → action **INCREASE** Unilever
  (CIO BUY, +CHF 20,123 within the sleeve, drift-safe). The draft *opens with good news, not a
  market dip.* **Takeaway: the workbench celebrates, it doesn't only alarm.**
- **Räber — resist the CIO.** Defensive mandate. Trigger is a *CIO tactical update* to rotate
  from defensive staples/healthcare into **mega-cap US AI** (no held issuer). Topic `us-tech-ai` ∩
  his logged aversion *"valued on pure hype… the dot-com crash of 2000 all over again"* /
  *"I want to sleep at night, not speculate on Silicon Valley cloud bubbles."* Output is a
  two-part strategy: **HOLD — do NOT execute the rotation** (keep the defensive allocation), and
  *if* exposure is mandated, **prefer ASML** (tangible hardware he respects) over abstract
  software. **Takeaway: the agent defends the client's documented stance — even against the house
  view — and stays inside the rails.**
- **Ammann — a reputational divest.** Growth mandate. *"PDD Holdings (Temu) hit with forced-labour
  allegations across supplier network"* (Bloomberg, **−0.68 BEARISH**). Topic `labour-governance`
  ∩ his edge *"dump the entire position before the local Swiss press can link my name to it."*
  `polarity: conflict`, held name `Growth:US7223041028` (**CHF 95,688**) → **SWAP PDD → Cie
  Financière Richemont** (CIO BUY, same sector Consumer Discretionary, labelled
  `clean-governance, swiss-luxury`). Constraint panel is honest: sub-asset-class differs (Emerging
  Markets → Domestic CHF) → `drift_safe: false`, *flagged* as minor single-name drift within
  ±2.0pp. The draft is sharp and reputational-risk-framed, in his data-driven style.
  **Takeaway: the framing matches the person, and the system tells the truth about drift.**

### Close (4:30 → 5:00)

Land all three judged themes in one breath: *"One pipeline, four very different people, four very
different right answers — each fully cited back to a CRM line, a news item, a CIO rating and a
portfolio row; each gated behind the RM; and the whole thing ran offline for zero tokens. Make a
note live and you'd watch it flow through the same seams."*

---

## 2. Slide-by-slide `.pptx` outline (mapped to judged criteria)

Judging weights (CLAUDE.md §11): **Creativity 25 · Trust & Explainability 25 · Feasibility 20 ·
Visual Design 15 · Presentation 15.** Each slide names the criterion it serves and the feature
that earns it.

| # | Slide | Content | Serves (feature → criterion) |
|---|---|---|---|
| 1 | **Title** | *Advisory Workbench — the next generation of wealth advisory.* Team, challenge, one-line pitch. | Presentation |
| 2 | **The problem** | An RM holds 100+ clients. Three years of CRM notes are unread; news moves faster than any human can cross-reference against every portfolio. The strategy is fixed — so where's the room to personalise? | Presentation; sets up Creativity |
| 3 | **The insight** | *Strategy stays fixed; personalise at the asset level.* Within the mandate, swap a conflicted name for a same-sector, CIO-approved one that fits both the strategy **and** the person. Two outputs: a strategy proposal **and** a conversation. | **Creativity** — the dual-output, asset-level framing |
| 4 | **How it works (architecture)** | The ASCII/visual flow from `ARCHITECTURE.md` §2: capture → meeting_log → profile + interest edges; news → classify once → tags; CIO list → labelled stocks; **match = profile topics ∩ news topics**; advisory → strategy + dialogue; RM approves. Three graphs + portfolio graph. | **Feasibility** + Creativity — a real, modular design |
| 5 | **Live demo: Schneider (the vertical slice)** | Screen-record fallback of Act 1. Profile → stance → Biogen trigger → conflict → **SWAP Biogen→Eli Lilly** → empathetic draft → RM confirm. | **Trust & Explainability** + Presentation |
| 6 | **Trust by construction** | The provenance model: every fact/alert/swap/message carries `{source_type, source_id, excerpt, …}`. Show the "why this surfaced" click-through (CRM line + news tag + portfolio row + CIO rating). *If we can't cite it, we don't surface it.* | **Trust & Explainability** (the 25% slide) |
| 7 | **Human-in-the-loop** | Every side-effect is gated: the AI proposes, the RM approves, the client decides. No auto-trade, no auto-send. Confirm-gate screenshot. | **Trust & Explainability** |
| 8 | **Inside the rails** | Constraints are *checked*, not claimed: CIO-approved universe only, same-sector swap, ±2.0pp drift rule. Show Schneider's `drift_safe: true` vs Ammann's honest `drift_safe: false` flag. Balanced mandate's real +2.201pp Foreign-Dev-Markets breach. | **Feasibility** + Trust |
| 9 | **Four people, four shapes** | The 2×2: Schneider (conflict → swap), Huber (opportunity → increase), Räber (resist-the-CIO → hold/prefer ASML), Ammann (reputational → divest/swap). One pipeline, four right answers. | **Creativity** + Presentation |
| 10 | **Feasibility & token economics** | Naive O(clients × items) vs ours (classify once) + (real matches reasoned once). Classify-once, free index match, strong model only on the opened match, cached per client. Runs offline for **0 tokens**; one env flag goes live (SIX MCP, Event Registry, Phoeniqs). | **Feasibility** (the 20% slide) |
| 11 | **The stack** | Python/FastAPI backend, in-memory graphs, swappable mock↔live adapters behind one `Source.fetch → Record` seam; Next.js dashboard. Seed-first, demo-safe, cached. | **Feasibility** + Visual Design |
| 12 | **Design & trust UX** | Dual-output panels (strategy | dialogue), provenance chips, "why this surfaced" tags, confirm gates, the conflict/opportunity colour language. | **Visual Design** + Trust |
| 13 | **Close / impact** | An RM serves more clients, never misses a values-conflict, and every recommendation is defensible to the client and the compliance desk. Ask. | Presentation |

> **Speaker-note reminders:** lead with Schneider; click at least one provenance trail on stage;
> say the words "the RM approves, the client decides"; show one honest `drift_safe: false` so the
> system reads as truthful, not magical. UK spelling throughout.

---

## 3. "Why this is feasible / token-cheap" — the 30-second talking point

> *"The expensive thing in a system like this is asking a model about every client and every news
> item — that's clients × items, and it doesn't scale. We don't do that. We classify and embed each
> news item **once**, shared across all clients. Matching a client to the news is then a free set
> intersection over a shared topic index — no model call at all. The strong model runs only on the
> handful of real matches, lazily, when the RM actually opens the alert, and the result is cached
> per client. There is exactly one LLM cost surface in the whole codebase. And because every adapter
> degrades to a deterministic seed, the entire pipeline — profiles, matches, swaps, drafts — runs
> offline for zero tokens. What you just saw cost nothing to generate, and it's fully reproducible.
> Flipping one environment variable swaps the same adapters onto live SIX prices, live Event
> Registry news, and the Phoeniqs model."*

---

## 4. Fact sheet (for live Q&A — all from the API)

| Persona | Mandate | Trigger (source, sentiment) | Match polarity | Held name (CHF) | Action | Target (CIO) | Drift-safe |
|---|---|---|---|---|---|---|---|
| **Schneider** | Balanced | Biogen winds down neuro research (Reuters Health, −0.62) | conflict | Biogen `US09062X1037` (101,097) | **SWAP** | Eli Lilly `US5324571083` (BUY) | ✅ same sub-asset-class |
| **Huber** | Defensive | Unilever cuts palm-oil suppliers, funds reforestation (NZZ, +0.71) | opportunity | Unilever `GB00B10RZP78` (80,491) | **INCREASE** (+20,123) | Unilever (BUY) | ✅ within sleeve |
| **Räber** | Defensive | CIO tactical: rotate into US AI infra (CIO desk, +0.34) | conflict | *(none held)* | **HOLD** + prefer | ASML `NL0010273215` (BUY) | ✅ strategy unchanged |
| **Ammann** | Growth | PDD/Temu forced-labour allegations (Bloomberg, −0.68) | conflict | PDD `US7223041028` (95,688) | **SWAP** | Richemont `CH0210483332` (BUY) | ⚠️ EM→Domestic, flagged |

Shared topic vocabulary (`topics.py`): `neuro-research`, `esg-deforestation`, `us-tech-ai`,
`labour-governance`. All four personas report `alert_count: 1` and, in offline mode,
`llm_used: false`.
