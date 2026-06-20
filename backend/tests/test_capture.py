"""RM Capture builder + endpoint contract (CAPTURE_CONTRACT §2).

The RM stages a multimodal note (extract = read-only), reviews, then confirms
(the only mutation): the immutable meeting_log gains one appended entry and the
RM-kept interest edges / facets materialise into the live profile, each citing the
new entry's provenance. Deterministic — no LLM.

Persistence is redirected to a tmp path so these tests never write the repo's
git-ignored `data/captured_entries.json`.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from workbench.agents import capture
from workbench.api import create_app
from workbench.models import CaptureConfirmRequest, CaptureExtractRequest
from workbench.seed import build_world

# A Schneider note that fires: topic (Parkinson's → neuro-research),
# opportunity polarity (fund), risk lexicon (protect → de-risk).
SCHNEIDER_NOTE = (
    "Hubertus wants to fund Parkinson's research and protect the endowment's "
    "long-term capital."
)


@pytest.fixture(autouse=True)
def _isolated_store(tmp_path, monkeypatch):
    """Redirect the write-through store to a tmp file for every test."""
    monkeypatch.setattr(capture, "CAPTURED_PATH", tmp_path / "captured_entries.json")
    yield


@pytest.fixture
def fresh_world():
    """A fresh world per test — confirm mutates, so we never share the session world."""
    return build_world()


# --- extract (read-only) ----------------------------------------------------

def test_extract_detects_topic_polarity_and_risk(fresh_world):
    req = CaptureExtractRequest(note=SCHNEIDER_NOTE, modality="Lunch", contact="Hubertus Schneider")
    draft = capture.extract_draft(fresh_world, "schneider", req)

    topics = {t["topic"] for t in draft["detected_topics"]}
    assert "neuro-research" in topics

    edge = next(e for e in draft["proposed_edges"] if e["topic"] == "neuro-research")
    assert edge["polarity"] == "opportunity"
    assert edge["selected"] is True
    assert edge["rationale"]

    # risk preview is non-empty and 'protect' nudges risk down
    rp = draft["risk_preview"]
    assert rp["signals"], rp
    assert rp["direction"] == "down"
    assert rp["delta"] < 0

    # modality glyph + normalised note + predicted id
    assert draft["modality_icon"] == "🍽️"
    assert draft["note"] == SCHNEIDER_NOTE
    assert draft["preview_entry_id"].startswith("schneider#")

    # proposed facets are concise leading sentence(s)
    assert draft["proposed_facets"]
    assert all(f["selected"] for f in draft["proposed_facets"])


def test_extract_is_read_only(fresh_world):
    before_logs = len(fresh_world.meeting_logs["schneider"])
    before_edges = len(fresh_world.interest_by_client["schneider"])
    capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=SCHNEIDER_NOTE)
    )
    assert len(fresh_world.meeting_logs["schneider"]) == before_logs
    assert len(fresh_world.interest_by_client["schneider"]) == before_edges


def test_extract_defaults_blank_date_to_today(fresh_world):
    from datetime import date as _date

    draft = capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=SCHNEIDER_NOTE, date="")
    )
    assert draft["date"] == _date.today().isoformat()


# --- confirm (the only mutation) --------------------------------------------

def test_confirm_grows_log_and_materialises_edge(fresh_world):
    draft = capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=SCHNEIDER_NOTE, modality="Lunch")
    )
    before = len(fresh_world.meeting_logs["schneider"])
    before_edges = len(fresh_world.interest_by_client["schneider"])

    req = CaptureConfirmRequest(
        note=draft["note"],
        modality=draft["modality"],
        contact=draft["contact"],
        date=draft["date"],
        edges=draft["proposed_edges"],
        facets=draft["proposed_facets"],
    )
    res = capture.confirm_capture(fresh_world, "schneider", req)

    assert res["ok"] is True
    assert res["entry_id"] == draft["preview_entry_id"]
    assert res["applied"]["edges"] >= 1
    assert res["log_count"] == before + 1

    # log grew by exactly one
    assert len(fresh_world.meeting_logs["schneider"]) == before + 1

    # a materialised interest edge appears in both stores, citing the new entry
    edges = fresh_world.interest_by_client["schneider"]
    assert len(edges) == before_edges + res["applied"]["edges"]
    new_edge = next(e for e in edges if e.topic == "neuro-research" and e.provenance.source_id == res["entry_id"])
    assert new_edge.provenance.source_type == "crm_log"
    assert new_edge.provenance.timestamp == draft["date"]
    # mirrored into the profile's interest_edges
    assert any(
        e.provenance.source_id == res["entry_id"]
        for e in fresh_world.profiles["schneider"].interest_edges
    )

    # insights cache was invalidated for this client
    assert "schneider" not in fresh_world.insights_cache


def test_confirmed_entry_is_immutable(fresh_world):
    req = CaptureConfirmRequest(
        note=SCHNEIDER_NOTE,
        modality="Lunch",
        contact="Hubertus Schneider",
        date="2026-06-20",
        edges=[],
        facets=[],
    )
    res = capture.confirm_capture(fresh_world, "schneider", req)
    entry = fresh_world.meeting_logs["schneider"][-1]
    eid, etext = entry.id, entry.note

    # append another entry — the prior one is untouched (append-only / immutable)
    capture.confirm_capture(
        fresh_world,
        "schneider",
        CaptureConfirmRequest(note="A later unrelated note.", modality="Email", date="2026-06-21"),
    )
    again = next(e for e in fresh_world.meeting_logs["schneider"] if e.id == eid)
    assert again.id == eid          # id stable on re-read
    assert again.note == etext      # text unchanged
    assert res["entry_id"] == eid


def test_confirm_drops_unknown_topic(fresh_world):
    before = len(fresh_world.interest_by_client["schneider"])
    req = CaptureConfirmRequest(
        note=SCHNEIDER_NOTE,
        modality="File Note",
        edges=[
            {"topic": "not-a-real-topic", "topic_label": "Bogus", "facet": "interests",
             "polarity": "neutral", "rationale": "x", "selected": True},
        ],
    )
    res = capture.confirm_capture(fresh_world, "schneider", req)
    assert res["applied"]["edges"] == 0
    assert len(fresh_world.interest_by_client["schneider"]) == before


# --- endpoint: /log includes the confirmed entry ----------------------------

def test_log_endpoint_includes_new_entry():
    app = create_app()
    world = app.state.world
    client = TestClient(app)

    before = client.get("/clients/schneider/log").json()
    n_before = len(before)

    req = CaptureConfirmRequest(
        note=SCHNEIDER_NOTE,
        modality="Lunch",
        contact="Hubertus Schneider",
        date="2026-06-20",
        edges=[],
        facets=[],
    )
    res = capture.confirm_capture(world, "schneider", req)

    after = client.get("/clients/schneider/log").json()
    assert len(after) == n_before + 1
    ids = {e["id"] for e in after}
    assert res["entry_id"] in ids
    appended = next(e for e in after if e["id"] == res["entry_id"])
    assert appended["note"] == SCHNEIDER_NOTE
    assert appended["source"]["source_type"] == "crm_log"


# --- LLM-backed extraction (mocked) -----------------------------------------

# A paraphrased note that hits NONE of the keyword/risk lexicons, so the
# deterministic path finds nothing — only the LLM should surface signals.
PARAPHRASED_NOTE = (
    "Hubertus mentioned over coffee that he is keen to channel money toward "
    "brain-illness studies and prefers to keep the family nest egg well shielded."
)

_LLM_RESPONSE = {
    "topics": [
        {
            "topic": "neuro-research",
            "facet": "interests",
            "polarity": "opportunity",
            "rationale": "Keen to fund brain-illness studies.",
        },
        {"topic": "not-a-real-topic", "facet": "interests", "polarity": "neutral", "rationale": "x"},
    ],
    "facets": [
        {"facet": "personality", "text": "Wants the family capital kept well protected."},
    ],
    "risk_signals": [
        {"term": "keep the nest egg shielded", "direction": "down"},
        {"term": "", "direction": "down"},  # dropped — empty term
    ],
}


@pytest.fixture
def _llm_on(monkeypatch):
    """Force the LLM path on with a canned structured response."""
    monkeypatch.setattr(capture, "llm_available", lambda: True)
    monkeypatch.setattr(capture, "chat_json", lambda *a, **k: dict(_LLM_RESPONSE))


def test_keyword_path_handles_paraphrased_note(fresh_world):
    """The broadened deterministic path now maps a paraphrase (no LLM): 'brain-illness'
    → neuro-research, and 'nest egg' / 'shielded' → a de-risk signal."""
    draft = capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=PARAPHRASED_NOTE)
    )
    assert "neuro-research" in {t["topic"] for t in draft["detected_topics"]}
    assert draft["risk_preview"]["direction"] == "down"
    # facets are still produced, so the note always develops the profile
    assert draft["proposed_facets"]


def test_llm_extract_surfaces_topic_facet_and_risk(_llm_on, fresh_world):
    draft = capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=PARAPHRASED_NOTE)
    )
    # topic mapped despite no keyword; unknown topic dropped
    assert {t["topic"] for t in draft["detected_topics"]} == {"neuro-research"}
    edge = draft["proposed_edges"][0]
    assert edge["topic"] == "neuro-research" and edge["polarity"] == "opportunity"
    # facet captured
    assert any(f["facet"] == "personality" for f in draft["proposed_facets"])
    # risk surfaced (down), empty-term signal dropped
    rp = draft["risk_preview"]
    assert rp["direction"] == "down" and rp["delta"] < 0
    assert [s["term"] for s in rp["signals"]] == ["keep the nest egg shielded"]


def test_llm_risk_signals_flow_into_timeline(_llm_on, fresh_world):
    from workbench.agents.risk_timeline import build_risk_timeline

    draft = capture.extract_draft(
        fresh_world, "schneider", CaptureExtractRequest(note=PARAPHRASED_NOTE, date="2026-06-20")
    )
    res = capture.confirm_capture(
        fresh_world,
        "schneider",
        CaptureConfirmRequest(
            note=draft["note"],
            modality=draft["modality"],
            date=draft["date"],
            edges=draft["proposed_edges"],
            facets=draft["proposed_facets"],
            risk_signals=draft["risk_preview"]["signals"],
        ),
    )

    # the stored entry carries the analysis's risk cues
    entry = next(e for e in fresh_world.meeting_logs["schneider"] if e.id == res["entry_id"])
    assert [s.term for s in entry.risk_signals] == ["keep the nest egg shielded"]

    # the timeline point for this note registers a de-risking move (not a flat 0)
    timeline = build_risk_timeline(fresh_world, "schneider")
    point = next(p for p in timeline["points"] if p["id"] == res["entry_id"])
    assert point["risk_relevant"] is True
    assert point["direction"] == "down" and point["delta"] < 0


# --- importance (per-edge / per-facet weight) -------------------------------

def test_confirm_applies_importance_weight(fresh_world):
    req = CaptureConfirmRequest(
        note=SCHNEIDER_NOTE,
        modality="Lunch",
        date="2026-06-20",
        edges=[
            {"topic": "neuro-research", "topic_label": "Neuro", "facet": "interests",
             "polarity": "opportunity", "rationale": "x", "selected": True, "weight": 3.0},
        ],
        facets=[
            {"facet": "personality", "text": "Deeply committed to the cause.",
             "selected": True, "weight": 2.5},
        ],
    )
    res = capture.confirm_capture(fresh_world, "schneider", req)

    edge = next(
        e for e in fresh_world.interest_by_client["schneider"]
        if e.topic == "neuro-research" and e.provenance.source_id == res["entry_id"]
    )
    assert edge.weight == 3.0

    stmt = next(
        s for s in fresh_world.profiles["schneider"].facets["personality"]
        if s.provenance.source_id == res["entry_id"]
    )
    assert stmt.weight == 2.5


def test_confirm_clamps_out_of_range_weight(fresh_world):
    req = CaptureConfirmRequest(
        note=SCHNEIDER_NOTE,
        modality="File Note",
        edges=[
            {"topic": "neuro-research", "topic_label": "Neuro", "facet": "interests",
             "polarity": "opportunity", "rationale": "x", "selected": True, "weight": 999.0},
        ],
    )
    res = capture.confirm_capture(fresh_world, "schneider", req)
    edge = next(
        e for e in fresh_world.interest_by_client["schneider"]
        if e.provenance.source_id == res["entry_id"]
    )
    assert edge.weight == 4.0  # clamped to _WEIGHT_HI


# --- conversational follow-ups ----------------------------------------------

def test_followup_walks_guided_quest_offline(fresh_world):
    """With no LLM, the interview walks the guided quest list and finishes."""
    asked: list[str] = []
    first = capture.next_followup(fresh_world, "schneider", "", asked)
    assert first["id"] == "opener" and first["done"] is False and first["question"]

    # walk to exhaustion; every question is non-empty and ids don't repeat
    guard = 0
    while not (step := capture.next_followup(fresh_world, "schneider", "note", asked))["done"]:
        assert step["question"]
        assert step["id"] not in asked
        asked.append(step["id"])
        guard += 1
        assert guard < 20
    # the final step is flagged done
    assert step["done"] is True


def test_followup_uses_llm_when_available(_llm_on, monkeypatch, fresh_world):
    monkeypatch.setattr(
        capture, "chat_json", lambda *a, **k: {"question": "How is his health?", "done": False}
    )
    step = capture.next_followup(fresh_world, "schneider", "We discussed the foundation.", [])
    assert step["source"] == "llm"
    assert step["question"] == "How is his health?"


# --- persistence stays out of the repo --------------------------------------

def test_confirm_writes_to_tmp_store_not_repo(fresh_world):
    """confirm write-through lands in the monkeypatched tmp path (not the repo)."""
    assert str(capture.CAPTURED_PATH).startswith(str(Path(capture.CAPTURED_PATH).parent))
    capture.confirm_capture(
        fresh_world, "schneider", CaptureConfirmRequest(note=SCHNEIDER_NOTE, modality="Email")
    )
    assert capture.CAPTURED_PATH.exists()
    import json

    records = json.loads(capture.CAPTURED_PATH.read_text())
    assert isinstance(records, list) and len(records) == 1
    assert records[0]["client_id"] == "schneider"
