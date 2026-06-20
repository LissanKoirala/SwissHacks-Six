"""Fernet encryption for Google access/refresh tokens at rest (TOKEN_ENC_KEY)."""
from __future__ import annotations

from functools import lru_cache

from .config import settings


@lru_cache(maxsize=1)
def _fernet():
    if not settings.token_enc_key:
        return None
    from cryptography.fernet import Fernet

    return Fernet(settings.token_enc_key.encode())


def encrypt(plaintext: str | None) -> str | None:
    if not plaintext:
        return None
    f = _fernet()
    if f is None:  # no key → cannot store tokens; caller should gate on settings.workspace_enabled
        raise RuntimeError("TOKEN_ENC_KEY not set — cannot encrypt Google tokens")
    return f.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    f = _fernet()
    if f is None:
        raise RuntimeError("TOKEN_ENC_KEY not set — cannot decrypt Google tokens")
    return f.decrypt(ciphertext.encode()).decode()
