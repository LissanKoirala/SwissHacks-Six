"""Image OCR for RM handwritten/printed notes.

Mirrors the transcribe module's swap pattern. Phoeniqs hosts a purpose-built
OCR model (`inference-deepseek-ocr`) reached via the OpenAI-compatible chat
completions endpoint with an inline base64 image. To swap models, change
`PHOENIQS_OCR_MODEL` in `.env` — the route + frontend stay identical.
"""
from __future__ import annotations

import base64
from typing import Protocol

import httpx

from ..config import settings


class OcrError(RuntimeError):
    pass


class Ocr(Protocol):
    def read(self, image: bytes, mime: str) -> str: ...


class PhoeniqsDeepseekOcr:
    """OpenAI-compatible chat completions with an inline base64 image."""

    def __init__(self, base_url: str, api_key: str, model: str):
        # The base URL from .env already includes `/v1`.
        self.url = f"{base_url.rstrip('/')}/chat/completions"
        self.api_key = api_key
        self.model = model

    def read(self, image: bytes, mime: str) -> str:
        if not image:
            raise OcrError("empty image")
        media = (mime or "").split(";", 1)[0].strip() or "image/png"
        if not media.startswith("image/"):
            media = "image/png"
        data_url = f"data:{media};base64,{base64.b64encode(image).decode()}"
        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        # deepseek-ocr is sensitive to long instructions — keep
                        # the prompt short or it returns an empty completion.
                        {"type": "text", "text": "Transcribe this note exactly as written."},
                    ],
                }
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "AdvisoryWorkbench/0.1 (+httpx)",
        }
        try:
            with httpx.Client(timeout=httpx.Timeout(connect=10.0, read=120.0, write=120.0, pool=10.0), http2=False) as client:
                r = client.post(self.url, headers=headers, json=body)
        except httpx.HTTPError as e:
            raise OcrError(f"Phoeniqs request failed: {type(e).__name__}: {e}") from e
        if r.status_code >= 400:
            raise OcrError(f"Phoeniqs {r.status_code}: {r.text[:300]}")
        data = r.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            raise OcrError(f"Phoeniqs unexpected response: {str(data)[:300]}") from e
        text = (text or "").strip()
        if not text:
            raise OcrError("Phoeniqs returned no transcript")
        return text


def get_ocr() -> Ocr:
    provider = settings.ocr_provider
    if provider == "phoeniqs":
        if not settings.phoeniqs_key:
            raise OcrError("PHOENIQS_API_KEY not configured")
        return PhoeniqsDeepseekOcr(settings.phoeniqs_url, settings.phoeniqs_key, settings.phoeniqs_ocr_model)
    raise OcrError(f"Unknown OCR_PROVIDER: {provider}")
