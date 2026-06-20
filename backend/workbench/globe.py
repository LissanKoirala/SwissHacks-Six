"""Investment Map globe builder (CLAUDE.md §4, PORT_CONTRACT §4).

Turns a client's holdings + live matches into the `Globe` shape the 3D map
renders: geo-located holdings (verdict + weight from the insights), the news
events that drove the alerts, and signal arcs from each event to the holdings
it touches. Every fact stays grounded in the same matcher/orchestrator output
the rest of the workbench cites — no new strategy is derived here (§2/§9)."""
from __future__ import annotations

from .agents.orchestrator import get_insights
from .geo import REGION_ANCHOR, _jitter, resolve_geo
from .graph.store import World

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
    for h in holdings:
        lat, lng, country, city = resolve_geo(h.issuer, h.region, h.isin)
        hid = _holding_id(h)
        verdict = verdict_by_isin.get(h.isin, "OK")
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
        })
        holding_pos[hid] = (lat, lng)

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

        # Event coordinates: issuer HQ when known, else the topic-region anchor.
        if news.issuer_name:
            elat, elng, country, _city = resolve_geo(
                news.issuer_name, None, news.issuer_isin)
        else:
            topic = m.shared_topics[0].topic if m.shared_topics else ""
            elat, elng, country = _topic_anchor(topic)

        severity = ("high" if m.polarity == "conflict"
                    else "med" if m.polarity == "opportunity" else "low")
        eid = f"event:{news.id}"
        events.append({
            "id": eid,
            "headline": m.headline,
            "source": news.source,
            "published_at": news.published_at,
            "lat": elat,
            "lng": elng,
            "country": country,
            "severity": severity,
            "summary": news.title,
            "linked_holding_ids": linked,
            "kind": "alert",
            "sentiment": round(news.sentiment.score, 2),
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

    # --- ambient world news: the rest of the news graph, geo-located ---------
    # Everything in the news graph that did NOT drive an alert for this client
    # still pulses on the globe (worldmonitor-style), dimmer, coloured by
    # sentiment. This gives the RM live world context, not just their own
    # alerts. Each pulse stays grounded in a real news item (§7.5 provenance).
    alert_news_ids = {m.news.id for m in matches}
    news_items: list[dict] = []
    for n in world.news:
        if n.id in alert_news_ids:
            continue  # already shown as a bright alert signal above
        if n.issuer_name:
            nlat, nlng, country, _city = resolve_geo(
                n.issuer_name, None, n.issuer_isin)
        elif n.topics:
            nlat, nlng, country = _topic_anchor(n.topics[0])
            nlat += _jitter(n.id, "lat")
            nlng += _jitter(n.id, "lng")
        else:
            glat, glng, gcountry = REGION_ANCHOR["Global"]
            nlat = glat + _jitter(n.id, "lat") * 3.0
            nlng = glng + _jitter(n.id, "lng") * 8.0
            country = gcountry
        score = n.sentiment.score
        severity = ("high" if score <= -0.5
                    else "med" if abs(score) >= 0.3 else "low")
        linked = [_holding_id(h) for h in holdings
                  if n.issuer_isin and h.isin == n.issuer_isin]
        news_items.append({
            "id": f"news:{n.id}",
            "headline": n.topics[0] if n.topics else "market",
            "source": n.source,
            "published_at": n.published_at,
            "lat": nlat,
            "lng": nlng,
            "country": country,
            "severity": severity,
            "summary": n.title,
            "linked_holding_ids": linked,
            "kind": "ambient",
            "sentiment": round(score, 2),
        })

    violations = sum(1 for h in globe_holdings if h["verdict"] == "VIOLATION")
    watches = sum(1 for h in globe_holdings if h["verdict"] == "WATCH")

    return {
        "client_id": client_id,
        "holdings": globe_holdings,
        "events": events,
        "news": news_items,
        "arcs": arcs,
        "stats": {
            "holdings": len(globe_holdings),
            "violations": violations,
            "watches": watches,
            "events": len(events),
            "news": len(news_items),
        },
    }
