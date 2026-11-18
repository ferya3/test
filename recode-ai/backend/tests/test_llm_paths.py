"""The online (model-backed) code paths, driven by a scripted fake provider and
a fake Anthropic client, so request construction is checked without network."""

import json
from types import SimpleNamespace

from app.ai.architect.architect import Architect
from app.ai.coding.agents import FrontendAgent, QAFixAgent
from app.ai.coding.editor import EditAgent
from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.base import ChatMessage, ImagePart, LLMResult
from app.ai.router import ModelRouter
from app.ai.vision.analyzer import UIAnalyzer
from app.core.config import get_settings
from app.core.storage import get_storage
from app.qa.visual import QAOutcome, QAReport, SectionMetric
from app.video.engine import VideoIntelligenceEngine


class Scripted:
    name = "fake"

    def __init__(self, handler):
        self.handler = handler
        self.requests = []

    def available(self):
        return True

    def complete(self, *, model, system, messages, max_tokens, effort):
        self.requests.append({"model": model, "system": system, "messages": messages, "effort": effort})
        return LLMResult(text=self.handler(system, messages), model=model, provider="fake")


def _router(provider):
    overrides = {role: {"provider": "fake"} for role in ("vision", "reasoning", "coding", "qa")}
    return ModelRouter(get_settings(), overrides=overrides, providers={"fake": provider})


def test_online_pipeline_pieces(recording):
    path, _ = recording
    storage = get_storage()
    video = VideoIntelligenceEngine(get_settings(), storage).analyze_video(path, "t/llm")

    def handler(system, messages):
        parts = messages[0].content
        if "UI Analysis Engine" in system:
            return json.dumps(
                {
                    "id": "page-1",
                    "title": "Acme",
                    "width": 1,
                    "height": 1,
                    "regions": [
                        {
                            "id": "header",
                            "type": "header",
                            "bbox": [0, 0, 1280, 80],
                            "background": "#0f172a",
                            "elements": [{"kind": "logo", "text": "Acme"}, {"kind": "link", "text": "قیمت‌ها"}],
                        },
                        {
                            "id": "hero",
                            "type": "hero",
                            "bbox": [0, 80, 1280, 600],
                            "background": "#1e3a8a",
                            "elements": [{"kind": "heading", "level": 1, "text": "ساخت سایت با ویدئو"}],
                        },
                    ],
                    "typography": {
                        "heading_font": "Vazirmatn",
                        "body_font": "Vazirmatn",
                        "base_size_px": 16,
                        "scale": {"h1": 52},
                    },
                }
            )
        if "motion analyst" in system:
            assert any(isinstance(p, ImagePart) and "t=" in p.label for p in parts)
            return json.dumps(
                {
                    "behaviors": [
                        {
                            "id": "menu",
                            "trigger": "click",
                            "target": "header",
                            "effect": "menu-toggle",
                            "duration_ms": 300,
                            "confidence": 0.8,
                        }
                    ]
                }
            )
        if "AI Architect" in system:
            payload = json.loads(parts[0])
            draft = payload["draft_spec"]
            draft["project_name"] = "Acme"
            for s in draft["pages"][0]["sections"]:
                s.pop("source", None)  # the router must restore QA anchors
            return "```json\n" + json.dumps(draft) + "\n```"
        if "Frontend Agent" in system:
            assert any(isinstance(p, ImagePart) for p in parts), "reference images must be sent"
            return (
                '<file path="index.html">\n<link rel="stylesheet" href="./styles.css" />'
                '<header id="header" data-section="header"></header>\n</file>\nDone.'
            )
        if "QA Agent" in system:
            labels = [p.label for p in parts if isinstance(p, ImagePart)]
            assert labels == ["Section 'hero' - REFERENCE", "Section 'hero' - CURRENT RENDER"]
            return '<file path="styles.css">\n#hero { min-height: 600px; }\n</file>'
        if "editing agent" in system:
            return '<file path="styles.css">\nbody { font-family: IRANSans; }\n</file>\n<reply>فونت تغییر کرد.</reply>'
        raise AssertionError(system[:80])

    provider = Scripted(handler)
    router = _router(provider)

    ui = UIAnalyzer(router, storage).analyze(video)
    assert ui.pages[0].regions[1].elements[0].text == "ساخت سایت با ویدئو"
    assert ui.pages[0].reference_key == video.pages[0].storage_key
    assert ui.behaviors[0].effect == "menu-toggle"

    spec = Architect(router).design(ui, video.viewport, name="Acme", framework="html")
    assert spec.direction == "rtl"
    assert spec.pages[0].sections[0].source["page_width"] == video.pages[0].width  # restored from draft

    result = FrontendAgent(router, storage).run(spec)
    # styles.css is referenced but not written -> taken from the scaffold; app.js is not referenced
    assert set(result.files) == {"index.html", "styles.css"}

    outcome = QAOutcome(
        QAReport(
            score=60,
            passed=False,
            threshold=88,
            sections=[SectionMetric(page_id="page-1", id="hero", ref_y=80, ref_h=600, out_y=80, out_h=500, score=60)],
        ),
        crops=[("hero", b"r", b"o")],
    )
    fix = QAFixAgent(router, storage).run(spec, result.files, outcome)
    assert fix.files == {"styles.css": "#hero { min-height: 600px; }\n"}

    edit = EditAgent(router).run(spec, result.files, "فونت را به ایران‌سنس تغییر بده", [])
    assert edit.reply == "فونت تغییر کرد." and "styles.css" in edit.files

    systems = [r["system"][:20] for r in provider.requests]
    assert len(systems) == 6


def test_anthropic_request_shape(monkeypatch):
    sent = {}

    class FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get_final_message(self):
            return SimpleNamespace(
                stop_reason="end_turn",
                model="claude-opus-5-5",
                content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text="ok")],
                usage=SimpleNamespace(
                    input_tokens=100, output_tokens=20, cache_creation_input_tokens=0, cache_read_input_tokens=50
                ),
            )

    def stream(**kwargs):
        sent.update(kwargs)
        return FakeStream()

    provider = AnthropicProvider(server_fallback=True)
    provider._client = SimpleNamespace(
        beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)), messages=SimpleNamespace(stream=stream)
    )
    out = provider.complete(
        model="claude-opus-5-5",
        system="sys",
        messages=[ChatMessage("user", ["hi", ImagePart(b"\x89PNG", label="ref")])],
        max_tokens=64000,
        effort="high",
    )
    assert out.text == "ok" and out.cache_read_tokens == 50
    assert sent["thinking"] == {"type": "adaptive"}
    assert sent["output_config"] == {"effort": "high"}
    assert sent["fallbacks"] == "default" and sent["betas"] == ["server-side-fallback-2026-07-01"]
    assert sent["system"][0]["cache_control"] == {"type": "ephemeral"}
    blocks = sent["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["text", "text", "image"]
    assert blocks[2]["source"]["media_type"] == "image/png"
