"""Real flight route statistics from DurHack training_data.csv (aggregated per IATA pair)."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Optional

from ..config import DATA_DIR


@lru_cache(maxsize=1)
def _routes() -> dict[str, dict[str, dict]]:
    path = DATA_DIR / "flight_routes.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("routes", {})


def route_stats(from_iata: str, to_iata: str) -> Optional[dict]:
    """Return {distance_km, time_hours, co2_kg, samples} or None if no historical route."""
    o, d = from_iata.upper(), to_iata.upper()
    if o == d:
        return {"distance_km": 0.0, "time_hours": 0.25, "co2_kg": 0.0, "samples": 0}
    direct = _routes().get(o, {}).get(d)
    if direct:
        return direct
    return None
