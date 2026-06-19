"""Portfolio analytics for the dashboard's charts + 3D investment globe.

Derives allocation breakdowns, headline figures, and per-region risk (linked to the client's
live matches, so every risk marker on the globe carries provenance — §2)."""
from __future__ import annotations

from .agents.matcher import match_client
from .graph.store import World
from .topics import topic_label

# Representative centroid per workbook region label (lat, lng) for the globe markers.
REGION_COORDS = {
    "Schweiz": (46.95, 7.45),
    "USA": (38.0, -97.0),
    "Europa": (50.5, 9.0),
    "Global": (20.0, 0.0),
    "Emerging M.": (10.0, 95.0),
    "Emerging Markets": (10.0, 95.0),
}
# When a conflict has no held name (a market/thematic push), attribute it to a region.
TOPIC_REGION = {
    "us-tech-ai": "USA",
    "labour-governance": "Emerging M.",
    "esg-deforestation": "Emerging M.",
    "neuro-research": "Global",
}


def _coords(region: str):
    return REGION_COORDS.get(region, (0.0, 0.0))


def _pct(part: float, total: float) -> float:
    return round(part / total * 100, 2) if total else 0.0


def build_analytics(world: World, client_id: str) -> dict:
    holdings = world.holdings_for_client(client_id)
    total = sum(h.current_chf for h in holdings) or 1.0
    mandate = world.mandates.get(world.portfolio_of(client_id))
    matches = match_client(world, client_id)
    alert_isins = {m.affected_holding.isin for m in matches if m.affected_holding}

    def group(key):
        agg: dict[str, float] = {}
        for h in holdings:
            k = getattr(h, key) or "Other"
            agg[k] = agg.get(k, 0.0) + h.current_chf
        return [{"name": k, "current_chf": round(v, 2), "pct": _pct(v, total)}
                for k, v in sorted(agg.items(), key=lambda x: -x[1])]

    by_asset_class = group("asset_class")
    by_sector = [s for s in group("industry_group") if s["name"] != "Other"][:10]

    # Sub-asset-class allocation vs mandate target (drift) — reuse the computed mandate targets.
    by_sub_asset_class = []
    if mandate:
        for t in mandate.targets:
            by_sub_asset_class.append({
                "name": t.sub_asset_class, "asset_class": t.asset_class,
                "target_pct": t.target_pct, "current_pct": t.current_pct,
                "current_chf": t.current_chf, "drift_pp": t.drift_pp, "breach": t.breach,
            })

    # Top holdings (with alert flag).
    top = sorted(holdings, key=lambda h: -h.current_chf)[:12]
    top_holdings = [{
        "issuer": h.issuer, "isin": h.isin, "industry_group": h.industry_group,
        "region": h.region, "current_chf": round(h.current_chf, 2),
        "pct": _pct(h.current_chf, total), "in_alert": h.isin in alert_isins,
    } for h in top]

    # Region exposure + risk for the globe.
    regions: dict[str, dict] = {}
    for h in holdings:
        r = regions.setdefault(h.region or "Other", {
            "region": h.region or "Other", "current_chf": 0.0, "count": 0, "risks": []})
        r["current_chf"] += h.current_chf
        r["count"] += 1

    for m in matches:
        region = (m.affected_holding.region if m.affected_holding
                  else TOPIC_REGION.get(m.shared_topics[0].topic if m.shared_topics else "", "Global"))
        bucket = regions.setdefault(region, {"region": region, "current_chf": 0.0, "count": 0, "risks": []})
        bucket["risks"].append({
            "kind": m.polarity,
            "label": ", ".join(sorted({topic_label(t.topic) for t in m.shared_topics})),
            "detail": m.headline,
            "sentiment": m.news.sentiment.label,
            "issuer": m.news.issuer_name,
            "provenance": m.news.provenance.model_dump(),
        })

    by_region = []
    for r in regions.values():
        lat, lng = _coords(r["region"])
        kinds = {risk["kind"] for risk in r["risks"]}
        level = ("high" if "conflict" in kinds else
                 "positive" if "opportunity" in kinds else
                 "stable")
        by_region.append({
            **r, "current_chf": round(r["current_chf"], 2),
            "pct": _pct(r["current_chf"], total), "lat": lat, "lng": lng, "risk_level": level,
        })
    by_region.sort(key=lambda x: -x["current_chf"])

    # Weighted news sentiment across the labelled book.
    sw = sn = 0.0
    for h in holdings:
        cio = world.cio_by_isin.get(h.isin)
        if cio and cio.sentiment:
            sw += cio.sentiment.score * h.current_chf
            sn += h.current_chf
    weighted_sentiment = round(sw / sn, 3) if sn else 0.0

    return {
        "client_id": client_id,
        "figures": {
            "total_chf": round(total, 2),
            "holding_count": len(holdings),
            "sub_asset_classes": len(by_sub_asset_class),
            "drift_breaches": sum(1 for t in by_sub_asset_class if t["breach"]),
            "alerts": len(matches),
            "weighted_sentiment": weighted_sentiment,
            "regions": len(by_region),
        },
        "by_asset_class": by_asset_class,
        "by_sub_asset_class": by_sub_asset_class,
        "by_sector": by_sector,
        "by_region": by_region,
        "top_holdings": top_holdings,
    }
