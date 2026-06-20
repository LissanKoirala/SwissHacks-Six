# Feature port — Advisory Command Center → Workbench

Bringing four features from `feat/advisory-command-center` into the workbench, **packaged the workbench way**: FastAPI builders (provenance on every fact, CLAUDE.md §7.5) + Next.js/React/Tailwind components in the existing **light** theme (`card`, `chip`, `accent`/`ink` tokens, `Provenance` trust primitive). Every component takes `{ clientId }` and self-fetches via `lib/api.ts`, like `PortfolioCharts`/`InvestmentGlobe`.

The orchestrator owns the **shared seams** (already written): `lib/types.ts`, `lib/api.ts`, `backend/.../api/app.py` routes (lazy-import the builders), `ClientView.tsx` tabs. Each feature agent owns disjoint files below.

Provenance shape (reuse `models.Provenance` / `lib/types Provenance`): `{ source_type, source_id, excerpt, url?, timestamp? }`. `source_type ∈ crm_log|news|cio_list|portfolio|mandate|market_digest`.

---

## 1. Rendezvous  — `GET /clients/{id}/rendezvous`
Builder: `backend/workbench/agents/rendezvous.py::build_rendezvous(world, client_id) -> dict`.
Component: `frontend/app/components/RendezvousView.tsx` (default export `RendezvousView({clientId})`), tab `rendezvous`.

JSON (snake_case):
```
RendezvousInterest = { id, label, category, icon, provenance: Provenance|null }
RendezvousSuggestion = { id, kind, icon, title, venue, city, when, why,
                         matched_interest_ids: string[], prep: string[],
                         confidence: "grounded"|"inferred", provenance: Provenance[] }
Rendezvous = { client_id, client_name,
               interests: RendezvousInterest[], suggestions: RendezvousSuggestion[],
               talking_points: { text, provenance: Provenance|null }[], avoid: string[] }
```
category/kind ∈ dining|sport|culture|outdoor|family|philanthropy|wine|travel|other.
Ground interests/suggestions in `world.meeting_logs[client_id]` (Provenance source_type="crm_log", source_id=entry.id, excerpt=note snippet, timestamp=entry.timestamp) and `world.profiles[client_id].facets`. Curate per persona; include a **football match** for Ammann and a **restaurant** for everyone. confidence="grounded" when a real log excerpt backs it, else "inferred".

## 2. Decision Flow — `GET /clients/{id}/decision`
Builder: `backend/workbench/agents/decision.py::build_decision(world, client_id) -> dict` — reshape `orchestrator.get_insights(world, id)` (do NOT re-derive strategy).
Component: `frontend/app/components/DecisionFlow.tsx` (`DecisionFlow({clientId})`), tab `decision`.

6 ordered layers: notes → dna → signal → holding → candidate → action.
```
DecisionNode = { id, layer, title, subtitle, detail, polarity?: Polarity|null, provenance: Provenance[] }
DecisionEdge = { id, source, target, kind: "supports"|"flags"|"triggers"|"replaces"|"honors"|"proposes", label }
Decision = { client_id, client_name, headline, polarity,
             layers: {id,label}[], nodes: DecisionNode[], edges: DecisionEdge[],
             recommendation: { action, sell: string|null, buy: string|null, rationale, constraints_checked: string[] } }
```
Map insights.matches[0] + strategy_proposal.swaps[0]: notes = shared_topics[].client_provenance (CRM log); dna = the topic stance; signal = match.news; holding = match.affected_holding; candidate = swap.buy_issuer (CIO BUY); action = swap. Edges: note→dna supports, dna→holding flags, signal→holding triggers, holding→candidate replaces, candidate→action proposes, dna→action honors. Render as an animated left→right layered DAG (SVG/canvas) in the light theme; click a node → its provenance (reuse `ProvenanceList`). Empty state if no matches.

## 3. CRM graph upgrades — extend existing `/clients/{id}/graph`
Edit: `backend/workbench/graph/crm_graph.py` (extend the node/link dicts) + `frontend/app/components/CrmGraph.tsx` (render).
Node additions: person/rm → `avatar` ("/faces/<slug>.jpg" when slug known) + `first_name`; medium/theme/interaction → `icon` (emoji). Link additions: `strength` (0..1) + `recency` (0..1, from interaction timestamp).
Avatar slugs (ascii-fold full name, ä→a ö→o ü→u é→e): eugen-raeber, lisa-raeber, hubertus-schneider, carmen-schneider, marius-huber, elena-huber, julian-ammann, thomas-keller (RM). Files exist in `frontend/public/faces/`.
Emoji — medium: Physical Meeting 🤝, Phone Call ☎️, Video Call 📹, Email ✉️, File Note 📝, Lunch 🍽️, Physical Event 🎟️ (default 📌). theme: "Capital Preservation" 🛡️, "Dividends / Income" 💰, "ESG / Sustainability" 🌱, "Reputation Risk" ⚠️, "Succession Planning" 👪, "Supply-Chain Governance" 🔗, "Anti-Speculation" 🎢, "Liquidity Event" 💧, "Health / Family" 🩺 (default 🏷️).
CrmGraph.tsx: circular avatar images on person/rm nodes (initials fallback), emoji on medium/theme/interaction, raise link contrast + width/alpha by `strength` and warmth/glow by `recency`, Ctrl/Cmd +/- zoom (only when this tab is visible) + a live zoom-% badge. Keep existing pan/drag/hover/search/legend/onSelect.

## 4. Investment Map globe — REPLACE the cobe globe
New endpoint `GET /clients/{id}/globe`. Builder: `backend/workbench/globe.py::build_globe(world, client_id) -> dict` using `backend/workbench/geo.py::resolve_geo(issuer, region, isin) -> (lat,lng,country,city)`.
Component: REWRITE `frontend/app/components/InvestmentGlobe.tsx` (keep the `InvestmentGlobe({clientId})` export + the "map" tab) to a `globe.gl` 3D globe (dep installed) with the vendored earth-night texture (`/textures/earth-night.jpg` + `/textures/earth-topology.png` bump + `/textures/night-sky.png` background); SSR-guard (dynamic import / window check). Keep the surrounding light-theme card + the region/holdings side list with provenance.
```
GlobeHolding = { id, issuer, isin, industry_group, current_chf, lat, lng, country, city,
                 verdict: "VIOLATION"|"WATCH"|"OK", weight }
GlobeEvent = { id, headline, source, published_at, lat, lng, country, severity: "high"|"med"|"low",
               summary, linked_holding_ids: string[] }
GlobeArc = { id, from_lat, from_lng, to_lat, to_lng, color, label }
Globe = { client_id, holdings, events, arcs, stats: { holdings, violations, watches, events } }
```
verdict from insights: affected_holding of a `conflict` match → VIOLATION; `opportunity` → WATCH; else OK. weight = current_chf / max(current_chf). events = the matches' news items, geo-located by issuer (fallback region centroid from analytics). arcs = event → each linked holding.
