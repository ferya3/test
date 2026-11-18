"""Any endpoint that speaks the OpenAI chat-completions protocol.

Covers OpenRouter, OpenAI, Google Gemini (OpenAI-compatible endpoint), local
Ollama / LM Studio / vLLM, and relay services that resell model access behind
that protocol. Images are sent as data-URI `image_url` parts; the model must
support vision for the vision role."""

from __future__ import annotations

import base64
import time

import httpx

from app.ai.providers.base import ChatMessage, ImagePart, LLMResult, ProviderError


class OpenAICompatibleProvider:
    name = "openai"

    def __init__(self, base_url: str, api_key: str | None, default_model: str | None = None, timeout: float = 600):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_model = default_model
        self.timeout = timeout

    def available(self) -> bool:
        return bool(self.base_url and self.default_model)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _content(parts: list[str | ImagePart]) -> list[dict]:
        out: list[dict] = []
        for part in parts:
            if isinstance(part, ImagePart):
                if part.label:
                    out.append({"type": "text", "text": part.label})
                data = base64.standard_b64encode(part.data).decode()
                out.append({"type": "image_url", "image_url": {"url": f"data:{part.media_type};base64,{data}"}})
            else:
                out.append({"type": "text", "text": part})
        return out

    def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[ChatMessage],
        max_tokens: int,
        effort: str | None,
    ) -> LLMResult:
        body = {
            "model": model,
            "messages": [{"role": "system", "content": system}]
            + [{"role": m.role, "content": self._content(m.content)} for m in messages],
            # many compatible servers reject the huge limits Claude accepts
            "max_tokens": min(max_tokens, 16384),
        }
        started = time.monotonic()
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions", json=body, headers=self._headers())
        except httpx.TimeoutException as e:
            raise ProviderError("The model endpoint timed out", retryable=True) from e
        except httpx.HTTPError as e:
            raise ProviderError(f"Could not reach {self.base_url}: {e.__class__.__name__}", retryable=True) from e
        if resp.status_code in (401, 403):
            raise ProviderError("The API key was rejected by the model endpoint")
        if resp.status_code == 429:
            raise ProviderError("Rate limited by the model endpoint", retryable=True)
        if resp.status_code >= 400:
            raise ProviderError(
                f"Model endpoint error {resp.status_code}: {resp.text[:300]}", retryable=resp.status_code >= 500
            )
        try:
            data = resp.json()
            choice = data["choices"][0]
            text = choice["message"].get("content") or ""
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise ProviderError(f"Unexpected response from the model endpoint: {resp.text[:300]}") from e
        if isinstance(text, list):  # some servers return content parts
            text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
        if choice.get("finish_reason") == "length":
            raise ProviderError("The model ran out of output tokens; the result would be truncated")
        usage = data.get("usage") or {}
        return LLMResult(
            text=text,
            model=data.get("model") or model,
            provider=self.name,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=int((time.monotonic() - started) * 1000),
            stop_reason=choice.get("finish_reason") or "",
        )

    def list_models(self) -> list[str]:
        with httpx.Client(timeout=30) as client:
            resp = client.get(f"{self.base_url}/models", headers=self._headers())
        if resp.status_code in (401, 403):
            raise ProviderError("The API key was rejected by the model endpoint")
        if resp.status_code >= 400:
            raise ProviderError(f"Model endpoint error {resp.status_code}: {resp.text[:200]}")
        items = resp.json().get("data") or resp.json().get("models") or []
        return sorted({str(m.get("id") or m.get("name")) for m in items if isinstance(m, dict)})
