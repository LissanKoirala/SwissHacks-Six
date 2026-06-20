"""Twilio SMS sender (spec §6). Graceful when unconfigured — the app boots and the seed demo
is unaffected; send routes surface a clear error instead of crashing."""
from __future__ import annotations

from .config import settings


class SmsError(Exception):
    pass


def send_sms(to: str, body: str) -> dict:
    """Send an SMS via Twilio. Raises SmsError (never crashes) on any problem."""
    if not settings.twilio_enabled:
        raise SmsError("Twilio not configured (set TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER)")
    if not to:
        raise SmsError("no destination phone number on file")

    from twilio.base.exceptions import TwilioRestException
    from twilio.rest import Client

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    try:
        msg = client.messages.create(to=to, from_=settings.twilio_from_number, body=body)
    except TwilioRestException as e:  # unverified number on trial, bad number, etc.
        raise SmsError(f"Twilio rejected the message: {e.msg}") from e
    return {"sid": msg.sid, "status": msg.status}
