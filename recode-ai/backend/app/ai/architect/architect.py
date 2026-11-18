"""AI Architect: UIAnalysis -> DesignSpec (pages, sections, tokens, components, behaviours)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.ai import prompts
from app.ai.providers.base import ChatMessage, ProviderError
from app.ai.router import ModelRouter
from app.schemas.spec import (
    BehaviorSpec,
    ComponentSpec,
    DesignSpec,
    DesignTokens,
    Element,
    PageSpec,
    SectionSpec,
    TypeStyle,
    UIAnalysis,
)
from app.video import imaging

log = logging.getLogger(__name__)

_COMPONENT = {
    "header": "SiteHeader",
    "nav": "SiteHeader",
    "hero": "Hero",
    "card-grid": "CardGrid",
    "features": "CardGrid",
    "gallery": "Gallery",
    "testimonials": "CardGrid",
    "pricing": "CardGrid",
    "cta": "CallToAction",
    "footer": "SiteFooter",
    "form": "ContactForm",
    "faq": "Faq",
    "stats": "Stats",
    "logos": "LogoStrip",
}
_RTL = re.compile(r"[֐-ࣿ]")


def _tokens(ui: UIAnalysis) -> DesignTokens:
    tokens = DesignTokens()
    palette = [c for p in ui.pages for c in p.palette]
    if palette:
        bg = max(palette, key=lambda c: c.share).hex
        tokens.colors["background"] = bg
        tokens.colors["text"] = imaging.contrast_text(bg)
        accent = imaging.accent_color(palette)
        if accent:
            tokens.colors["primary"] = accent
            tokens.colors["on-primary"] = imaging.contrast_text(accent)
        surfaces = [c.hex for c in palette if c.hex != bg and imaging.delta_e(c.hex, bg) < 12]
        if surfaces:
            tokens.colors["surface"] = surfaces[0]
    if ui.pages:
        typo = ui.pages[0].typography
        tokens.fonts = {"heading": typo.heading_font, "body": typo.body_font}
        scale = typo.scale
        tokens.type_scale = {
            "h1": TypeStyle(size=scale.get("h1", 56), weight=700, line_height=1.1),
            "h2": TypeStyle(size=scale.get("h2", 36), weight=700, line_height=1.2),
            "h3": TypeStyle(size=scale.get("h3", 22), weight=600, line_height=1.3),
            "body": TypeStyle(size=scale.get("body", typo.base_size_px), weight=400, line_height=1.6),
            "small": TypeStyle(size=scale.get("small", 14), weight=400, line_height=1.5),
        }
    return tokens


def heuristic_spec(
    ui: UIAnalysis,
    viewport: dict[str, int],
    *,
    name: str,
    framework: str,
    description: str = "",
) -> DesignSpec:
    spec = DesignSpec(project_name=name, framework=framework, viewport=dict(viewport), tokens=_tokens(ui))
    css_w = viewport.get("width", 1280)
    components: dict[str, ComponentSpec] = {}
    for page in ui.pages:
        scale = css_w / page.width if page.width else 1.0
        sections = []
        for region in page.regions:
            kind = region.type
            component = _COMPONENT.get(kind, "Section")
            h = int(round(region.bbox[3] * scale))
            sections.append(
                SectionSpec(
                    id=region.id,
                    kind=kind,
                    component=component,
                    layout="grid" if region.columns > 1 else ("row" if kind == "header" else "stack"),
                    columns=max(1, region.columns),
                    height_px=h,
                    background=region.background,
                    text_color=region.text_color,
                    padding_y=0 if kind == "header" else max(24, min(96, h // 8)),
                    sticky=False,
                    elements=region.elements,
                    items=region.items,
                    source={
                        "reference_key": page.reference_key,
                        "y": region.bbox[1],
                        "h": region.bbox[3],
                        "page_width": page.width,
                    },
                )
            )
            comp = components.setdefault(
                component, ComponentSpec(name=component, kind=kind, description=f"{kind} section")
            )
            comp.used_in.append(region.id)
        spec.pages.append(
            PageSpec(
                id=page.id,
                route=page.route,
                title=page.title or name,
                reference_key=page.reference_key,
                reference_width=page.width,
                reference_height=page.height,
                sections=sections,
            )
        )
    spec.components = list(components.values())
    spec.behaviors = list(ui.behaviors)
    for b in spec.behaviors:
        if b.effect == "sticky-header":
            sec = spec.section(b.target)
            if sec:
                sec.sticky = True
    if not spec.pages:
        spec.pages.append(_prompt_page(name, description))
        spec.assumptions.append("No reference media: the layout is a standard landing page built from the description.")
    texts = " ".join(e.text for p in spec.pages for s in p.sections for e in s.elements) + description
    if _RTL.search(texts):
        spec.direction, spec.language = "rtl", "fa"
        spec.tokens.fonts = {"heading": "Vazirmatn", "body": "Vazirmatn"}
    spec.assumptions.extend(ui.notes)
    return spec


def _prompt_page(name: str, description: str) -> PageSpec:
    desc = description.strip() or f"{name} - a modern website."
    return PageSpec(
        id="page-1",
        route="/",
        title=name,
        sections=[
            SectionSpec(
                id="header",
                kind="header",
                component="SiteHeader",
                layout="row",
                height_px=72,
                padding_y=0,
                sticky=True,
                elements=[
                    Element(kind="logo", text=name),
                    Element(kind="link", text="Features"),
                    Element(kind="link", text="Contact"),
                ],
            ),
            SectionSpec(
                id="hero",
                kind="hero",
                component="Hero",
                height_px=560,
                elements=[
                    Element(kind="heading", level=1, text=name),
                    Element(kind="text", text=desc[:300]),
                    Element(kind="button", text="Get started"),
                ],
            ),
            SectionSpec(
                id="card-grid-1",
                kind="card-grid",
                component="CardGrid",
                layout="grid",
                columns=3,
                height_px=520,
                elements=[Element(kind="heading", level=2, text="Features")],
                items=[{"title": f"Feature {i}", "text": "Describe a benefit here.", "image": True} for i in (1, 2, 3)],
            ),
            SectionSpec(
                id="footer",
                kind="footer",
                component="SiteFooter",
                height_px=200,
                elements=[Element(kind="text", text=f"© {name}")],
            ),
        ],
    )


class Architect:
    def __init__(self, router: ModelRouter):
        self.router = router

    def design(
        self,
        ui: UIAnalysis,
        viewport: dict[str, int],
        *,
        name: str,
        framework: str,
        description: str = "",
        overrides: dict[str, Any] | None = None,
    ) -> DesignSpec:
        draft = heuristic_spec(ui, viewport, name=name, framework=framework, description=description)
        spec = draft
        if not self.router.offline("reasoning"):
            try:
                spec = self._llm(ui, draft, viewport, description)
            except ProviderError as e:
                log.warning("architect fell back to heuristic spec: %s", e)
                draft.assumptions.append(f"Architect model failed ({e}); spec derived from measurements.")
                spec = draft
        spec.framework = framework  # type: ignore[assignment]
        spec.viewport = dict(viewport)
        self._apply_overrides(spec, overrides or {})
        return spec

    def _llm(self, ui: UIAnalysis, draft: DesignSpec, viewport: dict[str, int], description: str) -> DesignSpec:
        scale = {p.id: round(viewport.get("width", 1280) / p.width, 4) for p in ui.pages if p.width}
        payload = {
            "project_description": description,
            "viewport_css": viewport,
            "scale_reference_px_to_css_px": scale,
            "ui_analysis": ui.model_dump(),
            "draft_spec": draft.model_dump(),
        }
        spec = self.router.complete_json(
            "reasoning",
            prompts.ARCHITECT,
            [ChatMessage("user", [json.dumps(payload)])],
            DesignSpec,
            agent="architect",
        )
        # keep QA anchors even if the model dropped them
        for page in spec.pages:
            dpage = next((p for p in draft.pages if p.id == page.id), None)
            if not dpage:
                continue
            page.reference_key = page.reference_key or dpage.reference_key
            page.reference_width = page.reference_width or dpage.reference_width
            page.reference_height = page.reference_height or dpage.reference_height
            for section in page.sections:
                dsec = draft.section(section.id)
                if dsec and not section.source:
                    section.source = dsec.source
        if not spec.behaviors:
            spec.behaviors = [BehaviorSpec.model_validate(b.model_dump()) for b in draft.behaviors]
        return spec

    @staticmethod
    def _apply_overrides(spec: DesignSpec, overrides: dict[str, Any]) -> None:
        if overrides.get("font_override"):
            spec.tokens.fonts = {"heading": overrides["font_override"], "body": overrides["font_override"]}
        if overrides.get("direction"):
            spec.direction = overrides["direction"]
        if overrides.get("language"):
            spec.language = overrides["language"]
