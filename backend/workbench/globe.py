"""Investment Map globe builder (CLAUDE.md §4, PORT_CONTRACT §4).

Turns a client's holdings + live matches into the `Globe` shape the 3D map
renders: geo-located holdings (verdict + weight from the insights), the news
events that drove the alerts, and signal arcs from each event to the holdings
it touches. Every fact stays grounded in the same matcher/orchestrator output
the rest of the workbench cites — no new strategy is derived here (§2/§9)."""
from __future__ import annotations

import math

from .agents.orchestrator import get_insights
from .geo import REGION_ANCHOR, resolve_geo
from .graph.store import World
from .logo_ticker import resolve_logo_ticker

# Conflicts a market/thematic push attributes to (matches analytics.TOPIC_REGION).
TOPIC_REGION = {
    "us-tech-ai": "USA",
    "labour-governance": "Emerging M.",
    "esg-deforestation": "Emerging M.",
    "neuro-research": "Global",
}

# Arc colours per severity (cyan→amber→rose), readable on the dark globe.
_ARC_COLOR = {"high": "#fb7185", "med": "#f59e0b", "low": "#22d3ee"}
_SEVERITY = {"VIOLATION": "high", "WATCH": "low"}


def _holding_id(h) -> str:
    """Stable per-position id (a portfolio may hold a name in two sleeves)."""
    return f"{h.isin}:{h.industry_group or ''}"


def _topic_anchor(topic: str) -> tuple[float, float, str]:
    region = TOPIC_REGION.get(topic, "Global")
    lat, lng, country = REGION_ANCHOR.get(region, REGION_ANCHOR["Global"])
    return lat, lng, country


def _mean_lng(lngs: list[float]) -> float:
    if not lngs:
        return 0.0
    return math.degrees(math.atan2(
        sum(math.sin(math.radians(lng)) for lng in lngs),
        sum(math.cos(math.radians(lng)) for lng in lngs),
    ))


def _linked_geo(
    linked: list[str],
    holding_pos: dict[str, tuple[float, float]],
    holding_countries: dict[str, str],
) -> tuple[float, float, str] | None:
    """Centroid of the holdings a signal touches — better than a topic-region guess."""
    pts = [holding_pos[hid] for hid in linked if hid in holding_pos]
    if not pts:
        return None
    lat = sum(p[0] for p in pts) / len(pts)
    lng = _mean_lng([p[1] for p in pts])
    country = next(
        (holding_countries[hid] for hid in linked if hid in holding_countries),
        "Global",
    )
    return lat, lng, country


def build_globe(world: World, client_id: str) -> dict:
    insights = get_insights(world, client_id)
    matches = insights.matches
    holdings = world.holdings_for_client(client_id)

    # --- verdict map: which holdings are flagged, and how (§4) ---------------
    # conflict match's affected holding -> VIOLATION; opportunity -> WATCH.
    verdict_by_isin: dict[str, str] = {}
    for m in matches:
        if not m.affected_holding:
            continue
        isin = m.affected_holding.isin
        verdict = "VIOLATION" if m.polarity == "conflict" else (
            "WATCH" if m.polarity == "opportunity" else "OK")
        # A VIOLATION outranks a WATCH if the same name appears in two matches.
        if verdict_by_isin.get(isin) != "VIOLATION":
            verdict_by_isin[isin] = verdict

    max_chf = max((h.current_chf for h in holdings), default=0.0) or 1.0

    globe_holdings: list[dict] = []
    holding_pos: dict[str, tuple[float, float]] = {}
    holding_countries: dict[str, str] = {}
    for h in holdings:
        lat, lng, country, city = resolve_geo(h.issuer, h.region, h.isin)
        hid = _holding_id(h)
        verdict = verdict_by_isin.get(h.isin, "OK")
        logo_ticker = resolve_logo_ticker(world, client_id, h)
        globe_holdings.append({
            "id": hid,
            "issuer": h.issuer,
            "isin": h.isin,
            "industry_group": h.industry_group,
            "current_chf": round(h.current_chf, 2),
            "lat": lat,
            "lng": lng,
            "country": country,
            "city": city,
            "verdict": verdict,
            "weight": round(h.current_chf / max_chf, 4),
            "yahoo": logo_ticker or h.yahoo,
            "provenance": h.provenance.model_dump() if h.provenance else None,
        })
        holding_pos[hid] = (lat, lng)
        holding_countries[hid] = country

    # --- events: the matches' news, geo-located by issuer (fallback region) --
    events: list[dict] = []
    arcs: list[dict] = []
    for m in matches:
        news = m.news
        # Which held positions this signal touches.
        if m.affected_holding:
            linked = [_holding_id(h) for h in holdings
                      if h.isin == m.affected_holding.isin]
        else:
            # market/thematic push (no held name): attribute to topic region,
            # link every held position sitting in that region.
            topic = m.shared_topics[0].topic if m.shared_topics else ""
            region = TOPIC_REGION.get(topic, "Global")
            linked = [_holding_id(h) for h in holdings if (h.region or "") == region]

        # Event coordinates: issuer HQ → linked-holding centroid → topic region.
        if news.issuer_name:
            elat, elng, country, _city = resolve_geo(
                news.issuer_name, None, news.issuer_isin)
        elif linked:
            cent = _linked_geo(linked, holding_pos, holding_countries)
            if cent:
                elat, elng, country = cent
            else:
                topic = m.shared_topics[0].topic if m.shared_topics else ""
                elat, elng, country = _topic_anchor(topic)
        else:
            topic = m.shared_topics[0].topic if m.shared_topics else ""
            elat, elng, country = _topic_anchor(topic)

        if not linked:
            continue

        severity = ("high" if m.polarity == "conflict"
                    else "med" if m.polarity == "opportunity" else "low")
        eid = f"event:{news.id}"
        events.append({
            "id": eid,
            "headline": m.headline,
            "source": news.source,
            "published_at": news.published_at,
            "url": news.url,
            "issuer_name": news.issuer_name,
            "issuer_isin": news.issuer_isin,
            "lat": elat,
            "lng": elng,
            "country": country,
            "severity": severity,
            "summary": news.title,
            "linked_holding_ids": linked,
            "kind": "alert",
            "sentiment": round(news.sentiment.score, 2),
            "provenance": news.provenance.model_dump(),
        })

        color = _ARC_COLOR.get(severity, _ARC_COLOR["low"])
        for hid in linked:
            to_lat, to_lng = holding_pos.get(hid, (elat, elng))
            arcs.append({
                "id": f"arc:{news.id}:{hid}",
                "from_lat": elat,
                "from_lng": elng,
                "to_lat": to_lat,
                "to_lng": to_lng,
                "color": color,
                "label": m.headline,
            })

    violations = sum(1 for h in globe_holdings if h["verdict"] == "VIOLATION")
    watches = sum(1 for h in globe_holdings if h["verdict"] == "WATCH")

    return {
        "client_id": client_id,
        "holdings": globe_holdings,
        "events": events,
        "news": [],
        "arcs": arcs,
        "stats": {
            "holdings": len(globe_holdings),
            "violations": violations,
            "watches": watches,
            "events": len(events),
            "news": 0,
        },
    }
