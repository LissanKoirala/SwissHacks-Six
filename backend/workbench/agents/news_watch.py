"""News / risk watch (the Front Door's second, autonomous door).

When a new risk or piece of news is relevant to a client, assess the implication and — ONLY if
it genuinely warrants RM attention — open a task on that client's board. This is deliberately
SELECTIVE: the matcher already finds every shared-topic hit, but most are noise. We promote a
match to a task only when it clears a materiality bar, so the RM sees signal, not spam (§2: the
agent proposes; nothing reaches the client without the RM).

A match becomes a task when:
  • it is a CONFLICT on a position the client actually HOLDS                (always — direct risk)
  • it is a CONFLICT with strong sentiment (|score| ≥ 0.5)                 (a real threat even if
    not yet held — e.g. a CIO push toward a name the client avoids)
  • it is an OPPORTUNITY with strong sentiment (|score| ≥ 0.55) on a name  (a values-aligned move
    the client is exposed/aligned to                                         worth surfacing)
Everything else (neutral, weak, informational) stays out of the board.

Deterministic and free — reuses the no-LLM set-intersection matcher (§9). Idempotent via a
per-(client, news) dedup key, so re-scanning never duplicates a task.
"""
from __future__ import annotations

from ..graph.store import World
from ..models import Match
from ..topics import topic_label
from .matcher import match_client

_CONFLICT_SENTIMENT_BAR = 0.5
_OPPORTUNITY_SENTIMENT_BAR = 0.55


def _is_material(m: Match) -> bool:
    score = abs(m.news.sentiment.score)
    if m.polarity == "conflict":
        if m.affected_holding is not None:
            return True
        return score >= _CONFLICT_SENTIMENT_BAR
    if m.polarity == "opportunity":
        # Only surface strong opportunities that touch a held name (avoid generic good-news spam).
        return m.affected_holding is not None and score >= _OPPORTUNITY_SENTIMENT_BAR
    return False


def _priority(m: Match) -> str:
    if m.polarity == "conflict" and m.affected_holding is not None:
        return "high"
    if m.polarity == "conflict":
        return "high" if abs(m.news.sentiment.score) >= 0.7 else "medium"
    return "medium"


def _title(m: Match) -> str:
    labels = ", ".join(sorted({topic_label(t.topic) for t in m.shared_topics})) or "a key theme"
    issuer = m.news.issuer_name
    if m.polarity == "conflict" and m.affected_holding is not None:
        return f"Risk review: {m.affected_holding.issuer} conflicts on {labels}"
    if m.polarity == "conflict":
        return f"Risk watch: market pressure on {labels}"
    return f"Opportunity: {issuer or 'a held name'} aligned on {labels}"


def _distinct(matches: list[Match]) -> list[Match]:
    """Collapse several signals about the SAME held name / theme into one (so a holding hit by a
    news item AND an ESG flag AND an analyst note becomes a single board task, not three)."""
    seen: set = set()
    out: list[Match] = []
    for m in matches:
        if m.affected_holding:
            key = ("holding", m.affected_holding.isin)
        else:
            topic = m.shared_topics[0].topic if m.shared_topics else m.news.id
            key = ("theme", m.polarity, topic)
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out


def scan(world: World) -> list[dict]:
    """Walk every client's matches and return the material ones as proposed task drafts.
    Caller (the task board) applies + dedups them."""
    drafts: list[dict] = []
    for cid in world.clients:
        for m in _distinct(match_client(world, cid)):
            if not _is_material(m):
                continue
            # An investment-implication task: the executor will run the advisory engine on this
            # exact match. A conflict that needs restructuring is inherently complex.
            kind = "investment_review"
            drafts.append({
                "client_id": cid,
                "title": _title(m),
                "detail": m.headline,
                "kind": kind,
                "priority": _priority(m),
                "source": "news",
                "dedup_key": f"news:{cid}:{m.news.id}",
                "origin": m.news.provenance,
                "match_id": m.id,
                "news_id": m.news.id,
            })
    return drafts
