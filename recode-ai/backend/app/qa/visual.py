"""Visual QA Engine: rendered site vs. reference frames.

Per section (matched through data-section ids and the spec's source pixels):
structural similarity, background colour difference and height ratio.
Plus console errors, horizontal overflow at mobile/tablet widths and whether
recorded click behaviours actually do something."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np
from pydantic import BaseModel, Field

from app.ai.coding.renderer import page_file
from app.core.config import Settings
from app.core.storage import Storage
from app.qa.render import SiteRender, SiteRenderer
from app.schemas.spec import DesignSpec
from app.video import imaging


class SectionMetric(BaseModel):
    page_id: str
    id: str
    ref_y: int
    ref_h: int
    out_y: int | None = None
    out_h: int | None = None
    ssim: float = 0.0
    color_delta: float = 0.0
    ref_bg: str = ""
    out_bg: str = ""
    height_ratio: float = 0.0
    score: float = 0.0


class QAIssue(BaseModel):
    severity: str  # high | medium | low
    kind: str  # missing-section | height | color | structure | console | overflow | behavior | page
    message: str
    section_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class QAReport(BaseModel):
    score: float
    passed: bool
    threshold: float
    page_scores: dict[str, float] = Field(default_factory=dict)
    sections: list[SectionMetric] = Field(default_factory=list)
    issues: list[QAIssue] = Field(default_factory=list)
    console_errors: list[str] = Field(default_factory=list)
    overflow: dict[str, int] = Field(default_factory=dict)
    behavior_checks: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: dict[str, str] = Field(default_factory=dict)


@dataclass
class QAOutcome:
    report: QAReport
    crops: list[tuple[str, bytes, bytes]] = field(default_factory=list)  # (section id, ref jpeg, render jpeg)


def _median_hex(img: np.ndarray) -> str:
    if img.size == 0:
        return "#000000"
    margin = max(1, img.shape[1] // 30)
    sides = np.concatenate([img[:, :margin], img[:, -margin:]], axis=1).reshape(-1, 3)
    return imaging.to_hex(np.median(sides, axis=0))


def _compare(ref: np.ndarray, out: np.ndarray) -> tuple[float, float, str, str]:
    """Structure + colour of two crops (out is resized onto ref)."""
    if ref.size == 0 or out.size == 0:
        return 0.0, 100.0, "", ""
    work_w = 320
    r = imaging.resize_to_width(ref, work_w)
    o = cv2.resize(out, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    # blur first: text is placeholder-vs-real far more often than layout is wrong
    r_blur, o_blur = cv2.GaussianBlur(r, (5, 5), 0), cv2.GaussianBlur(o, (5, 5), 0)
    s, _ = imaging.ssim(r_blur, o_blur)
    ref_bg, out_bg = _median_hex(ref), _median_hex(out)
    return max(0.0, s), imaging.delta_e(ref_bg, out_bg), ref_bg, out_bg


class VisualQAEngine:
    def __init__(self, settings: Settings, storage: Storage):
        self.settings = settings
        self.storage = storage

    def run(
        self,
        spec: DesignSpec,
        site_files: dict[str, bytes | str],
        key_prefix: str,
        threshold: float | None = None,
        render: SiteRender | None = None,
    ) -> QAOutcome:
        threshold = self.settings.qa_threshold if threshold is None else threshold
        pages = [(p.id, self._page_url(spec, p.route)) for p in spec.pages]
        if render is None:
            render = SiteRenderer(self.settings).render(
                site_files, pages, spec.viewport, behaviors=[b.model_dump() for b in spec.behaviors]
            )
        report = QAReport(
            score=0.0,
            passed=False,
            threshold=threshold,
            console_errors=render.console_errors[:20],
            overflow=render.overflow,
            behavior_checks=render.behavior_checks,
        )
        crops: list[tuple[float, str, bytes, bytes]] = []
        css_w = spec.viewport.get("width", 1280)

        for page in spec.pages:
            out = render.pages.get(page.id)
            if out is None:
                report.issues.append(QAIssue(severity="high", kind="page", message=f"Page {page.route} did not render"))
                report.page_scores[page.id] = 0.0
                continue
            key = f"{key_prefix}/{page.id}-render.png"
            report.artifacts[f"{page.id}:render"] = self.storage.put(key, imaging.encode_png(out.full), "image/png")
            if not page.reference_key:
                report.page_scores[page.id] = 100.0  # nothing to compare against (prompt-only project)
                continue
            ref_full = imaging.decode_image(self.storage.get(page.reference_key))
            ref = imaging.resize_to_width(ref_full, css_w)
            scale = css_w / ref_full.shape[1]
            dom = {s["id"]: s for s in out.sections}
            weighted, total_h = 0.0, 0.0
            for section in page.sections:
                src = section.source or {}
                ry = int(round(src.get("y", 0) * scale))
                rh = int(round(src.get("h", 0) * scale))
                if rh <= 0:
                    continue
                metric = SectionMetric(page_id=page.id, id=section.id, ref_y=ry, ref_h=rh)
                box = dom.get(section.id)
                if box is None:
                    report.issues.append(
                        QAIssue(
                            severity="high",
                            kind="missing-section",
                            section_id=section.id,
                            message=f"Section '{section.id}' is missing from the render",
                        )
                    )
                    report.sections.append(metric)
                    total_h += rh
                    continue
                oy, oh = int(round(box["top"])), max(1, int(round(box["height"])))
                metric.out_y, metric.out_h = oy, oh
                ref_crop = ref[ry : ry + rh]
                out_crop = out.full[oy : oy + oh]
                s, d_e, ref_bg, out_bg = _compare(ref_crop, out_crop)
                ratio = oh / rh
                metric.ssim, metric.color_delta = round(s, 4), round(d_e, 2)
                metric.ref_bg, metric.out_bg = ref_bg, out_bg
                metric.height_ratio = round(ratio, 3)
                color_score = max(0.0, 1 - d_e / 25)
                height_score = max(0.0, 1 - abs(1 - ratio) * 2.5)
                metric.score = round(100 * (0.45 * s + 0.35 * color_score + 0.20 * height_score), 2)
                report.sections.append(metric)
                weighted += metric.score * rh
                total_h += rh
                self._issues_for(report, section.id, metric)
                crops.append(
                    (
                        metric.score,
                        section.id,
                        imaging.encode_jpeg(imaging.fit_for_vision(ref_crop, 900), 80),
                        imaging.encode_jpeg(imaging.fit_for_vision(out_crop, 900), 80),
                    )
                )
            sections_score = weighted / total_h if total_h else 0.0
            global_score = self._global(ref, out.full, report, page.id, key_prefix)
            report.page_scores[page.id] = round(0.8 * sections_score + 0.2 * global_score, 2)

        score = float(np.mean(list(report.page_scores.values()))) if report.page_scores else 0.0
        if report.console_errors:
            score -= min(10, 2 * len(report.console_errors))
            report.issues.append(
                QAIssue(
                    severity="medium",
                    kind="console",
                    message=f"{len(report.console_errors)} console error(s)",
                    data={"errors": report.console_errors[:5]},
                )
            )
        for width, px in report.overflow.items():
            if px > 2:
                score -= 3
                report.issues.append(
                    QAIssue(
                        severity="medium", kind="overflow", message=f"Horizontal overflow of {px}px at {width}px width"
                    )
                )
        for check in report.behavior_checks:
            if not check.get("passed"):
                score -= 3
                report.issues.append(
                    QAIssue(
                        severity="medium",
                        kind="behavior",
                        message=f"Behaviour '{check.get('behavior')}': {check.get('message')}",
                    )
                )
        report.score = round(max(0.0, min(100.0, score)), 2)
        report.passed = report.score >= threshold
        report.issues.sort(key=lambda i: {"high": 0, "medium": 1, "low": 2}.get(i.severity, 3))
        crops.sort(key=lambda c: c[0])
        return QAOutcome(report=report, crops=[(c[1], c[2], c[3]) for c in crops[:4]])

    @staticmethod
    def _page_url(spec: DesignSpec, route: str) -> str:
        if spec.framework == "react-vite":
            return "index.html" if route in ("", "/") else f"index.html#{route}"
        return page_file(route)

    @staticmethod
    def _issues_for(report: QAReport, section_id: str, m: SectionMetric) -> None:
        if abs(1 - m.height_ratio) > 0.06:
            report.issues.append(
                QAIssue(
                    severity="high" if abs(1 - m.height_ratio) > 0.2 else "medium",
                    kind="height",
                    section_id=section_id,
                    message=f"'{section_id}' is {m.out_h}px tall, reference is {m.ref_h}px",
                    data={"out_h": m.out_h, "ref_h": m.ref_h},
                )
            )
        if m.color_delta > 8:
            report.issues.append(
                QAIssue(
                    severity="high" if m.color_delta > 20 else "medium",
                    kind="color",
                    section_id=section_id,
                    message=f"'{section_id}' background {m.out_bg} vs reference {m.ref_bg} (ΔE {m.color_delta})",
                    data={"ref_bg": m.ref_bg, "out_bg": m.out_bg},
                )
            )
        if m.ssim < 0.55:
            report.issues.append(
                QAIssue(
                    severity="medium",
                    kind="structure",
                    section_id=section_id,
                    message=f"'{section_id}' layout differs from the reference (SSIM {m.ssim})",
                )
            )

    def _global(self, ref: np.ndarray, out: np.ndarray, report: QAReport, page_id: str, key_prefix: str) -> float:
        h = min(ref.shape[0], out.shape[0])
        if h < 10:
            return 0.0
        r = imaging.resize_to_width(ref[:h], 480)
        o = cv2.resize(out[:h], (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
        s, smap = imaging.ssim(cv2.GaussianBlur(r, (5, 5), 0), cv2.GaussianBlur(o, (5, 5), 0))
        heat = cv2.applyColorMap(np.clip((1 - smap) * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
        side = np.hstack([r, o, cv2.addWeighted(o, 0.4, heat, 0.6, 0)])
        report.artifacts[f"{page_id}:compare"] = self.storage.put(
            f"{key_prefix}/{page_id}-compare.png", imaging.encode_png(side), "image/png"
        )
        height_penalty = abs(1 - out.shape[0] / ref.shape[0])
        return max(0.0, 100 * (max(0.0, s) - min(0.5, height_penalty)))
