"""Structured specifications passed between the engines.

VideoAnalysis  (Video Intelligence Engine)  -> what happened, and when
UIAnalysis     (UI Analysis Engine)         -> what is on screen
DesignSpec     (AI Architect)               -> what to build
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


# --------------------------------------------------------------------------
# Video Intelligence
# --------------------------------------------------------------------------


class VideoMeta(Loose):
    width: int
    height: int
    fps: float
    duration: float
    frame_count: int = 0
    codec: str = ""
    has_audio: bool = False


class TimelineEvent(Loose):
    """Something that happened between two moments of the recording.

    Order matters: a menu that appears at t=3.2s after a click at the top-right
    is a *behaviour*, not just a second layout."""

    id: str
    kind: Literal["scroll", "cut", "interaction"]
    t_start: float
    t_end: float
    # scroll
    direction: Literal["down", "up"] | None = None
    distance_px: float = 0.0
    # interaction (bbox normalised 0..1 in viewport space)
    bbox: list[float] | None = None
    area_ratio: float = 0.0
    hint: str = ""
    frames: list[int] = Field(default_factory=list)  # keyframe indices that document it


class Keyframe(Loose):
    index: int  # source frame index
    t: float
    scene: int
    reasons: list[str] = Field(default_factory=list)
    storage_key: str = ""
    width: int = 0
    height: int = 0


class StitchedPage(Loose):
    scene: int
    t_start: float
    t_end: float
    storage_key: str = ""
    width: int = 0
    height: int = 0
    viewport_height: int = 0  # in stitched pixels
    sticky_header_px: int = 0


class Band(Loose):
    y0: int
    y1: int
    bg: str
    gradient: str | None = None  # CSS linear-gradient(...) when the background is not flat
    text_color: str = "#111111"
    columns: int = 1
    density: float = 0.0


class PaletteColor(Loose):
    hex: str
    share: float


class VideoAnalysis(Loose):
    meta: VideoMeta
    dpr: float = 1.0
    viewport: dict[str, int]  # css px
    sample_fps: float
    events: list[TimelineEvent] = Field(default_factory=list)
    keyframes: list[Keyframe] = Field(default_factory=list)
    pages: list[StitchedPage] = Field(default_factory=list)
    palette: list[PaletteColor] = Field(default_factory=list)


# --------------------------------------------------------------------------
# UI Analysis
# --------------------------------------------------------------------------


class Element(Loose):
    kind: Literal["heading", "text", "button", "link", "image", "icon", "input", "list", "logo", "video", "badge"] = (
        "text"
    )
    text: str = ""
    level: int | None = None
    href: str | None = None
    items: list[str] = Field(default_factory=list)
    src: str | None = None  # project-relative path of an extracted image (assets/img-1.jpg)
    # font_size / color / align / background / weight / uppercase / letter_spacing, and for
    # canvas layouts the box in reference px relative to its section: x, y, w, h
    style: dict[str, Any] = Field(default_factory=dict)


class Region(Loose):
    id: str
    type: str = "section"  # header | nav | hero | section | card-grid | features | cta | footer | gallery | form
    bbox: list[float]  # x, y, w, h in reference-image px
    background: str = "#ffffff"
    background_image: str | None = None  # e.g. a CSS linear-gradient(...)
    text_color: str = "#111111"
    columns: int = 1
    elements: list[Element] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)  # repeated cards
    notes: str = ""


class Typography(Loose):
    heading_font: str = "Inter"
    body_font: str = "Inter"
    base_size_px: int = 16
    scale: dict[str, int] = Field(default_factory=lambda: {"h1": 56, "h2": 36, "h3": 22, "body": 16, "small": 14})


class PageAnalysis(Loose):
    id: str
    route: str = "/"
    title: str = ""
    reference_key: str = ""
    width: int
    height: int
    viewport_height: int = 0
    regions: list[Region] = Field(default_factory=list)
    palette: list[PaletteColor] = Field(default_factory=list)
    typography: Typography = Field(default_factory=Typography)
    assets: dict[str, str] = Field(default_factory=dict)  # project path -> storage key


class BehaviorSpec(Loose):
    id: str
    trigger: Literal["load", "scroll", "hover", "click", "interval", "viewport-enter"] = "load"
    target: str = ""  # section id or css selector
    # fade-in | slide-up | slide-down | menu-toggle | sticky-header | header-shrink | hover-lift | auto-slider ...
    effect: str = "fade-in"
    duration_ms: int = 300
    delay_ms: int = 0
    easing: str = "ease-out"
    params: dict[str, Any] = Field(default_factory=dict)
    evidence: dict[str, Any] = Field(default_factory=dict)  # t_start, t_end, frames
    confidence: float = 0.5


class UIAnalysis(Loose):
    pages: list[PageAnalysis] = Field(default_factory=list)
    behaviors: list[BehaviorSpec] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Design Specification (AI Architect output)
# --------------------------------------------------------------------------


class TypeStyle(Loose):
    size: int
    weight: int = 400
    line_height: float = 1.5
    letter_spacing: float = 0.0


class DesignTokens(Loose):
    colors: dict[str, str] = Field(
        default_factory=lambda: {
            "background": "#ffffff",
            "surface": "#f5f5f5",
            "text": "#111111",
            "muted": "#666666",
            "primary": "#2563eb",
            "on-primary": "#ffffff",
            "border": "#e5e5e5",
        }
    )
    fonts: dict[str, str] = Field(default_factory=lambda: {"heading": "Inter", "body": "Inter"})
    type_scale: dict[str, TypeStyle] = Field(
        default_factory=lambda: {
            "h1": TypeStyle(size=56, weight=700, line_height=1.1),
            "h2": TypeStyle(size=36, weight=700, line_height=1.2),
            "h3": TypeStyle(size=22, weight=600, line_height=1.3),
            "body": TypeStyle(size=16, weight=400, line_height=1.6),
            "small": TypeStyle(size=14, weight=400, line_height=1.5),
        }
    )
    spacing: dict[str, int] = Field(default_factory=lambda: {"xs": 4, "sm": 8, "md": 16, "lg": 32, "xl": 64})
    radii: dict[str, int] = Field(default_factory=lambda: {"sm": 4, "md": 8, "lg": 16, "full": 9999})
    shadows: dict[str, str] = Field(default_factory=lambda: {"card": "0 4px 16px rgba(0,0,0,.08)"})
    container_width: int = 1200


class SectionSpec(Loose):
    id: str
    kind: str = "section"
    component: str = "Section"
    # canvas: children placed where they are in the reference, scaled with the page width
    layout: Literal["stack", "row", "grid", "split", "center", "canvas"] = "stack"
    columns: int = 1
    height_px: int | None = None  # observed height in CSS px
    background: str | None = None
    background_image: str | None = None
    text_color: str | None = None
    padding_y: int = 64
    sticky: bool = False
    elements: list[Element] = Field(default_factory=list)
    items: list[dict[str, Any]] = Field(default_factory=list)
    source: dict[str, Any] = Field(default_factory=dict)  # {reference_key, y, h, page_width}


class PageSpec(Loose):
    id: str
    route: str = "/"
    title: str = "Home"
    reference_key: str = ""
    reference_width: int = 0
    reference_height: int = 0
    sections: list[SectionSpec] = Field(default_factory=list)


class ComponentSpec(Loose):
    name: str
    kind: str = "section"
    description: str = ""
    props: dict[str, Any] = Field(default_factory=dict)
    used_in: list[str] = Field(default_factory=list)


class DesignSpec(Loose):
    project_name: str = "Recode Project"
    framework: Literal["html", "react-vite"] = "html"
    language: str = "en"
    direction: Literal["ltr", "rtl"] = "ltr"
    viewport: dict[str, int] = Field(default_factory=lambda: {"width": 1280, "height": 720})
    tokens: DesignTokens = Field(default_factory=DesignTokens)
    pages: list[PageSpec] = Field(default_factory=list)
    components: list[ComponentSpec] = Field(default_factory=list)
    behaviors: list[BehaviorSpec] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    requires_backend: bool = False
    # images cut out of the reference (project path -> storage key); copied into the project
    assets: dict[str, str] = Field(default_factory=dict)

    def section(self, section_id: str) -> SectionSpec | None:
        for page in self.pages:
            for section in page.sections:
                if section.id == section_id:
                    return section
        return None
