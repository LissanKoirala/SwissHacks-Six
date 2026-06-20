"""Live flight fares via Google Flights (``fli`` library — https://github.com/punitarani/fli).

No API key required. Results are cached under ``backend/.cache`` so repeated rendezvous
loads and duplicate legs (same route/cabin/date) do not re-hit Google.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from functools import lru_cache
from typing import Literal, Optional

from pydantic import BaseModel

from ..config import CACHE_DIR, settings

log = logging.getLogger(__name__)

CabinClass = Literal["economy", "premium_economy", "business", "first"]


class LiveFare(BaseModel):
    price_chf: float
    price_usd: float
    stops: int
    duration_minutes: int
    airline: str = ""
    flight_number: str = ""


def _fli_installed() -> bool:
    try:
        import fli  # noqa: F401
        return True
    except ImportError:
        return False


def flights_live_enabled() -> bool:
    return settings.flights_enabled and _fli_installed()


@lru_cache(maxsize=1)
def _seat_types():
    from fli.models import SeatType

    return {
        "economy": SeatType.ECONOMY,
        "premium_economy": SeatType.PREMIUM_ECONOMY,
        "business": SeatType.BUSINESS,
        "first": SeatType.FIRST,
    }


def _airport(iata: str):
    from fli.models import Airport

    code = (iata or "").strip().upper()
    try:
        return Airport[code]
    except KeyError:
        return None


def _cache_path(key: str) -> str:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(key.encode()).hexdigest()[:24]
    return str(CACHE_DIR / f"fli_{digest}.json")


def _read_cache(key: str) -> Optional[LiveFare]:
    path = _cache_path(key)
    try:
        raw = json.loads(open(path, encoding="utf-8").read())
        return LiveFare.model_validate(raw)
    except Exception:
        return None


def _write_cache(key: str, fare: LiveFare) -> None:
    try:
        open(_cache_path(key), "w", encoding="utf-8").write(fare.model_dump_json())
    except Exception as exc:
        log.debug("[fli] cache write failed: %s", exc)


def fetch_live_fare(
    from_iata: str,
    to_iata: str,
    *,
    travel_date: str,
    cabin: CabinClass,
    currency: str = "CHF",
) -> Optional[LiveFare]:
    """Cheapest matching one-way fare for a single leg, or None on failure."""
    if not flights_live_enabled():
        return None
    if from_iata == to_iata:
        return None

    origin = _airport(from_iata)
    dest = _airport(to_iata)
    if origin is None or dest is None:
        log.info("[fli] unknown IATA pair %s→%s", from_iata, to_iata)
        return None

    cache_key = f"{from_iata}|{to_iata}|{travel_date}|{cabin}|{currency}"
    cached = _read_cache(cache_key)
    if cached:
        return cached

    try:
        from fli.models import (
            FlightSearchFilters,
            FlightSegment,
            MaxStops,
            PassengerInfo,
            SortBy,
        )
        from fli.search import SearchFlights

        seat = _seat_types()[cabin]
        filters = FlightSearchFilters(
            passenger_info=PassengerInfo(adults=1),
            flight_segments=[
                FlightSegment(
                    departure_airport=[[origin, 0]],
                    arrival_airport=[[dest, 0]],
                    travel_date=travel_date,
                )
            ],
            seat_type=seat,
            stops=MaxStops.ANY,
            sort_by=SortBy.CHEAPEST,
        )
        results = SearchFlights().search(filters, currency=currency, top_n=1)
        if not results:
            return None
        hit = results[0]
        if getattr(hit, "price_unknown", False) or hit.price is None:
            return None

        chf = float(hit.price)
        usd = round(chf / 0.92, 0)
        leg = hit.legs[0] if hit.legs else None
        fare = LiveFare(
            price_chf=round(chf, 0),
            price_usd=usd,
            stops=int(hit.stops or 0),
            duration_minutes=int(hit.duration or 0),
            airline=str(getattr(leg.airline, "value", leg.airline) if leg else ""),
            flight_number=str(leg.flight_number if leg else ""),
        )
        _write_cache(cache_key, fare)
        return fare
    except Exception as exc:
        log.warning("[fli] search failed %s→%s: %s", from_iata, to_iata, exc)
        return None


def travel_date_str(event_start: Optional[datetime]) -> str:
    if event_start:
        return event_start.strftime("%Y-%m-%d")
    return (datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)).strftime(
        "%Y-%m-%d"
    )
