"""Task executor — the agentic core of the Front Door.

Given a task, the agent ATTEMPTS it with the client's data at hand and parks a draft deliverable
for the RM to sign off (Golden rule §2: advisory only — it never sends an email or places a trade;
it produces a draft the RM approves). Outcomes:

  • a completable task  → the agent finishes a draft and moves it to `review` (needs sign-off)
  • a COMPLEX task      → the agent does the groundwork it can, then leaves it in `started` for the
                          RM to carry forward (e.g. a multi-name research deep-dive, or a conflict
                          with no clean in-universe replacement)

Reuses the existing deterministic engines — matcher + advisory (build_strategy / build_dialogue) —
so investment work stays inside the rails (CIO-approved, same-sector, ±2pp drift). The Phoeniqs
LLM only polishes prose when USE_LIVE=1; everything works offline.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..graph.store import World
from ..models import (
    DraftEmail,
    Match,
    Provenance,
    Task,
    TaskArtifact,
)
from ..topics import topic_label
from .advisory import build_dialogue, build_strategy
from .llm import chat
from .matcher import match_client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _client(world: World, task: Task) -> dict:
    return world.clients.get(task.client_id or "", {})


def _first_name(name: str) -> str:
    return (name or "").strip().split(" ")[0] or "there"


def _log(task: Task, msg: str) -> None:
    task.activity.append(msg)


# --- match resolution -------------------------------------------------------

def _relevant_match(world: World, task: Task) -> Match | None:
    """The Match this task should reason over. News tasks point at one specific item; email tasks
    take the client's most salient current match."""
    if not task.client_id:
        return None
    matches = match_client(world, task.client_id)
    if not matches:
        return None
    if task.dedup_key and task.dedup_key.startswith("news:"):
        news_id = task.dedup_key.split(":", 2)[-1]
        for m in matches:
            if m.news.id == news_id:
                return m
    # email-driven: prefer a match whose topic/issuer is named in the task text, else top salience
    hay = f"{task.title} {task.detail}".lower()
    for m in matches:
        issuer = (m.news.issuer_name or "").lower()
        if issuer and issuer.split()[0] in hay:
            return m
        if any(topic_label(t.topic).lower() in hay for t in m.shared_topics):
            return m
    return matches[0]


# --- per-kind executors -----------------------------------------------------

def _exec_investment(world: World, task: Task) -> TaskArtifact:
    cid = task.client_id
    m = _relevant_match(world, task)
    if m is None:
        task.complex = True
        _log(task, "No active signal/holding matched this request — needs RM scoping.")
        return TaskArtifact(
            kind="note", summary="No matched signal — RM to scope manually",
            body="The agent found no current news/holding signal to act on for this request. "
                 "Recommend the RM clarify the ask with the client before proceeding.",
            confidence="low",
        )

    _log(task, f"Matched signal '{m.news.title}' ({m.polarity}).")
    strategy = build_strategy(world, cid, m)
    dialogue, llm_used = build_dialogue(world, cid, m)
    _log(task, f"Ran advisory engine — {len(strategy.swaps)} action(s) proposed"
               f"{' (LLM-polished dialogue)' if llm_used else ''}.")

    actions = [s.action for s in strategy.swaps]
    # Complex = needs RM judgement: a divestment with no clean replacement, or multiple actions.
    has_divest_only = bool(strategy.swaps) and all(a == "DIVEST" for a in actions)
    multi = len(strategy.swaps) > 1
    complex_ = has_divest_only or multi or not strategy.swaps
    task.complex = complex_

    lines = [f"**{strategy.headline}**", ""]
    for s in strategy.swaps:
        if s.action == "SWAP":
            lines.append(f"- **SWAP** {s.sell_issuer} → {s.buy_issuer} "
                         f"(CHF {s.amount_chf:,.0f}, {'same sector' if s.same_sector else 'sector change'}, "
                         f"{'drift-safe' if s.drift_safe else 'check drift'})")
        elif s.action in ("INCREASE", "REDUCE"):
            lines.append(f"- **{s.action}** {s.buy_issuer or s.sell_issuer} (CHF {s.amount_chf:,.0f})")
        elif s.action == "DIVEST":
            lines.append(f"- **DIVEST** {s.sell_issuer} — no clean same-sector replacement; RM to advise")
        else:
            lines.append(f"- **{s.action}** {s.buy_issuer or s.sell_issuer or ''}".rstrip())
        lines.append(f"  - {s.rationale}")
    if strategy.constraints_checked:
        lines += ["", "Constraints checked:"] + [f"- {c}" for c in strategy.constraints_checked]

    summary = (f"Proposed {', '.join(actions)} within mandate"
               if strategy.swaps else "Reviewed — flagged for RM, no in-rail action")
    return TaskArtifact(
        kind="strategy",
        summary=summary,
        body="\n".join(lines),
        strategy_proposal=strategy,
        dialogue=dialogue,
        confidence="high" if (strategy.swaps and not complex_) else "medium",
        llm_used=llm_used,
        provenance=strategy.provenance,
    )


def _exec_email_reply(world: World, task: Task) -> TaskArtifact:
    cid = task.client_id
    meta = _client(world, task)
    name = meta.get("name", "the client")
    style = meta.get("style", "")
    m = _relevant_match(world, task) if cid else None

    # Gather light context the reply can lean on.
    context_bits: list[str] = []
    prov: list[Provenance] = []
    if m is not None:
        context_bits.append(m.headline)
        prov += list(m.why)
        _log(task, f"Pulled context from signal '{m.news.title}'.")
    profile = world.profiles.get(cid or "")
    if profile and profile.headline:
        context_bits.append(profile.headline)

    body = _draft_reply_body(world, task, name, style, context_bits, m)
    subject = f"Re: {task.detail.split('.')[0][:60]}" if task.detail else f"Re: your note, {name}"
    # Reply is a completable deliverable → review.
    task.complex = False
    _log(task, "Drafted a reply for RM review (not sent — advisory only).")
    return TaskArtifact(
        kind="draft_email",
        summary="Drafted reply for RM review",
        body=body,
        draft_email=DraftEmail(to_name=name, subject=subject, body=body),
        confidence="medium",
        llm_used=bool(m and False),  # set true only if LLM polished; see below
        provenance=prov,
    )


def _draft_reply_body(world, task, name, style, context_bits, m) -> str:
    first = _first_name(name)
    # Deterministic, on-style draft.
    opener = f"Dear {first},\n\n"
    if m is not None and m.polarity == "conflict":
        core = ("Thank you for flagging this — you're right to raise it. I've reviewed the "
                "development against your portfolio and your stated priorities, and I share the "
                "concern. ")
    elif m is not None and m.polarity == "opportunity":
        core = ("Thank you for your note — I agree this is a genuinely positive development that "
                "fits what you care about. ")
    else:
        core = "Thank you for your note. "
    middle = ""
    if context_bits:
        middle = "In short: " + context_bits[0] + " "
    middle += ("I've prepared the detail and a recommended way forward for us to go through "
               "together — nothing will be actioned without your decision.")
    closer = ("\n\nShall I call you this week to walk through it?\n\nWith best regards,\n"
              "Your relationship manager")
    draft = opener + core + middle + closer

    # Optional LLM polish in the client's documented style (USE_LIVE=1 only).
    polished = chat(
        system=("You are a Swiss private-bank relationship manager. Write a warm, concise, "
                "compliant email reply (no financial advice to the client directly, advisory "
                f"framing only). Match this client's style: {style}"),
        user=(f"Client first name: {first}\nContext: {' '.join(context_bits)}\n"
              f"Their message gist: {task.detail}\n\nWrite the reply email body only."),
        max_tokens=320,
    )
    if polished and len(polished.strip()) > 40:
        task.activity.append("LLM polished the reply in the client's documented style.")
        return polished.strip()
    return draft


def _exec_research(world: World, task: Task) -> TaskArtifact:
    """Research is inherently a big, multi-step piece — the agent scaffolds what it can from the
    world data and LEAVES IT STARTED for the RM to carry forward."""
    cid = task.client_id
    task.complex = True
    holdings = world.holdings_for_client(cid) if cid else []
    deviations = world.cio_deviations(cid) if cid else []
    opp = []
    try:
        from .opportunities import build_opportunities
        opp = build_opportunities(world, cid) if cid else []
    except Exception:
        opp = []

    lines = ["**Research scaffold (agent-started — RM to complete):**", ""]
    lines.append(f"- Scope: {task.detail[:200]}")
    lines.append(f"- Holdings in scope: {len(holdings)} positions, "
                 f"total CHF {sum(h.current_chf for h in holdings):,.0f}.")
    if deviations:
        lines.append(f"- ⚠️ {len(deviations)} holding(s) deviate from the CIO list "
                     f"({', '.join(h.issuer for h in deviations[:4])}).")
    if opp:
        names = ", ".join(o.get("issuer", "") for o in opp[:4] if isinstance(o, dict))
        lines.append(f"- Candidate CIO-approved alternatives identified: {names}.")
    lines += ["", "Outstanding (needs RM/analyst):",
              "- Peer-relative concentration screen", "- Full ESG/governance pass across names",
              "- Ranked substitution shortlist with substitution metrics"]
    _log(task, "Assembled a research scaffold from portfolio + CIO data; left in Started for the RM.")
    prov = [h.provenance for h in (deviations or holdings)[:3] if h.provenance]
    return TaskArtifact(
        kind="research_note",
        summary="Started — scaffold ready, RM to complete the deep-dive",
        body="\n".join(lines),
        confidence="low",
        provenance=prov,
    )


def _exec_schedule(world: World, task: Task) -> TaskArtifact:
    meta = _client(world, task)
    name = meta.get("name", "the client")
    first = _first_name(name)
    body = (f"Dear {first},\n\nThank you — happy to set that up. I'll hold the slots you "
            "suggested and send a calendar invite to confirm, along with the documents you "
            "asked for ahead of time.\n\nWith best regards,\nYour relationship manager")
    task.complex = False
    _log(task, "Drafted a scheduling reply + flagged a calendar hold for RM confirmation.")
    return TaskArtifact(
        kind="draft_email", summary="Drafted scheduling reply (RM to confirm slot)",
        body=body, draft_email=DraftEmail(to_name=name, subject="Re: scheduling", body=body),
        confidence="high",
    )


def _exec_document(world: World, task: Task) -> TaskArtifact:
    cid = task.client_id
    holdings = world.holdings_for_client(cid) if cid else []
    total = sum(h.current_chf for h in holdings)
    mandate = world.mandates.get(world.portfolio_of(cid)) if cid else None
    lines = ["**Portfolio statement draft (auto-generated — RM to review):**", ""]
    lines.append(f"- Total portfolio value: CHF {total:,.0f}")
    if mandate:
        breaches = [t for t in mandate.targets if t.breach]
        lines.append(f"- Mandate: {mandate.name} — "
                     f"{len(breaches)} sleeve(s) breaching the ±2pp drift band.")
    top = sorted(holdings, key=lambda h: h.current_chf, reverse=True)[:5]
    if top:
        lines += ["", "Top holdings:"] + [f"- {h.issuer}: CHF {h.current_chf:,.0f}" for h in top]
    task.complex = False
    _log(task, "Generated a portfolio statement draft from the workbook valuation.")
    prov = [h.provenance for h in top[:3] if h.provenance]
    return TaskArtifact(
        kind="analysis", summary="Drafted portfolio statement for RM review",
        body="\n".join(lines), confidence="high", provenance=prov,
    )


def _exec_general(world: World, task: Task) -> TaskArtifact:
    task.complex = False
    _log(task, "Logged for RM follow-up — no automated action available.")
    return TaskArtifact(
        kind="note", summary="Flagged for RM follow-up",
        body=f"No automated path for this item. Suggested next step:\n\n> {task.detail or task.title}",
        confidence="low",
    )


_DISPATCH = {
    "investment_review": _exec_investment,
    "email_reply": _exec_email_reply,
    "research": _exec_research,
    "schedule": _exec_schedule,
    "document": _exec_document,
    "general": _exec_general,
}


def execute_task(world: World, task: Task) -> Task:
    """Attempt the task in place: set its artifact, complexity, status and activity trail.
    `complex` tasks land in `started`; completable tasks land in `review` (needs sign-off)."""
    _log(task, f"Agent picked up task ({task.kind}).")
    try:
        artifact = _DISPATCH.get(task.kind, _exec_general)(world, task)
    except Exception as e:  # never let one task crash the board
        task.complex = False
        artifact = TaskArtifact(
            kind="note", summary="Agent hit an error — RM to handle manually",
            body=f"Automated attempt failed: {e}", confidence="low",
        )
        _log(task, f"Execution error: {e}")
    task.artifact = artifact
    task.status = "started" if task.complex else "review"
    task.updated_at = _now()
    _log(task, "Parked in 'Started' for RM" if task.complex
              else "Draft ready — parked in 'Needs sign-off' for RM.")
    return task
