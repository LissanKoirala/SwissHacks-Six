"""Speech-to-text for RM dictation.

One Transcriber interface; swap the provider in one place. ElevenLabs is wired now
(easy key, generous quota); Phoeniqs is a stub to be filled in when their STT
endpoint is available — change `STT_PROVIDER=phoeniqs` to flip without touching
the route or frontend.
"""
from __future__ import annotations

from typing import Protocol

import httpx

from ..config import settings


class TranscribeError(RuntimeError):
    pass


class Transcriber(Protocol):
    def transcribe(self, audio: bytes, mime: str, filename: str) -> str: ...


class ElevenLabsTranscriber:
    # Speech-to-text REST endpoint (multipart). Docs: elevenlabs.io/docs/api-reference/speech-to-text.
    URL = "https://api.elevenlabs.io/v1/speech-to-text"

    def __init__(self, api_key: str, model_id: str):
        self.api_key = api_key
        self.model_id = model_id

    def transcribe(self, audio: bytes, mime: str, filename: str) -> str:
        # ElevenLabs is picky about the content-type — strip codec parameter
        # (e.g. `audio/webm;codecs=opus` → `audio/webm`) and fall back to a
        # generic type it always accepts.
        base_mime = (mime or "").split(";", 1)[0].strip() or "audio/webm"
        headers = {
            "xi-api-key": self.api_key,
            "Accept": "application/json",
            "User-Agent": "AdvisoryWorkbench/0.1 (+httpx)",
        }
        # One retry on transient disconnects — the API occasionally resets the
        # connection mid-upload before responding.
        last_err: Exception | None = None
        for attempt in range(2):
            try:
                with httpx.Client(timeout=httpx.Timeout(connect=10.0, read=120.0, write=120.0, pool=10.0), http2=False) as client:
                    r = client.post(
                        self.URL,
                        headers=headers,
                        files={"file": (filename or "audio.webm", audio, base_mime)},
                        data={"model_id": self.model_id},
                    )
                break
            except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError) as e:
                last_err = e
                if attempt == 1:
                    raise TranscribeError(f"ElevenLabs request failed: {type(e).__name__}: {e}") from e
            except httpx.HTTPError as e:
                raise TranscribeError(f"ElevenLabs request failed: {type(e).__name__}: {e}") from e
        else:  # pragma: no cover — covered by the raise above
            raise TranscribeError(f"ElevenLabs request failed: {last_err}")
        if r.status_code >= 400:
            raise TranscribeError(f"ElevenLabs {r.status_code}: {r.text[:300]}")
        data = r.json()
        text = (data.get("text") or "").strip()
        if not text:
            raise TranscribeError("ElevenLabs returned no transcript")
        return text


class PhoeniqsTranscriber:
    # TODO: implement once Phoeniqs exposes an STT endpoint. Same interface; the
    # route + frontend stay unchanged. Set STT_PROVIDER=phoeniqs to enable.
    def transcribe(self, audio: bytes, mime: str, filename: str) -> str:
        raise TranscribeError("Phoeniqs STT not implemented yet — set STT_PROVIDER=elevenlabs")


def get_transcriber() -> Transcriber:
    provider = settings.stt_provider
    if provider == "elevenlabs":
        if not settings.elevenlabs_key:
            raise TranscribeError("ELEVENLABS_API_KEY not configured")
        return ElevenLabsTranscriber(settings.elevenlabs_key, settings.elevenlabs_stt_model)
    if provider == "phoeniqs":
        return PhoeniqsTranscriber()
    raise TranscribeError(f"Unknown STT_PROVIDER: {provider}")
