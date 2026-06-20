"""Decision Flow builder (PORT_CONTRACT §2).

Reshapes the orchestrator's insights into a six-layer, left→right decision DAG that explains
*why this call* — from the CRM note that established the client's stance, through the matched
news signal and the affected holding, to the CIO-approved swap the advisory agent proposed.

This module DERIVES NOTHING: strategy lives in `agents.advisory` (run via `get_insights`). Here
we only walk `matches[0]` + `strategy_proposal.swaps[0]`, carry the *real* provenance onto each
node, and wire the edges (CLAUDE.md §2: if you can't cite it, don't surface it)."""
from __future__ import annotations

from typing import Optional

from ..graph.store import World
from ..models import (
    DialogueSuggestion,  # noqa: F401  (kept for type parity with insights shape)
    Match,
    Provenance,
    StrategyProposal,
    SwapProposal,
    TopicMatch,
)
from ..topics import topic_label
from .orchestrator import get_insights

# The six ordered layers (left → right). Frozen here so the component's columns match (§2).
LAYERS: list[dict[str, str]] = [
    {"id": "notes", "label": "CRM notes"},
    {"id": "dna", "label": "Client DNA"},
    {"id": "signal", "label": "Market signal"},
    {"id": "holding", "label": "Affected holding"},
    {"id": "candidate", "label": "CIO candidate"},
    {"id": "action", "label": "Recommendation"},
]


def _prov_dump(p: Provenance) -> dict:
    return p.model_dump()


def _node(
    node_id: str,
    layer: str,
    title: str,
    subtitle: str,
    detail: str,
    provenance: list[Provenance],
    polarity: Optional[str] = None,
) -> dict:
    return {
        "id": node_id,
        "layer": layer,
        "title": title,
        "subtitle": subtitle,
        "detail": detail,
        "polarity": polarity,
        "provenance": [_prov_dump(p) for p in provenance],
    }


def _edge(edge_id: str, source: str, target: str, kind: str, label: str) -> dict:
    return {"id": edge_id, "source": source, "target": target, "kind": kind, "label": label}


def _empty_decision(world: World, client_id: str) -> dict:
    """A valid, empty-ish Decision when there are no active matches — the flow is real, the
    advisory verdict is 'nothing to action right now', stated plainly (PORT_CONTRACT §2)."""
    meta = world.clients.get(client_id, {})
    name = meta.get("name", client_id)
    return {
        "client_id": client_id,
        "client_name": name,
        "headline": (
            f"No active alert for {name}. Nothing in the current news set intersects this "
            f"client's documented stances, so there is no portfolio action to propose."
        ),
        "polarity": "neutral",
        "layers": list(LAYERS),
        "nodes": [],
        "edges": [],
        "recommendation": {
            "action": "NONE",
            "sell": None,
            "buy": None,
            "rationale": "Continue monitoring — surface a call only when a cited signal lands.",
            "constraints_checked": [],
        },
    }


def _notes_node(match: Match) -> tuple[dict, list[Provenance]]:
    """Layer 1 — the CRM log line(s) that established the client's stance on the shared topic."""
    topics: list[TopicMatch] = match.shared_topics
    primary = topics[0] if topics else None
    labels = ", ".join(dict.fromkeys(topic_label(t.topic) for t in topics)) or "this client"
    # carry every client-side citation so the side panel shows the full CRM evidence
    client_provs = [t.client_provenance for t in topics]
    excerpt = primary.client_provenance.excerpt if primary else ""
    node = _node(
        node_id="notes",
        layer="notes",
        title="What the client told us",
        subtitle=labels,
        detail=excerpt,
        provenance=client_provs,
    )
    return node, client_provs


def _dna_node(match: Match) -> dict:
    """Layer 2 — the distilled stance (the interest edge / topic the notes encode)."""
    topics = match.shared_topics
    labels = ", ".join(dict.fromkeys(topic_label(t.topic) for t in topics)) or "Documented stance"
    stance = "Avoid / penalise" if match.polarity == "conflict" else (
        "Reward / lean in" if match.polarity == "opportunity" else "Watch"
    )
    return _node(
        node_id="dna",
        layer="dna",
        title=labels,
        subtitle=f"Stance · {stance}",
        detail=(
            f"This is a load-bearing value for the client: their logged stance on {labels} is what "
            f"makes the signal actionable rather than noise."
        ),
        provenance=[t.client_provenance for t in topics],
        polarity=match.polarity,
    )


def _signal_node(match: Match) -> dict:
    """Layer 3 — the classified news item that matched the stance."""
    news = match.news
    sub = news.issuer_name or news.source
    sentiment = news.sentiment.label.title() if news.sentiment else ""
    detail = news.title
    return _node(
        node_id="signal",
        layer="signal",
        title=news.title,
        subtitle=f"{sub} · {sentiment}".strip(" ·"),
        detail=detail,
        provenance=[news.provenance],
        polarity=match.polarity,
    )


def _holding_node(match: Match) -> Optional[dict]:
    """Layer 4 — the held name the news is about, if any."""
    h = match.affected_holding
    if h is None:
        return None
    prov = Provenance(
        source_type="portfolio",
        source_id=f"{h.portfolio}:{h.isin}",
        excerpt=(
            f"Holds {h.issuer} ({h.isin}) — CHF {h.current_chf:,.0f} in the {h.portfolio} mandate, "
            f"{h.industry_group or 'unclassified sector'}."
        ),
    )
    return _node(
        node_id="holding",
        layer="holding",
        title=h.issuer,
        subtitle=f"CHF {h.current_chf:,.0f} · {h.industry_group or '—'}",
        detail=f"{h.security or h.issuer} ({h.isin})",
        provenance=[prov],
        polarity=match.polarity,
    )


def _candidate_node(swap: SwapProposal) -> Optional[dict]:
    """Layer 5 — the CIO-approved name the advisory agent would buy into."""
    if not swap.buy_issuer:
        return None
    # the cio_list provenance is the last entry on the swap when a candidate was chosen
    cio_provs = [p for p in swap.provenance if p.source_type == "cio_list"]
    detail = f"CIO BUY · same-sector replacement in {swap.industry_group or 'the sector'}"
    return _node(
        node_id="candidate",
        layer="candidate",
        title=swap.buy_issuer,
        subtitle=detail,
        detail=(
            f"Approved-universe target ({swap.industry_group or 'sector'}). "
            f"{'Drift-safe within the ±2.0pp band.' if swap.drift_safe else 'Drift to verify with the RM.'}"
        ),
        provenance=cio_provs or list(swap.provenance),
        polarity="opportunity",
    )


def _action_node(swap: SwapProposal, polarity: str) -> dict:
    """Layer 6 — the proposed move itself (the swap the RM approves)."""
    if swap.buy_issuer and swap.sell_issuer:
        title = f"{swap.action} · {swap.sell_issuer} → {swap.buy_issuer}"
    elif swap.buy_issuer:
        title = f"{swap.action} · {swap.buy_issuer}"
    elif swap.sell_issuer:
        title = f"{swap.action} · {swap.sell_issuer}"
    else:
        title = swap.action
    amount = f"CHF {swap.amount_chf:,.0f}" if swap.amount_chf else "value-neutral"
    return _node(
        node_id="action",
        layer="action",
        title=title,
        subtitle=f"{amount} · {'drift-safe' if swap.drift_safe else 'verify drift'}",
        detail=swap.rationale,
        provenance=list(swap.provenance),
        polarity=polarity,
    )


def build_decision(world: World, client_id: str) -> dict:
    """Build the six-layer Decision DAG for the client's primary insight (PORT_CONTRACT §2).

    notes → dna → signal → holding → candidate → action, edges:
      note→dna supports, dna→holding flags, signal→holding triggers,
      holding→candidate replaces, candidate→action proposes, dna→action honors.
    """
    insights = get_insights(world, client_id)
    matches = insights.matches
    if not matches:
        return _empty_decision(world, client_id)

    match: Match = matches[0]
    strategy: Optional[StrategyProposal] = insights.strategy_proposal
    swap: Optional[SwapProposal] = (
        strategy.swaps[0] if (strategy and strategy.swaps) else None
    )

    nodes: list[dict] = []
    edges: list[dict] = []

    notes_node, _ = _notes_node(match)
    dna_node = _dna_node(match)
    signal_node = _signal_node(match)
    holding_node = _holding_node(match)
    candidate_node = _candidate_node(swap) if swap else None
    action_node = _action_node(swap, match.polarity) if swap else None

    nodes.append(notes_node)
    nodes.append(dna_node)
    nodes.append(signal_node)
    if holding_node:
        nodes.append(holding_node)
    if candidate_node:
        nodes.append(candidate_node)
    if action_node:
        nodes.append(action_node)

    # --- wire edges, only between nodes that actually exist ---
    edges.append(_edge("e-notes-dna", "notes", "dna", "supports", "establishes stance"))

    # dna→holding flags / signal→holding triggers — the conflict converges on the held name
    if holding_node:
        edges.append(_edge("e-dna-holding", "dna", "holding", "flags", "values conflict"))
        edges.append(_edge("e-signal-holding", "signal", "holding", "triggers", "names the holding"))
    else:
        # no held name — the signal still tests the stance directly
        edges.append(_edge("e-signal-dna", "signal", "dna", "triggers", "tests the stance"))

    if candidate_node:
        replace_source = "holding" if holding_node else "signal"
        edges.append(
            _edge("e-holding-candidate", replace_source, "candidate", "replaces",
                  "same-sector swap")
        )

    if action_node:
        prop_source = "candidate" if candidate_node else ("holding" if holding_node else "signal")
        edges.append(_edge("e-candidate-action", prop_source, "action", "proposes", "advisory output"))
        # dna→action honors — the proposal honours the documented stance (the through-line)
        edges.append(_edge("e-dna-action", "dna", "action", "honors", "honours the stance"))

    recommendation = {
        "action": swap.action if swap else "REVIEW",
        "sell": swap.sell_issuer if swap else None,
        "buy": swap.buy_issuer if swap else None,
        "rationale": (
            swap.rationale if swap else
            "Surfaced for the conversation — no drift-safe portfolio action is available right now."
        ),
        "constraints_checked": (strategy.constraints_checked if strategy else []),
    }

    return {
        "client_id": client_id,
        "client_name": insights.client.name,
        "headline": match.headline,
        "polarity": match.polarity,
        "layers": list(LAYERS),
        "nodes": nodes,
        "edges": edges,
        "recommendation": recommendation,
    }
