"""APScheduler morning-briefing job (spec §8). A single in-process scheduler (run uvicorn with
one worker) ticks hourly and texts every enabled RM whose briefing_hour matches the current
hour in the configured timezone. The (user, date) unique log row makes it idempotent."""
from __future__ import annotations

from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from .briefing_service import send_briefing
from .config import settings
from .db import SessionLocal
from .db_models import RmUser

_scheduler: BackgroundScheduler | None = None


def _tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(settings.briefing_tz)
    except Exception:
        return None


def _tick(world, tz) -> None:
    hour = datetime.now(tz).hour
    db = SessionLocal()
    try:
        users = db.query(RmUser).filter_by(briefing_enabled=True).all()
        for u in users:
            if u.briefing_hour == hour and u.phone_e164:
                try:
                    send_briefing(db, world, u, force=False)
                except Exception:  # one bad send must not stop the others
                    pass
    finally:
        db.close()


def start_scheduler(world) -> None:
    """Start the hourly tick once per process (guarded; safe across repeated create_app)."""
    global _scheduler
    if _scheduler is not None or not settings.scheduler_enabled:
        return
    tz = _tz()
    sched = BackgroundScheduler(timezone=tz) if tz else BackgroundScheduler()
    sched.add_job(lambda: _tick(world, tz), "cron", minute=0, id="briefing-tick", replace_existing=True)
    sched.start()
    _scheduler = sched
