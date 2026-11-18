"""Claude via the official Anthropic SDK.

* adaptive thinking + per-role effort,
* streaming (code generation easily exceeds non-streaming timeouts),
* prompt caching on the (stable) system prompt,
* server-side refusal fallback on models that support it."""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import anthropic

from app.ai.providers.base import ChatMessage, ImagePart, LLMResult, ProviderError, ProviderRefusal

# models that accept `fallbacks: "default"` (beta server-side-fallback-2026-07-01)
_FALLBACK_MODELS = {"claude-fable-5-2", "claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
# older models that reject adaptive thinking / effort
_LEGACY_PREFIXES = ("claude-haiku-4", "claude-sonnet-4-5", "claude-opus-4-5", "claude-3")


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, server_fallback: bool = True, timeout: float = 900.0):
        self.server_fallback = server_fallback
        self.timeout = timeout
        self._client: anthropic.Anthropic | None = None

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic(timeout=self.timeout, max_retries=3)
        return self._client

    def available(self) -> bool:
        if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
            return True
        # `ant auth login` profile
        return (Path.home() / ".config" / "anthropic").exists()

    @staticmethod
    def _content(parts: list[str | ImagePart]) -> list[dict]:
        blocks: list[dict] = []
        for part in parts:
            if isinstance(part, ImagePart):
                if part.label:
                    blocks.append({"type": "text", "text": part.label})
                blocks.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": part.media_type,
                            "data": base64.standard_b64encode(part.data).decode(),
                        },
                    }
                )
            else:
                blocks.append({"type": "text", "text": part})
        return blocks

    def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[ChatMessage],
        max_tokens: int,
        effort: str | None,
    ) -> LLMResult:
        legacy = model.startswith(_LEGACY_PREFIXES)
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": m.role, "content": self._content(m.content)} for m in messages],
        }
        if not legacy:
            kwargs["thinking"] = {"type": "adaptive"}
            if effort:
                kwargs["output_config"] = {"effort": effort}

        started = time.monotonic()
        try:
            if self.server_fallback and model in _FALLBACK_MODELS:
                with self.client.beta.messages.stream(
                    **kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
                ) as stream:
                    message = stream.get_final_message()
            else:
                with self.client.messages.stream(**kwargs) as stream:
                    message = stream.get_final_message()
        except anthropic.BadRequestError as e:
            raise ProviderError(f"Claude rejected the request: {e.message}") from e
        except anthropic.AuthenticationError as e:
            raise ProviderError("Anthropic credentials are missing or invalid") from e
        except anthropic.RateLimitError as e:
            raise ProviderError("Rate limited by the Anthropic API", retryable=True) from e
        except anthropic.APIStatusError as e:
            raise ProviderError(f"Anthropic API error {e.status_code}", retryable=e.status_code >= 500) from e
        except anthropic.APIConnectionError as e:
            raise ProviderError("Could not reach the Anthropic API", retryable=True) from e

        if message.stop_reason == "refusal":
            details = getattr(message, "stop_details", None)
            category = getattr(details, "category", None) if details else None
            raise ProviderRefusal(f"The model declined this request (category: {category or 'unspecified'})")
        if message.stop_reason == "max_tokens":
            raise ProviderError("The model ran out of output tokens; the result would be truncated")

        text = "".join(block.text for block in message.content if block.type == "text")
        usage = message.usage
        return LLMResult(
            text=text,
            model=message.model,
            provider=self.name,
            input_tokens=(usage.input_tokens or 0) + (getattr(usage, "cache_creation_input_tokens", 0) or 0),
            output_tokens=usage.output_tokens or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
            latency_ms=int((time.monotonic() - started) * 1000),
            stop_reason=message.stop_reason or "",
        )
