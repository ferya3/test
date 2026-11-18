"""Deterministic image measurements: palette, horizontal bands, colours.

These run before (and independently of) any AI model. They give the vision
model hard numbers to anchor on, and they power the offline heuristic mode."""

from __future__ import annotations

import cv2
import numpy as np

from app.schemas.spec import Band, PaletteColor


def to_hex(bgr: np.ndarray | tuple | list) -> str:
    b, g, r = (int(round(float(c))) for c in bgr[:3])
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def hex_to_bgr(value: str) -> tuple[int, int, int]:
    v = value.lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    try:
        r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    except (ValueError, IndexError):
        return (255, 255, 255)
    return (b, g, r)


def luminance(hex_color: str) -> float:
    b, g, r = hex_to_bgr(hex_color)

    def ch(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast_text(bg_hex: str) -> str:
    return "#111111" if luminance(bg_hex) > 0.45 else "#ffffff"


def delta_e(hex_a: str, hex_b: str) -> float:
    a = cv2.cvtColor(np.uint8([[hex_to_bgr(hex_a)]]), cv2.COLOR_BGR2LAB)[0, 0].astype(float)
    b = cv2.cvtColor(np.uint8([[hex_to_bgr(hex_b)]]), cv2.COLOR_BGR2LAB)[0, 0].astype(float)
    # OpenCV 8-bit Lab: L*255/100, a+128, b+128
    a[0] *= 100 / 255
    b[0] *= 100 / 255
    return float(np.linalg.norm(a - b))


def resize_to_width(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w == width:
        return img
    height = max(1, int(round(h * width / w)))
    interp = cv2.INTER_AREA if width < w else cv2.INTER_LINEAR
    return cv2.resize(img, (width, height), interpolation=interp)


def palette(img: np.ndarray, k: int = 6) -> list[PaletteColor]:
    small = resize_to_width(img, 160)
    pixels = small.reshape(-1, 3).astype(np.float32)
    if len(pixels) < k:
        return []
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    cv2.setRNGSeed(7)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(-counts)
    out: list[PaletteColor] = []
    for i in order:
        hex_c = to_hex(centers[i])
        share = float(counts[i] / counts.sum())
        if any(delta_e(hex_c, p.hex) < 4 for p in out):
            for p in out:
                if delta_e(hex_c, p.hex) < 4:
                    p.share = round(p.share + share, 4)
            continue
        out.append(PaletteColor(hex=hex_c, share=round(share, 4)))
    return out


def accent_color(colors: list[PaletteColor]) -> str | None:
    best, best_sat = None, 0.0
    for c in colors:
        if c.share < 0.005:
            continue
        hsv = cv2.cvtColor(np.uint8([[hex_to_bgr(c.hex)]]), cv2.COLOR_BGR2HSV)[0, 0]
        sat = float(hsv[1]) * (float(hsv[2]) / 255)
        if sat > best_sat:
            best, best_sat = c.hex, sat
    return best if best_sat > 60 else None


def _columns(edges_band: np.ndarray) -> int:
    """Count content columns inside a band from the vertical edge profile."""
    if edges_band.size == 0:
        return 1
    profile = edges_band.mean(axis=0)
    w = len(profile)
    active = profile > max(2.0, profile.max() * 0.08)
    # close small gaps so words inside one card do not split it
    kernel = max(3, w // 60)
    active = np.convolve(active.astype(float), np.ones(kernel), mode="same") > 0
    blocks, start = [], None
    for x, on in enumerate(active):
        if on and start is None:
            start = x
        elif not on and start is not None:
            blocks.append((start, x))
            start = None
    if start is not None:
        blocks.append((start, w))
    blocks = [b for b in blocks if (b[1] - b[0]) > w * 0.08]
    if len(blocks) < 2:
        return 1
    widths = np.array([b[1] - b[0] for b in blocks], dtype=float)
    # repeated cards have similar widths
    if widths.std() / widths.mean() < 0.35:
        return min(len(blocks), 6)
    return 1


def bands(img: np.ndarray, min_height: int = 24, threshold: float = 14.0) -> list[Band]:
    """Split a page screenshot into horizontal bands of uniform background."""
    work_w = 256
    scale = img.shape[1] / work_w
    small = resize_to_width(img, work_w)
    h = small.shape[0]
    # row background = median colour of the row edges (left/right 12%) + whole-row median
    margin = max(3, int(work_w * 0.03))  # page gutters, not content
    sides = np.concatenate([small[:, :margin], small[:, -margin:]], axis=1)
    row_bg = np.median(sides, axis=1).astype(np.float32)  # (h,3)
    lab = cv2.cvtColor(row_bg.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(float)

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)

    min_rows = max(2, int(round(min_height / scale)))
    segments: list[list[int]] = []
    start = 0
    ref = lab[0]
    for y in range(1, h):
        if np.linalg.norm(lab[y] - ref) > threshold:
            # require the change to persist (ignore thin lines / text)
            end = min(h, y + max(2, min_rows // 3))
            if np.all(np.linalg.norm(lab[y:end] - lab[y], axis=1) < threshold):
                segments.append([start, y])
                start = y
                ref = lab[y]
    segments.append([start, h])

    # merge segments that are too short into the previous one
    merged: list[list[int]] = []
    for seg in segments:
        if merged and (seg[1] - seg[0]) < min_rows:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    if len(merged) > 1 and (merged[0][1] - merged[0][0]) < min_rows:
        merged[1][0] = merged[0][0]
        merged.pop(0)

    out: list[Band] = []
    for y0, y1 in merged:
        bg = to_hex(np.median(row_bg[y0:y1], axis=0))
        band_edges = edges[y0:y1]
        band_img = small[y0:y1]
        # text colour: the dominant colour of edge-adjacent pixels that differs from bg
        mask = cv2.dilate(band_edges, np.ones((2, 2), np.uint8)) > 0
        text_color = contrast_text(bg)
        if mask.sum() > 20:
            px = band_img[mask]
            bg_bgr = np.array(hex_to_bgr(bg), dtype=float)
            dist = np.linalg.norm(px.astype(float) - bg_bgr, axis=1)
            far = px[dist > 80]
            if len(far) > 10:
                text_color = to_hex(np.median(far, axis=0))
        out.append(
            Band(
                y0=int(round(y0 * scale)),
                y1=int(round(y1 * scale)),
                bg=bg,
                text_color=text_color,
                columns=_columns(band_edges),
                density=round(float(band_edges.mean() / 255), 4),
            )
        )
    return out


def ssim(a: np.ndarray, b: np.ndarray) -> tuple[float, np.ndarray]:
    """Structural similarity (grayscale). Returns (mean, map)."""
    if a.ndim == 3:
        a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    if b.ndim == 3:
        b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)  # noqa: E731
    mu_a, mu_b = blur(a), blur(b)
    mu_a2, mu_b2, mu_ab = mu_a * mu_a, mu_b * mu_b, mu_a * mu_b
    sig_a = blur(a * a) - mu_a2
    sig_b = blur(b * b) - mu_b2
    sig_ab = blur(a * b) - mu_ab
    smap = ((2 * mu_ab + c1) * (2 * sig_ab + c2)) / ((mu_a2 + mu_b2 + c1) * (sig_a + sig_b + c2))
    return float(smap.mean()), smap


def encode_png(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise ValueError("PNG encode failed")
    return buf.tobytes()


def encode_jpeg(img: np.ndarray, quality: int = 88) -> bytes:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise ValueError("JPEG encode failed")
    return buf.tobytes()


def decode_image(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unreadable image")
    return img


def tiles(img: np.ndarray, tile_height: int, max_tiles: int = 6) -> list[np.ndarray]:
    """Split a tall page into viewport-sized tiles for vision models."""
    h = img.shape[0]
    if h <= tile_height * 1.15:
        return [img]
    count = min(max_tiles, int(np.ceil(h / tile_height)))
    step = (h - tile_height) / max(1, count - 1)
    return [img[int(i * step) : int(i * step) + tile_height] for i in range(count)]


def fit_for_vision(img: np.ndarray, max_side: int = 1568) -> np.ndarray:
    h, w = img.shape[:2]
    scale = min(1.0, max_side / max(h, w))
    if scale >= 1.0:
        return img
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
