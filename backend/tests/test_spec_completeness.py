"""Spec-completeness features: DNA derivation, style-aware drafts, sentiment/draft/substitution
provenance, proactive opportunities, the portfolio audit, and the 24/7 news watch."""
from fastapi.testclient import TestClient

from workbench.api import create_app
from workbench.agents.classifier import to_news_item
from workbench.agents.news_watcher import detect_breaking
from workbench.agents.orchestrator import get_insights
from workbench.ingestion.base import Record
from workbench.seed import build_world

client = TestClient(create_app())


# --- A1: Client DNA is read from the logs, not just transcribed -------------------------------

def test_dna_built_from_logs(world):
    p = world.profiles["schneider"]
    assert p.log_entries_scanned > 0  # the agent actually read the meeting log
    # at least one auto-derived fact (origin="log"), cited to a CRM line
    derived = [s for ss in p.facets.values() for s in ss if s.origin == "log"]
    assert derived, "expected facts auto-extracted from the logs"
    assert all(s.provenance.source_type == "crm_log" for s in derived)
    # curated edges are corroborated by a count of supporting log entries
    assert any(e.log_support > 1 for e in p.interest_edges)


def test_capture_marks_origin():
    # capture-materialised facts/edges are distinguishable from seed/log (own world: mutating)
    from workbench.models import CaptureConfirmRequest, ProposedEdge
    from workbench.agents.capture import confirm_capture
    world = build_world()
    cid = "huber"
    before = len(world.interest_by_client.get(cid, []))
    confirm_capture(world, cid, CaptureConfirmRequest(
        note="Marius wants to fund more reforestation leaders.", modality="File Note",
        edges=[ProposedEdge(topic="esg-deforestation", topic_label="x", facet="interests",
                            polarity="opportunity", rationale="t")],
        facets=[],
    ))
    edges = world.interest_by_client[cid]
    assert len(edges) == before + 1
    assert edges[-1].origin == "capture"


# --- A2 + B2: style-aware drafts that survive offline, with a draft_source citation ------------

def test_dialogue_styled_and_sourced(world):
    s = get_insights(world, "schneider").dialogue_suggestion
    r = get_insights(world, "raeber").dialogue_suggestion
    assert s.draft_source in ("llm", "template")
    # offline the two personas must NOT get an identical generic opener
    assert s.draft_message != r.draft_message


# --- B1/B3: sentiment + substitution provenance ----------------------------------------------

def test_sentiment_carries_source(world):
    assert world.news, "expected seeded news"
    assert all(n.sentiment.source for n in world.news)


def test_substitution_metrics_cited(world):
    # Schneider's Biogen conflict yields a swap with a cited substitution comparison
    sp = get_insights(world, "schneider").strategy_proposal
    swap = next((s for s in sp.swaps if s.substitution), None)
    assert swap is not None
    assert swap.substitution.provenance, "substitution metrics must cite their sources"


# --- A3: proactive opportunity proposals are drift-safe (never a displayed breach) ------------

def test_opportunity_proposals_are_drift_safe(world):
    for cid in world.clients:
        for sp in get_insights(world, cid).additional_proposals:
            if sp.headline.startswith("New opportunity"):
                assert all(sw.drift_safe for sw in sp.swaps)


def test_compromise_alignment_for_averse_client(world):
    # Räber is averse to US-tech/AI but respects tangible hardware — ASML should surface as an
    # acceptable-substitute alignment, not be hidden.
    from workbench.agents.opportunities import build_opportunities
    opps = build_opportunities(world, "raeber", limit=6)
    asml = next((o for o in opps if "ASML" in o["issuer"]), None)
    assert asml and asml["alignment_topics"], "ASML should align as an acceptable substitute"


# --- C: proactive portfolio audit -------------------------------------------------------------

def test_portfolio_audit_flags_standing_conflict():
    r = client.get("/clients/schneider/audit")
    assert r.status_code == 200
    audit = r.json()
    issuers = [v["issuer"] for v in audit["value_conflicts"]]
    assert "Biogen Inc." in issuers  # a values conflict that exists independent of any news
    # every flagged conflict is cited
    assert all(v["provenance"] for v in audit["value_conflicts"])


def test_portfolio_audit_endpoint_shape():
    r = client.get("/clients/ammann/audit")
    assert r.status_code == 200
    a = r.json()
    assert {"value_conflicts", "cio_deviations", "drift_breaches", "total_deviations"} <= a.keys()
    assert "PDD Holdings Inc." in [v["issuer"] for v in a["value_conflicts"]]


# --- D: the 24/7 news watch -------------------------------------------------------------------

def test_news_watch_detects_breaking():
    world = build_world()  # own world: this test appends to world.news
    rec = Record(source_type="news", source_id="news-watch-test", kind="news", excerpt="x",
                 payload={"id": "news-watch-test",
                          "title": "A pharma firm halts its Parkinson research programme",
                          "body": "Defunds neurodegenerative brain disease research.",
                          "sentiment": -0.6, "issuer_name": "TestPharma",
                          "published_at": "2026-06-20", "source": "Test"})
    item = to_news_item(rec)
    world.news.append(item)
    alerts = detect_breaking(world, [item])
    assert any(a["client_id"] == "schneider" and a["polarity"] == "conflict" for a in alerts)


def test_breaking_endpoint():
    r = client.get("/breaking")
    assert r.status_code == 200
    assert "alerts" in r.json()
