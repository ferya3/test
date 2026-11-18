"""Model router: one (provider, model, effort) per role, overridable per project.

    vision     -> reads keyframes / stitched pages        (UI Analysis Engine)
    reasoning  -> turns analysis into a DesignSpec         (AI Architect)
    coding     -> writes and edits files                    (Code Generation agents)
    qa         -> compares render vs reference and fixes    (QA agent)

The "embedding" role (finding relevant files for an edit) is served locally by
app.ai.retrieval, so it never needs a vendor endpoint."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.base import ChatMessage, LLMProvider, LLMResult, ProviderError
from app.core.binary import is_binary
from app.core.config import Settings

log = logging.getLogger(__name__)

ROLES = ("vision", "reasoning", "coding", "qa")
T = TypeVar("T", bound=BaseModel)

UsageRecorder = Callable[[str, str, LLMResult], None]  # (role, agent, result)


@dataclass
class RoleConfig:
    provider: str
    model: str
    effort: str | None


class ModelRouter:
    def __init__(
        self,
        settings: Settings,
        overrides: dict[str, Any] | None = None,
        recorder: UsageRecorder | None = None,
        providers: dict[str, LLMProvider] | None = None,
    ):
        self.settings = settings
        self.overrides = overrides or {}
        self.recorder = recorder
        self.providers: dict[str, LLMProvider] = providers or {
            "anthropic": AnthropicProvider(server_fallback=settings.anthropic_server_fallback)
        }

    def config(self, role: str) -> RoleConfig:
        o = self.overrides.get(role) or {}
        return RoleConfig(
            provider=o.get("provider") or self.settings.ai_provider,
            model=o.get("model") or getattr(self.settings, f"model_{role}"),
            effort=o.get("effort") or getattr(self.settings, f"effort_{role}"),
        )

    def offline(self, role: str) -> bool:
        """True when this role should use the deterministic heuristic path."""
        cfg = self.config(role)
        if cfg.provider == "heuristic":
            return True
        provider = self.providers.get(cfg.provider)
        if provider is None or not provider.available():
            if self.settings.allow_offline_fallback:
                return True
            raise ProviderError(f"No credentials configured for provider '{cfg.provider}'")
        return False

    def describe(self) -> dict[str, dict[str, Any]]:
        out = {}
        for role in ROLES:
            cfg = self.config(role)
            out[role] = {
                "provider": cfg.provider,
                "model": cfg.model,
                "effort": cfg.effort,
                "offline": self.offline(role),
            }
        return out

    # ------------------------------------------------------------------ calls

    def complete(
        self, role: str, system: str, messages: list[ChatMessage], *, agent: str = "", max_tokens: int = 64000
    ) -> LLMResult:
        cfg = self.config(role)
        provider = self.providers[cfg.provider]
        result = provider.complete(
            model=cfg.model, system=system, messages=messages, max_tokens=max_tokens, effort=cfg.effort
        )
        if self.recorder:
            try:
                self.recorder(role, agent, result)
            except Exception:  # usage accounting must never break generation
                log.exception("usage recorder failed")
        return result

    def complete_json(
        self,
        role: str,
        system: str,
        messages: list[ChatMessage],
        schema: type[T],
        *,
        agent: str = "",
        max_tokens: int = 64000,
    ) -> T:
        """JSON answer validated against a pydantic schema, with one repair round."""
        result = self.complete(role, system, messages, agent=agent, max_tokens=max_tokens)
        try:
            return schema.model_validate(extract_json(result.text))
        except (ValueError, ValidationError) as first_error:
            repair = messages + [
                ChatMessage("assistant", [result.text]),
                ChatMessage(
                    "user",
                    [
                        "That answer could not be parsed. Error:\n"
                        f"{str(first_error)[:2000]}\n\n"
                        "Reply again with only the corrected JSON object, no prose, no code fences."
                    ],
                ),
            ]
            result = self.complete(role, system, repair, agent=f"{agent}:repair", max_tokens=max_tokens)
            try:
                return schema.model_validate(extract_json(result.text))
            except (ValueError, ValidationError) as e:
                raise ProviderError(f"{agent or role}: model returned invalid JSON twice: {e}") from e

    def complete_files(
        self, role: str, system: str, messages: list[ChatMessage], *, agent: str = "", max_tokens: int = 64000
    ) -> tuple[dict[str, str], str]:
        """Answer containing <file path="..."> blocks. Returns (files, notes)."""
        result = self.complete(role, system, messages, agent=agent, max_tokens=max_tokens)
        files = parse_file_blocks(result.text)
        notes = FILE_BLOCK.sub("", result.text).strip()
        return files, notes[:4000]


# ---------------------------------------------------------------------- parsing

FILE_BLOCK = re.compile(r'<file\s+path="([^"]+)"\s*>\n?(.*?)\n?</file>', re.DOTALL)
DELETE_BLOCK = re.compile(r'<delete\s+path="([^"]+)"\s*/>')


def parse_file_blocks(text: str) -> dict[str, str]:
    files: dict[str, str] = {}
    for path, body in FILE_BLOCK.findall(text):
        body = re.sub(r"^```[a-zA-Z0-9]*\n", "", body)
        body = re.sub(r"\n```\s*$", "", body)
        files[path.strip().lstrip("/")] = body if body.endswith("\n") else body + "\n"
    for path in DELETE_BLOCK.findall(text):
        files[path.strip().lstrip("/")] = ""  # empty string = delete
    return files


def format_files(files: dict[str, str], limit_chars: int = 180_000) -> str:
    parts, used = [], 0
    for path in sorted(files):
        body = files[path]
        if is_binary(path):  # pictures are listed, not inlined
            parts.append(f'<file path="{path}" binary="image or font, already in the project"/>')
            continue
        if used + len(body) > limit_chars:
            parts.append(f'<file path="{path}" omitted="too large ({len(body)} chars)"/>')
            continue
        parts.append(f'<file path="{path}">\n{body}</file>')
        used += len(body)
    return "\n".join(parts)


def extract_json(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start = min((i for i in (candidate.find("{"), candidate.find("[")) if i >= 0), default=-1)
    if start < 0:
        raise ValueError("no JSON object found")
    decoder = json.JSONDecoder()
    value, _ = decoder.raw_decode(candidate[start:])
    return value
