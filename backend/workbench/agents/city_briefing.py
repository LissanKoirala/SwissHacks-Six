"""City briefings for Rendezvous — Wikipedia summary + image + Open-Meteo weather."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import httpx
from pydantic import BaseModel, Field

from .wikipedia_media import wikipedia_page

class CityWeather(BaseModel):
    kind: str = "unknown"  # forecast | climate | unknown
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    temp_typical_c: Optional[float] = None
    precipitation_mm: Optional[float] = None
    label: str = ""
    event_date: Optional[str] = None


class CityBriefing(BaseModel):
    city: str
    country: str
    summary: str = ""
    image_url: Optional[str] = None
    weather: CityWeather = Field(default_factory=CityWeather)
    sources: list[str] = Field(default_factory=list)


def _parse_event_start(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _open_meteo(lat: float, lng: float, event: datetime) -> tuple[CityWeather, bool]:
    today = datetime.now(timezone.utc).date()
    target = event.date()
    diff_days = (target - today).days
    date_str = target.isoformat()

    try:
        with httpx.Client(timeout=10.0) as client:
            if 0 <= diff_days <= 15:
                url = (
                    "https://api.open-meteo.com/v1/forecast?"
                    f"latitude={lat}&longitude={lng}"
                    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode"
                    "&timezone=auto&forecast_days=16"
                )
                data = client.get(url).json()
                daily = data.get("daily") or {}
                times: list[str] = daily.get("time") or []
                if date_str in times:
                    idx = times.index(date_str)
                    tmin = daily["temperature_2m_min"][idx]
                    tmax = daily["temperature_2m_max"][idx]
                    precip = (daily.get("precipitation_sum") or [None])[idx]
                    return CityWeather(
                        kind="forecast",
                        temp_min_c=tmin,
                        temp_max_c=tmax,
                        precipitation_mm=precip,
                        event_date=date_str,
                        label=f"{round(tmin)}–{round(tmax)}°C on {event.strftime('%a %d %b')}",
                    ), True

            url = (
                "https://archive-api.open-meteo.com/v1/archive?"
                f"latitude={lat}&longitude={lng}"
                f"&start_date={event.year - 10}-01-01&end_date={event.year - 1}-12-31"
                "&daily=temperature_2m_mean,precipitation_sum"
                "&timezone=auto"
            )
            data = client.get(url).json()
            daily = data.get("daily") or {}
            times = daily.get("time") or []
            temps = daily.get("temperature_2m_mean") or []
            precips = daily.get("precipitation_sum") or []
            month, day = event.month, event.day
            bucket_t, bucket_p = [], []
            for i, t in enumerate(times):
                try:
                    d = datetime.fromisoformat(t).date()
                except ValueError:
                    continue
                if d.month == month and d.day == day:
                    if i < len(temps) and temps[i] is not None:
                        bucket_t.append(temps[i])
                    if i < len(precips) and precips[i] is not None:
                        bucket_p.append(precips[i])
            if bucket_t:
                avg_t = sum(bucket_t) / len(bucket_t)
                avg_p = sum(bucket_p) / len(bucket_p) if bucket_p else None
                return CityWeather(
                    kind="climate",
                    temp_typical_c=avg_t,
                    precipitation_mm=avg_p,
                    event_date=date_str,
                    label=f"Typical ~{round(avg_t)}°C for {event.strftime('%d %b')} (10-yr avg)",
                ), True
    except Exception:
        pass
    return CityWeather(label="Weather unavailable", event_date=date_str), False


def fetch_city_briefing(
    *,
    city: str,
    country: str,
    lat: float,
    lng: float,
    event_start_iso: Optional[str] = None,
) -> CityBriefing:
    event = _parse_event_start(event_start_iso) or datetime.now(timezone.utc)
    clean_city = city.split("(")[0].strip()
    summary, image_url, wiki_ok = wikipedia_page(clean_city)
    weather, meteo_ok = _open_meteo(lat, lng, event)
    sources: list[str] = []
    if wiki_ok:
        sources.append("Wikipedia")
    if meteo_ok:
        sources.append("Open-Meteo")
    if not summary:
        summary = f"{city}, {country} — a neutral hub for convening dispersed attendees."
    return CityBriefing(
        city=city, country=country, summary=summary, image_url=image_url,
        weather=weather, sources=sources,
    )
