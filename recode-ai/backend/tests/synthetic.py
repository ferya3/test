"""Synthetic screen recordings for tests and demos (no network, no browser)."""

from __future__ import annotations

import cv2
import numpy as np

SECTIONS = [
    # name, y0, y1, bg (BGR), columns
    ("header", 0, 80, (42, 23, 15), 1),
    ("hero", 80, 680, (138, 58, 30), 1),
    ("features", 680, 1280, (255, 255, 255), 3),
    ("cta", 1280, 1700, (235, 99, 37), 1),
    ("testimonials", 1700, 2250, (252, 250, 248), 2),
    ("footer", 2250, 2600, (39, 24, 17), 1),
]
PAGE_W, PAGE_H = 1280, 2600


def _text_lines(img, x, y, w, rows, color, rng, line_h=14, gap=12):
    for r in range(rows):
        lw = int(w * rng.uniform(0.55, 1.0))
        cv2.rectangle(img, (x, y + r * (line_h + gap)), (x + lw, y + r * (line_h + gap) + line_h), color, -1)


def make_site_image(seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.zeros((PAGE_H, PAGE_W, 3), np.uint8)
    for name, y0, y1, bg, cols in SECTIONS:
        img[y0:y1] = bg
        light = sum(bg) / 3 > 128
        fg = (40, 30, 30) if light else (245, 245, 245)
        if name == "header":
            cv2.rectangle(img, (40, 26), (170, 54), (80, 200, 250), -1)
            for i in range(4):
                cv2.rectangle(img, (760 + i * 110, 34), (840 + i * 110, 46), fg, -1)
            cv2.rectangle(img, (1200, 28), (1240, 52), fg, 2)
        elif cols > 1:
            pad, gap = 80, 40
            cw = (PAGE_W - 2 * pad - gap * (cols - 1)) // cols
            _text_lines(img, pad, y0 + 60, 500, 1, fg, rng, line_h=28)
            for c in range(cols):
                x = pad + c * (cw + gap)
                card_bg = (241, 245, 249) if light else (60, 60, 60)
                cv2.rectangle(img, (x, y0 + 140), (x + cw, y1 - 60), card_bg, -1)
                cv2.rectangle(img, (x + 24, y0 + 164), (x + 84, y0 + 224), (235, 99, 37), -1)
                _text_lines(img, x + 24, y0 + 250, cw - 48, 6, fg, rng)
        else:
            _text_lines(img, 120, y0 + 90, 900, 2, fg, rng, line_h=40, gap=20)
            _text_lines(img, 120, y0 + 230, 760, 4, fg, rng)
            if name in ("hero", "cta"):
                cv2.rectangle(img, (120, y1 - 160), (330, y1 - 100), (80, 200, 250), -1)
    return img


def make_recording(
    path: str, fps: int = 30, width: int = 1280, height: int = 720, blank_lead: bool = False, jump_end: bool = False
) -> dict:
    """Top (1s) -> scroll to 1200px (2.5s) -> pause -> menu opens -> scroll to bottom.

    blank_lead: start with a few white frames, like a browser recording before first paint.
    jump_end:   the last scroll moves ~300px per frame, more than a viewport between two
                5 fps samples (anchor-link style jumps)."""
    page = make_site_image()
    header = page[0:80].copy()
    max_scroll = PAGE_H - height
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    frames = []

    def frame_at(offset: int, menu: float = 0.0) -> np.ndarray:
        f = page[offset : offset + height].copy()
        f[0:80] = header  # sticky header
        if menu > 0:
            h = int(260 * menu)
            cv2.rectangle(f, (960, 80), (1260, 80 + h), (255, 255, 255), -1)
            for i in range(min(5, h // 50)):
                cv2.rectangle(f, (990, 100 + i * 50), (1180, 116 + i * 50), (40, 30, 30), -1)
        return f

    def ease(t: float) -> float:
        return t * t * (3 - 2 * t)

    if blank_lead:
        for _ in range(3):
            frames.append(np.full((height, width, 3), 255, np.uint8))
    for _ in range(fps):  # 1s at top
        frames.append(frame_at(0))
    n = int(2.5 * fps)
    for i in range(n):  # scroll to 1200
        frames.append(frame_at(int(1200 * ease((i + 1) / n))))
    for _ in range(int(0.6 * fps)):
        frames.append(frame_at(1200))
    n = int(0.3 * fps)
    for i in range(n):  # menu opens over 300ms
        frames.append(frame_at(1200, (i + 1) / n))
    for _ in range(int(0.8 * fps)):
        frames.append(frame_at(1200, 1.0))
    for _ in range(int(0.2 * fps)):  # menu closes instantly, short pause
        frames.append(frame_at(1200))
    n = 3 if jump_end else int(1.5 * fps)
    for i in range(n):  # scroll to bottom
        frames.append(
            frame_at(
                1200 + int((max_scroll - 1200) * (i + 1) / n if jump_end else (max_scroll - 1200) * ease((i + 1) / n))
            )
        )
    for _ in range(int(0.5 * fps)):
        frames.append(frame_at(max_scroll))
    for f in frames:
        writer.write(f)
    writer.release()
    return {"frames": len(frames), "fps": fps, "page_height": PAGE_H, "max_scroll": max_scroll}
