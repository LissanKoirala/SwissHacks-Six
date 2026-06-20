"""Client Digital Twin — pre-mortem on the current proposal (advisory only).

Deterministic core: every persona gets a cited stance read; an objection driver
appears when a swap buys into a value the client avoids; risk-mismatch keys off the
client's mandate drift. No LLM in these tests (offline).
"""
import pytest
from fastapi.testclient import TestClient

from workbench.agents.twin import build_twin
from workbench.api import create_app
from workbench.models import Provenance, SubstitutionMetrics, SwapProposal
from workbench.seed import build_world

client = TestClient(create_app())
CLIENTS = ["schneider", "huber", "raeber", "ammann"]
STANCES = {"receptive", "mixed", "likely_to_object"}


@pytest.fixture
def world():
    return build_world()


@pytest.mark.parametrize("client_id", CLIENTS)
def test_twin_contract(client_id):
    r = client.get(f"/clients/{client_id}/twin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["client_id"] == client_id
    assert body["client_name"]
    assert body["stance"] in STANCES
    assert body["confidence"] in {"low", "medium", "high"}
    assert body["summary"]
    # every driver cites its source (the explanation IS a provenance chain)
    for d in body["drivers"]:
        assert d["provenance"]["source_id"]
        assert d["stance"] in {"supportive", "opposing", "neutral"}
        assert d["kind"]
    # top-level provenance is deduped and non-empty whenever there are drivers
    if body["drivers"]:
        assert body["provenance"]


def test_unknown_client_404():
    assert client.get("/clients/nobody/twin").status_code == 404


def test_each_driver_is_cited(world):
    twin = build_twin(world, "schneider")
    assert twin.drivers
    assert all(d.provenance.source_id for d in twin.drivers)
    # Schneider's values align with his proposal → receptive
    assert twin.stance == "receptive"
    assert any(d.stance == "supportive" for d in twin.drivers)


def test_buying_into_an_avoided_value_triggers_objection(world, monkeypatch):
    """If a swap buys into a tag the client avoids, the twin flags a strong objection."""
    from workbench.agents import twin as twin_mod
    from workbench.agents.orchestrator import get_insights

    insights = get_insights(world, "raeber")
    # Inject a hypothetical swap that buys US mega-cap software — exactly what Räber avoids.
    bad_swap = SwapProposal(
        action="SWAP",
        buy_issuer="Hypothetical AI Co",
        rationale="test",
        substitution=SubstitutionMetrics(
            sector_match=True, sub_asset_class_match=True,
            value_tags_buy=["us-mega-cap-software"], value_tags_sell=[],
        ),
        provenance=[Provenance(source_type="cio_list", source_id="test-swap", excerpt="x")],
    )
    if insights.strategy_proposal is None:
        from workbench.models import StrategyProposal
        insights.strategy_proposal = StrategyProposal(
            client_id="raeber", headline="test", polarity="conflict", swaps=[bad_swap]
        )
    else:
        insights.strategy_proposal.swaps.append(bad_swap)
    monkeypatch.setattr(twin_mod, "get_insights", lambda *a, **k: insights)

    twin = build_twin(world, "raeber")
    objections = [d for d in twin.drivers if d.kind == "value-conflict"]
    assert objections, twin.drivers
    assert objections[0].stance == "opposing"
    assert objections[0].contribution < 0
    assert twin.stance == "likely_to_object"
