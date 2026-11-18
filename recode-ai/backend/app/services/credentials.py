"""Each user's model providers: their own keys, or the server's when allowed."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.base import LLMProvider
from app.ai.providers.openai_compatible import OpenAICompatibleProvider
from app.core.config import Settings
from app.core.secrets import decrypt
from app.models import ProviderCredential, User

PROVIDERS = ("anthropic", "openai")


class UnsafeEndpoint(ValueError):
    pass


def check_endpoint(url: str, settings: Settings) -> str:
    """A user-supplied model endpoint: http(s) only, and no private / internal address unless
    the operator allows it (the server would otherwise call into its own network for them)."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise UnsafeEndpoint("The base URL must start with https:// (or http:// for a local server)")
    if settings.allow_private_llm_urls:
        return url.strip().rstrip("/")
    if parsed.scheme != "https":
        raise UnsafeEndpoint("Use an https:// URL")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except socket.gaierror as e:
        raise UnsafeEndpoint(f"Cannot resolve {parsed.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeEndpoint(
                "This address is private. Local model servers need RECODE_ALLOW_PRIVATE_LLM_URLS=true on the server."
            )
    return url.strip().rstrip("/")


def build_provider(cred: ProviderCredential, settings: Settings) -> LLMProvider | None:
    key = decrypt(cred.api_key_encrypted) if cred.api_key_encrypted else None
    if cred.provider == "anthropic":
        if not key:
            return None
        return AnthropicProvider(
            server_fallback=settings.anthropic_server_fallback, api_key=key, base_url=cred.base_url or None
        )
    if cred.provider == "openai" and cred.base_url:
        try:
            base = check_endpoint(cred.base_url, settings)  # again at use: DNS may have changed
        except UnsafeEndpoint:
            return None
        return OpenAICompatibleProvider(base, key, default_model=cred.model)
    return None


def user_providers(db: Session, user: User | None, settings: Settings) -> tuple[dict[str, LLMProvider], str | None]:
    """(providers, preferred provider). The user's own keys come first; the server's key is a
    fallback when the operator allows it."""
    providers: dict[str, LLMProvider] = {}
    if user is not None:
        rows = db.scalars(select(ProviderCredential).where(ProviderCredential.user_id == user.id)).all()
        for cred in rows:
            provider = build_provider(cred, settings)
            if provider is not None:
                providers[cred.provider] = provider
    own = [p for p in PROVIDERS if p in providers]
    preferred = (user.settings or {}).get("preferred_provider") if user else None
    if preferred not in own:
        preferred = own[0] if own else None
    if "anthropic" not in providers and settings.allow_server_key:
        providers["anthropic"] = AnthropicProvider(server_fallback=settings.anthropic_server_fallback)
    return providers, preferred
