"""Briefing composer + send service + auth gating (spec §5–§9).

Deterministic composer (offline), idempotent/graceful send (no Twilio creds in CI), and the
auth gate: /briefing/preview is public, but settings + test-send require a signed-in RM.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from workbench.agents.briefing import DeterministicComposer
from workbench.api import create_app
from workbench.briefing_service import send_briefing
from workbench.db import Base
from workbench.db_models import BriefingLog, RmUser
from workbench.seed import build_world

client = TestClient(create_app())


def test_composer_is_deterministic_and_bounded():
    overview = {
        "briefing": "3 clients need attention first — start with Eugen Räber: US-tech conflict.",
        "priority_tasks": [
            {"client_name": "Eugen Räber", "reason": "US mega-cap tech conflict", "severity": "high"},
            {"client_name": "Marius Huber", "reason": "deforestation opportunity", "severity": "med"},
        ],
        "meetings": [{}, {}, {}],
    }
    c = DeterministicComposer()
    a, b = c.compose(overview), c.compose(overview)
    assert a == b, "composition must be deterministic"
    assert "Eugen Räber" in a
    assert "Marius Huber" in a and "3 meetings" in a
    assert len(a) <= 480


@pytest.fixture
def db():
    eng = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, future=True
    )
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def test_send_is_idempotent_and_degrades_without_twilio(db):
    world = build_world(use_live_news=False)
    user = RmUser(google_sub="sub-1", email="rm@example.com", name="RM Desk")
    db.add(user)
    db.commit()

    # no phone on file → composed, not sent, logged once
    r1 = send_briefing(db, world, user, force=True)
    assert r1["ok"] and r1["text"] and r1["sent"] is False
    assert r1["status"] == "no_phone"
    assert db.query(BriefingLog).filter_by(user_id=user.id, sent_date=date.today()).count() == 1

    # phone set but Twilio unconfigured → graceful failure, still a single (upserted) row
    user.phone_e164 = "+41790000000"
    db.commit()
    r2 = send_briefing(db, world, user, force=True)
    assert r2["status"] == "failed"
    assert "Twilio" in r2.get("error", "")
    assert db.query(BriefingLog).filter_by(user_id=user.id, sent_date=date.today()).count() == 1


def test_preview_is_public_but_settings_require_sign_in():
    r = client.get("/briefing/preview")
    assert r.status_code == 200
    assert r.json()["text"]

    assert client.get("/auth/me").json() is None  # logged-out
    assert client.put("/me/briefing", json={"phone_e164": "+41790000000"}).status_code == 401
    assert client.post("/briefing/send-test").status_code == 401
