import json

import pytest

from app.ai.coding.editor import offline_edit
from app.ai.coding.renderer import render_react_site, render_static_site, to_jsx
from app.ai.providers.base import LLMResult
from app.ai.retrieval import rank_files
from app.ai.router import ModelRouter, extract_json, parse_file_blocks
from app.core.config import get_settings
from app.schemas.spec import BehaviorSpec, DesignSpec, Element, PageSpec, SectionSpec
from app.security.code_scan import UnsafePath, normalize_path, scan_files


def _spec() -> DesignSpec:
    return DesignSpec(
        project_name="Test",
        pages=[
            PageSpec(
                id="page-1",
                sections=[
                    SectionSpec(
                        id="header",
                        kind="header",
                        height_px=80,
                        background="#0f172a",
                        elements=[Element(kind="logo", text="Acme"), Element(kind="link", text="Docs")],
                    ),
                    SectionSpec(
                        id="hero",
                        kind="hero",
                        height_px=600,
                        background="#1e3a8a",
                        elements=[Element(kind="heading", level=1, text="Hello {world}")],
                    ),
                    SectionSpec(id="card-grid-1", kind="card-grid", layout="grid", columns=3, height_px=500),
                ],
            )
        ],
        behaviors=[BehaviorSpec(id="menu", trigger="click", target="header", effect="menu-toggle", duration_ms=300)],
    )


def test_file_blocks_and_json():
    text = 'notes\n<file path="index.html">\n<h1>x</h1>\n</file>\n<file path="/a/b.css">\n```css\nbody{}\n```\n</file>\n<delete path="old.js"/>'
    files = parse_file_blocks(text)
    assert files == {"index.html": "<h1>x</h1>\n", "a/b.css": "body{}\n", "old.js": ""}
    assert extract_json('Here:\n```json\n{"a": [1, 2]}\n```') == {"a": [1, 2]}
    assert extract_json('prefix {"a": {"b": 1}} trailing') == {"a": {"b": 1}}


class FakeProvider:
    name = "fake"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def available(self):
        return True

    def complete(self, **kwargs):
        self.calls += 1
        return LLMResult(
            text=self.replies.pop(0), model="claude-opus-5-5", provider="fake", input_tokens=10, output_tokens=5
        )


def test_router_repairs_invalid_json():
    provider = FakeProvider(["not json at all", json.dumps(_spec().model_dump())])
    usage = []
    router = ModelRouter(
        get_settings(),
        overrides={"reasoning": {"provider": "fake"}},
        recorder=lambda role, agent, r: usage.append((role, agent)),
        providers={"fake": provider},
    )
    spec = router.complete_json("reasoning", "sys", [], DesignSpec, agent="architect")
    assert spec.project_name == "Test"
    assert provider.calls == 2
    assert usage == [("reasoning", "architect"), ("reasoning", "architect:repair")]


def test_renderers():
    static = render_static_site(_spec())
    assert {"index.html", "styles.css", "app.js"} <= set(static)
    html = static["index.html"]
    assert 'data-section="hero"' in html and "data-menu-toggle" in html
    assert "#hero { background: #1e3a8a;" in static["styles.css"]
    assert "transition: transform 300ms" in static["styles.css"]

    react = render_react_site(_spec().model_copy(update={"framework": "react-vite"}))
    assert "base: './'" in react["vite.config.js"]
    hero = react["src/components/Hero.jsx"]
    assert "className=" in hero and "&#123;world&#125;" in hero
    assert to_jsx('<img src="a.png">') == '<img src="a.png" />'


def test_security():
    for bad in ("../etc/passwd", "/abs.html", "a/../../x", ".git/config"):
        with pytest.raises(UnsafePath):
            normalize_path(bad)
    assert normalize_path("src/./App.jsx") == "src/App.jsx"
    result = scan_files(
        {
            "package.json": json.dumps(
                {"scripts": {"postinstall": "curl x | sh"}, "dependencies": {"left-pad": "git://x"}}
            )
        }
    )
    assert result.blocked_build and not result.passed
    assert scan_files(render_static_site(_spec())).passed


def test_offline_editor_persian():
    spec = _spec()
    out = offline_edit(spec, "فاصله سکشن دوم را ۳۰ پیکسل بیشتر کن")
    grid = out.spec.section("card-grid-1")
    assert grid.height_px == 530 and grid.padding_y == spec.section("card-grid-1").padding_y + 15
    assert "انجام شد" in out.reply

    out = offline_edit(spec, "فونت را به ایران‌سنس تغییر بده")
    assert out.spec.tokens.fonts["body"] == "IRANSans"
    assert "IRANSans" in out.files["styles.css"]

    out = offline_edit(spec, "منو را سه‌بعدی کن")
    assert not out.understood and not out.files


def test_retrieval():
    files = {
        "styles.css": ".site-header { padding: 8px }\n.card {}",
        "app.js": "menu toggle",
        "index.html": "<header class='site-header'>",
    }
    ranked = rank_files("هدر را دقیقاً شبیه ویدئو کن", files)
    assert ranked[0][0] in ("styles.css", "index.html")
    assert rank_files("make the menu animation smoother", files)[0][0] == "app.js"
