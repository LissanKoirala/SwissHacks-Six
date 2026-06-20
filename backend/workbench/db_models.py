"""ORM tables (spec §4): the signed-in relationship manager + a sent-briefing audit log.
No Google tokens are stored (identity-only sign-in)."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class RmUser(Base):
    """A relationship manager, identified by their Google subject id."""

    __tablename__ = "rm_user"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, default="", index=True)
    name: Mapped[str] = mapped_column(String, default="")
    picture: Mapped[str | None] = mapped_column(String, nullable=True)
    phone_e164: Mapped[str | None] = mapped_column(String, nullable=True)
    briefing_hour: Mapped[int] = mapped_column(Integer, default=9)
    briefing_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BriefingLog(Base):
    """One row per sent SMS briefing — audit + once-a-day idempotency."""

    __tablename__ = "briefing_log"
    __table_args__ = (UniqueConstraint("user_id", "sent_date", name="uq_briefing_user_date"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("rm_user.id"), index=True)
    sent_date: Mapped[date] = mapped_column(Date)
    body: Mapped[str] = mapped_column(String, default="")
    twilio_sid: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="sent")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
