"""Translation backends. Both are free:

- ollama: a local LLM on your GPU. Best quality, because it sees the previous
  lines and keeps names, pronouns and tone consistent. Fully offline.
- google: Google Translate's free web endpoint. No setup and fast, but needs
  internet, ignores context and is weaker for Persian.
"""

import json
import re
import urllib.error
import urllib.request
from collections.abc import Sequence

LANGUAGE_NAMES = {
    "fa": "Persian (Farsi)",
    "en": "English",
    "ar": "Arabic",
    "tr": "Turkish",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "ru": "Russian",
}

RTL_LANGUAGES = {"fa", "ar", "he", "ur", "ps"}

# (source line, its translation) pairs, oldest first.
History = Sequence[tuple[str, str]]


def build_messages(text: str, history: History, target: str) -> list[dict]:
    lang = LANGUAGE_NAMES.get(target, target)
    system = (
        f"You are a professional subtitle translator. Translate each line the user sends into "
        f"natural, fluent, conversational {lang}, the way a native speaker would say it in a dubbed film. "
        f"Keep names as they sound, keep the meaning and tone, and keep it short enough to read as a subtitle. "
        f"The lines come from live speech recognition and may be cut mid-sentence or contain small errors: "
        f"translate what was meant. Reply with the translation only, no notes, quotes or explanations."
    )
    messages = [{"role": "system", "content": system}]
    # Earlier lines go in as real turns, so the model keeps terms and pronouns consistent.
    for src, dst in history:
        messages.append({"role": "user", "content": src})
        messages.append({"role": "assistant", "content": dst})
    messages.append({"role": "user", "content": text})
    return messages


def clean_reply(reply: str) -> str:
    # Reasoning models (qwen3, deepseek-r1) wrap their thinking in <think> tags.
    reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL)
    reply = reply.strip().strip('"«»“”').strip()
    return reply


class OllamaTranslator:
    def __init__(self, model: str = "aya-expanse:8b", host: str = "http://localhost:11434", target: str = "fa"):
        self.model = model
        self.url = host.rstrip("/") + "/api/chat"
        self.target = target

    def translate(self, text: str, history: History = ()) -> str:
        body = {
            "model": self.model,
            "messages": build_messages(text, history, self.target),
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0.2},
        }
        req = urllib.request.Request(
            self.url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                reply = json.load(resp)["message"]["content"]
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise RuntimeError(f"Ollama error {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Ollama is not reachable at {self.url}. Is it running? ({exc.reason})") from exc
        return clean_reply(reply)


class GoogleTranslator:
    def __init__(self, target: str = "fa", source: str | None = None):
        from deep_translator import GoogleTranslator as _Google

        self._google = _Google(source=source or "auto", target=target)

    def translate(self, text: str, history: History = ()) -> str:
        return self._google.translate(text) or ""


def make_translator(kind: str, target: str, source: str | None, ollama_model: str, ollama_host: str):
    if kind == "ollama":
        return OllamaTranslator(model=ollama_model, host=ollama_host, target=target)
    if kind == "google":
        return GoogleTranslator(target=target, source=source)
    raise ValueError(f"unknown translator: {kind}")
