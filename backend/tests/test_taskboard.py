"""The Front Door: email/news → kanban board → agentic execution → RM sign-off.

Covers the contract end to end, deterministically (USE_LIVE=0): inbound email is routed + mined
into tasks, the news/risk watch is selective, the agent attempts each task and parks a draft, and
the RM sign-off gate moves it to done. Golden rule §2 (advisory only) is asserted: nothing is sent
or traded; the agent only drafts.

Persistence is redirected to a tmp path (conftest) so these tests never touch the repo store.
"""
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from workbench import taskboard
from workbench.agents import email_triage, news_watch
from workbench.api import create_app
from workbench.config import settings
from workbench.models import EmailMessage, Provenance
from workbench.seed import build_world


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch):
    monkeypatch.setattr(taskboard, "TASKS_PATH", Path(tempfile.mkdtemp()) / "tasks.json")
    yield


@pytest.fixture
def fresh_world():
    return build_world()


# --- routing + triage -------------------------------------------------------

def test_route_email_by_explicit_hint(fresh_world):
    msg = EmailMessage(id="e1", client_id="huber", subject="hi", body="hello",
                       provenance=Provenance(source_type="crm_log", source_id="email:e1", excerpt="hi"))
    assert email_triage.route_email(fresh_world, msg) == "huber"


def test_route_email_by_surname(fresh_world):
    msg = EmailMessage(id="e2", from_name="Eugen Räber", from_email="e@x.example",
                       subject="markets", body="thoughts?",
                       provenance=Provenance(source_type="crm_log", source_id="email:e2", excerpt="x"))
    assert email_triage.route_email(fresh_world, msg) == "raeber"


def test_unroutable_email_returns_none(fresh_world):
    msg = EmailMessage(id="e3", from_name="Stranger", from_email="s@x.example",
                       subject="hi", body="no client here",
                       provenance=Provenance(source_type="crm_log", source_id="email:e3", excerpt="x"))
    assert email_triage.route_email(fresh_world, msg) is None


@pytest.mark.parametrize("body,expected_kind", [
    ("Can you move me out of Biogen into something committed?", "investment_review"),
    ("I'd like a full research deep-dive across all my tech names.", "research"),
    ("Could we schedule a quarterly review meeting next week?", "schedule"),
    ("Please send me the latest portfolio statement.", "document"),
    ("What does this mean? Could you reassure me?", "email_reply"),
])
def test_intent_classification(fresh_world, body, expected_kind):
    msg = EmailMessage(id="k", client_id="schneider", subject="", body=body,
                       provenance=Provenance(source_type="crm_log", source_id="email:k", excerpt="x"))
    drafts = email_triage.extract_tasks(fresh_world, msg, use_llm=False)
    assert drafts[0]["kind"] == expected_kind


def test_negated_invest_is_not_a_trade_request(fresh_world):
    """'please don't move me into AI' is a reassurance ask, not an investment_review."""
    msg = EmailMessage(id="neg", client_id="raeber", subject="markets jittery",
                       body="Please don't move me into anything speculative; reassure me.",
                       provenance=Provenance(source_type="crm_log", source_id="email:neg", excerpt="x"))
    drafts = email_triage.extract_tasks(fresh_world, msg, use_llm=False)
    assert drafts[0]["kind"] == "email_reply"


# --- bootstrap: the board fills itself --------------------------------------

def test_bootstrap_populates_board_from_both_doors(fresh_world):
    assert len(fresh_world.tasks) >= 8
    sources = {t.source for t in fresh_world.tasks}
    assert "email" in sources and "news" in sources
    # every bootstrapped task was attempted by the agent (has an artifact + status moved off backlog)
    for t in fresh_world.tasks:
        assert t.status in ("review", "started")
        assert t.artifact is not None


def test_inbox_is_triaged(fresh_world):
    assert len(fresh_world.inbox) >= 6
    # at least the four personas are represented among routed mail
    routed = {e.client_id for e in fresh_world.inbox if e.client_id}
    assert {"schneider", "huber", "raeber", "ammann"} <= routed


# --- the agent attempts tasks ----------------------------------------------

def test_investment_task_reuses_advisory_engine(fresh_world):
    """A conflict on a held name yields a same-sector SWAP draft inside the rails."""
    t = next(x for x in fresh_world.tasks
             if x.source == "news" and x.client_id == "ammann")
    assert t.artifact.strategy_proposal is not None
    swaps = t.artifact.strategy_proposal.swaps
    assert swaps and swaps[0].action in ("SWAP", "DIVEST")
    # cited — nothing surfaces without provenance (§7.5)
    assert t.artifact.provenance


def test_research_task_is_complex_and_left_started(fresh_world):
    research = [x for x in fresh_world.tasks if x.kind == "research"]
    assert research
    for t in research:
        assert t.complex is True
        assert t.status == "started"


def test_email_reply_produces_draft_not_sent(fresh_world):
    t = next(x for x in fresh_world.tasks if x.kind == "email_reply" and x.client_id == "raeber")
    assert t.status == "review"
    assert t.artifact.draft_email is not None
    assert t.artifact.draft_email.body  # a real draft, parked for the RM


# --- selectivity of the news watch -----------------------------------------

def test_news_watch_is_selective(fresh_world):
    drafts = news_watch.scan(fresh_world)
    # only material signals (held conflicts / strong opportunities), one per distinct trigger
    assert 1 <= len(drafts) <= 5
    for d in drafts:
        assert d["priority"] in ("high", "medium")


def test_news_watch_is_idempotent(fresh_world):
    before = len(fresh_world.tasks)
    again = taskboard.ingest_news(fresh_world)
    assert again == []  # dedup keys prevent re-creating the same signal
    assert len(fresh_world.tasks) == before


# --- API contract -----------------------------------------------------------

def test_api_board_endpoints():
    client = TestClient(create_app())

    all_tasks = client.get("/tasks").json()
    assert isinstance(all_tasks, list) and all_tasks

    # per-client filter
    amm = client.get("/tasks", params={"client_id": "ammann"}).json()
    assert amm and all(t["client_id"] == "ammann" for t in amm)

    # inbox feed
    inbox = client.get("/inbox").json()
    assert inbox and any(e["client_id"] for e in inbox)


def test_api_manual_create_executes_and_signoff_gate():
    client = TestClient(create_app())

    created = client.post("/tasks", json={
        "title": "Draft a reply to Schneider about fees",
        "detail": "Could you explain the fee schedule?",
        "client_id": "schneider", "kind": "email_reply", "priority": "medium",
    }).json()
    tid = created["id"]
    # the agent attempted it on create → a draft parked for sign-off
    assert created["status"] == "review"
    assert created["artifact"]["draft_email"]["body"]

    # RM sign-off gate (advisory only — records approval, does not send)
    done = client.post(f"/tasks/{tid}/signoff", json={"rm_name": "Anna"}).json()
    assert done["status"] == "done"
    assert done["signed_off_by"] == "Anna"


def test_api_patch_moves_card_and_dismiss():
    client = TestClient(create_app())
    tid = client.get("/tasks").json()[0]["id"]

    moved = client.patch(f"/tasks/{tid}", json={"status": "backlog"}).json()
    assert moved["status"] == "backlog"

    dismissed = client.post(f"/tasks/{tid}/dismiss").json()
    assert dismissed["status"] == "dismissed"


def test_api_ingest_email_is_idempotent():
    client = TestClient(create_app())
    first = client.post("/ingest/email", json={}).json()
    # board already bootstrapped from the same fixtures → re-scan creates nothing new
    assert first["count"] == 0


def test_api_drop_in_raw_email_creates_task():
    client = TestClient(create_app())
    raw = {
        "id": "drop-in-1",
        "from_name": "Marius Huber",
        "from_email": "marius@x.example",
        "subject": "Increase my Unilever position please",
        "body": "I'd like to increase my position in Unilever within my mandate.",
        "provenance": {"source_type": "crm_log", "source_id": "email:drop-in-1", "excerpt": "x"},
    }
    out = client.post("/ingest/email", json={"raw_email": raw}).json()
    assert out["count"] == 1
    t = out["created"][0]
    assert t["client_id"] == "huber"
    assert t["kind"] == "investment_review"


# --- instant push (Gmail watch → Pub/Sub → /gmail/push) ---------------------
# Gmail itself can't run offline, so we mock the history sync to return one new message and assert
# the webhook ingests it into a task. This is exactly the path that runs when deployed.

def test_gmail_push_webhook_ingests(monkeypatch):
    from workbench.ingestion import gmail_push

    def _fake_sync():
        return [EmailMessage(
            id="gmail:abc123", from_name="Mr Schneider", from_email="s@example.com",
            subject="[workbench] sell my pharma position",
            body="Please get me out of that pharma name today.",
            provenance=Provenance(source_type="crm_log", source_id="email:gmail:abc123", excerpt="x"),
        )]

    monkeypatch.setattr(gmail_push, "sync_new_messages", _fake_sync)
    client = TestClient(create_app())

    # a Pub/Sub push envelope (contents are ignored — we sync off our stored historyId)
    envelope = {"message": {"data": "", "messageId": "1"}, "subscription": "x"}
    out = client.post("/gmail/push", json=envelope).json()
    assert out["ok"] and out["ingested"] == 1 and out["tasks_created"] == 1

    # the message became a real task on the board
    tasks = client.get("/tasks").json()
    assert any(t["kind"] == "investment_review" and "pharma" in t["title"].lower() for t in tasks)


def test_gmail_push_webhook_rejects_bad_token(monkeypatch):
    monkeypatch.setattr(settings, "gmail_push_token", "s3cret")
    client = TestClient(create_app())
    # no token → 403; correct token would pass through to the (no-op) sync
    assert client.post("/gmail/push?token=wrong", json={}).status_code == 403
    assert client.post("/gmail/push?token=s3cret", json={}).status_code == 200
