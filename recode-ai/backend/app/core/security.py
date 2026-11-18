"""Password hashing and signed tokens (access, media and preview tokens)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import get_settings

_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, iterations, salt_b64, digest_b64 = encoded.split("$")
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
    return hmac.compare_digest(actual, expected)


def create_token(subject: str, kind: str, ttl: timedelta, **claims: Any) -> str:
    now = datetime.now(UTC)
    payload = {"sub": subject, "kind": kind, "iat": now, "exp": now + ttl, **claims}
    return jwt.encode(payload, get_settings().secret_key, algorithm="HS256")


def decode_token(token: str, kind: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("kind") != kind:
        return None
    return payload


def access_token(user_id: str) -> str:
    return create_token(user_id, "access", timedelta(minutes=get_settings().access_token_ttl_minutes))


def media_token(storage_key: str) -> str:
    """Signed, expiring capability for one stored object (used by <img src>)."""
    return create_token(storage_key, "media", timedelta(minutes=get_settings().media_token_ttl_minutes))


def preview_token(project_id: str, version_id: str) -> str:
    """Signed capability to view one version of one project inside an iframe."""
    return create_token(
        project_id,
        "preview",
        timedelta(minutes=get_settings().media_token_ttl_minutes),
        ver=version_id,
    )
