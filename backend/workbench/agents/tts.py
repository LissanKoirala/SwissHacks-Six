"""Text-to-speech for the conversational capture voice.

One Synthesizer interface; swap the provider in one place. ElevenLabs is wired now
(reuses the STT key); the frontend falls back to the browser's speechSynthesis when
TTS_PROVIDER is unset or the key is missing, so the interview always has a voice.
"""
from __future__ import annotations

from typing import Protocol

import httpx

from ..config import settings


class SynthError(RuntimeError):
    pass


class Synthesizer(Protocol):
    def synthesize(self, text: str) -> tuple[bytes, str]: ...  # (audio bytes, mime)


class ElevenLabsSynthesizer:
    # Text-to-speech REST endpoint. Docs: elevenlabs.io/docs/api-reference/text-to-speech.
    BASE = "https://api.elevenlabs.io/v1/text-to-speech"
    _MAX_CHARS = 800  # keep one spoken question short and cheap

    def __init__(self, api_key: str, model_id: str, voice_id: str):
        self.api_key = api_key
        self.model_id = model_id
        self.voice_id = voice_id

    def synthesize(self, text: str) -> tuple[bytes, str]:
        clipped = (text or "").strip()[: self._MAX_CHARS]
        if not clipped:
            raise SynthError("empty text")
        headers = {
            "xi-api-key": self.api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "User-Agent": "AdvisoryWorkbench/0.1 (+httpx)",
        }
        body = {
            "text": clipped,
            "model_id": self.model_id,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        try:
            with httpx.Client(
                timeout=httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0),
                http2=False,
            ) as client:
                r = client.post(
                    f"{self.BASE}/{self.voice_id}",
                    headers=headers,
                    params={"output_format": "mp3_44100_128"},
                    json=body,
                )
        except httpx.HTTPError as e:
            raise SynthError(f"ElevenLabs request failed: {type(e).__name__}: {e}") from e
        if r.status_code >= 400:
            raise SynthError(f"ElevenLabs {r.status_code}: {r.text[:300]}")
        if not r.content:
            raise SynthError("ElevenLabs returned no audio")
        return r.content, "audio/mpeg"


def get_synthesizer() -> Synthesizer:
    provider = settings.tts_provider
    if provider == "elevenlabs":
        if not settings.elevenlabs_key:
            raise SynthError("ELEVENLABS_API_KEY not configured")
        return ElevenLabsSynthesizer(
            settings.elevenlabs_key,
            settings.elevenlabs_tts_model,
            settings.elevenlabs_voice_id,
        )
    raise SynthError(f"Unknown TTS_PROVIDER: {provider}")
