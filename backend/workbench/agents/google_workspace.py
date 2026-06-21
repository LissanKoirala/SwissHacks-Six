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


def _decode_b64(data: str) -> str:
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", "replace")


def _extract_body(payload: dict) -> str:
    """Best-effort plain-text body: prefer text/plain, fall back to text/html (tags stripped)."""
    plain: str | None = None
    html: str | None = None

    def walk(part: dict) -> None:
        nonlocal plain, html
        mime = part.get("mimeType", "")
        data = (part.get("body") or {}).get("data")
        if data:
            if mime == "text/plain" and plain is None:
                plain = _decode_b64(data)
            elif mime == "text/html" and html is None:
                html = _decode_b64(data)
        for sub in part.get("parts") or []:
            walk(sub)

    walk(payload or {})
    if plain:
        return plain.strip()
    if html:
        import re
        text = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"[ \t]{2,}", " ", text).strip()
    return ""


def get_message(db: Session, row: OAuthToken, message_id: str) -> dict:
    """Full message — headers + the plain-text body — for the in-app email viewer."""
    msg = call(db, row, "GET", f"{GMAIL}/messages/{message_id}", params={"format": "full"})
    payload = msg.get("payload", {})
    return {
        "id": msg.get("id"),
        "thread_id": msg.get("threadId"),
        "from": _header(payload, "From"),
        "to": _header(payload, "To"),
        "subject": _header(payload, "Subject") or "(no subject)",
        "date": _header(payload, "Date"),
        "body": _extract_body(payload),
        "unread": "UNREAD" in (msg.get("labelIds") or []),
    }


def list_inbox(db: Session, row: OAuthToken, max_results: int = 12,
               query: str | None = None) -> list[dict]:
    """Recent messages: from / subject / snippet / date (metadata only).

    Default: the RM's own INBOX. With `query` (a Gmail search, e.g. ``from:x@y OR to:x@y``) it
    returns that client's correspondence across all mail — sent and received — so a per-client
    Workspace shows both sides of the thread."""
    if query:
        params = {"maxResults": max_results, "q": query}
    else:
        params = {"maxResults": max_results, "labelIds": "INBOX", "q": "in:inbox"}
    listing = call(db, row, "GET", f"{GMAIL}/messages", params=params)
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

def list_events(db: Session, row: OAuthToken, days: int = 14, max_results: int = 15,
                query: str | None = None) -> list[dict]:
    now = datetime.now(timezone.utc)
    params = {
        "timeMin": now.isoformat(),
        "timeMax": (now + timedelta(days=days)).isoformat(),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": max_results,
    }
    if query:  # free-text Calendar search — matches attendee email, title, location, etc.
        params["q"] = query
    data = call(db, row, "GET", f"{CAL}/events", params=params)
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


__all__ = ["list_inbox", "get_message", "create_draft", "list_events", "create_event", "GoogleError"]
