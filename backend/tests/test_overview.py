"""Overview dashboard contract (OVERVIEW_CONTRACT) over the real app.

The RM's morning landing aggregates across all clients into five grounded sections:
priority tasks, meetings, market moves, portfolio events, and the news wire. Every
card cites a real source; the numbers are internally consistent. Deterministic — no LLM.
"""
from fastapi.testclient import TestClient

from workbench.api import create_app

client = TestClient(create_app())

SEVERITIES = {"high", "med", "low"}
POLARITIES = {"conflict", "opportunity", "neutral"}
KINDS = {"earnings", "filing", "ipo"}


def _overview():
    r = client.get("/overview")
    assert r.status_code == 200, r.text
    return r.json()


def test_overview_shape_and_kpis():
    o = _overview()
    expected = {
        "generated_at", "today", "use_live", "rm_name", "briefing", "kpis",
        "priority_tasks", "meetings", "market_moves", "portfolio_events", "news",
    }
    assert expected <= set(o), o.keys()
    assert o["rm_name"]
    assert o["briefing"]

    k = o["kpis"]
    # KPI counts mirror the section lengths exactly (single source of truth)
    assert k["clients"] == 4
    assert k["priority_tasks"] == len(o["priority_tasks"])
    assert k["meetings_upcoming"] == len(o["meetings"])
    assert k["market_moves"] == len(o["market_moves"])
    assert k["portfolio_events"] == len(o["portfolio_events"])
    assert k["aum_chf"] > 0


def test_priority_tasks_are_grounded_and_sorted():
    o = _overview()
    tasks = o["priority_tasks"]
    assert tasks, "seed data should surface at least one priority task"

    rank = {"high": 0, "med": 1, "low": 2}
    assert [rank[t["severity"]] for t in tasks] == sorted(
        rank[t["severity"]] for t in tasks
    ), "tasks must be urgent-first"

    for t in tasks:
        assert t["severity"] in SEVERITIES
        assert t["polarity"] in POLARITIES
        # conflict is always high; that is the rail the RM acts on first
        if t["polarity"] == "conflict":
            assert t["severity"] == "high"
        assert t["client_name"] and t["reason"] and t["trigger_headline"]
        assert t["suggested_action"]
        assert t["provenance"], "every task must cite its source (CLAUDE.md §2)"


def test_meetings_one_per_client_and_cite_last_meeting():
    o = _overview()
    meetings = o["meetings"]
    assert len(meetings) == 4
    assert {m["client_id"] for m in meetings} == {"schneider", "huber", "raeber", "ammann"}
    today = o["today"]
    for m in meetings:
        assert m["date"] >= today, "next meeting is today or later"
        assert m["agenda"]
        # last-met line is grounded in a real crm_log entry
        if m["last_met"]:
            assert m["provenance"]
            assert m["provenance"][0]["source_type"] == "crm_log"
    # alerted clients are scheduled before the rest
    alerted = {t["client_id"] for t in o["priority_tasks"]}
    if alerted and len(alerted) < 4:
        first_dates = [m["date"] for m in meetings if m["client_id"] in alerted]
        rest_dates = [m["date"] for m in meetings if m["client_id"] not in alerted]
        assert max(first_dates) <= min(rest_dates)


def test_market_moves_are_macro_digests():
    o = _overview()
    for mv in o["market_moves"]:
        assert mv["direction"] in {"up", "down", "flat"}
        assert mv["provenance"]["source_type"] in {"news", "market_digest"}


def test_portfolio_events_cite_real_holdings():
    o = _overview()
    events = o["portfolio_events"]
    assert events
    dates = [e["date"] for e in events]
    assert dates == sorted(dates), "events are date-ascending"
    for e in events:
        assert e["kind"] in KINDS
        assert e["issuer"] and e["isin"]
        assert e["held_by"], "an event must be held by at least one client"
        assert e["provenance"]["source_type"] == "portfolio"


def test_news_wire_polarity_reflects_impact_not_appetite():
    o = _overview()
    by_title = {n["title"]: n for n in o["news"]}
    # the Biogen wind-down is a conflict for Schneider even though he *likes* neuro research
    biogen = next((n for n in o["news"] if "Biogen" in n["title"]), None)
    assert biogen is not None
    refs = {r["client_name"]: r["polarity"] for r in biogen["relevant_clients"]}
    assert any("Schneider" in name for name in refs), refs
    schneider_pol = next(p for name, p in refs.items() if "Schneider" in name)
    assert schneider_pol == "conflict"
    for n in o["news"]:
        assert n["provenance"]["source_type"] == "news"
        assert not n.get("market_digest"), "macro digests belong in market_moves"
