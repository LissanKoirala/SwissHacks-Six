# Overview dashboard contract

The **Overview** is the RM's morning landing page — what they see *before* drilling
into a single client. Philosophy: a simple, glanceable desk view for a relationship
manager (wide age range, not all technical); detail lives one click away inside each
client. Everything is grounded — every card cites a real CRM log line, news item, or
held position (CLAUDE.md §2 traceability).

## Endpoint

`GET /overview` → one aggregate across **all** clients (no per-client round-trips in
the UI). Deterministic, offline-safe (no LLM, `USE_LIVE=0`). Builder:
`backend/workbench/agents/overview.py :: build_overview(world)`.

## Shape (snake_case, mirrors `frontend/lib/types.ts :: Overview`)

```
Overview {
  generated_at, today, use_live, rm_name,
  briefing,                       // one-line morning prioritisation (the "SMS briefing")
  kpis { clients, priority_tasks, meetings_upcoming, market_moves, portfolio_events, aum_chf },
  priority_tasks: OverviewTask[]  // §1 — who to touch base with, and why
  meetings:       OverviewMeeting[]   // §2 — next meetings (Google Calendar pending)
  market_moves:   MarketMove[]    // §3 — macro / market-digest news
  portfolio_events: PortfolioEvent[]  // §4 — earnings / filings / IPOs on held names
  news:           NewsWireItem[]  // §5 — company news wire, tagged with affected clients
}
```

### Section sourcing (all citeable)

1. **Priority tasks** — each client's `insights.matches` (a world event hitting their
   profile). Severity: `conflict → high`, `opportunity → med/low` by |sentiment|.
   Carries the match provenance and a suggested next action. Sorted urgent-first.
2. **Meetings** — last `meeting_log` entry per client gives *last met* (real, cited);
   the next date is a **suggested** business-day slot, agenda/venue lifted from the
   grounded `rendezvous` plan. Alerted clients are scheduled sooner. Google Calendar /
   Gmail draft are stubbed affordances pending live integration.
3. **Market moves** — `news` items flagged `market_digest` (macro, dialogue-only per §2).
4. **Portfolio events** — synthesised earnings/filings on the largest **held** issuers
   + sector IPOs, each cited to a real portfolio holding and tagged with which clients
   hold it. Stub for a live SEC/earnings feed.
5. **News wire** — company/issuer `news` items, each tagged with the clients it touches
   (topic intersection) and their polarity.

## UI

`frontend/app/components/OverviewDashboard.tsx`, rendered as the default landing in
`app/page.tsx`. The sidebar gets an **Overview** item above the client list; selecting a
client (here or in any card) drills into `ClientView`. Integration affordances
(Connect Google Calendar, Draft email, SMS briefing) are clearly labelled "soon".
