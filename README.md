# SIX-Noumena-NTT-Data

## Challenge Title

**The Next Generation of Wealth Advisory**

## Introduction

### Problem Description

Asset management faces the challenge of making well-founded investment decisions under time pressure in a highly dynamic market environment. Wealth managers operate between increasing market volatility, growing regulatory requirements, and an ever-expanding number of heterogeneous data sources, and investment decisions increasingly rely on the consolidated analysis of market, reference, tax, and regulatory data rather than individual signals. At the same time, demanding client segments — especially high-net-worth and ultra-high-net-worth individuals — expect personalized, transparent, and comprehensible advice. Classic user interfaces and manual analysis processes reach their limits, and the need for AI-supported, trustworthy recommendation and support systems is correspondingly high.

### Case Introduction

The task is to design and prototype an AI-powered wealth management workbench that automatically composes an interactive, intuitive interface for each individual user (e.g. relationship manager, investment specialist, compliance) and guides them through decisions with the right information at the right time. The interface should be assembled dynamically from role, context, portfolio situation, customer profile, and interaction intent (e.g. preparing a client meeting, explaining a recommendation, handling an event-driven alert), while keeping the experience simple: a single place to ask questions, compare options, see rationales, and trigger next actions. In addition, the system should identify how a client's behavior changes over time (risk appetite, trading frequency, channel preference, responsiveness, product interests), infer plausible drivers, and translate them into implications for the bank–client relationship (retention risk, advisory approach, suitability constraints, opportunity signals).

## Potential Users

Client advisors in wealth management — relationship managers, investment specialists, and compliance — who act as trusted partners in helping clients grow and protect their wealth while minimizing financial uncertainty.

## Use Cases

The solution should bring together several capabilities:

- **Personalized interaction layer:** generate user-specific dashboards and workflows (widgets, summaries, alerts, drill-downs) from user role and current context.
- **Natural-language & guided UX:** a chat/command experience plus guided steps (what to do next, what to ask, what to verify) to reduce cognitive load.
- **Explainability by default:** show the "why" behind recommendations and detected behavior changes (key signals, confidence, constraints, assumptions).
- **Behavior-change detection:** detect deviations and trends versus the client's own baseline and versus peer/reference segments where available.
- **Reasoning on drivers:** connect observed changes to potential causes (market events, life events, portfolio drawdown, news sentiment, advisor interaction patterns, product performance).
- **Business implications:** recommend relationship actions (proactive outreach, content/offer, meeting agenda, risk review, escalation) and highlight risks and opportunities.

## Expected Outcome

Expected deliverables include an end-to-end clickable prototype or working front-end; a minimal back-end/agent flow that demonstrates personalization and reasoning; and a short demo story showing how a relationship manager uses the UI to understand a client change, explain it, and decide on the next best action for the bank–client relationship.

## Technology 

### Available Technology

- **SIX Financial Information (MCP server + Web API):** market and financial data including real-time and historical prices (equities, funds, ETFs, bonds), macroeconomic indicators (rates, inflation, FX), fundamentals, and estimates. Each sample-portfolio position carries a Valor and MIC (combine as `{Valor}_{MIC}` for SIX MCP listing tools such as `end_of_day_snapshot`, `intraday_snapshot`, `end_of_day_history`; use the Valor alone for instrument tools). For bonds, use SIX `instrument_symbology` with the ISIN directly. A small number of ISINs are outside SIX's data subscription (see the workbook README for the list).
- **Tenity MCP-News Server:** news and sentiment feed for event- and news-driven signals.
- **Provided datasets (two workbooks):**

| Workbook | Contents |
|---|---|
| `SwissHacks_CRM.xlsx` | Three-year relationship-manager interaction logs for four sample clients (Räber, Schneider, Huber, Ammann), capturing financial behavior, preferences, and evolving signals over time. |
| `SwissHacks_Portfolio_Construction_final.xlsx` | Three model mandates (Defensive, Balanced, Growth; each summing to CHF 10M): CIO sub-asset-class targets, current positions, three-year transaction history, and cash flows (deposits, withdrawals, fees, coupons). Includes SIX (Valor + MIC) and Yahoo identifiers to speed up instrument lookup. |

- **Noumena Digital:** domain models, knowledge graphs, and AI-ready financial abstractions. _[Noumena Cloud and related capabilities carried over from the earlier challenge statement — Noumena to confirm and complete.]_
- **NTT DATA:** reference architectures and AI / cloud / trust-by-design assets. _[Details such as Azure OpenAI–based XAI, RAG, and multi-agent patterns carried over from the earlier challenge statement — NTT DATA to confirm and complete.]_

### Expected or Suggested Tech Stack

SIX MCP with the SIX Web API as a REST/JSON alternative (certificate-based authentication); Noumena Cloud (Azure-based) with knowledge graphs and financial abstractions; and Azure OpenAI–based patterns for explainable AI, retrieval-augmented generation, and multi-agent decision support.

## Challenge Slides

[Add link to the challenge introduction slides.]

## Resources & Further Information

### Relevant Links

- News aggregation API (used by the Tenity MCP-News server): https://www.newsapi.ai/news-aggregation
- [Add relevant links here.]

### Additional Information

Data conventions for the portfolio workbook: all amounts are in CHF; ISINs follow ISO 6166; equities are priced at real historical closes and bonds at par (100% of face); for bonds, quantity = face value ÷ 100. Summing BUY − SELL quantities per ISIN gives the current position. The workbook README lists the SIX coverage gaps (12 ISINs) and the Yahoo Ticker fallbacks.

## Judging Criteria

[Add the judging criteria, including percentages where applicable.]

| Criterion | Description | Weight |
|---|---|---|
| Creativity | Novel human–AI interaction; fresh ideas beyond standard chatbots | 25% |
| Trust & Explainability | Transparency, traceability, and human control | 25% |
| Feasibility | Technical realism and architectural soundness | 20% |
| Visual Design | Clarity, usability, and a trust-oriented UI | 15% |
| Presentation Quality | Clear and convincing storytelling | 15% |

## Point of Contact

### Contact Person(s)

| Company | Name | Contact |
|---|---|---|
| SIX | Jennifer Chang | jennifer.chang@six-group.com | Coordination
| NTT DATA | Thomas Geiger | thomas.geiger@nttdata.com |
| Noumena Digital | [To be added] | [To be added] |

### Availability

[Add availability during the event, for example agenda if in person, or email/contact details if remote support is available throughout the weekend.]

## Prize

The winning team members will each receive:

[Describe the prize, for example an opportunity to present the solution to management.]
