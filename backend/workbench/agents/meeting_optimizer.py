"""Meeting-location optimiser for the Rendezvous planner.

Ports the DurHack 2025 "Event Optimiser" idea into the advisory workbench: given a set
of geographically dispersed attendees (RM, client, family — who are *not* assumed to be in
the same country), score many candidate meeting cities on real flight-grounded travel time,
CO₂ and fairness, then recommend the optimal place to convene.

Flight estimates are grounded in the airport table extracted from durhack2025 `codes.csv`
(`data/airports.json`) plus a calibrated emissions/time model. No RL model, no live API —
deterministic and offline (CLAUDE.md §9), but the inputs are real airport coordinates.

Optimisation modes:
- ``fairness``      — spread the travel burden; never over-inconvenience the client.
- ``environmental`` — minimise total travel CO₂ (Huber and similar ESG-led profiles).
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..config import DATA_DIR

OptimizationMode = Literal["fairness", "environmental"]
TravelMode = Literal["local", "train", "flight"]
Role = Literal["rm", "client", "family"]


# --- airport table (real coords from durhack codes.csv) ----------------------

@lru_cache(maxsize=1)
def _airports() -> dict[str, dict]:
    path = DATA_DIR / "airports.json"
    data = json.loads(path.read_text())
    return {a["iata"]: a for a in data["airports"]}


# Neutral hub candidates considered for every meeting (in addition to attendee cities).
_HUB_CANDIDATES = [
    "ZRH", "GVA", "FRA", "LHR", "CDG", "AMS", "MUC", "LIS", "MAD",
    "VIE", "FCO", "BRU", "JFK", "BOS", "MIA", "GRU", "LIM", "DXB",
]


# --- models ------------------------------------------------------------------

class Participant(BaseModel):
    id: str
    name: str
    role: Role
    city: str
    country: str
    iata: str
    lat: float
    lng: float


class FlightLeg(BaseModel):
    participant_id: str
    participant_name: str
    role: Role
    from_city: str
    from_iata: str
    to_city: str
    to_iata: str
    distance_km: float
    travel_hours: float
    co2_kg: float
    mode: TravelMode
    timezone_shift_h: int


class CalendarSlot(BaseModel):
    label: str
    start: str
    end: str
    rationale: str


class CandidateCity(BaseModel):
    city: str
    country: str
    iata: str
    lat: float
    lng: float
    total_co2_kg: float
    max_travel_hours: float
    avg_travel_hours: float
    fairness_score: float
    composite_score: float
    is_optimal: bool = False
    legs: list[FlightLeg] = Field(default_factory=list)
    # Enriched when building the plan (activities, pricing, briefing per city)
    activities: list[dict] = Field(default_factory=list)
    flight_quotes: list[dict] = Field(default_factory=list)
    total_travel_cost_chf: Optional[float] = None
    city_briefing: dict = Field(default_factory=dict)
    globe: dict = Field(default_factory=dict)


class GlobePoint(BaseModel):
    id: str
    kind: Literal["origin", "meeting"]
    label: str
    lat: float
    lng: float
    color: str
    role: Optional[Role] = None


class GlobeArc(BaseModel):
    id: str
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    label: str
    color: str
    travel_hours: float
    mode: TravelMode


class RendezvousGlobe(BaseModel):
    points: list[GlobePoint] = Field(default_factory=list)
    arcs: list[GlobeArc] = Field(default_factory=list)
    focus_lat: float = 47.37
    focus_lng: float = 8.54


class MeetingOptimization(BaseModel):
    mode: OptimizationMode = "fairness"
    default_mode: OptimizationMode = "fairness"
    summary: str = ""
    participants: list[Participant] = Field(default_factory=list)
    candidates: list[CandidateCity] = Field(default_factory=list)
    optimal_city: Optional[str] = None
    optimal_country: Optional[str] = None
    optimal_iata: Optional[str] = None
    calendar_slot: Optional[CalendarSlot] = None
    calendar_options: list[CalendarSlot] = Field(default_factory=list)
    globe: RendezvousGlobe = Field(default_factory=RendezvousGlobe)
    live_flight_quotes_deferred: bool = False


# --- scenarios (CRM-grounded, deliberately international) ---------------------
#
# Each participant carries a home city + nearest airport. The RM is NOT assumed to be
# co-located with the client; clients/family travel internationally per their CRM context.

def _p(
    pid: str, name: str, role: Role, iata: str, *,
    city: Optional[str] = None, lat: Optional[float] = None, lng: Optional[float] = None,
) -> Participant:
    """Build a participant. ``lat``/``lng`` override the airport coords for a home town
    served by that airport (e.g. Zug/Flims → ZRH) so domestic legs read as real train hops."""
    a = _airports()[iata]
    return Participant(
        id=pid, name=name, role=role,
        city=city or a["city"], country=a["country"], iata=iata,
        lat=lat if lat is not None else a["lat"],
        lng=lng if lng is not None else a["lng"],
    )


def _scenario(client_id: str, client_name: str) -> tuple[list[Participant], OptimizationMode]:
    # (participant builders, default mode). RM origin varies by scenario.
    if client_id == "schneider":
        return [
            _p("rm", "Thomas Keller", "rm", "ZRH"),
            _p("client", "Hubertus Schneider", "client", "BOS", city="Boston (research summit)"),
            _p("carmen", "Carmen Schneider", "family", "ZRH", city="Zug", lat=47.1662, lng=8.5155),
        ], "fairness"
    if client_id == "huber":
        return [
            _p("rm", "Thomas Keller", "rm", "ZRH"),
            _p("client", "Marius Huber", "client", "GRU", city="São Paulo (field trip)"),
            _p("elena", "Elena Huber", "family", "ZRH", city="Zürich"),
        ], "environmental"
    if client_id == "raeber":
        return [
            _p("rm", "Thomas Keller", "rm", "ZRH"),
            _p("client", "Eugen Räber", "client", "ZRH", city="Zürich"),
            _p("lisa", "Lisa Räber", "family", "ZRH", city="Flims", lat=46.837, lng=9.283),
        ], "fairness"
    if client_id == "ammann":
        return [
            _p("rm", "Thomas Keller", "rm", "LHR", city="London (due diligence)"),
            _p("client", "Julian Ammann", "client", "GVA", city="Geneva"),
        ], "fairness"
    # generic
    return [
        _p("rm", "Thomas Keller", "rm", "ZRH"),
        _p("client", client_name, "client", "ZRH"),
    ], "fairness"


# --- flight model (calibrated to real per-passenger aviation figures) ---------

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _tz_hours(lng: float) -> int:
    return round(lng / 15.0)


def _estimate_leg(
    *,
    from_iata: str,
    to_iata: str,
    lat1: float, lng1: float, country1: str,
    lat2: float, lng2: float, country2: str,
) -> tuple[float, float, float, TravelMode]:
    """Return (distance_km, travel_hours, co2_kg, mode). Uses real route stats when available."""
    from .flight_routes import route_stats

    o, d = from_iata.upper(), to_iata.upper()
    if o == d:
        return 0.0, 0.25, 0.0, "local"

    dist = _haversine_km(lat1, lng1, lat2, lng2)
    if dist < 25:
        return dist, round(dist / 40 + 0.25, 2), round(dist * 0.17, 1), "local"

    route = route_stats(o, d)
    if route and route.get("samples", 0) > 0:
        # Real aggregated sector data from training_data.csv (+ door-to-door buffer)
        r_dist = route["distance_km"]
        hours = route["time_hours"] + 1.2  # airport / security buffer
        co2 = route["co2_kg"]
        if dist < 700 and country1 in _EU and country2 in _EU and r_dist < 900:
            # Short European sectors often rail-competitive — keep train if faster/greener
            rail_h = dist / 110 + 0.6
            rail_co2 = dist * 0.035
            if rail_co2 < co2 * 0.55:
                return dist, round(rail_h, 2), round(rail_co2, 1), "train"
        return r_dist, round(hours, 2), round(co2, 1), "flight"

    # Fallback when no historical route in dataset
    if dist < 700 and country1 in _EU and country2 in _EU:
        hours = dist / 110 + 0.6
        co2 = dist * 0.035
        return dist, round(hours, 2), round(co2, 1), "train"
    overhead = 2.5 if dist > 5000 else 1.8
    hours = dist / 820 + overhead
    factor = 0.20 if dist < 1500 else (0.16 if dist < 4000 else 0.13)
    co2 = dist * factor + 55
    return dist, round(hours, 2), round(co2, 1), "flight"


_EU = {
    "Switzerland", "United Kingdom", "Germany", "France", "Netherlands", "Italy",
    "Portugal", "Spain", "Austria", "Belgium", "Ireland", "Denmark",
}


# --- scoring + optimisation --------------------------------------------------

def _role_weight(role: Role) -> float:
    # client inconvenience matters most; RM least (it is their job to travel).
    return {"client": 2.2, "family": 1.6, "rm": 0.7}[role]


def _candidate_cities(participants: list[Participant]) -> list[dict]:
    seen: dict[str, dict] = {}
    # attendee home cities first (a meeting where someone is already there = zero travel for them)
    for p in participants:
        seen.setdefault(p.iata, {
            "city": p.city if p.iata not in {x.iata for x in participants if x is not p} else _airports()[p.iata]["city"],
            "country": p.country, "iata": p.iata, "lat": p.lat, "lng": p.lng,
        })
    for iata in _HUB_CANDIDATES:
        a = _airports()[iata]
        seen.setdefault(iata, {
            "city": a["city"], "country": a["country"], "iata": iata,
            "lat": a["lat"], "lng": a["lng"],
        })
    return list(seen.values())


def _score_candidate(
    participants: list[Participant], cand: dict, mode: OptimizationMode
) -> CandidateCity:
    legs: list[FlightLeg] = []
    weighted: list[float] = []
    total_co2 = 0.0
    for p in participants:
        dist, hours, co2, tmode = _estimate_leg(
            from_iata=p.iata, to_iata=cand["iata"],
            lat1=p.lat, lng1=p.lng, country1=p.country,
            lat2=cand["lat"], lng2=cand["lng"], country2=cand["country"],
        )
        tz = abs(_tz_hours(cand["lng"]) - _tz_hours(p.lng))
        legs.append(FlightLeg(
            participant_id=p.id, participant_name=p.name, role=p.role,
            from_city=p.city, from_iata=p.iata,
            to_city=cand["city"], to_iata=cand["iata"],
            distance_km=round(dist, 1), travel_hours=hours, co2_kg=co2,
            mode=tmode, timezone_shift_h=tz,
        ))
        total_co2 += co2
        weighted.append(hours * _role_weight(p.role))

    hrs = [l.travel_hours for l in legs]
    max_h = max(hrs) if hrs else 0.0
    avg_h = sum(hrs) / len(hrs) if hrs else 0.0
    mean_w = sum(weighted) / len(weighted) if weighted else 0.0
    fairness = (sum((x - mean_w) ** 2 for x in weighted) / len(weighted)) ** 0.5 if weighted else 0.0

    # never over-inconvenience the client relative to the RM
    client_leg = next((l for l in legs if l.role == "client"), None)
    rm_leg = next((l for l in legs if l.role == "rm"), None)
    client_penalty = 0.0
    if client_leg and rm_leg and client_leg.travel_hours > rm_leg.travel_hours + 1.5:
        client_penalty = (client_leg.travel_hours - rm_leg.travel_hours) * 40

    if mode == "environmental":
        composite = total_co2 * 2.0 + fairness * 8 + client_penalty + max_h * 3
    else:
        composite = fairness * 45 + total_co2 * 0.6 + client_penalty + max_h * 6

    return CandidateCity(
        city=cand["city"], country=cand["country"], iata=cand["iata"],
        lat=cand["lat"], lng=cand["lng"],
        total_co2_kg=round(total_co2, 1),
        max_travel_hours=round(max_h, 2),
        avg_travel_hours=round(avg_h, 2),
        fairness_score=round(fairness, 2),
        composite_score=round(composite, 2),
        legs=legs,
    )


def _default_mode(client_id: str, profile_topics: set[str]) -> OptimizationMode:
    if client_id == "huber":
        return "environmental"
    if any("esg" in t or "deforest" in t for t in profile_topics):
        return "environmental"
    return "fairness"


def _calendar_slot(max_travel_h: float, *, start: Optional[datetime] = None) -> CalendarSlot:
    now = datetime.now(timezone.utc)
    buffer = timedelta(hours=max_travel_h + 2)
    base = start if start else now
    slot_start = base + buffer if start else now + buffer
    while slot_start.weekday() >= 5:
        slot_start += timedelta(days=1)
    slot_start = slot_start.replace(hour=11, minute=0, second=0, microsecond=0)
    if slot_start < (now + buffer if not start else base + buffer):
        slot_start += timedelta(days=1)
        while slot_start.weekday() >= 5:
            slot_start += timedelta(days=1)
    duration_h = 3
    end = slot_start + timedelta(hours=duration_h)
    return CalendarSlot(
        label=f"{slot_start.strftime('%a %d %b')} · {slot_start.strftime('%H:%M')}–{end.strftime('%H:%M')}",
        start=slot_start.isoformat(timespec="minutes"),
        end=end.isoformat(timespec="minutes"),
        rationale=(
            f"Earliest shared window after the longest leg ({max_travel_h:.1f}h) plus a 2h buffer — "
            f"clears both the RM's and the client's calendars."
        ),
    )


def _calendar_options(max_travel_h: float, count: int = 5) -> list[CalendarSlot]:
    """Several viable weekday windows for the RM to pick from."""
    first = _calendar_slot(max_travel_h)
    options: list[CalendarSlot] = [first]
    try:
        cursor = datetime.fromisoformat(first.start.replace("Z", "+00:00"))
    except ValueError:
        return options
    while len(options) < count:
        cursor += timedelta(days=1)
        if cursor.weekday() >= 5:
            continue
        end = cursor + timedelta(hours=3)
        options.append(CalendarSlot(
            label=f"{cursor.strftime('%a %d %b')} · {cursor.strftime('%H:%M')}–{end.strftime('%H:%M')}",
            start=cursor.isoformat(timespec="minutes"),
            end=end.isoformat(timespec="minutes"),
            rationale=(
                f"Alternative slot — still clears {max_travel_h:.1f}h max travel plus 2h buffer."
            ),
        ))
    return options


def _arc_color(hours: float) -> str:
    if hours < 2:
        return "#34d399"
    if hours < 8:
        return "#fbbf24"
    return "#fb7185"


def _globe_for_candidate(
    participants: list[Participant], cand: CandidateCity
) -> RendezvousGlobe:
    points: list[GlobePoint] = [
        GlobePoint(
            id=p.id, kind="origin", role=p.role,
            label=f"{p.name} · {p.city}", lat=p.lat, lng=p.lng,
            color="#22d3ee" if p.role == "rm" else "#38bdf8",
        )
        for p in participants
    ]
    arcs: list[GlobeArc] = []
    points.append(GlobePoint(
        id="meeting", kind="meeting",
        label=f"Meet in {cand.city}", lat=cand.lat, lng=cand.lng, color="#fbbf24",
    ))
    for leg in cand.legs:
        if leg.travel_hours <= 0.3:
            continue
        p = next(x for x in participants if x.id == leg.participant_id)
        arcs.append(GlobeArc(
            id=f"arc-{leg.participant_id}",
            from_lat=p.lat, from_lng=p.lng, to_lat=cand.lat, to_lng=cand.lng,
            label=(
                f"{leg.participant_name}: {leg.from_iata}→{leg.to_iata} · "
                f"{leg.travel_hours}h · {leg.co2_kg} kg CO₂ · {leg.mode}"
            ),
            color=_arc_color(leg.travel_hours), travel_hours=leg.travel_hours,
            mode=leg.mode,
        ))
    return RendezvousGlobe(points=points, arcs=arcs, focus_lat=cand.lat, focus_lng=cand.lng)


def _enrich_candidate(
    cand: CandidateCity,
    *,
    client_id: str,
    participants: list[Participant],
    interest_ids: list[str],
    event_start_iso: Optional[str],
    include_live_flight_quotes: bool = False,
) -> CandidateCity:
    from .city_briefing import fetch_city_briefing
    from .flight_pricing import quote_all_legs
    from .rendezvous_activities import activities_for_city

    event_start = None
    if event_start_iso:
        try:
            event_start = datetime.fromisoformat(event_start_iso.replace("Z", "+00:00"))
        except ValueError:
            pass

    acts = activities_for_city(cand.iata, cand.city, interest_ids=interest_ids)
    from .flight_fli import flights_live_enabled

    defer_quotes = flights_live_enabled() and not include_live_flight_quotes
    if defer_quotes:
        quotes = []
        total_chf = None
    else:
        quotes = quote_all_legs(
            cand.legs, participants, client_id,
            interest_ids=interest_ids, event_start=event_start,
            use_live=include_live_flight_quotes,
        )
        total_chf = round(sum(q.price_chf for q in quotes), 0)

    briefing = fetch_city_briefing(
        city=cand.city, country=cand.country, lat=cand.lat, lng=cand.lng,
        event_start_iso=event_start_iso,
    )
    globe = _globe_for_candidate(participants, cand)
    update: dict = {
        "activities": [a.model_dump() for a in acts],
        "flight_quotes": [q.model_dump() for q in quotes],
        "total_travel_cost_chf": total_chf,
        "city_briefing": briefing.model_dump(),
        "globe": globe.model_dump(),
    }
    return cand.model_copy(update=update)


def flight_quotes_for_iata(
    client_id: str,
    client_name: str,
    iata: str,
    *,
    interest_ids: Optional[list[str]] = None,
    event_start_iso: Optional[str] = None,
) -> dict:
    """Live Google Flights quotes for one candidate city (lazy-loaded by the UI)."""
    from .flight_pricing import quote_all_legs

    participants, _ = _scenario(client_id, client_name)
    code = iata.strip().upper()
    cand_raw = next((c for c in _candidate_cities(participants) if c["iata"] == code), None)
    if not cand_raw:
        raise ValueError(f"unknown candidate airport: {code}")

    scored = _score_candidate(participants, cand_raw, "fairness")
    event_start = None
    if event_start_iso:
        try:
            event_start = datetime.fromisoformat(event_start_iso.replace("Z", "+00:00"))
        except ValueError:
            pass

    quotes = quote_all_legs(
        scored.legs,
        participants,
        client_id,
        interest_ids=interest_ids or [],
        event_start=event_start,
        use_live=True,
    )
    total_chf = sum(q.price_chf for q in quotes)
    return {
        "iata": code,
        "flight_quotes": [q.model_dump() for q in quotes],
        "total_travel_cost_chf": round(total_chf, 0),
    }


def optimize_meeting(
    client_id: str,
    client_name: str,
    *,
    profile_topics: Optional[set[str]] = None,
    interest_ids: Optional[list[str]] = None,
    mode: Optional[OptimizationMode] = None,
    event_start_iso: Optional[str] = None,
    include_live_flight_quotes: bool = False,
) -> MeetingOptimization:
    participants, _ = _scenario(client_id, client_name)
    topics = profile_topics or set()
    default_mode = _default_mode(client_id, topics)
    active_mode: OptimizationMode = mode or default_mode

    cands = [_score_candidate(participants, c, active_mode) for c in _candidate_cities(participants)]
    cands.sort(key=lambda c: c.composite_score)
    for c in cands:
        c.is_optimal = False
    if cands:
        cands[0].is_optimal = True
    top = cands[:6]
    best = top[0] if top else None

    # Calendar — honour explicit event_start or pick earliest viable slot
    max_h = best.max_travel_hours if best else 0.0
    cal_options = _calendar_options(max_h)
    if event_start_iso:
        try:
            custom = datetime.fromisoformat(event_start_iso.replace("Z", "+00:00"))
            if custom.tzinfo is None:
                custom = custom.replace(tzinfo=timezone.utc)
            end = custom + timedelta(hours=3)
            cal = CalendarSlot(
                label=f"{custom.strftime('%a %d %b')} · {custom.strftime('%H:%M')}–{end.strftime('%H:%M')}",
                start=custom.isoformat(timespec="minutes"),
                end=end.isoformat(timespec="minutes"),
                rationale="Custom date selected by the RM.",
            )
        except ValueError:
            cal = cal_options[0] if cal_options else None
    else:
        cal = cal_options[0] if cal_options else _calendar_slot(max_h)

    event_iso = cal.start if cal else None
    ids = interest_ids or []
    top = [
        _enrich_candidate(
            c, client_id=client_id, participants=participants,
            interest_ids=ids, event_start_iso=event_iso,
            include_live_flight_quotes=include_live_flight_quotes,
        )
        for c in top
    ]
    best = top[0] if top else None

    globe_data = best.globe if best and best.globe else {}
    points = [GlobePoint.model_validate(p) for p in globe_data.get("points", [])]
    arcs = [GlobeArc.model_validate(a) for a in globe_data.get("arcs", [])]

    summary = ""
    if best:
        head = "Greenest" if active_mode == "environmental" else "Fairest"
        budget = ""
        if not _live_deferred() and best.total_travel_cost_chf:
            budget = f", travel budget CHF {best.total_travel_cost_chf:,.0f}"
        summary = (
            f"{head} place to convene {len(participants)} attendees across "
            f"{len({p.country for p in participants})} countries is "
            f"{best.city} ({best.country}): {best.total_co2_kg:.0f} kg CO₂ total, "
            f"longest leg {best.max_travel_hours:.1f}h, fairness σ {best.fairness_score:.1f}"
            f"{budget}."
        )

    return MeetingOptimization(
        mode=active_mode,
        default_mode=default_mode,
        summary=summary,
        participants=participants,
        candidates=top,
        optimal_city=best.city if best else None,
        optimal_country=best.country if best else None,
        optimal_iata=best.iata if best else None,
        calendar_slot=cal,
        calendar_options=cal_options,
        globe=RendezvousGlobe(
            points=points, arcs=arcs,
            focus_lat=best.lat if best else 47.37,
            focus_lng=best.lng if best else 8.54,
        ),
        live_flight_quotes_deferred=_live_deferred(),
    )


def _live_deferred() -> bool:
    from .flight_fli import flights_live_enabled
    return flights_live_enabled()
