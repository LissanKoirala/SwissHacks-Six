"""Google sign-in + optional Gmail/Calendar (scopes from settings.google_scopes). A signed
session cookie holds only the user id; Google access/refresh tokens are Fernet-encrypted in the
oauth_token table so the app can read inbox / draft / read+add calendar events on the RM's behalf.

Auth is optional: logged-out requests still get the seed demo. Degrades gracefully when Google
isn't configured."""
from __future__ import annotations

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .db_models import RmUser

oauth = OAuth()
_registered = False


def init_oauth() -> None:
    """Register the Google provider once, if credentials are present."""
    global _registered
    if _registered or not settings.google_enabled:
        return
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": settings.google_scopes},
    )
    _registered = True


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google/login")
async def google_login(request: Request):
    if not settings.google_enabled:
        raise HTTPException(503, "Google sign-in not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)")
    init_oauth()
    # offline + consent → guarantees a refresh token so we can call Gmail/Calendar later.
    return await oauth.google.authorize_redirect(
        request, settings.google_redirect_uri,
        access_type="offline", prompt="consent", include_granted_scopes="true",
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not settings.google_enabled:
        raise HTTPException(503, "Google sign-in not configured")
    init_oauth()
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as e:  # state mismatch / user denied
        raise HTTPException(400, f"OAuth error: {e.error}")
    info = token.get("userinfo")
    if not info:
        info = await oauth.google.userinfo(token=token)
    sub = info.get("sub")
    if not sub:
        raise HTTPException(400, "no subject id in Google response")

    user = db.query(RmUser).filter_by(google_sub=sub).one_or_none()
    if user is None:
        user = RmUser(google_sub=sub)
        db.add(user)
    user.email = info.get("email") or user.email or ""
    user.name = info.get("name") or user.name or ""
    user.picture = info.get("picture")
    db.commit()

    # Persist the encrypted Google tokens so Gmail/Calendar work on the RM's behalf.
    if settings.workspace_enabled and token.get("access_token"):
        from .google_api import store_token

        store_token(db, user, token)

    request.session["user_id"] = user.id
    return RedirectResponse(settings.frontend_url)


@router.post("/logout")
def logout(request: Request):
    request.session.pop("user_id", None)
    return {"ok": True}


def current_user(request: Request, db: Session = Depends(get_db)) -> RmUser | None:
    """Resolve the signed-in RM from the session cookie, or None."""
    uid = request.session.get("user_id")
    if not uid:
        return None
    return db.query(RmUser).filter_by(id=uid).one_or_none()


def require_user(user: RmUser | None = Depends(current_user)) -> RmUser:
    if user is None:
        raise HTTPException(401, "not signed in")
    return user


def public_user(user: RmUser) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "phone_e164": user.phone_e164,
        "briefing_hour": user.briefing_hour,
        "briefing_enabled": user.briefing_enabled,
    }


def _workspace_status(db: Session, user: RmUser) -> dict:
    if not settings.workspace_enabled:
        return {"connected": False, "gmail": False, "calendar": False}
    from .google_api import token_for

    row = token_for(db, user)
    scopes = (row.scopes if row else "") or ""
    return {
        "connected": row is not None,
        "gmail": "gmail" in scopes,
        "calendar": "calendar" in scopes,
    }


@router.get("/me")
def me(user: RmUser | None = Depends(current_user), db: Session = Depends(get_db)):
    if not user:
        return None
    out = public_user(user)
    out["workspace"] = _workspace_status(db, user)
    return out


@router.get("/config")
def auth_config():
    """Lets the UI show whether Google sign-in / workspace is wired before creds exist."""
    return {
        "google_enabled": settings.google_enabled,
        "twilio_enabled": settings.twilio_enabled,
        "workspace_enabled": settings.workspace_enabled,
        "gmail_scope": settings.gmail_scope,
        "calendar_scope": settings.calendar_scope,
    }
