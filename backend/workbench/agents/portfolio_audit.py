"""Portfolio Agent — standing deviation audit (DeepDive p.10 'Portfolio Agent').

The match pipeline is *reactive*: it fires when news breaks. This pass is *proactive* and
news-independent — it answers "where does this book stand against the client's DNA and the CIO
list, right now?" the moment the RM opens the client, before anything has happened. It surfaces
three kinds of standing deviation, every one fully cited (Trust, §2/§7.5):

1. **Values conflicts** — a held name carrying a CIO value tag the client has documented wanting to
   avoid (e.g. a holding labelled `labour-risk` for a client with a labour-governance red line).
   This catches a conflict that already exists in the portfolio, independent of any trigger.
2. **CIO deviations** — held names downgraded to SELL or no longer on the CIO list (the spec's
   "flag assets no longer on the CIO list").
3. **Mandate drift breaches** — sub-asset-class sleeves outside the ±2.0pp band.

Pure index/lookup work over the already-built world — no LLM, in line with token discipline (§9).
"""
from __future__ import annotations

from ..graph.store import World
from ..models import Provenance
from ..topics import topic_label
from .advisory import TOPIC_PREFERENCES


def _avoid_index(world: World, client_id: str) -> dict[str, list]:
    """Map each avoid value-tag → the client's conflict interest edges that justify avoiding it, so
    a flagged holding can cite the exact log line behind the red line."""
    out: dict[str, list] = {}
    for e in world.interest_by_client.get(client_id, []):
        if e.polarity != "conflict":
            continue
        _want, avoid, _sec = TOPIC_PREFERENCES.get(e.topic, ([], [], None))
        for tag in avoid:
            out.setdefault(tag, []).append(e)
    return out


def build_portfolio_audit(world: World, client_id: str) -> dict:
    avoid_idx = _avoid_index(world, client_id)
    holdings = world.holdings_for_client(client_id)

    value_conflicts: list[dict] = []
    for h in holdings:
        cio = world.cio_by_isin.get(h.isin)
        if not cio:
            continue
        hit = set(cio.value_tags) & set(avoid_idx)
        if not hit:
            continue
        # Cite: the held position, the offending CIO label, and the conflict edge(s) behind it.
        edges = [e for tag in hit for e in avoid_idx[tag]]
        topics = sorted({topic_label(e.topic) for e in edges})
        prov: list[Provenance] = []
        if h.provenance:
            prov.append(h.provenance)
        prov.append(cio.provenance)
        for e in edges:
            prov.append(e.provenance)
        value_conflicts.append({
            "isin": h.isin, "issuer": h.issuer, "industry_group": h.industry_group,
            "current_chf": round(h.current_chf, 2),
            "conflicting_tags": sorted(hit),
            "topics": topics,
            "severity": "high",
            "reason": (f"{h.issuer} is labelled {', '.join(sorted(hit))} — a standing conflict with "
                       f"{world.clients.get(client_id, {}).get('name', client_id)}'s documented stance on "
                       f"{', '.join(topics)}. Surfaced independently of any news trigger."),
            "provenance": [p.model_dump() for p in prov],
        })

    cio_deviations: list[dict] = []
    for h in world.cio_deviations(client_id):
        cio = world.cio_by_isin.get(h.isin)
        prov = [p for p in [h.provenance, (cio.provenance if cio else None)] if p]
        cio_deviations.append({
            "isin": h.isin, "issuer": h.issuer, "status": h.cio_status,
            "current_chf": round(h.current_chf, 2),
            "severity": "medium" if h.cio_status == "SELL" else "low",
            "reason": (f"{h.issuer} is {'rated SELL' if h.cio_status == 'SELL' else 'no longer on'} "
                       f"the CIO list — review whether it still belongs in the mandate."),
            "provenance": [p.model_dump() for p in prov],
        })

    mandate = world.mandates.get(world.portfolio_of(client_id))
    drift_breaches: list[dict] = []
    if mandate:
        for t in mandate.targets:
            if t.breach:
                drift_breaches.append({
                    "sub_asset_class": t.sub_asset_class,
                    "drift_pp": t.drift_pp,
                    "target_pct": t.target_pct,
                    "current_pct": t.current_pct,
                    "severity": "medium",
                    "reason": (f"{t.sub_asset_class} sleeve is {t.drift_pp:+.2f}pp vs target — outside the "
                               f"±2.0pp band; a rebalance is due."),
                    "provenance": [t.provenance.model_dump()] if t.provenance else [],
                })

    total = len(value_conflicts) + len(cio_deviations) + len(drift_breaches)
    return {
        "client_id": client_id,
        "value_conflicts": value_conflicts,
        "cio_deviations": cio_deviations,
        "drift_breaches": drift_breaches,
        "total_deviations": total,
        "clean": total == 0,
    }
