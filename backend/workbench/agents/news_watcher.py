"""24/7 news watch — the News Agent's live tick (DeepDive p.4: "news … is flagged the moment it
breaks"). A background poller re-fetches the live feeds on an interval, classifies the new items
once (shared, §9), and surfaces any that newly match a client as *breaking alerts* — pushing a
notification to opted-in RMs and buffering them for the dashboard.

Design notes:
- **Additive & idempotent.** Only items with an id not already in the world are ingested, so a
  re-poll of the same feed never double-counts. Matching reuses the same set-intersection path as
  the rest of the app — no new per-client model calls.
- **Offline/seed-safe.** With USE_LIVE off there are no live feeds, so a poll is a no-op; the
  static demo and the tests are untouched. The detection core (`detect_breaking`) is pure and
  unit-tested by injecting an item, so the behaviour is verified without live keys.
- **Opt-in.** Gated behind NEWS_WATCH_ENABLED; the scheduler job only starts when asked.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ..config import settings
from ..graph.store import World
from .classifier import to_news_item
from .matcher import match_client

_BREAKING_CAP = 50

# Serialises a watch tick against itself (a scheduled tick vs an on-demand /breaking/poll), so two
# ticks can't both ingest + mutate the shared world at once. The poll is the only writer of news at
# runtime; request handlers only read, and list.append/dict.pop are individually GIL-atomic.
_poll_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def refresh_news(world: World) -> list:
    """Re-fetch the live feeds and ingest any genuinely new items (dedup by id). Returns the new
    NewsItems (already classified). No-op (empty) when live feeds are off."""
    from ..ingestion.news import EventRegistrySource
    from ..ingestion.sec_edgar import SecFilingLiveSource
    from ..ingestion.market_signals import FMPSignalLiveSource
    from ..ingestion.macro import MacroLiveSource

    from ..ingestion.news import RSSFeedSource

    existing = {n.id for n in world.news}
    recs = []
    if settings.news_enabled:
        force = {"force_refresh": True}
        for kw in ("palm oil deforestation", "Parkinson research", "labour supply chain", "AI infrastructure"):
            try:
                recs += EventRegistrySource(kw).fetch(force)
            except Exception:
                pass
    if settings.rss_enabled:
        for url in settings.rss_feed_urls:
            try:
                recs += RSSFeedSource(url).fetch(force)
            except Exception:
                pass
    for live in (SecFilingLiveSource, FMPSignalLiveSource, MacroLiveSource):
        flag = {"SecFilingLiveSource": settings.sec_enabled,
                "FMPSignalLiveSource": settings.fmp_enabled,
                "MacroLiveSource": settings.macro_enabled}[live.__name__]
        if not flag:
            continue
        try:
            recs += live().fetch()
        except Exception:
            pass

    fresh = []
    for r in recs:
        item = to_news_item(r)
        if item.id in existing:
            continue
        existing.add(item.id)
        world.news.append(item)
        fresh.append(item)
    return fresh


def detect_breaking(world: World, new_items: list) -> list[dict]:
    """Given freshly-ingested news, return the breaking alerts: each (client, item) pair where the
    item matches that client's DNA. Pure — the unit-testable core of the watcher."""
    if not new_items:
        return []
    new_ids = {n.id for n in new_items}
    alerts: list[dict] = []
    for cid in world.clients:
        for m in match_client(world, cid):
            if m.news.id not in new_ids:
                continue
            alerts.append({
                "client_id": cid,
                "client_name": world.clients.get(cid, {}).get("name", cid),
                "polarity": m.polarity,
                "headline": m.headline,
                "news_id": m.news.id,
                "news_title": m.news.title,
                "affected_holding": (m.affected_holding.issuer if m.affected_holding else None),
                "detected_at": _now(),
            })
    return alerts


def _push(alert: dict) -> None:
    """Best-effort notification of one breaking alert to opted-in RMs (never raises)."""
    try:
        from ..db import SessionLocal
        from ..db_models import RmUser
        from ..notify import send_sms
    except Exception:
        return
    body = f"⚡ Breaking for {alert['client_name']}: {alert['headline']}"
    db = SessionLocal()
    try:
        for u in db.query(RmUser).filter_by(briefing_enabled=True).all():
            if u.phone_e164:
                try:
                    send_sms(u.phone_e164, body)
                except Exception:
                    pass
    finally:
        db.close()


def poll_once(world: World, *, push: bool = True) -> list[dict]:
    """One watch tick: ingest new live news, detect breaking matches, buffer them (newest first),
    invalidate the affected clients' insights, and push notifications. Returns the new alerts.
    Serialised so concurrent ticks (scheduled + on-demand) can't race the shared world."""
    with _poll_lock:
        fresh = refresh_news(world)
        if fresh:
            # New items can change matches on every client surface — don't serve stale caches.
            world.insights_cache.clear()
            world.twin_cache.clear()
        alerts = detect_breaking(world, fresh)
        if alerts:
            world.breaking[:0] = alerts            # prepend newest
            del world.breaking[_BREAKING_CAP:]     # keep bounded
    # Push outside the lock (network I/O shouldn't block the next tick).
    if push:
        for a in alerts:
            _push(a)
    return alerts


_scheduler = None


def start_news_watch(world: World) -> None:
    """Start the interval poller once per process (guarded; opt-in via NEWS_WATCH_ENABLED)."""
    global _scheduler
    if _scheduler is not None or not settings.news_watch_enabled:
        return
    from apscheduler.schedulers.background import BackgroundScheduler

    sched = BackgroundScheduler()
    sched.add_job(lambda: poll_once(world), "interval",
                  minutes=max(1, settings.news_watch_minutes), id="news-watch",
                  replace_existing=True)
    sched.start()
    _scheduler = sched
