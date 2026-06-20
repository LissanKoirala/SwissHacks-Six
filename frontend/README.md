# Advisory Workbench — Frontend

A relationship-manager (RM) dashboard for the SwissHacks *Next Generation of
Wealth Advisory* challenge. It renders a living client profile, surfaces
profile-vs-news/CIO matches, and presents the product's two outputs side by
side — a **mandate-safe strategy proposal** and a **dialogue suggestion** —
each fully cited and gated behind an explicit RM confirm.

> **Advisory only.** The agent proposes, the RM approves, the client decides.
> Nothing in this UI auto-executes a trade or auto-sends a message. The confirm
> buttons are non-destructive local mock actions.

## Requirements

- **The backend must be running on `http://localhost:8000`.** This frontend is
  a pure client of the FastAPI API; all data is fetched in the browser at
  runtime (never at build/SSR time), so the build does not need the backend up,
  but the running app does.
- Node 18+ and npm.

## Run

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Then open http://localhost:3000. Pick a client from the left sidebar.

To point at a different backend, set `NEXT_PUBLIC_API_BASE`:

```bash
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
```

## What you'll see

- **Sidebar** — the four clients (`GET /clients`), each with a mandate pill and
  an alert-count badge, plus a live integration-health strip
  (`GET /api/health/integrations`).
- **Client header** — name, mandate, headline, and the *Advisory only* banner.
- **Advisory tab**
  - **Alert card(s)** from `matches[]`: polarity chip (conflict = amber,
    opportunity = green), the news item with source / date / sentiment, the
    affected holding, and a **"Why this surfaced"** expander that cites *both*
    sides of every shared topic — the CRM quote and the news excerpt.
  - **Dual output** — two panels:
    - **Strategy proposal**: each swap as a row (action chip, SELL → BUY,
      CHF amount, drift-safe / minor-drift badge, same-sector tag, rationale,
      and a *View sources* provenance list), plus a collapsible
      *Constraints checked* list and an RM **confirm gate**.
    - **Dialogue suggestion**: tone line, talking points each with a clickable
      provenance tag, the draft message as a quoted card, and *general market
      context* footnotes — with its own RM **confirm gate**.
- **Portfolio tab** (`GET /clients/{id}/portfolio`) — a mandate-drift table
  (breach rows highlighted, ±2.0pp threshold) and a holdings table with the
  alert's affected holding highlighted.
- **Profile tab** (`GET /clients/{id}`) — the four profile facets
  (professional / interests / historical / personality), every fact carrying
  its CRM-log provenance.

## Trust feature: `<Provenance>`

Every cited fact — profile facets, shared topics, swap rationales, talking
points, market context — renders through one reusable `<Provenance>` component
(`app/components/Provenance.tsx`): a coloured source-type badge, the source id,
timestamp, the verbatim excerpt, and an outbound link when present. If a claim
can't be cited, it isn't surfaced.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS. No other
runtime dependencies. UK spelling throughout user-facing copy.

## Layout

```
app/
  layout.tsx            root layout + global styles
  page.tsx              shell: sidebar + selected client
  globals.css           Tailwind layers + component classes
  components/
    Sidebar.tsx         client list + integration health
    ClientView.tsx      header, advisory-only banner, tabs, dual output
    AlertCard.tsx       match → news + "why this surfaced" (both sides cited)
    StrategyPanel.tsx   swaps, constraints, RM confirm gate
    DialoguePanel.tsx   talking points, draft, market context, RM confirm gate
    PortfolioView.tsx   mandate-drift table + holdings table
    ProfileView.tsx     profile facets with provenance
    Provenance.tsx      the reusable citation component (trust feature)
    ConfirmGate.tsx     non-destructive RM approve flow
    ui.tsx              chips, badges, expander
lib/
  api.ts                fetch client (NEXT_PUBLIC_API_BASE)
  types.ts              types mirroring the backend contract
  format.ts             CHF / pct / date formatting (en-GB)
```
