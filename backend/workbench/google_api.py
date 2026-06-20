"""Authenticated Google REST calls on a user's behalf, with transparent token refresh.

Direct httpx (no heavy google client libs). Tokens come from the encrypted oauth_token row;
on 401/expiry we refresh via the refresh token and persist the new access token."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from .config import settings
from .crypto import decrypt, encrypt
from .db_models import OAuthToken, RmUser

TOKEN_URL = "https://oauth2.googleapis.com/token"
_TIMEOUT = 20.0


class GoogleError(Exception):
    pass


def token_for(db: Session, user: RmUser) -> OAuthToken | None:
    return db.query(OAuthToken).filter_by(user_id=user.id, provider="google").one_or_none()


def store_token(db: Session, user: RmUser, token: dict) -> OAuthToken:
    """Persist (encrypted) the access/refresh tokens from an Authlib token dict."""
    access = token.get("access_token")
    refresh = token.get("refresh_token")
    scopes = token.get("scope", "") or " ".join(token.get("scopes", []) or [])
    expires_at = None
    if token.get("expires_at"):
        expires_at = datetime.fromtimestamp(int(token["expires_at"]), tz=timezone.utc)
    elif token.get("expires_in"):
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(token["expires_in"]))

    row = token_for(db, user)
    if row is None:
        row = OAuthToken(user_id=user.id, provider="google", access_token_enc=encrypt(access) or "")
        db.add(row)
    else:
        row.access_token_enc = encrypt(access) or row.access_token_enc
    # Google only returns a refresh_token on first consent (prompt=consent) — keep the old one otherwise.
    if refresh:
        row.refresh_token_enc = encrypt(refresh)
    row.scopes = scopes
    row.expires_at = expires_at
    db.commit()
    return row


def _refresh(db: Session, row: OAuthToken) -> str:
    refresh = decrypt(row.refresh_token_enc) if row.refresh_token_enc else None
    if not refresh:
        raise GoogleError("Google session expired and no refresh token — please reconnect Google.")
    resp = httpx.post(
        TOKEN_URL,
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": refresh,
            "grant_type": "refresh_token",
        },
        timeout=_TIMEOUT,
    )
    if resp.status_code != 200:
        raise GoogleError(f"token refresh failed ({resp.status_code})")
    data = resp.json()
    access = data["access_token"]
    row.access_token_enc = encrypt(access)
    if data.get("expires_in"):
        row.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(data["expires_in"]))
    db.commit()
    return access


def _access_token(db: Session, row: OAuthToken) -> str:
    if row.expires_at and row.expires_at <= datetime.now(timezone.utc) + timedelta(seconds=30):
        return _refresh(db, row)
    return decrypt(row.access_token_enc)


def call(db: Session, row: OAuthToken, method: str, url: str, *, params=None, json=None) -> dict:
    """Bearer-authenticated Google API call; refreshes once on 401."""
    def _do(tok: str) -> httpx.Response:
        return httpx.request(
            method, url, params=params, json=json,
            headers={"Authorization": f"Bearer {tok}"}, timeout=_TIMEOUT,
        )

    resp = _do(_access_token(db, row))
    if resp.status_code == 401:  # stale token — refresh once and retry
        resp = _do(_refresh(db, row))
    if resp.status_code >= 400:
        raise GoogleError(f"Google API {method} {url.split('/')[-1]} → {resp.status_code}: {resp.text[:200]}")
    return resp.json() if resp.content else {}
