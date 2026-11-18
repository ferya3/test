"""Provider-neutral interface. Engines talk to roles (vision / reasoning /
coding / qa), never to a vendor SDK, so models can be swapped per role."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ImagePart:
    data: bytes
    media_type: str = "image/png"
    label: str = ""  # rendered as a caption text block before the image


@dataclass
class ChatMessage:
    role: str  # user | assistant
    content: list[str | ImagePart] = field(default_factory=list)


@dataclass
class LLMResult:
    text: str
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    latency_ms: int = 0
    stop_reason: str = ""


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class ProviderRefusal(ProviderError):
    pass


class LLMProvider(Protocol):
    name: str

    def available(self) -> bool: ...

    def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[ChatMessage],
        max_tokens: int,
        effort: str | None,
    ) -> LLMResult: ...


# USD per 1M tokens (input, output). Used for the model_usage cost column.
PRICING: dict[str, tuple[float, float]] = {
    "claude-fable-5-2": (8.0, 40.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> float:
    price_in, price_out = PRICING.get(model, (0.0, 0.0))
    cached = cache_read_tokens * price_in * 0.1
    return round((input_tokens * price_in + output_tokens * price_out + cached) / 1_000_000, 6)
