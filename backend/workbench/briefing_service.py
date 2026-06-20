"""Briefing send service (spec §6/§8) — compose + send + idempotent daily log. Shared by the
on-demand test route and the scheduler so both behave identically."""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from .agents.briefing import get_composer
from .agents.overview import build_overview
from .db_models import BriefingLog, RmUser
from .notify import SmsError, send_sms


def compose_for(world) -> str:
    """The SMS text over the (seed) book — also handy as a logged-out preview."""
    return get_composer().compose(build_overview(world))


def send_briefing(db: Session, world, user: RmUser, *, force: bool = False) -> dict:
    """Compose and (if a phone is on file) send the briefing; record one row per day.

    Idempotent: the scheduler skips a user already sent today. `force=True` (the test send)
    always recomposes and resends, updating today's row."""
    today = date.today()
    existing = db.query(BriefingLog).filter_by(user_id=user.id, sent_date=today).one_or_none()
    if existing and existing.status == "sent" and not force:
        return {"ok": True, "skipped": "already sent today", "text": existing.body}

    text = compose_for(world)
    result: dict = {"ok": True, "text": text, "sent": False}
    sid: str | None = None
    status = "composed"

    if user.phone_e164:
        try:
            r = send_sms(user.phone_e164, text)
            sid = r["sid"]
            status = "sent"
            result["sent"] = True
            result["sid"] = sid
        except SmsError as e:
            status = "failed"
            result["error"] = str(e)
    else:
        status = "no_phone"
        result["error"] = "no phone number on file — add one in briefing settings"

    if existing:
        existing.body, existing.twilio_sid, existing.status = text, sid, status
    else:
        db.add(BriefingLog(user_id=user.id, sent_date=today, body=text, twilio_sid=sid, status=status))
    db.commit()
    result["status"] = status
    return result
