"""Client Digital Twin — a pre-mortem on the current proposal (CLAUDE.md §1/§2).

Before the RM acts, the twin predicts how *this* client is likely to react, grounded
in their weighted interest edges and profile facets. Every driver cites the log line
that justifies it (the explanation IS a provenance chain). Deterministic core — the
LLM only polishes the phrasing, lazily — so it works offline and stays cheap (§9).

Advisory only: the twin reasons about the client to help the RM prepare. It never
contacts the client and never places a trade.
"""
from __future__ import annotations

from typing import Optional

from ..graph.store import World
from ..models import ClientTwin, Provenance, StrategyProposal, TwinDriver
from ..topics import topic_label
from .advisory import TOPIC_PREFERENCES
from .llm import chat_json, llm_available
from .orchestrator import get_insights
from .risk_timeline import build_risk_timeline

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

    summary = _summary(name, stance, scored)
    anticipated_objection: Optional[str] = None
    suggested_framing: Optional[str] = None
    llm_used = False
    polished = _polish(name, stance, scored)
    if polished:
        anticipated_objection = (polished.get("anticipated_objection") or "").strip() or None
        suggested_framing = (polished.get("suggested_framing") or "").strip() or None
        llm_used = True
    if suggested_framing is None and framing is not None:
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
