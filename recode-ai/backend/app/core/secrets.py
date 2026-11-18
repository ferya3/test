"""Encryption of user-supplied secrets (model provider API keys) at rest.

Keys are encrypted with Fernet (AES-128-CBC + HMAC) under a key derived from
RECODE_SECRET_KEY. Changing RECODE_SECRET_KEY makes stored keys unreadable:
users then enter them again."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(b"recode-ai:provider-keys:" + get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def mask(value: str | None) -> str | None:
    """'sk-ant-api03-…x7Q2' — enough to recognise a key, useless to anyone else."""
    if not value:
        return None
    if len(value) <= 12:
        return "…" + value[-2:]
    return f"{value[:7]}…{value[-4:]}"
