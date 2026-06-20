"""The insights API contract (CLAUDE.md §7.4) over the real app."""
from fastapi.testclient import TestClient

from workbench.api import create_app

client = TestClient(create_app())


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["clients"]


def test_integrations_probe():
    r = client.get("/api/health/integrations")
    assert r.status_code == 200
    names = {p["name"] for p in r.json()["probes"]}
    assert {"Phoeniqs LLM", "SIX MCP", "Event Registry"} <= names


def test_clients_list():
    r = client.get("/clients")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 4
    assert all("alert_count" in c for c in data)


def test_insights_contract():
    r = client.get("/clients/schneider/insights")
    assert r.status_code == 200
    body = r.json()
    assert {"matches", "strategy_proposal", "dialogue_suggestion"} <= set(body)
    assert body["strategy_proposal"]["swaps"][0]["sell_issuer"].startswith("Biogen")
    assert body["dialogue_suggestion"]["talking_points"]


def test_portfolio_route():
    r = client.get("/clients/huber/portfolio")
    assert r.status_code == 200
    assert r.json()["total_chf"] > 0
    assert r.json()["holdings"]


def test_unknown_client_404():
    assert client.get("/clients/nobody/insights").status_code == 404
