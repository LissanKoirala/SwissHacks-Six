"""Email triage (the Front Door's brain). Two deterministic jobs, both offline-first:

1. ROUTE an inbound email to a client (by explicit hint, then sender address, then name match).
2. EXTRACT the actionable task(s) it implies — kind, title, priority, topics — so the board fills
   itself. An LLM (Phoeniqs) polishes the title/summary when USE_LIVE=1, but the classification
   and routing stay deterministic and rule-bound (token discipline, §9; advisory only, §2).

No mutation here — triage only proposes Task drafts. The task board store applies them.
"""
from __future__ import annotations

from typing import Optional

from ..graph.store import World
from ..models import EmailMessage
from ..topics import classify_text, topic_label
from .llm import chat_json

# --- routing ---------------------------------------------------------------

def _surnames(world: World) -> dict[str, str]:
    """client_id -> lowercase surname, for name-based routing of live mail."""
    out = {}
    for cid, meta in world.clients.items():
        name = (meta.get("name") or "").strip()
        if name:
            out[cid] = name.split()[-1].lower()
    return out


def route_email(world: World, msg: EmailMessage) -> Optional[str]:
    """Resolve which client an email is about. Returns a client_id or None (unrouted)."""
    if msg.client_id and msg.client_id in world.clients:
        return msg.client_id
    hay = f"{msg.from_name} {msg.from_email} {msg.subject}".lower()
    # surname match anywhere in sender/subject is a strong, cheap signal
    for cid, surname in _surnames(world).items():
        if surname and surname in hay:
            return cid
    return None


# --- intent / kind classification ------------------------------------------
# First match wins, in priority order. Each cue set maps to how the agent will ATTEMPT the task.

# NB: kept specific on purpose — bare "invest"/"research" trip on "investing"/"research funding"
# in ordinary prose, so we match action phrases, not topic words.
_INVEST_CUES = [
    "sell", "buy ", "switch", "swap", "move out", "move me out", "get me out", "divest",
    "exit", "increase", "reduce", "rebalance", "reallocate", "my position", "invest in",
    "overweight", "underweight", "substitution", "replacement", "make a trade", "out of it",
]
# Invest cues are ignored when negated ("please don't move me into…") — a reassurance ask,
# not a trade request.
_INVEST_NEGATORS = ["don't", "do not", "dont", "no need", "without", "rather not", "stay out"]
_RESEARCH_CUES = [
    "deep-dive", "deep dive", "analysis of my", "full analysis", "research deep",
    "concentration", "screen", "vs peers", "against peers", "across all", "ranked list",
]
_SCHEDULE_CUES = [
    "schedule", "book a call", "book a meeting", "set up a call", "catch up", "catch-up",
    "quarterly review", "meeting", "calendar", "availability",
]
_DOCUMENT_CUES = [
    "statement", "report", "summary", "send me the", "documentation", "paperwork", "factsheet",
]
_REPLY_CUES = [
    "what does it mean", "can you", "could you", "could someone", "please", "let me know",
    "question", "reassure", "explain", "your thoughts", "advise", "get back to me",
    "introductory", "interested in",
]

_PRIORITY_HIGH = [
    "urgent", "asap", "immediately", "concerned", "worried", "won't carry", "wont carry",
    "reputational", "can't be invested", "cant be invested", "today",
]


def _has_unnegated_invest(low: str) -> bool:
    """True if an invest cue appears AND is not clearly negated by nearby 'don't/without/…'."""
    negated = any(n in low for n in _INVEST_NEGATORS)
    for cue in _INVEST_CUES:
        idx = low.find(cue)
        if idx < 0:
            continue
        if not negated:
            return True
        # cue present but the message is framed as a negation → only count it if the cue clearly
        # sits before any negator (a real ask followed by an aside), else treat as reassurance.
        first_neg = min((low.find(n) for n in _INVEST_NEGATORS if low.find(n) >= 0), default=-1)
        if first_neg < 0 or idx < first_neg:
            return True
    return False


def _kind(low: str) -> str:
    # Research is checked before investment because a "deep-dive analysis" email also trips
    # invest cues, but is genuinely the bigger (complex) piece of work.
    if any(c in low for c in _RESEARCH_CUES):
        return "research"
    if _has_unnegated_invest(low):
        return "investment_review"
    if any(c in low for c in _SCHEDULE_CUES):
        return "schedule"
    if any(c in low for c in _DOCUMENT_CUES):
        return "document"
    if any(c in low for c in _REPLY_CUES):
        return "email_reply"
    return "general"


def _priority(low: str, kind: str, has_holding_topic: bool) -> str:
    if any(c in low for c in _PRIORITY_HIGH):
        return "high"
    if kind in ("investment_review", "research") and has_holding_topic:
        return "high"
    if kind in ("investment_review", "research"):
        return "medium"
    if kind == "email_reply":
        return "medium"
    return "low"


_KIND_VERB = {
    "email_reply": "Draft reply",
    "investment_review": "Review & propose",
    "research": "Research deep-dive",
    "schedule": "Schedule",
    "document": "Prepare document",
    "general": "Follow up",
}


def _deterministic_title(msg: EmailMessage, kind: str) -> str:
    subject = (msg.subject or "").strip()
    # Strip a leading reply/forward marker or a word the verb already says, so we don't double up.
    for lead in ("re:", "fw:", "fwd:", "deep-dive:", "deep dive:"):
        if subject.lower().startswith(lead):
            subject = subject[len(lead):].strip()
    verb = _KIND_VERB.get(kind, "Follow up")
    if subject:
        s = subject if len(subject) <= 70 else subject[:67] + "…"
        return f"{verb}: {s}"
    return f"{verb} on {msg.from_name or 'client'} email"


def extract_tasks(world: World, msg: EmailMessage, *, use_llm: bool = True) -> list[dict]:
    """Return a list of proposed task drafts (dicts) from one email. Usually one; a clearly
    multi-ask email may yield two. Deterministic; LLM only refines the wording."""
    low = f"{msg.subject}\n{msg.body}".lower()
    kind = _kind(low)
    topics = classify_text(f"{msg.subject} {msg.body}")
    labels = [topic_label(t) for t in topics]

    # Does the email touch a topic the client is actually exposed to via a holding/interest?
    cid = msg.client_id
    has_holding_topic = bool(cid and (set(topics) & world.client_topics(cid)))
    priority = _priority(low, kind, has_holding_topic)

    title = _deterministic_title(msg, kind)
    detail_bits = []
    if msg.from_name:
        detail_bits.append(f"From {msg.from_name}.")
    if labels:
        detail_bits.append("Topics: " + ", ".join(labels) + ".")
    # First two non-empty lines of the body as the gist.
    gist = " ".join(l.strip() for l in (msg.body or "").splitlines() if l.strip())[:300]
    if gist:
        detail_bits.append(gist)
    detail = " ".join(detail_bits)

    # Optional LLM refinement of the human-facing title (cheap, single call, cached upstream).
    if use_llm:
        refined = _llm_title(msg, kind)
        if refined:
            title = refined

    return [{
        "title": title,
        "detail": detail,
        "kind": kind,
        "priority": priority,
        "topics": topics,
    }]


def _llm_title(msg: EmailMessage, kind: str) -> Optional[str]:
    data = chat_json(
        system=(
            "You are a private-bank relationship manager's assistant. Read a client email and "
            "produce a single crisp action-oriented task title (max 12 words) for the RM's board. "
            "No client name in the title."
        ),
        user=f"Email subject: {msg.subject}\n\nEmail body:\n{msg.body}\n\nIntent: {kind}",
        max_tokens=60,
    )
    if isinstance(data, dict):
        for k in ("title", "task", "action"):
            v = data.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()[:90]
    return None
