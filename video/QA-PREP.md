# Q&A Prep — Everyone's a Billionaire

Anticipated judge/audience questions for the ~4-minute Q&A, with concise answers.
SwissHacks · SIX / Noumena / NTT DATA. Judging: Trust & Explainability 25 ·
Creativity 25 · Feasibility 20 · Visual Design 15 · Presentation 15.

**Memorise cold:** the Schneider end-to-end thread and the token-economics line —
together they cover most of what gets asked. If you don't know something, say
"out of scope for the hack — here's how we'd approach it" rather than overclaim.

---

## Trust, compliance & explainability (their #1 focus)

**Is this giving financial advice? Who's liable?**
No. Advisory-only by design: the agent proposes, the RM approves, the client
decides. Every side-effectful step is gated by an explicit RM confirm — it never
auto-trades or auto-sends. The RM remains the regulated adviser.

**How do you stop hallucination? Why should an RM trust an output?**
Every fact, alert and suggestion carries provenance — one click to the source
log line, news item or CIO row. If we can't cite it, we don't surface it. The
match itself is deterministic (a shared-topic set intersection), not an LLM
guess; the model only drafts the wording.

**Suitability / MiFID — how do you keep it in the mandate?**
Strategy is constrained to CIO-approved names, same-sector swaps, and the ±2.0pp
drift rule as hard constraints — we surface "constraints checked". General
market info only feeds the dialogue, never the trade.

**Data privacy / client confidentiality?**
Profiles are per-client and can run on-prem; the only external LLM surface is
Phoeniqs, so sensitive data needn't leave the bank. (Be honest about current
hack state if pushed.)

## Feasibility & technical

**Does this scale? What does it cost in tokens?**
Cost is O(items classified once) + O(real matches) — not O(clients x items).
Classify/embed once and cache; matching is a free index lookup; the strong model
runs lazily, only on real hits, cached per (client, item).

**What's real vs mocked in the demo?**
Seeded from the provided SwissHacks CRM + Portfolio workbooks (real case-study
clients). Live adapters exist for SIX MCP (prices/valuation), Event Registry
(news + sentiment) and Phoeniqs (LLM / embeddings / OCR), each with offline
fallbacks so the demo is deterministic.

**Which model, and why?**
Phoeniqs for LLM + embeddings. A cheap/deterministic classifier does the
tagging; the strong model is reserved for the dialogue/strategy draft. Swappable
behind one interface.

**How fast is it for the RM in the morning?**
The overview is pre-warmed/cached, matching is instant, and the expensive
reasoning is lazy — it runs when the RM opens the item, not speculatively.

## Product & differentiation (creativity)

**How is this different from ChatGPT / a RAG chatbot?**
It isn't a chat box. It's a structured, cited pipeline with hard mandate rails,
a living profile across four facets, a predictive client digital twin that
anticipates objections, and a risk timeline that uses past reactions to predict
future ones.

**Walk me through one end-to-end trigger.** (the Schneider thread — know it cold)
CRM stance (his foundation funds neuro research) -> Biogen shuts its neuro
division (news) -> conflict surfaced and cited -> same-sector, sentiment-screened
swap (Biogen -> Eli Lilly, CHF 101,097, drift-safe) -> dialogue drafted in his
voice -> RM signs off.

**How do you keep the profile current / handle cold start?**
Multimodal capture (voice / photo / text) -> extract -> RM confirm -> immutable
log; the twin and risk timeline rebuild from it. Cold start is covered by the
3-year CRM history.

## Business / adoption

**Will RMs actually trust and use it? Doesn't it threaten their job?**
It augments, not replaces — it gives one RM a billionaire-grade team so they can
give every client full attention. The confirm-gate keeps them in control;
provenance lets them defend every call.

**What's the wedge / who pays?**
Private banks and wealth managers, sold to the desk as RM productivity plus
compliance-grade traceability.

## Likely curveballs

**Show me where it's wrong, or says "no action".**
It does return "no action" when a client is within mandate and values — show the
"nothing to propose" state. Restraint is a feature.

**Sentiment can be wrong — what then?**
Sentiment is labelled upstream once and only screens candidates; the RM always
sees it and its source, and nothing auto-executes.

**Where does Noumena / the graph fit?**
We modelled the three graphs — CRM, news, and the meta/topic index — as the data
model; it can be backed by Noumena when productionised.

---

## Roles for the Q&A
- One owner fields **Trust / compliance**, one fields **Feasibility / tech**.
- Keep the **Schneider end-to-end** and the **token-economics** answers ready cold.
- Don't overclaim regulatory coverage — frame it as the approach, not a finished cert.
