"""Flight price estimates for the Rendezvous planner.

Uses Google Flights live fares via ``fli`` when ``USE_LIVE_FLIGHTS=1`` (cached under
``.cache/``). Falls back to calibrated heuristic pricing for offline demos.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from urllib.parse import quote_plus

from pydantic import BaseModel

from .flight_fli import LiveFare, fetch_live_fare, flights_live_enabled, travel_date_str
from .meeting_optimizer import FlightLeg, Participant, TravelMode

CabinClass = Literal["economy", "premium_economy", "business", "first"]
PriceSource = Literal["estimate", "google_flights"]

# CHF per USD for display consistency with the workbook
CHF_PER_USD = 0.92


class FlightQuote(BaseModel):
    participant_id: str
    participant_name: str
    role: str
    from_iata: str
    to_iata: str
    mode: TravelMode
    cabin: CabinClass
    price_chf: float
    price_usd: float
    co2_kg: float
    travel_hours: float
    note: str = ""
    search_url: Optional[str] = None
    price_source: PriceSource = "estimate"


def _google_flights_url(
    from_iata: str,
    to_iata: str,
    *,
    event_start: Optional[datetime] = None,
    cabin: CabinClass = "economy",
) -> str:
    """Deep link to Google Flights for RM verification (not a live fare API)."""
    if from_iata == to_iata:
        return ""
    parts = [f"Flights from {from_iata} to {to_iata}"]
    if event_start:
        parts.append(f"on {event_start.strftime('%Y-%m-%d')}")
    cabin_hint = {
        "economy": "",
        "premium_economy": " premium economy",
        "business": " business class",
        "first": " first class",
    }.get(cabin, "")
    if cabin_hint:
        parts.append(cabin_hint.strip())
    return f"https://www.google.com/travel/flights?q={quote_plus(' '.join(parts))}"


# --- cabin preference (client-centric) ---------------------------------------

_FIRST_CLASS_CLIENTS = {"schneider", "ammann"}
_BUSINESS_CLIENTS = {"raeber", "huber"}
# Huber: comfortable but not ostentatious — premium on long haul only
_PREMIUM_INTERESTS = frozenset({
    "fine_dining", "gala", "art", "discretion", "football", "governance",
})


def client_preferred_cabin(
    client_id: str,
    *,
    interest_ids: Optional[list[str]] = None,
    travel_hours: float = 0,
) -> CabinClass:
    """Pick cabin for the *client* based on persona + interests + leg length."""
    if client_id in _FIRST_CLASS_CLIENTS:
        return "first"
    if client_id == "huber":
        # Long-haul field work — business for comfort; short hops stay green (train/local)
        return "business" if travel_hours >= 6 else "premium_economy"
    if client_id == "raeber":
        return "business"  # understated quality, not flashy first
    ids = set(interest_ids or [])
    if ids & _PREMIUM_INTERESTS and travel_hours >= 4:
        return "first"
    return "business"


def cabin_for_participant(
    client_id: str,
    role: str,
    *,
    interest_ids: Optional[list[str]] = None,
    travel_hours: float = 0,
    mode: TravelMode = "flight",
) -> CabinClass:
    if mode in ("local", "train"):
        return "economy"
    if role == "client":
        return client_preferred_cabin(
            client_id, interest_ids=interest_ids, travel_hours=travel_hours
        )
    client_cabin = client_preferred_cabin(
        client_id, interest_ids=interest_ids, travel_hours=travel_hours
    )
    if role == "rm":
        # RM mirrors client on long haul when client flies premium
        if client_cabin == "first":
            return "business"
        if client_cabin == "business":
            return "business"
        return "economy"
    # family
    if client_cabin == "first":
        return "business"
    if client_cabin == "business":
        return "premium_economy"
    return "economy"


_CABIN_MULT: dict[CabinClass, float] = {
    "economy": 1.0,
    "premium_economy": 1.65,
    "business": 3.8,
    "first": 7.2,
}


def _base_fare_chf(distance_km: float, mode: TravelMode) -> float:
    if mode == "local":
        return 45.0
    if mode == "train":
        return 25.0 + distance_km * 0.32
    if distance_km < 1500:
        return 160.0 + distance_km * 0.11
    if distance_km < 4500:
        return 380.0 + distance_km * 0.09
    return 780.0 + distance_km * 0.075


def _lead_time_multiplier(event_start: Optional[datetime]) -> float:
    if not event_start:
        return 1.0
    days = (event_start - datetime.now(event_start.tzinfo)).total_seconds() / 86400
    if days < 3:
        return 1.18
    if days < 7:
        return 1.08
    if days > 21:
        return 0.94
    return 1.0


def quote_leg(
    leg: FlightLeg,
    participant: Participant,
    client_id: str,
    *,
    interest_ids: Optional[list[str]] = None,
    event_start: Optional[datetime] = None,
    fare_cache: Optional[dict[tuple[str, str, str, CabinClass], Optional[LiveFare]]] = None,
    use_live: Optional[bool] = None,
) -> FlightQuote:
    cabin = cabin_for_participant(
        client_id,
        leg.role,
        interest_ids=interest_ids,
        travel_hours=leg.travel_hours,
        mode=leg.mode,
    )
    base = _base_fare_chf(leg.distance_km, leg.mode)
    mult = _CABIN_MULT[cabin]
    # long-haul first/business premium bump
    if leg.distance_km > 4000 and cabin in ("business", "first"):
        mult *= 1.12
    chf = round(base * mult * _lead_time_multiplier(event_start), 0)
    usd = round(chf / CHF_PER_USD, 0)
    price_source: PriceSource = "estimate"
    note = ""

    if leg.mode == "flight" and (use_live if use_live is not None else flights_live_enabled()):
        date = travel_date_str(event_start)
        cache_key = (leg.from_iata, leg.to_iata, date, cabin)
        live = None
        if fare_cache is not None:
            if cache_key not in fare_cache:
                fare_cache[cache_key] = fetch_live_fare(
                    leg.from_iata, leg.to_iata, travel_date=date, cabin=cabin
                )
            live = fare_cache[cache_key]
        else:
            live = fetch_live_fare(
                leg.from_iata, leg.to_iata, travel_date=date, cabin=cabin
            )
        if live:
            chf = live.price_chf
            usd = live.price_usd
            price_source = "google_flights"
            detail = live.airline
            if live.flight_number:
                detail = f"{detail} {live.flight_number}".strip()
            stop_note = "non-stop" if live.stops == 0 else f"{live.stops} stop(s)"
            note = f"{detail or 'Cheapest'} · {stop_note}."

    if not note:
        if leg.role == "client" and cabin == "first":
            note = "First class — aligned with this client's comfort & profile interests."
        elif leg.role == "client" and cabin == "business":
            note = "Business — balanced comfort without excess."
        elif leg.mode == "train":
            note = "High-speed rail — lower CO₂ than flying this sector."

    return FlightQuote(
        participant_id=leg.participant_id,
        participant_name=leg.participant_name,
        role=leg.role,
        from_iata=leg.from_iata,
        to_iata=leg.to_iata,
        mode=leg.mode,
        cabin=cabin,
        price_chf=chf,
        price_usd=usd,
        co2_kg=leg.co2_kg,
        travel_hours=leg.travel_hours,
        note=note,
        price_source=price_source,
        search_url=_google_flights_url(
            leg.from_iata,
            leg.to_iata,
            event_start=event_start,
            cabin=cabin,
        ) if leg.mode == "flight" else None,
    )


def quote_all_legs(
    legs: list[FlightLeg],
    participants: list[Participant],
    client_id: str,
    *,
    interest_ids: Optional[list[str]] = None,
    event_start: Optional[datetime] = None,
    use_live: Optional[bool] = None,
) -> list[FlightQuote]:
    by_id = {p.id: p for p in participants}
    fare_cache: dict[tuple[str, str, str, CabinClass], Optional[LiveFare]] = {}
    return [
        quote_leg(
            leg, by_id[leg.participant_id], client_id,
            interest_ids=interest_ids, event_start=event_start,
            fare_cache=fare_cache,
            use_live=use_live,
        )
        for leg in legs
        if leg.participant_id in by_id
    ]
