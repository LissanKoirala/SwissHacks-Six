"""Gmail + Calendar adapters on the signed-in RM's own account.

Gmail: read recent inbox + create drafts (never sends — golden rule). Calendar: read the next
fortnight + add an event (explicit RM action). All calls go through google_api.call with refresh."""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sqlalchemy.orm import Session

from ..db_models import OAuthToken
from ..google_api import GoogleError, call

GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me"
CAL = "https://www.googleapis.com/calendar/v3/calendars/primary"


# --- Gmail -------------------------------------------------------------------

def _header(payload: dict, name: str) -> str:
    for h in (payload.get("headers") or []):
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def list_inbox(db: Session, row: OAuthToken, max_results: int = 12) -> list[dict]:
    """Recent inbox messages: from / subject / snippet / date (metadata only)."""
    listing = call(db, row, "GET", f"{GMAIL}/messages",
                   params={"maxResults": max_results, "labelIds": "INBOX", "q": "in:inbox"})
    out: list[dict] = []
    for m in (listing.get("messages") or []):
        msg = call(db, row, "GET", f"{GMAIL}/messages/{m['id']}",
                   params={"format": "metadata",
                           "metadataHeaders": ["From", "Subject", "Date"]})
        payload = msg.get("payload", {})
        out.append({
            "id": msg.get("id"),
            "thread_id": msg.get("threadId"),
            "from": _header(payload, "From"),
            "subject": _header(payload, "Subject") or "(no subject)",
            "date": _header(payload, "Date"),
            "snippet": msg.get("snippet", ""),
            "unread": "UNREAD" in (msg.get("labelIds") or []),
        })
    return out


def create_draft(db: Session, row: OAuthToken, to: str, subject: str, body: str) -> dict:
    """Create a Gmail DRAFT (never sends). Returns the draft id + a deep link."""
    em = EmailMessage()
    em["To"] = to
    em["Subject"] = subject
    em.set_content(body)
    raw = base64.urlsafe_b64encode(em.as_bytes()).decode()
    draft = call(db, row, "POST", f"{GMAIL}/drafts", json={"message": {"raw": raw}})
    did = draft.get("id", "")
    return {"id": did, "message_id": draft.get("message", {}).get("id"),
            "url": "https://mail.google.com/mail/u/0/#drafts"}


# --- Calendar ----------------------------------------------------------------

def list_events(db: Session, row: OAuthToken, days: int = 14, max_results: int = 15) -> list[dict]:
    now = datetime.now(timezone.utc)
    data = call(db, row, "GET", f"{CAL}/events", params={
        "timeMin": now.isoformat(),
        "timeMax": (now + timedelta(days=days)).isoformat(),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": max_results,
    })
    out: list[dict] = []
    for e in (data.get("items") or []):
        start = e.get("start", {})
        end = e.get("end", {})
        out.append({
            "id": e.get("id"),
            "summary": e.get("summary", "(no title)"),
            "start": start.get("dateTime") or start.get("date"),
            "end": end.get("dateTime") or end.get("date"),
            "all_day": "date" in start,
            "location": e.get("location", ""),
            "attendees": [a.get("email") for a in (e.get("attendees") or []) if a.get("email")],
            "html_link": e.get("htmlLink", ""),
        })
    return out


def create_event(db: Session, row: OAuthToken, *, summary: str, start: str, end: str,
                 attendees: list[str] | None = None, description: str = "",
                 location: str = "") -> dict:
    """Add an event to the RM's primary calendar (explicit RM action)."""
    body = {
        "summary": summary,
        "description": description,
        "location": location,
        "start": {"dateTime": start},
        "end": {"dateTime": end},
    }
    if attendees:
        body["attendees"] = [{"email": a} for a in attendees]
    ev = call(db, row, "POST", f"{CAL}/events", json=body)
    return {"id": ev.get("id"), "html_link": ev.get("htmlLink", ""), "summary": ev.get("summary")}


__all__ = ["list_inbox", "create_draft", "list_events", "create_event", "GoogleError"]
