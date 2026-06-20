"""Instant Gmail push: watch → Pub/Sub → webhook (the real-time counterpart to the poller).

How it works end to end (see docs/DEPLOY.md for the GCP setup):
  1. `register_watch()` calls Gmail `users.watch()`, binding the mailbox to a Pub/Sub topic and
     recording the current historyId as our baseline.
  2. Gmail publishes a tiny notification to the topic on every mailbox change; a Pub/Sub *push*
     subscription POSTs it to `/gmail/push` on this backend — within ~1s of the email arriving.
  3. `sync_new_messages()` (called by that webhook) asks Gmail for everything added since the last
     historyId, fetches the new messages, and returns them as EmailMessages for the normal pipeline.

watch() must be renewed at least every 7 days or notifications stop — the app re-registers daily.
Read-only throughout (gmail.readonly): we never send or modify mail (§2). Best-effort — any error
returns [] / None so a hiccup degrades gracefully rather than crashing a request.
"""
from __future__ import annotations

import json

from ..config import DATA_DIR, settings
from ..models import EmailMessage
from .email import GmailOAuthSource

HISTORY_PATH = DATA_DIR / ".gmail_history.json"


def _load_history_id() -> str | None:
    try:
        return str(json.loads(HISTORY_PATH.read_text())["historyId"])
    except Exception:
        return None


def _save_history_id(hid) -> None:
    try:
        HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        HISTORY_PATH.write_text(json.dumps({"historyId": str(hid)}))
    except Exception:
        pass


def register_watch() -> str | None:
    """Bind the mailbox to the Pub/Sub topic and store the baseline historyId. Returns it or None.
    Safe to call repeatedly — it's also how we renew before the 7-day expiry."""
    if not (settings.gmail_configured and settings.gmail_pubsub_topic):
        return None
    service = GmailOAuthSource._service()
    if service is None:
        return None
    try:
        resp = service.users().watch(userId="me", body={
            "topicName": settings.gmail_pubsub_topic,
            "labelIds": settings.gmail_watch_labels or ["INBOX"],
            "labelFilterBehavior": "INCLUDE",
        }).execute()
        hid = resp.get("historyId")
        if hid:
            _save_history_id(hid)
        return str(hid) if hid else None
    except Exception:
        return None


def _relevant(msg: EmailMessage) -> bool:
    """Apply the same subject gate the poll query uses, so push and poll ingest the same set."""
    flt = settings.gmail_subject_filter
    if not flt:
        return True
    return flt.lower() in (msg.subject or "").lower()


def sync_new_messages() -> list[EmailMessage]:
    """Pull messages added since the stored historyId. Called on each push notification.
    Updates the baseline historyId so the next push only sees newer mail (idempotent with the
    pipeline's own dedup keys as a second guard)."""
    if not settings.gmail_configured:
        return []
    service = GmailOAuthSource._service()
    if service is None:
        return []
    start = _load_history_id()
    if not start:
        # No baseline yet — establish one now and skip backfilling the whole inbox.
        register_watch()
        return []

    src = GmailOAuthSource()
    out: list[EmailMessage] = []
    seen: set[str] = set()
    page = None
    try:
        while True:
            resp = service.users().history().list(
                userId="me", startHistoryId=start, historyTypes=["messageAdded"],
                pageToken=page,
            ).execute()
            for h in resp.get("history", []):
                for added in h.get("messagesAdded", []):
                    mid = (added.get("message") or {}).get("id")
                    if not mid or mid in seen:
                        continue
                    seen.add(mid)
                    try:
                        full = service.users().messages().get(
                            userId="me", id=mid, format="full"
                        ).execute()
                    except Exception:
                        continue
                    msg = src._parse(full)
                    if _relevant(msg):
                        out.append(msg)
            page = resp.get("nextPageToken")
            if not page:
                if resp.get("historyId"):
                    _save_history_id(resp["historyId"])
                break
        return out
    except Exception:
        # historyId likely too old/expired (Gmail prunes history) → reset the baseline.
        register_watch()
        return []
