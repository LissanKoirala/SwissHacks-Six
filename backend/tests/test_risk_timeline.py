"""Risk Timeline endpoint contract (RISK_TIMELINE_CONTRACT §2) over the real app.

For each of the four personas: the timeline replays the meeting log chronologically,
scores risk appetite in [0.05, 0.95], starts at the mandate baseline, cites every
point, and tracks mandate fit. Deterministic — no LLM."""
import pytest
from fastapi.testclient import TestClient

from workbench.agents.risk_timeline import _DELTA_CAP
from workbench.api import create_app

client = TestClient(create_app())

CLIENTS = ["schneider", "huber", "raeber", "ammann"]
BASELINE = {"Defensive": 0.30, "Balanced": 0.55, "Growth": 0.78}
FITS = {"aligned", "cautious-drift", "risk-on-drift"}
DIRECTIONS = {"up", "down", "flat"}


@pytest.mark.parametrize("client_id", CLIENTS)
def test_risk_timeline_contract(client_id):
    r = client.get(f"/clients/{client_id}/risk-timeline")
    assert r.status_code == 200, r.text
    body = r.json()

    # top-level shape
    expected_keys = {
        "client_id", "client_name", "mandate", "baseline", "band", "bands",
        "start_date", "end_date", "points", "milestones", "current",
    }
    assert expected_keys <= set(body), body.keys()
    assert body["client_id"] == client_id
    assert body["client_name"]
    assert body["mandate"] in BASELINE

    # baseline matches the mandate baseline
    baseline = BASELINE[body["mandate"]]
    assert body["baseline"] == pytest.approx(baseline)

    # band derives from the baseline (± 0.12)
    band = body["band"]
    assert band["label"] == body["mandate"]
    assert band["lo"] == pytest.approx(round(baseline - 0.12, 3))
    assert band["hi"] == pytest.approx(round(baseline + 0.12, 3))

    # three fixed visual bands
    assert [b["id"] for b in body["bands"]] == ["defensive", "balanced", "growth"]

    points = body["points"]
    assert points, "points must be non-empty"

    # date-ascending
    dates = [p["date"] for p in points]
    assert dates == sorted(dates), "points must be date-ascending"
    assert body["start_date"] == dates[0]
    assert body["end_date"] == dates[-1]

    for p in points:
        # every score in range
        assert 0.05 <= p["risk_score"] <= 0.95, p
        # delta clamped to the per-entry cap
        assert -_DELTA_CAP <= p["delta"] <= _DELTA_CAP, p
        assert p["direction"] in DIRECTIONS
        assert p["mandate_fit"] in FITS
        assert isinstance(p["risk_relevant"], bool)
        assert isinstance(p["signals"], list)
        assert p["risk_relevant"] == bool(p["signals"])
        # mandate_gap is score - baseline
        assert p["mandate_gap"] == pytest.approx(round(p["risk_score"] - baseline, 3))
        # accrual counts are non-negative ints
        assert p["edges_known"] >= 0
        assert p["facets_known"] >= 0
        assert isinstance(p["facet_changes"], list)
        # short excerpt
        assert len(p["note_excerpt"]) <= 170
        # every point cites its own source Provenance (round-trips as a dict)
        prov = p["provenance"]
        assert prov["source_type"] == "crm_log"
        assert prov["excerpt"]

    # first point: baseline ± its own first delta, clamped to the score band
    first = points[0]
    assert first["risk_score"] == pytest.approx(
        round(min(0.95, max(0.05, baseline + first["delta"])), 3)
    )

    # at least one risk-relevant point (the lexicon fires somewhere in 3 years of logs)
    assert any(p["risk_relevant"] for p in points)

    # current == the last point
    assert body["current"] == points[-1]

    # milestones reference real points and the first is a 'start'
    point_ids = {p["id"] for p in points}
    assert body["milestones"], "expected at least the start milestone"
    assert all(m["point_id"] in point_ids for m in body["milestones"])
    assert any(m["kind"] == "start" for m in body["milestones"])
    for m in body["milestones"]:
        assert m["kind"] in {"start", "spike", "crossing"}
        assert m["label"]


def test_unknown_client_404():
    assert client.get("/clients/nobody/risk-timeline").status_code == 404


def test_strong_terms_swing_harder_than_mild():
    """A strong conviction word (bullish/bearish) moves the line ~2x a mild one."""
    from workbench.agents.risk_timeline import score_note

    mild_up = score_note("Happy to add to the position.")["delta"]
    strong_up = score_note("He is very bullish.")["delta"]
    assert strong_up > mild_up > 0

    mild_down = score_note("He wants to be careful.")["delta"]
    strong_down = score_note("He has turned bearish.")["delta"]
    assert strong_down < mild_down < 0

    # the strong cue roughly doubles the mild one
    assert abs(strong_up) > 1.8 * abs(mild_up)
    assert abs(strong_down) > 1.8 * abs(mild_down)


def test_signal_weight_picks_strong_tier():
    from workbench.agents.risk_timeline import signal_weight

    assert abs(signal_weight("very bullish on tech", "up")) > abs(signal_weight("add a little", "up"))
    assert abs(signal_weight("bearish, wants out", "down")) > abs(signal_weight("a touch cautious", "down"))
