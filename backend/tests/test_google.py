"""Google workspace: token encryption + auth gating on the Gmail/Calendar routes."""
from fastapi.testclient import TestClient

from workbench.api import create_app
from workbench.crypto import decrypt, encrypt

client = TestClient(create_app())


def test_token_crypto_roundtrip():
    assert decrypt(encrypt("ya29.access-token")) == "ya29.access-token"
    assert decrypt(encrypt("1//refresh-token")) == "1//refresh-token"
    # empty stays empty (no token to store)
    assert encrypt("") is None
    assert decrypt(None) is None
    # ciphertext is not the plaintext
    assert encrypt("secret") != "secret"


def test_google_routes_require_sign_in():
    assert client.get("/integrations/google/inbox").status_code == 401
    assert client.get("/integrations/google/calendar").status_code == 401
    assert client.post("/integrations/google/draft", json={"to": "a@b.com"}).status_code == 401
    assert (
        client.post(
            "/integrations/google/calendar",
            json={"summary": "Mtg", "start": "2026-06-22T14:00:00+02:00", "end": "2026-06-22T15:00:00+02:00"},
        ).status_code
        == 401
    )


def test_auth_config_reports_workspace():
    cfg = client.get("/auth/config").json()
    assert "workspace_enabled" in cfg and "gmail_scope" in cfg and "calendar_scope" in cfg
