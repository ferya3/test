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
from app.video.content import ImageBox, TextLine, analyze_content, crop, is_cutout

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


def _font_size(line: TextLine, scale: float) -> int:
    # glyph box -> font size, by what the box spans: capitals only ~0.7 em, ascenders ~0.95 em,
    # ascenders + descenders (g, j, p, q, y, comma) ~1.15 em, x-height only ~0.55 em
    text = line.text
    if text.isupper():
        ratio = 0.72
    elif any(ch in "gjpqy,;" for ch in text):
        ratio = 1.15
    elif any(ch in "bdfhklt" or ch.isupper() or ch.isdigit() for ch in text):
        ratio = 0.95
    else:
        ratio = 0.6
    return max(10, int(round(line.h / ratio * scale)))


def _align(x: int, w: int, page_w: int) -> str:
    center = x + w / 2
    if abs(center - page_w / 2) < page_w * 0.04:
        return "center"
    return "right" if x > page_w * 0.55 else "left"


def _paragraphs(lines: list[TextLine], scale: float) -> list[list[TextLine]]:
    """Consecutive lines of the same size, alignment and colour form one paragraph."""
    groups: list[list[TextLine]] = []
    for line in lines:
        if groups:
            prev = groups[-1][-1]
            size_a, size_b = _font_size(prev, scale), _font_size(line, scale)
            same = (
                abs(size_a - size_b) <= max(2, 0.25 * max(size_a, size_b))  # "across the" has no ascenders
                and line.y - (prev.y + prev.h) < prev.h * 1.2
                and not prev.background
                and not line.background
                and imaging.delta_e(prev.color, line.color) < 15
                and abs((prev.x + prev.w / 2) - (line.x + line.w / 2)) < max(prev.w, line.w) * 0.6
            )
            if same:
                groups[-1].append(line)
                continue
        groups.append([line])
    return groups


def _text_elements(lines: list[TextLine], top: int, page_w: int, scale: float, kind: str) -> list[Element]:
    elements: list[Element] = []
    if kind == "header" and lines:
        logo, rest = lines[0], lines[1:]
        elements.append(Element(kind="logo", text=logo.text, style={"color": logo.color}))
        for line in rest:
            words = line.text.split()
            for word in words if len(words) <= 6 else [line.text]:
                elements.append(Element(kind="link", text=word, href="#", style={"color": line.color}))
        return elements
    have_h1 = False
    for group in _paragraphs(lines, scale):
        first = group[0]
        x0 = min(line.x for line in group)
        y0 = min(line.y for line in group)
        x1 = max(line.x + line.w for line in group)
        y1 = max(line.y + line.h for line in group)
        size = max(_font_size(line, scale) for line in group)
        text = " ".join(line.text for line in group)
        style = {
            "font_size": size,
            "color": first.color,
            "align": _align(x0, x1 - x0, page_w),
            "x": x0,
            "y": y0 - top,
            "w": x1 - x0,
            "h": y1 - y0,
            "lines": len(group),
        }
        if first.background:
            style.update(background=first.background, weight=600)
            elements.append(Element(kind="button", text=text, style=style))
            continue
        if first.text.isupper() and size < 16:  # an eyebrow / kicker above a title
            style.update(uppercase=True, letter_spacing="0.2em", weight=500)
            elements.append(Element(kind="text", text=text, style=style))
        elif size >= 30 or (size >= 24 and len(text) < 80):
            level = 1 if not have_h1 and size >= 30 else 2
            have_h1 = have_h1 or level == 1
            style["weight"] = 700
            elements.append(Element(kind="heading", level=level, text=text, style=style))
        elif size >= 17 and len(text) < 60:
            style["weight"] = 600
            elements.append(Element(kind="heading", level=3, text=text, style=style))
        else:
            elements.append(Element(kind="text", text=text, style=style))
    return elements


def heuristic_page(
    page_id: str,
    reference_key: str,
    img,
    viewport_h: int,
    route: str = "/",
    *,
    css_scale: float = 1.0,
    images: list[tuple[ImageBox, str]] | None = None,
    lines: list[TextLine] | None = None,
) -> PageAnalysis:
    """Measured page: bands -> regions. With `lines` (OCR) and `images` (extracted crops,
    each with its project path) the regions carry the real copy and pictures; without
    them, placeholders that say what kind of content goes where."""
    h, w = img.shape[:2]
    measured = imaging.bands(img)
    # a picture that crosses a band boundary belongs to one section with both bands
    spans = [[b.y0, b.y1, b] for b in measured]
    for box, _ in images or []:
        hit = [i for i, (y0, y1, _) in enumerate(spans) if y0 < box.y + box.h and box.y < y1]
        if len(hit) > 1:
            first, last = hit[0], hit[-1]
            tallest = max((spans[i] for i in hit), key=lambda sp: sp[1] - sp[0])[2]
            spans[first : last + 1] = [[spans[first][0], spans[last][1], tallest]]
    has_content = lines is not None or bool(images)

    regions: list[Region] = []
    counts: dict[str, int] = {}
    for i, (y0, y1, band) in enumerate(spans):
        band_lines = [ln for ln in lines or [] if y0 <= ln.y + ln.h / 2 < y1]
        band_images = [(b, p) for b, p in images or [] if y0 <= b.y + b.h / 2 < y1]
        kind = _region_type(i, len(spans), band.model_copy(update={"y0": y0, "y1": y1}), h, viewport_h or h)
        if len(band_images) >= 3:
            kind = "gallery"
        counts[kind] = counts.get(kind, 0) + 1
        rid = kind if counts[kind] == 1 and kind in ("header", "hero", "footer") else f"{kind}-{counts[kind]}"
        if has_content:
            if lines is not None:
                elements = _text_elements(band_lines, y0, w, css_scale, kind)
            else:  # pictures were found but no OCR engine is installed
                elements = _elements_for(kind, band.columns)[0]
            elements += [
                Element(kind="image", src=path, text="", style={"x": b.x, "y": b.y - y0, "w": b.w, "h": b.h})
                for b, path in band_images
            ]
            items: list[dict] = []
        else:
            elements, items = _elements_for(kind, band.columns)
        regions.append(
            Region(
                id=rid,
                type=kind,
                bbox=[0, y0, w, y1 - y0],
                background=band.bg,
                background_image=band.gradient,
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
        title=next((e.text for r in regions for e in r.elements if e.kind == "heading"), ""),
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


def _keep_pictures(page: PageAnalysis, draft: PageAnalysis) -> None:
    """Extracted pictures the model did not place go into the region they belong to."""
    used = {e.src for r in page.regions for e in r.elements if e.src}
    for region in draft.regions:
        for element in region.elements:
            if element.kind != "image" or not element.src or element.src in used:
                continue
            centre = region.bbox[1] + element.style.get("y", 0) + element.style.get("h", 0) / 2
            target = next(
                (r for r in page.regions if r.bbox[1] <= centre < r.bbox[1] + r.bbox[3]),
                page.regions[-1] if page.regions else None,
            )
            if target is None:
                continue
            style = dict(element.style)
            style["y"] = centre - style.get("h", 0) / 2 - target.bbox[1]
            target.elements.append(element.model_copy(update={"style": style}))


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
            draft = self._measured_page(
                f"page-{n + 1}",
                page.storage_key,
                img,
                page.viewport_height,
                route,
                video.viewport.get("width", img.shape[1]),
            )
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

    def _measured_page(
        self, page_id: str, reference_key: str, img, viewport_h: int, route: str, css_width: int
    ) -> PageAnalysis:
        """Bands + OCR text + pictures cut out of the reference (stored as project assets)."""
        boxes, lines = analyze_content(img)
        boxes = boxes[:40]
        prefix = reference_key.rsplit("/pages/", 1)[0]
        images: list[tuple[ImageBox, str]] = []
        assets: dict[str, str] = {}
        cutouts: dict[str, bool] = {}
        for k, box in enumerate(boxes, start=1):
            path = f"assets/{page_id}-img-{k}.jpg"
            key = self.storage.put(
                f"{prefix}/extracted/{page_id}-img-{k}.jpg",
                imaging.encode_jpeg(crop(img, box, pad=0), 90),
                "image/jpeg",
            )
            images.append((box, path))
            assets[path] = key
            cutouts[path] = is_cutout(img, box)
        page = heuristic_page(
            page_id,
            reference_key,
            img,
            viewport_h,
            route,
            css_scale=css_width / img.shape[1],
            images=images,
            lines=lines,
        )
        page.assets = assets
        for region in page.regions:
            for element in region.elements:
                if element.src and cutouts.get(element.src):
                    element.style["cutout"] = True  # object on the page background: soften the crop edges
        return page

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
            # OCR lines and pictures cut out of the reference (their boxes in reference px)
            "draft_elements": {r.id: [e.model_dump(exclude_defaults=True) for e in r.elements] for r in draft.regions},
            "extracted_images": sorted(draft.assets),
        }
        parts.append("Computer-vision measurements and draft:\n" + json.dumps(measured))
        parts.append(f'Return the PageAnalysis JSON with id "{draft.id}", width {w}, height {h}.')
        page = self.router.complete_json(
            "vision", prompts.VISION_PAGE, [ChatMessage("user", parts)], PageAnalysis, agent="vision-page"
        )
        page.id, page.route, page.reference_key = draft.id, draft.route, draft.reference_key
        page.width, page.height, page.viewport_height = w, h, viewport_h
        page.palette = draft.palette
        page.assets = draft.assets
        _keep_pictures(page, draft)
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
