"""UI Analysis Engine.

Always computes a measured draft from computer vision (bands, columns,
colours, sticky header, timeline). With a vision model available, the model
corrects region types, reads texts and fonts, and interprets the ordered
keyframes into behaviours. Without one, the draft is the analysis."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable

from app.ai import prompts
from app.ai.providers.base import ChatMessage, ImagePart, ProviderError
from app.ai.router import ModelRouter
from app.core.storage import Storage
from app.schemas.spec import (
    Band,
    BehaviorSpec,
    Element,
    PageAnalysis,
    Region,
    UIAnalysis,
    VideoAnalysis,
)
from app.video import imaging

log = logging.getLogger(__name__)
Progress = Callable[[float, str], None]


# ----------------------------------------------------------------- heuristics


def _region_type(i: int, n: int, band: Band, page_h: int, viewport_h: int) -> str:
    h = band.y1 - band.y0
    if i == 0 and h <= max(140, viewport_h * 0.16) and n > 1:
        return "header"
    if i == n - 1 and n > 2 and h < page_h * 0.35:
        return "footer"
    if band.columns >= 2:
        return "card-grid"
    if i <= 1 and h >= viewport_h * 0.45:
        return "hero"
    return "section"


def _elements_for(kind: str, columns: int) -> tuple[list[Element], list[dict]]:
    if kind == "header":
        return [
            Element(kind="logo", text="Brand"),
            Element(kind="link", text="Home", href="#"),
            Element(kind="link", text="Features", href="#"),
            Element(kind="link", text="Pricing", href="#"),
            Element(kind="link", text="Contact", href="#"),
        ], []
    if kind == "hero":
        return [
            Element(kind="heading", level=1, text="Headline from the recording"),
            Element(kind="text", text="Supporting copy that introduces the product in one or two sentences."),
            Element(kind="button", text="Get started"),
        ], []
    if kind == "card-grid":
        items = [
            {"title": f"Feature {i + 1}", "text": "Short description of this item.", "image": True}
            for i in range(columns)
        ]
        return [Element(kind="heading", level=2, text="Section title")], items
    if kind == "footer":
        return [
            Element(kind="logo", text="Brand"),
            Element(kind="text", text="© Brand. All rights reserved."),
        ], []
    return [
        Element(kind="heading", level=2, text="Section title"),
        Element(kind="text", text="Paragraph text describing this part of the page."),
    ], []


def heuristic_page(page_id: str, reference_key: str, img, viewport_h: int, route: str = "/") -> PageAnalysis:
    h, w = img.shape[:2]
    measured = imaging.bands(img)
    regions: list[Region] = []
    counts: dict[str, int] = {}
    for i, band in enumerate(measured):
        kind = _region_type(i, len(measured), band, h, viewport_h or h)
        counts[kind] = counts.get(kind, 0) + 1
        rid = kind if counts[kind] == 1 and kind in ("header", "hero", "footer") else f"{kind}-{counts[kind]}"
        elements, items = _elements_for(kind, band.columns)
        regions.append(
            Region(
                id=rid,
                type=kind,
                bbox=[0, band.y0, w, band.y1 - band.y0],
                background=band.bg,
                text_color=band.text_color,
                columns=band.columns,
                elements=elements,
                items=items,
                notes=f"measured band, edge density {band.density}",
            )
        )
    return PageAnalysis(
        id=page_id,
        route=route,
        title="",
        reference_key=reference_key,
        width=w,
        height=h,
        viewport_height=viewport_h,
        regions=regions,
        palette=imaging.palette(img),
    )


def heuristic_behaviors(video: VideoAnalysis, pages: list[PageAnalysis]) -> list[BehaviorSpec]:
    behaviors: list[BehaviorSpec] = []
    header_id = next((r.id for p in pages for r in p.regions if r.type == "header"), "header")
    if any(p.sticky_header_px for p in video.pages):
        behaviors.append(
            BehaviorSpec(
                id="sticky-header",
                trigger="scroll",
                target=header_id,
                effect="sticky-header",
                duration_ms=0,
                evidence={"source": "header rows unchanged while the page scrolled"},
                confidence=0.9,
            )
        )
    seen: set[str] = set()
    for ev in video.events:
        if ev.kind != "interaction" or not ev.bbox:
            continue
        duration = int(max(120, min(900, (ev.t_end - ev.t_start) * 1000 * 0.75)))
        effect, trigger, target, confidence = None, "click", header_id, 0.55
        if ev.hint in ("dropdown-menu", "menu-toggle"):
            effect, confidence = "menu-toggle", 0.75
        elif ev.hint == "side-drawer":
            effect = "drawer"
        elif ev.hint == "overlay-or-modal":
            effect, target, confidence = "modal", "body", 0.35
        elif ev.hint == "carousel-or-slider":
            effect, trigger, target, confidence = "auto-slider", "interval", "", 0.4
        elif ev.hint == "header-change":
            effect, trigger, confidence = "header-shrink", "scroll", 0.5
        elif ev.hint == "hover-or-click-feedback":
            effect, trigger, target, confidence = "hover-lift", "hover", ".card, .btn", 0.3
        if not effect or effect in seen:
            continue
        seen.add(effect)
        behaviors.append(
            BehaviorSpec(
                id=effect,
                trigger=trigger,
                target=target,
                effect=effect,
                duration_ms=duration,
                easing="ease-out",
                params={"bbox": ev.bbox},
                evidence={"t_start": ev.t_start, "t_end": ev.t_end, "event_ids": [ev.id], "frames": ev.frames},
                confidence=confidence,
            )
        )
    return behaviors


# ------------------------------------------------------------------- analyzer


class UIAnalyzer:
    def __init__(self, router: ModelRouter, storage: Storage):
        self.router = router
        self.storage = storage

    def analyze(self, video: VideoAnalysis, progress: Progress | None = None) -> UIAnalysis:
        progress = progress or (lambda p, m: None)
        offline = self.router.offline("vision")
        pages: list[PageAnalysis] = []
        notes: list[str] = []
        for n, page in enumerate(video.pages):
            img = imaging.decode_image(self.storage.get(page.storage_key))
            route = "/" if n == 0 else f"/page-{n + 1}"
            draft = heuristic_page(f"page-{n + 1}", page.storage_key, img, page.viewport_height, route)
            if offline:
                pages.append(draft)
                continue
            progress(0.1 + 0.6 * n / max(1, len(video.pages)), f"Vision model reading page {n + 1}")
            try:
                pages.append(self._llm_page(img, draft, page.viewport_height, video.dpr))
            except ProviderError as e:
                log.warning("vision page analysis failed, using measured draft: %s", e)
                notes.append(f"page {n + 1}: vision model failed ({e}); used computer-vision draft")
                pages.append(draft)

        behaviors = heuristic_behaviors(video, pages)
        if not offline and video.keyframes:
            progress(0.75, "Vision model interpreting the timeline")
            try:
                behaviors = self._llm_behaviors(video, pages, behaviors) or behaviors
            except ProviderError as e:
                notes.append(f"behaviour analysis fell back to heuristics ({e})")
        if offline:
            notes.append(
                "Offline mode: texts and fonts are placeholders; layout, colours and "
                "behaviours are measured from the recording."
            )
        return UIAnalysis(pages=pages, behaviors=behaviors, notes=notes)

    # -------------------------------------------------------------- LLM paths

    def _llm_page(self, img, draft: PageAnalysis, viewport_h: int, dpr: float) -> PageAnalysis:
        h, w = img.shape[:2]
        tile_h = viewport_h or int(w * 0.5625)
        parts: list = [
            f"Reference image: {w}x{h} px, device pixel ratio {dpr:g} "
            f"(CSS px = reference px x {round((1 / dpr), 3)} at the recorded width).",
        ]
        tiles = imaging.tiles(img, tile_h, max_tiles=6)
        step = (h - tile_h) / max(1, len(tiles) - 1) if len(tiles) > 1 else 0
        for i, tile in enumerate(tiles):
            y0 = int(i * step)
            fitted = imaging.fit_for_vision(tile)
            parts.append(
                ImagePart(
                    imaging.encode_jpeg(fitted, 85),
                    "image/jpeg",
                    label=f"Tile {i + 1}/{len(tiles)}: reference y={y0}..{y0 + tile.shape[0]} px",
                )
            )
        measured = {
            "bands": [
                r.model_dump(include={"id", "bbox", "background", "text_color", "columns"}) for r in draft.regions
            ],
            "palette": [p.model_dump() for p in draft.palette],
            "draft_types": {r.id: r.type for r in draft.regions},
        }
        parts.append("Computer-vision measurements and draft:\n" + json.dumps(measured))
        parts.append(f'Return the PageAnalysis JSON with id "{draft.id}", width {w}, height {h}.')
        page = self.router.complete_json(
            "vision", prompts.VISION_PAGE, [ChatMessage("user", parts)], PageAnalysis, agent="vision-page"
        )
        page.id, page.route, page.reference_key = draft.id, draft.route, draft.reference_key
        page.width, page.height, page.viewport_height = w, h, viewport_h
        page.palette = draft.palette
        return page

    def _llm_behaviors(
        self, video: VideoAnalysis, pages: list[PageAnalysis], draft: list[BehaviorSpec]
    ) -> list[BehaviorSpec]:
        parts: list = []
        for kf in video.keyframes[:16]:
            img = imaging.fit_for_vision(imaging.decode_image(self.storage.get(kf.storage_key)), 1024)
            parts.append(
                ImagePart(
                    imaging.encode_jpeg(img, 80),
                    "image/jpeg",
                    label=f"t={kf.t:.2f}s scene {kf.scene} ({', '.join(kf.reasons)})",
                )
            )
        context = {
            "viewport_css": video.viewport,
            "events": [e.model_dump(exclude_none=True) for e in video.events],
            "sticky_header_px": [p.sticky_header_px for p in video.pages],
            "regions": [{"id": r.id, "type": r.type, "bbox": r.bbox} for p in pages for r in p.regions],
            "heuristic_draft": [b.model_dump() for b in draft],
        }
        parts.append("Timeline and context:\n" + json.dumps(context))

        from pydantic import BaseModel

        class _Out(BaseModel):
            behaviors: list[BehaviorSpec]

        out = self.router.complete_json(
            "vision", prompts.VISION_BEHAVIOR, [ChatMessage("user", parts)], _Out, agent="vision-behavior"
        )
        return out.behaviors
