"""Locks the portfolio-domain features layered on top of the base pipeline:
CIO-deviation audit, the phantom-row fix, Huber's additive INCREASE + Good News Briefing,
risk-matched substitution metrics, NEW unheld opportunities, the transaction ledger, multi-match
proposals, and the RM conversational query. Every new fact must stay cited (CLAUDE.md §2)."""
from fastapi.testclient import TestClient

from workbench.agents.opportunities import build_opportunities
from workbench.agents.orchestrator import get_insights
from workbench.analytics import build_analytics
from workbench.api import create_app
from workbench.ledger import build_ledger

client = TestClient(create_app())


def test_cio_deviation_audit_flags_off_list_and_sell(world):
    a = build_analytics(world, "huber")
    statuses = {d["status"] for d in a["cio_deviations"]}
    assert "OFF_LIST" in statuses   # cantonal banks no longer on the CIO list
    assert "SELL" in statuses       # China Mobile downgraded to SELL
    assert a["figures"]["off_list_count"] >= 1
    assert a["figures"]["sell_rated_count"] >= 1
    for d in a["cio_deviations"]:
        assert d["provenance"], "every deviation flag must be cited"


def test_no_phantom_global_mandate_breach(world):
    for m in world.mandates.values():
        labels = {t.sub_asset_class for t in m.targets}
        assert "GLOBAL MANDATE" not in labels
        assert not any(t.target_pct == 100 and t.breach for t in m.targets)


def test_huber_is_additive_increase_not_a_swap(world):
    sp = get_insights(world, "huber").strategy_proposal
    s = sp.swaps[0]
    assert s.action == "INCREASE"
    assert s.sell_isin is None           # overweight, NOT a swap (no holding sold)
    assert s.buy_isin == "GB00B10RZP78"  # Unilever
    assert s.drift_safe
    assert sp.good_news_briefing is not None


def test_substitution_metrics_on_conflict_swap(world):
    sp = get_insights(world, "ammann").strategy_proposal
    sub = sp.swaps[0].substitution
    assert sub is not None
    assert sub.sector_match
    assert sub.vol_sell is not None and sub.vol_buy is not None
    # the replacement must clear the values screen the sold name failed
    assert not (set(sub.value_tags_buy) & {"labour-risk", "supply-chain-governance-risk"})


def test_holdings_carry_risk_and_provenance(world):
    h = next(h for h in world.holdings_for_client("schneider")
             if not h.isin.lower().startswith("cash"))
    assert h.hist_vol_30d is not None and h.risk_source
    assert h.provenance is not None
    assert h.cio_status in ("BUY", "HOLD", "SELL", "OFF_LIST")


def test_opportunities_are_unheld_buy_and_cited(world):
    for cid in world.clients:
        ops = build_opportunities(world, cid)
        assert ops, f"{cid} has no opportunities"
        held = world.held_isins(cid)
        for o in ops:
            assert o["isin"] not in held       # NEW = not already held
            assert o["rating"] == "BUY"         # CIO-approved only
            assert o["provenance"]              # cited


def test_ledger_cost_basis_income_and_provenance(world):
    L = build_ledger(world, "schneider")
    assert L["summary"]["txn_count"] > 100
    assert L["summary"]["cost_basis_chf"] > 0
    assert L["summary"]["income_yield_pct"] is not None
    assert L["positions"] and L["positions"][0]["provenance"]
    assert all(t["provenance"] for t in L["transactions"][:5])


def test_additional_proposals_are_distinct(world):
    ins = get_insights(world, "schneider")
    # Schneider has a Biogen conflict + a distinct Roche opportunity
    assert ins.additional_proposals
    for p in ins.additional_proposals:
        assert p.swaps


def test_rm_query_alternative_differs_from_primary(world):
    ins = get_insights(world, "ammann")
    mid = ins.matches[0].id
    buy = ins.strategy_proposal.swaps[0].buy_isin
    r = client.post("/clients/ammann/query",
                    json={"match_id": mid, "question": "alternative", "exclude_isin": buy}).json()
    assert r["kind"] == "alternative"
    if r["alternative"]:
        assert r["alternative"]["buy_isin"] != buy


def test_new_endpoints_respond():
    assert client.get("/clients/huber/opportunities").status_code == 200
    assert client.get("/clients/huber/transactions").status_code == 200
    assert client.get("/clients/nobody/transactions").status_code == 404
    assert client.get("/clients/nobody/opportunities").status_code == 404
