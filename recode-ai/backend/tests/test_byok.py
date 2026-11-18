"""Bring your own key: per-user model provider credentials."""

import json
import socket

import httpx
import pytest
from sqlalchemy import select

from app.ai.providers.base import ChatMessage, ImagePart
from app.ai.providers.openai_compatible import OpenAICompatibleProvider
from app.ai.router import ModelRouter
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.secrets import decrypt, encrypt, mask
from app.models import ProviderCredential, User
from app.services.credentials import user_providers

PUBLIC_IP = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("104.18.6.192", 443))]
PRIVATE_IP = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 443))]


def _register(client, email):
    token = client.post("/api/auth/register", json={"email": email, "password": "byok-password-1"}).json()
    return {"Authorization": f"Bearer {token['access_token']}"}


def test_secrets_roundtrip_and_mask():
    token = encrypt("sk-ant-api03-secret-value-1234")
    assert "secret" not in token and decrypt(token) == "sk-ant-api03-secret-value-1234"
    assert decrypt("not-a-token") is None
    assert mask("sk-ant-api03-secret-value-1234") == "sk-ant-…1234"


def test_keys_are_per_user_encrypted_and_never_returned(client, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: PUBLIC_IP)
    alice, bob = _register(client, "alice@byok-example.com"), _register(client, "bob@byok-example.com")

    assert client.put("/api/account/providers/anthropic", headers=alice, json={}).status_code == 422
    r = client.put("/api/account/providers/anthropic", headers=alice, json={"api_key": "sk-ant-api03-alice-key-9876"})
    assert r.status_code == 200 and r.json()["key_hint"] == "sk-ant-…9876"
    r = client.put(
        "/api/account/providers/openai",
        headers=alice,
        json={"api_key": "sk-or-v1-alice-openrouter", "base_url": "https://openrouter.ai/api/v1/", "model": "x/y"},
    )
    assert r.status_code == 200 and r.json()["base_url"] == "https://openrouter.ai/api/v1"

    listed = client.get("/api/account/providers", headers=alice).text
    assert "alice-key" not in listed and 'openrouter"' not in listed.replace("openrouter.ai", "")
    assert [p["configured"] for p in client.get("/api/account/providers", headers=bob).json()] == [False, False]

    with get_sessionmaker()() as db:
        cred = db.scalar(select(ProviderCredential).where(ProviderCredential.provider == "anthropic"))
        assert "alice-key" not in cred.api_key_encrypted  # encrypted at rest
        user = db.scalar(select(User).where(User.email == "alice@byok-example.com"))
        providers, preferred = user_providers(db, user, get_settings())
        assert preferred == "anthropic" and providers["anthropic"].api_key == "sk-ant-api03-alice-key-9876"
        assert providers["openai"].base_url == "https://openrouter.ai/api/v1"
        other = db.scalar(select(User).where(User.email == "bob@byok-example.com"))
        bob_providers, bob_preferred = user_providers(db, other, get_settings())
        assert bob_preferred is None and getattr(bob_providers["anthropic"], "api_key", None) is None

    meta = client.get("/api/meta", headers=alice).json()
    assert meta["providers"]["anthropic"]["own_key"] is True and meta["preferred_provider"] == "anthropic"
    assert meta["roles"]["coding"]["offline"] is False
    assert client.get("/api/meta", headers=bob).json()["providers"]["anthropic"]["own_key"] is False

    # keep the key, change the preference, then remove
    r = client.put("/api/account/settings", headers=alice, json={"preferred_provider": "openai"})
    assert r.json()["preferred_provider"] == "openai"
    assert client.get("/api/meta", headers=alice).json()["roles"]["vision"]["provider"] == "openai"
    assert client.delete("/api/account/providers/anthropic", headers=alice).status_code == 204
    assert client.get("/api/account/providers", headers=alice).json()[0]["configured"] is False


def test_private_endpoints_are_refused(client, monkeypatch):
    headers = _register(client, "carol@byok-example.com")
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: PRIVATE_IP)
    body = {"api_key": "k", "base_url": "https://internal.example/v1", "model": "m"}
    r = client.put("/api/account/providers/openai", headers=headers, json=body)
    assert r.status_code == 422 and "private" in r.json()["detail"]
    body["base_url"] = "http://redis:6379"
    assert client.put("/api/account/providers/openai", headers=headers, json=body).status_code == 422


def test_openai_compatible_request_and_response(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": "google/gemini-2.5-pro",
                "choices": [{"message": {"content": '<file path="index.html">\nok\n</file>'}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 120, "completion_tokens": 30},
            },
        )

    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler)))
    provider = OpenAICompatibleProvider(
        "https://openrouter.ai/api/v1", "sk-or-test", default_model="google/gemini-2.5-pro"
    )
    out = provider.complete(
        model="google/gemini-2.5-pro",
        system="sys",
        max_tokens=64000,
        effort="high",
        messages=[ChatMessage("user", ["describe", ImagePart(b"\x89PNG", label="frame 1")])],
    )
    assert out.text.startswith("<file") and out.input_tokens == 120 and out.provider == "openai"
    assert seen["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-or-test"
    body = seen["body"]
    assert body["max_tokens"] == 16384 and body["messages"][0] == {"role": "system", "content": "sys"}
    parts = body["messages"][1]["content"]
    assert [p["type"] for p in parts] == ["text", "text", "image_url"]
    assert parts[2]["image_url"]["url"].startswith("data:image/png;base64,")


@pytest.mark.parametrize(
    ("project", "account", "preferred", "expected"),
    [
        ({}, {}, None, ("anthropic", "claude-opus-5-5")),  # server defaults
        ({}, {}, "openai", ("openai", "acct-default")),  # the provider the user has a key for
        ({}, {"coding": {"provider": "openai", "model": "gpt-x"}}, "anthropic", ("openai", "gpt-x")),
        (
            {"coding": {"model": "gpt-y"}},
            {"coding": {"provider": "openai", "model": "gpt-x"}},
            None,
            ("openai", "gpt-y"),
        ),
        (
            {"coding": {"provider": "anthropic"}},
            {"coding": {"provider": "openai", "model": "gpt-x"}},
            None,
            ("anthropic", "claude-opus-5-5"),
        ),  # a model chosen for another provider is not carried over
        (
            {"coding": {"provider": "anthropic", "model": "claude-sonnet-5-5"}},
            {},
            "openai",
            ("anthropic", "claude-sonnet-5-5"),
        ),  # the project wins
    ],
)
def test_role_resolution(project, account, preferred, expected):
    settings = get_settings().model_copy(update={"ai_provider": "anthropic"})
    providers = {"openai": OpenAICompatibleProvider("https://x.test/v1", "k", default_model="acct-default")}
    router = ModelRouter(
        settings, overrides=project, providers=providers, user_defaults=account, preferred_provider=preferred
    )
    cfg = router.config("coding")
    assert (cfg.provider, cfg.model) == expected
