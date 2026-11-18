"""Frame-to-frame motion analysis: scroll, scene cuts and local interactions."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

STILL_RATIO = 0.003  # fraction of changed pixels below which two frames are "the same"
CUT_RATIO = 0.45
PIXEL_DELTA = 24


@dataclass
class PairMetrics:
    kind: str  # still | scroll | cut | interaction
    diff_ratio: float
    dy: float = 0.0  # content displacement (negative = content moved up = scroll down)
    dx: float = 0.0
    response: float = 0.0
    compensated_ratio: float = 1.0
    boxes: list[tuple[int, int, int, int]] = field(default_factory=list)  # x,y,w,h in sample px


def _overlap(a: np.ndarray, b: np.ndarray, shift: int) -> tuple[np.ndarray, np.ndarray]:
    """Rows of a and b that should match if b(y) = a(y - shift)."""
    h = a.shape[0]
    b_rows = b[max(0, shift) : min(h, h + shift)]
    a_rows = a[max(0, -shift) : min(h - shift, h)]
    return a_rows, b_rows


def _changed_boxes(mask: np.ndarray, min_area: int) -> list[tuple[int, int, int, int]]:
    mask = cv2.dilate(mask.astype(np.uint8) * 255, np.ones((5, 5), np.uint8), iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = [cv2.boundingRect(c) for c in contours]
    boxes = [b for b in boxes if b[2] * b[3] >= min_area]
    boxes.sort(key=lambda b: -b[2] * b[3])
    return boxes[:8]


def compare_frames(a: np.ndarray, b: np.ndarray) -> PairMetrics:
    """a, b: grayscale float32 frames of identical size."""
    diff = np.abs(a - b) > PIXEL_DELTA
    diff_ratio = float(diff.mean())
    if diff_ratio < STILL_RATIO:
        return PairMetrics("still", diff_ratio)

    h, w = a.shape
    window = cv2.createHanningWindow((w, h), cv2.CV_32F)
    (dx, dy), response = cv2.phaseCorrelate(a, b, window)

    compensated = 1.0
    if abs(dy) >= 0.25 and abs(dx) < 1.5 and abs(dy) < h * 0.9:
        # warp a by the measured (sub-pixel) translation and see what is left
        m = np.float32([[1, 0, dx], [0, 1, dy]])
        warped = cv2.warpAffine(a, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        margin = int(np.ceil(abs(dy))) + 1
        a_rows, b_rows = warped[margin : h - margin], b[margin : h - margin]
        if a_rows.size:
            # per-row mismatch; ignore the worst 20% of rows, which are the
            # fixed parts of the screen (sticky header, cookie bar, chat bubble)
            rows = (np.abs(a_rows - b_rows) > PIXEL_DELTA).mean(axis=1)
            keep = np.sort(rows)[: max(1, int(len(rows) * 0.8))]
            compensated = float(keep.mean())

    if abs(dy) >= 0.25 and compensated < 0.06 and compensated < diff_ratio * 0.4:
        return PairMetrics(
            "scroll", diff_ratio, dy=float(dy), dx=float(dx), response=float(response), compensated_ratio=compensated
        )

    hist_a = cv2.calcHist([a.astype(np.uint8)], [0], None, [32], [0, 256])
    hist_b = cv2.calcHist([b.astype(np.uint8)], [0], None, [32], [0, 256])
    corr = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL)
    if diff_ratio > CUT_RATIO and (corr < 0.8 or diff_ratio > 0.7):
        return PairMetrics("cut", diff_ratio, response=float(response))

    boxes = _changed_boxes(diff, min_area=int(h * w * 0.0015))
    return PairMetrics(
        "interaction",
        diff_ratio,
        dy=float(dy),
        dx=float(dx),
        response=float(response),
        compensated_ratio=compensated,
        boxes=boxes,
    )


def interaction_hint(bbox: list[float]) -> str:
    """Name what a localised change probably is (normalised x, y, w, h)."""
    x, y, w, h = bbox
    area = w * h
    if area > 0.45:
        return "overlay-or-modal"
    if y < 0.18 and h < 0.2 and w > 0.6:
        return "header-change"
    if y < 0.2 and x > 0.55 and w < 0.45 and h > 0.15:
        return "dropdown-menu"
    if y < 0.2 and x > 0.55 and w < 0.45:
        return "menu-toggle"
    if x < 0.05 and w < 0.45 and h > 0.5:
        return "side-drawer"
    if x > 0.55 and w < 0.45 and h > 0.5:
        return "side-drawer"
    if area < 0.03:
        return "hover-or-click-feedback"
    if w > 0.8 and 0.15 < h < 0.6:
        return "carousel-or-slider"
    return "element-state-change"
