"""Inbound-email adapter — the Front Door's first source (CLAUDE.md §6: one adapter per source,
swappable mock <-> live, behind a common interface).

Offline (default): reads `data/email_fixtures.json` so the whole pipeline — triage → tasks →
agentic drafting → RM sign-off — runs with NO credentials. Drop IMAP creds into `.env`
(EMAIL_PROVIDER=imap + EMAIL_IMAP_*) and set USE_LIVE=1 to pull a real mailbox; nothing
downstream changes because both paths emit the same `EmailMessage` shape.

We never send mail and never mark messages read — strictly read-only ingestion (§2).
"""
from __future__ import annotations

import email as _email
import imaplib
import json
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime

from ..config import DATA_DIR, settings
from ..models import EmailMessage, Provenance


def _excerpt(subject: str, body: str, n: int = 200) -> str:
    return (f"{subject} — {body}".strip(" —")[:n]) or subject[:n]


class EmailFixtureSource:
    """Seed inbox. Deterministic, demo-safe."""

    name = "email-fixture"

    def __init__(self, path=None):
        self.path = path or (DATA_DIR / "email_fixtures.json")

    def fetch(self, query=None) -> list[EmailMessage]:
        try:
            raw = json.loads(self.path.read_text())
        except Exception:
            return []
        rows = raw.get("emails", raw) if isinstance(raw, dict) else raw
        out: list[EmailMessage] = []
        for r in rows or []:
            if not isinstance(r, dict) or not r.get("id"):
                continue
            out.append(EmailMessage(
                id=r["id"],
                from_name=r.get("from_name", ""),
                from_email=r.get("from_email", ""),
                to_email=r.get("to_email", ""),
                subject=r.get("subject", ""),
                body=r.get("body", ""),
                received_at=r.get("received_at", ""),
                client_id=r.get("client_id"),
                provenance=Provenance(
                    source_type="crm_log",  # an email is a client interaction → CRM-class origin
                    source_id=f"email:{r['id']}",
                    excerpt=_excerpt(r.get("subject", ""), r.get("body", "")),
                    timestamp=r.get("received_at", "") or None,
                ),
            ))
        return out


class ImapEmailSource:
    """Live mailbox over IMAP. Works with any provider (Gmail app-password, Outlook, Fastmail…).
    Read-only: we PEEK messages, never set the Seen flag. Best-effort — any failure returns []
    so the board degrades to the seed inbox rather than crashing."""

    name = "email-imap"

    def fetch(self, query=None) -> list[EmailMessage]:
        if not settings.email_configured:
            return []
        try:
            cls = imaplib.IMAP4_SSL if settings.email_imap_ssl else imaplib.IMAP4
            conn = cls(settings.email_imap_host, settings.email_imap_port)
            conn.login(settings.email_imap_user, settings.email_imap_password)
            conn.select(settings.email_imap_folder, readonly=True)
            typ, data = conn.search(None, "ALL")
            if typ != "OK":
                conn.logout()
                return []
            ids = data[0].split()[-settings.email_scan_limit:]
            out: list[EmailMessage] = []
            for num in reversed(ids):  # newest first
                typ, msg_data = conn.fetch(num, "(BODY.PEEK[])")
                if typ != "OK" or not msg_data or not msg_data[0]:
                    continue
                out.append(self._parse(msg_data[0][1]))
            conn.logout()
            return out
        except Exception:
            return []

    def _parse(self, raw_bytes: bytes) -> EmailMessage:
        msg = _email.message_from_bytes(raw_bytes)
        subject = self._decode(msg.get("Subject", ""))
        from_name, from_email = parseaddr(msg.get("From", ""))
        from_name = self._decode(from_name) or from_email
        try:
            received = parsedate_to_datetime(msg.get("Date", "")).isoformat()
        except Exception:
            received = ""
        body = self._body(msg)
        mid = (msg.get("Message-ID", "") or f"{from_email}-{subject}").strip("<> ")
        return EmailMessage(
            id=f"imap:{mid}",
            from_name=from_name, from_email=from_email,
            to_email=parseaddr(msg.get("To", ""))[1],
            subject=subject, body=body, received_at=received,
            client_id=None,  # routed later by triage
            provenance=Provenance(
                source_type="crm_log", source_id=f"email:imap:{mid}",
                excerpt=_excerpt(subject, body), timestamp=received or None,
            ),
        )

    @staticmethod
    def _decode(value: str) -> str:
        try:
            return str(make_header(decode_header(value or "")))
        except Exception:
            return value or ""

    @staticmethod
    def _body(msg) -> str:
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain" and "attachment" not in str(
                    part.get("Content-Disposition", "")
                ):
                    try:
                        return part.get_payload(decode=True).decode(
                            part.get_content_charset() or "utf-8", "replace"
                        )
                    except Exception:
                        continue
            return ""
        try:
            return msg.get_payload(decode=True).decode(
                msg.get_content_charset() or "utf-8", "replace"
            )
        except Exception:
            return msg.get_payload() or ""


class GmailOAuthSource:
    """Live Gmail over the Gmail API with OAuth2 — the "proper Google auth" path (no app password,
    no IMAP toggle). Auth comes from a token file written by `workbench.ingestion.gmail_oauth`, or
    from client-id/secret/refresh-token env vars. Read-only: we never modify/mark messages.

    Best-effort: any missing library, credential, or API error returns [] so the board degrades to
    the seed inbox rather than crashing. The google libraries are imported lazily so the module (and
    the offline demo) load fine without them installed."""

    name = "email-gmail"

    def fetch(self, query=None) -> list[EmailMessage]:
        if not settings.gmail_configured:
            return []
        try:
            service = self._service()
            if service is None:
                return []
            q = query or settings.gmail_query
            resp = service.users().messages().list(
                userId="me", q=q, maxResults=settings.email_scan_limit
            ).execute()
            out: list[EmailMessage] = []
            for ref in resp.get("messages", []):
                full = service.users().messages().get(
                    userId="me", id=ref["id"], format="full"
                ).execute()
                out.append(self._parse(full))
            return out
        except Exception:
            return []

    @staticmethod
    def _service():
        """Build an authorised Gmail API client, or None if libs/creds are unavailable."""
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
        except Exception:
            return None  # google libs not installed — fall back to fixtures
        scopes = ["https://www.googleapis.com/auth/gmail.readonly"]
        creds = None
        if settings.gmail_token_file:
            import os
            if os.path.exists(settings.gmail_token_file):
                try:
                    creds = Credentials.from_authorized_user_file(settings.gmail_token_file, scopes)
                except Exception:
                    creds = None
        if creds is None and settings.gmail_refresh_token:
            creds = Credentials(
                token=None,
                refresh_token=settings.gmail_refresh_token,
                client_id=settings.gmail_client_id,
                client_secret=settings.gmail_client_secret,
                token_uri="https://oauth2.googleapis.com/token",
                scopes=scopes,
            )
        if creds is None:
            return None
        return build("gmail", "v1", credentials=creds, cache_discovery=False)

    def _parse(self, msg: dict) -> EmailMessage:
        import base64

        payload = msg.get("payload", {}) or {}
        headers = {h.get("name", "").lower(): h.get("value", "")
                   for h in payload.get("headers", [])}
        subject = headers.get("subject", "")
        from_name, from_email = parseaddr(headers.get("from", ""))
        from_name = from_name or from_email
        try:
            received = parsedate_to_datetime(headers.get("date", "")).isoformat()
        except Exception:
            received = ""

        def _decode(data: str) -> str:
            try:
                return base64.urlsafe_b64decode(data.encode()).decode("utf-8", "replace")
            except Exception:
                return ""

        def _walk(part: dict) -> str:
            if part.get("mimeType") == "text/plain":
                data = (part.get("body", {}) or {}).get("data")
                if data:
                    return _decode(data)
            for sub in part.get("parts", []) or []:
                found = _walk(sub)
                if found:
                    return found
            return ""

        body = _walk(payload) or msg.get("snippet", "")
        mid = msg.get("id", "")
        return EmailMessage(
            id=f"gmail:{mid}",
            from_name=from_name, from_email=from_email,
            to_email=parseaddr(headers.get("to", ""))[1],
            subject=subject, body=body, received_at=received,
            client_id=None,  # routed later by triage
            provenance=Provenance(
                source_type="crm_log", source_id=f"email:gmail:{mid}",
                excerpt=_excerpt(subject, body), timestamp=received or None,
            ),
        )


def _live_source():
    """Pick the live adapter for the configured provider."""
    if settings.email_provider == "gmail":
        return GmailOAuthSource()
    return ImapEmailSource()


def fetch_inbox() -> list[EmailMessage]:
    """The one call ingestion makes. Live provider (IMAP or Gmail OAuth) when enabled+configured,
    else seed fixtures. Falls back to fixtures if a live pull yields nothing (demo never empty)."""
    if settings.email_enabled:
        live = _live_source().fetch()
        if live:
            return live
    return EmailFixtureSource().fetch()
