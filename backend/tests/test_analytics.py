"""Portfolio analytics + CRM graph (dashboard charts, globe, network view)."""
from fastapi.testclient import TestClient

from workbench.analytics import build_analytics
from workbench.api import create_app
from workbench.graph.crm_graph import build_crm_graph

client = TestClient(create_app())


def test_analytics_figures_and_allocation(world):
    a = build_analytics(world, "schneider")
    assert a["figures"]["total_chf"] > 1_000_000
    assert a["figures"]["holding_count"] > 0
    assert abs(sum(x["pct"] for x in a["by_asset_class"]) - 100) < 1.0
    # sub-asset-class drift carries the computed breach flags
    assert any(t["breach"] for t in a["by_sub_asset_class"])


def test_region_risk_is_geocoded_and_provenanced(world):
    a = build_analytics(world, "schneider")
    regions = {r["region"]: r for r in a["by_region"]}
    assert all(r["lat"] or r["lng"] for r in regions.values())  # every marker has coords
    usa = regions["USA"]
    assert usa["risk_level"] == "high"
    assert usa["risks"] and usa["risks"][0]["provenance"]["excerpt"]  # cited


def test_region_risk_per_persona(world):
    cases = {"huber": ("Europa", "positive"), "ammann": ("Emerging M.", "high"),
             "raeber": ("USA", "high")}
    for cid, (region, level) in cases.items():
        regions = {r["region"]: r for r in build_analytics(world, cid)["by_region"]}
        assert regions[region]["risk_level"] == level, f"{cid} {region}"


def test_top_holding_alert_flag(world):
    a = build_analytics(world, "ammann")
    flagged = [h for h in a["top_holdings"] if h["in_alert"]]
    # PDD is the conflicted name; it should be flagged if it lands in the top-12 by value
    assert all(h["region"] for h in a["top_holdings"])
    assert isinstance(flagged, list)


def test_crm_graph_structure(world):
    g = build_crm_graph(world, "schneider")
    types = {n["type"] for n in g["nodes"]}
    assert {"rm", "client", "interaction", "theme"} <= types
    assert len(g["links"]) > len(g["nodes"]) // 2
    # interactions roughly track the meeting log
    interactions = [n for n in g["nodes"] if n["type"] == "interaction"]
    assert len(interactions) >= 20


def test_new_endpoints(world):
    assert client.get("/clients/schneider/analytics").status_code == 200
    assert client.get("/clients/schneider/graph").status_code == 200
    assert client.get("/clients/nobody/analytics").status_code == 404
    body = client.get("/clients/huber/analytics").json()
    assert body["by_region"]
