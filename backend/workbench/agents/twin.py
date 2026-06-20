"""Client Digital Twin — a pre-mortem on the current proposal (CLAUDE.md §1/§2).

Before the RM acts, the twin predicts how *this* client is likely to react, grounded
in their weighted interest edges and profile facets. Every driver cites the log line
that justifies it (the explanation IS a provenance chain). Deterministic core — the
LLM only polishes the phrasing, lazily — so it works offline and stays cheap (§9).

It is the deep, conversational face of the worldview engine: it reuses the same insights
(relevance/lens/reaction/life-events) the RM already sees, so the read is consistent — a
recent life event becomes a framing driver, and the engine's grounded reaction is the
offline framing fallback.

Advisory only: the twin reasons about the client to help the RM prepare. It never
contacts the client and never places a trade.
"""
from __future__ import annotations

from typing import Optional

import re

from ..graph.store import World
from ..models import (
    ClientTwin,
    Provenance,
    StrategyProposal,
    TwinAskAnswer,
    TwinDriver,
    TwinFormatResult,
)
from ..topics import topic_label
from .advisory import TOPIC_PREFERENCES
from .llm import chat, chat_json, llm_available
from .orchestrator import get_insights
from .risk_timeline import build_risk_timeline
from .worldview import detect_life_events

# Contribution multipliers — a buy *into* an avoided value bites harder than the
# reassurance of divesting it (loss aversion), so objections dominate when present.
_OBJECT_MULT = 1.6
_ALIGN_MULT = 1.0
_MATCH_MULT = 0.8       # value alignment inferred from a match (no concrete swap) — slightly softer
_RISK_MISMATCH = -0.8
_RISK_REASSURE = 0.4

# Volatility deltas (decimal, annualised) that count as "riskier" / "similar".
_VOL_RISKIER = 0.03
_VOL_SIMILAR = 0.02

# Stance thresholds on the aggregate score.
_OBJECT_AT = -1.0
_RECEPTIVE_AT = 0.8


def _proposals(insights) -> list[StrategyProposal]:
    out: list[StrategyProposal] = []
    if insights.strategy_proposal:
        out.append(insights.strategy_proposal)
    out.extend(insights.additional_proposals)
    return out


def _driver(kind: str, stance: str, label: str, detail: str, weight: float,
            contribution: float, prov: Provenance) -> TwinDriver:
    return TwinDriver(
        label=label, kind=kind, stance=stance, weight=round(weight, 2),
        contribution=round(contribution, 3), detail=detail, provenance=prov,
    )


def _value_drivers(world: World, client_id: str, proposals: list[StrategyProposal]) -> list[TwinDriver]:
    """Match each swap's bought/sold value-tags against the client's weighted edges."""
    edges = world.interest_by_client.get(client_id, [])
    found: list[TwinDriver] = []
    for prop in proposals:
        for swap in prop.swaps:
            sub = swap.substitution
            buy_tags = set(sub.value_tags_buy) if sub else set()
            sell_tags = set(sub.value_tags_sell) if sub else set()
            prov = swap.provenance[0] if swap.provenance else (
                prop.provenance[0] if prop.provenance else None
            )
            if prov is None:
                continue
            for edge in edges:
                prefs = TOPIC_PREFERENCES.get(edge.topic)
                if not prefs:
                    continue
                desired, avoid, _ = (set(prefs[0]), set(prefs[1]), prefs[2])
                label = topic_label(edge.topic)
                w = edge.weight
                if edge.polarity == "conflict":
                    hit = buy_tags & avoid
                    if hit:
                        found.append(_driver(
                            "value-conflict", "opposing", f"Avoids {label}",
                            f"The swap buys into {', '.join(sorted(hit))}, which cuts against "
                            f"their stance on {label}.",
                            w, -_OBJECT_MULT * w, edge.provenance,
                        ))
                        continue
                    hit = sell_tags & avoid
                    if hit:
                        found.append(_driver(
                            "value-aligned", "supportive", f"Honours stance on {label}",
                            f"The swap divests {', '.join(sorted(hit))}, honouring their stance "
                            f"on {label}.",
                            w, _ALIGN_MULT * w, edge.provenance,
                        ))
                elif edge.polarity == "opportunity":
                    hit = buy_tags & desired
                    if hit:
                        found.append(_driver(
                            "value-aligned", "supportive", f"Backs {label}",
                            f"The swap backs {', '.join(sorted(hit))}, which they champion under "
                            f"{label}.",
                            w, _ALIGN_MULT * w, edge.provenance,
                        ))
    return found


def _match_drivers(world: World, client_id: str, insights) -> list[TwinDriver]:
    """Reason over the matches themselves, so a client's values register even when the
    proposal is a good-news briefing or a respectful swap with no value-tag delta."""
    edges = world.interest_by_client.get(client_id, [])
    by_topic: dict[str, list] = {}
    for e in edges:
        by_topic.setdefault(e.topic, []).append(e)
    out: list[TwinDriver] = []
    for m in insights.matches:
        for tm in m.shared_topics:
            cands = [e for e in by_topic.get(tm.topic, []) if e.polarity == m.polarity]
            if not cands:
                continue
            edge = max(cands, key=lambda e: e.weight)
            label = topic_label(tm.topic)
            prov = tm.client_provenance or edge.provenance
            if m.polarity == "opportunity":
                out.append(_driver(
                    "value-aligned", "supportive", f"Backs {label}",
                    f"This responds to news on {label}, which they champion.",
                    edge.weight, _MATCH_MULT * edge.weight, prov,
                ))
            elif m.polarity == "conflict":
                out.append(_driver(
                    "value-aligned", "supportive", f"Shares the concern on {label}",
                    f"This addresses a {label} concern they hold strongly — they'll feel heard.",
                    edge.weight, _MATCH_MULT * edge.weight, prov,
                ))
    return out


def _risk_drivers(world: World, client_id: str, proposals: list[StrategyProposal],
                  mandate_fit: Optional[str]) -> list[TwinDriver]:
    """Read each swap's volatility delta against where the client sits vs their mandate."""
    cautious = mandate_fit == "cautious-drift"
    out: list[TwinDriver] = []
    for prop in proposals:
        for swap in prop.swaps:
            sub = swap.substitution
            if not sub or sub.vol_delta is None or not swap.provenance:
                continue
            prov = swap.provenance[0]
            if sub.vol_delta >= _VOL_RISKIER and cautious:
                out.append(_driver(
                    "risk-mismatch", "opposing", "May feel too aggressive",
                    f"The replacement is more volatile (Δσ {sub.vol_delta:+.0%}) while they have "
                    "drifted more defensive than their mandate.",
                    1.0, _RISK_MISMATCH, prov,
                ))
            elif abs(sub.vol_delta) <= _VOL_SIMILAR:
                out.append(_driver(
                    "risk-reassurance", "supportive", "Comparable risk",
                    f"The replacement carries similar risk (Δσ {sub.vol_delta:+.0%}), so it "
                    "shouldn't unsettle them.",
                    1.0, _RISK_REASSURE, prov,
                ))
    return out


def _framing_driver(world: World, client_id: str) -> Optional[TwinDriver]:
    """The client's heaviest personality/values facet — sets the tone, doesn't score."""
    profile = world.profiles.get(client_id)
    if not profile:
        return None
    stmts = (profile.facets.get("personality") or []) + (profile.facets.get("interests") or [])
    if not stmts:
        return None
    top = max(stmts, key=lambda s: getattr(s, "weight", 1.0))
    return _driver(
        "framing", "neutral", "Communication style",
        f"Frame it around: “{top.text}”", getattr(top, "weight", 1.0), 0.0, top.provenance,
    )


def _life_event_driver(insights) -> Optional[TwinDriver]:
    """A recent life event the worldview engine surfaced (§5) becomes a sensitivity-framing
    driver — neutral (doesn't move the stance), but it tells the RM what to lead with."""
    events = getattr(insights, "life_events", None) or []
    if not events:
        return None
    e = events[0]
    return _driver(
        "life-event", "neutral", e.label,
        f"{e.implication} Lead with sensitivity to this.", 1.0, 0.0, e.provenance,
    )


def _dedupe(drivers: list[TwinDriver]) -> list[TwinDriver]:
    """Collapse to one driver per cited fact (provenance source_id) so the same log line
    can't be counted twice via both a swap and a match; keep the strongest. Order by
    |contribution| desc."""
    best: dict[str, TwinDriver] = {}
    for d in drivers:
        key = d.provenance.source_id
        if key not in best or abs(d.contribution) > abs(best[key].contribution):
            best[key] = d
    return sorted(best.values(), key=lambda d: -abs(d.contribution))


def _stance(score: float) -> str:
    if score <= _OBJECT_AT:
        return "likely_to_object"
    if score >= _RECEPTIVE_AT:
        return "receptive"
    return "mixed"


def _confidence(score: float, n: int) -> str:
    mag = abs(score)
    if n == 0:
        return "low"
    if mag >= 2.0:
        return "high"
    if mag >= 1.0:
        return "medium"
    return "low"


_STANCE_LEAD = {
    "receptive": "Likely to welcome this",
    "mixed": "Mixed — could go either way",
    "likely_to_object": "Likely to push back",
}


def _summary(name: str, stance: str, scored: list[TwinDriver]) -> str:
    lead = _STANCE_LEAD[stance]
    top = next((d for d in scored if d.stance != "neutral"), None)
    if top is None:
        return f"{lead}. No strong value or risk signals on record for {name}."
    return f"{lead}: {top.detail}"


def _polish(name: str, stance: str, scored: list[TwinDriver]) -> Optional[dict]:
    """Optional LLM phrasing of the objection + a framing line. Cheap, lazy, cited inputs."""
    if not llm_available() or not scored:
        return None
    bullets = "\n".join(f"- ({d.stance}) {d.detail}" for d in scored[:5])
    system = (
        "You coach a relationship manager before a client conversation. From the signals, "
        "write how the client might react and how to frame the proposal to land well. Never "
        "address the client; never give the client financial advice. Be concise."
    )
    user = (
        f"Client: {name}. Predicted stance: {stance.replace('_', ' ')}.\n"
        f"Signals (each already evidenced):\n{bullets}\n\n"
        'Return JSON {"anticipated_objection":"<one sentence in the client\'s voice, or empty '
        'if receptive>","suggested_framing":"<one or two sentences of advice for the RM>"}.'
    )
    return chat_json(system, user, max_tokens=220)


def build_twin(world: World, client_id: str, *, refresh: bool = False) -> ClientTwin:
    """Predict the client's reaction to the current proposal. Deterministic, fully cited;
    LLM only polishes the phrasing."""
    insights = get_insights(world, client_id, refresh=refresh)
    name = insights.client.name
    proposals = _proposals(insights)

    timeline = build_risk_timeline(world, client_id)
    mandate_fit = (timeline.get("current") or {}).get("mandate_fit")

    # Value alignment (dedup by cited fact), then risk fit on top — both signed + cited.
    value = _dedupe(_value_drivers(world, client_id, proposals)
                    + _match_drivers(world, client_id, insights))
    scored = value + _risk_drivers(world, client_id, proposals, mandate_fit)
    scored.sort(key=lambda d: -abs(d.contribution))
    score = sum(d.contribution for d in scored)
    stance = _stance(score)

    drivers = list(scored)
    framing = _framing_driver(world, client_id)
    if framing is not None:
        drivers.append(framing)
    # A recent life event (worldview §5) adds a neutral sensitivity-framing driver — but never
    # twice for the same cited log line.
    life = _life_event_driver(insights)
    if life is not None and all(d.provenance.source_id != life.provenance.source_id for d in drivers):
        drivers.append(life)

    summary = _summary(name, stance, scored)
    anticipated_objection: Optional[str] = None
    suggested_framing: Optional[str] = None
    llm_used = False
    polished = _polish(name, stance, scored)
    if polished:
        anticipated_objection = (polished.get("anticipated_objection") or "").strip() or None
        suggested_framing = (polished.get("suggested_framing") or "").strip() or None
        llm_used = True
    # Offline framing fallback: reuse the worldview engine's grounded reaction rebuttal, then the
    # heaviest-facet framing — so the twin always tells the RM how to land it, even with no LLM.
    if suggested_framing is None:
        reaction = getattr(insights, "reaction", None)
        if reaction is not None and reaction.suggested_rebuttal:
            suggested_framing = reaction.suggested_rebuttal
        elif framing is not None:
            suggested_framing = framing.detail

    provenance = list({(d.provenance.source_type, d.provenance.source_id): d.provenance
                       for d in drivers}.values())

    return ClientTwin(
        client_id=client_id,
        client_name=name,
        stance=stance,
        score=round(score, 3),
        confidence=_confidence(score, len(scored)),
        summary=summary,
        anticipated_objection=anticipated_objection,
        suggested_framing=suggested_framing,
        drivers=drivers,
        llm_used=llm_used,
        provenance=provenance,
    )


# --- Ask the twin (free-form Q&A) + autoformat (channel drafts) --------------
# The RM asks the twin anything about the client; the answer predicts how the
# client would think/respond, grounded in cited profile facts. Then the RM can
# turn any drafted content into a ready-to-review email / text / talking points.
# Advisory only: the twin speaks to the RM about the client and never sends.

_STOP = {
    "the", "a", "an", "to", "of", "and", "or", "is", "are", "be", "would", "will",
    "do", "does", "did", "how", "what", "why", "should", "could", "for", "on", "in",
    "with", "about", "his", "her", "their", "they", "he", "she", "it", "this", "that",
    "if", "we", "i", "you", "client", "feel", "react", "think",
}


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) > 2 and t not in _STOP}


def _profile_facts(world: World, client_id: str) -> list[dict]:
    """All citable profile facts: weighted interest edges + facet statements."""
    facts: list[dict] = []
    for e in world.interest_by_client.get(client_id, []):
        label = topic_label(e.topic)
        facts.append({
            "label": label,
            "detail": f"{e.polarity} stance on {label}",
            "weight": e.weight,
            "prov": e.provenance,
        })
    profile = world.profiles.get(client_id)
    if profile:
        for facet_name, stmts in profile.facets.items():
            for s in stmts or []:
                facts.append({
                    "label": facet_name.title(),
                    "detail": s.text,
                    "weight": getattr(s, "weight", 1.0),
                    "prov": s.provenance,
                })
    return facts


def _rank_facts(facts: list[dict], question: str, k: int = 5) -> list[dict]:
    """Most relevant facts to the question (keyword overlap, then importance). Always
    returns the heaviest facts as a floor so the answer is grounded even on a miss."""
    q = _tokens(question)

    def overlap(f: dict) -> int:
        return len(q & _tokens(f["label"] + " " + f["detail"]))

    ranked = sorted(facts, key=lambda f: (overlap(f), f["weight"]), reverse=True)
    hit = [f for f in ranked if overlap(f) > 0]
    return (hit or ranked)[:k]


def _client_name(world: World, client_id: str) -> str:
    meta = world.clients.get(client_id, {})
    if meta.get("name"):
        return meta["name"]
    prof = world.profiles.get(client_id)
    return prof.name if prof else client_id


_ASK_SYSTEM = (
    "You simulate a private-bank client's 'digital twin' to help their relationship "
    "manager (RM) prepare. Answer the RM's question by predicting how THIS client would "
    "think or respond, grounded ONLY in the supplied profile facts. Speak to the RM about "
    "the client in the third person. Never give the client financial advice and never "
    "invent facts. Keep it to 2-4 sentences."
)


def ask_twin(world: World, client_id: str, question: str) -> TwinAskAnswer:
    """Answer a free-form RM question as the client's twin, grounded in cited facts."""
    name = _client_name(world, client_id)
    question = (question or "").strip()
    chosen = _rank_facts(_profile_facts(world, client_id), question) if question else []
    citations = list(
        {f["prov"].source_id: f["prov"] for f in chosen}.values()
    )

    answer = ""
    confidence = "low"
    llm_used = False
    if question and llm_available() and chosen:
        facts_str = "\n".join(f"{i + 1}. {f['label']}: {f['detail']}" for i, f in enumerate(chosen))
        txt = chat(
            _ASK_SYSTEM,
            f"Client: {name}.\nProfile facts:\n{facts_str}\n\nRM question: {question}",
            max_tokens=260,
        )
        if txt:
            answer = txt.strip()
            confidence = "medium"
            llm_used = True

    if not answer:
        if not question:
            answer = "Ask a question about the client to get a predicted read."
        elif chosen:
            lead = chosen[0]
            answer = (
                f"Based on {name}'s record — {lead['detail'].lower()} — they would likely weigh "
                f"this through that lens. Confirm with them directly before acting."
            )
        else:
            answer = f"There isn't enough on {name}'s record to predict this with confidence yet."

    return TwinAskAnswer(
        client_id=client_id,
        question=question,
        answer=answer,
        confidence=confidence,
        citations=citations,
        llm_used=llm_used,
    )


# --- autoformat -------------------------------------------------------------

_CHANNELS = {"email", "sms", "whatsapp", "talking_points", "call_script"}

_CHANNEL_BRIEF = {
    "email": "a concise, warm professional email from the RM to the client (subject line + body, "
             "ready to review and send)",
    "sms": "a short SMS from the RM to the client (under 320 characters, no subject line)",
    "whatsapp": "a friendly but professional WhatsApp message from the RM to the client (short, "
                "light formatting)",
    "talking_points": "a tight bullet list of talking points for the RM to use in conversation",
    "call_script": "a brief call script for the RM: a natural opener, the key points, and a close",
}


def _format_system(channel: str, tone: str | None) -> str:
    brief = _CHANNEL_BRIEF.get(channel, _CHANNEL_BRIEF["email"])
    extra = f" Tone: {tone}." if tone else ""
    return (
        f"You are drafting {brief} for a relationship manager to review. Use UK spelling. "
        "Keep the client's documented preferences in mind. Output only the drafted message — "
        f"no preamble, no notes.{extra} The RM reviews and sends; never claim it has been sent."
    )


def _fallback_format(channel: str, content: str, name: str) -> str:
    """Deterministic, offline draft when the LLM is unavailable."""
    body = content.strip()
    first = (name or "there").split(" ")[0]
    if channel == "sms":
        return body[:320]
    if channel == "whatsapp":
        return f"Hi {first}, {body}"
    if channel == "talking_points":
        lines = [s.strip() for s in re.split(r"(?<=[.!?])\s+", body) if s.strip()]
        return "\n".join(f"• {ln}" for ln in lines) or f"• {body}"
    if channel == "call_script":
        return (
            f"Opener: Hi {first}, thanks for taking a moment.\n"
            f"Key point: {body}\n"
            "Close: Happy to talk it through whenever suits — no rush."
        )
    # email
    return (
        f"Subject: A quick note\n\nDear {first},\n\n{body}\n\n"
        "Kind regards,\nYour relationship manager"
    )


def format_message(world: World, client_id: str, content: str, channel: str,
                   tone: str | None = None) -> TwinFormatResult:
    """Turn drafted content into a ready-to-review message for a channel. Never sends."""
    channel = channel if channel in _CHANNELS else "email"
    content = (content or "").strip()
    if content and llm_available():
        txt = chat(_format_system(channel, tone), content, max_tokens=500)
        if txt:
            return TwinFormatResult(channel=channel, formatted=txt.strip(), llm_used=True)
    name = _client_name(world, client_id)
    return TwinFormatResult(
        channel=channel,
        formatted=_fallback_format(channel, content, name),
        llm_used=False,
    )
