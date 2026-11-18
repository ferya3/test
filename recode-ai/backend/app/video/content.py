"""Content of a reference page beyond its layout:

* trim_frame  - removes what is not the page: window borders, scrollbars
* find_images - photographs / illustrations (products, people, mockups) as crops
* read_text   - text lines with position, size, alignment and button styling (Tesseract OCR)

These let the offline mode rebuild a page with its real images and copy, and
give the vision model exact anchors when one is configured."""

from __future__ import annotations

import csv
import io
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.video import imaging

log = logging.getLogger(__name__)


# ------------------------------------------------------------------- frame


def _uniform_line(line: np.ndarray, tol: float = 12.0) -> bool:  # JPEG noise on dark frames ~10
    return float(line.reshape(-1, 3).std(axis=0).max()) < tol


def _strip_border(img: np.ndarray, max_px: int = 16) -> tuple[int, int, int, int]:
    """Outer lines of one flat colour that differ from the page inside (window frames, borders)."""
    h, w = img.shape[:2]

    def depth(lines) -> int:
        """How many outer lines form a flat border, given lines ordered outside -> inside."""
        first = lines(0)
        if not _uniform_line(first):
            return 0
        color = np.median(first.reshape(-1, 3), axis=0)
        k = 0
        while k < max_px:
            line = lines(k)
            if not _uniform_line(line) or np.abs(np.median(line.reshape(-1, 3), axis=0) - color).max() > 10:
                break
            k += 1
        inner = np.median(lines(k).reshape(-1, 3), axis=0)
        return k if k < max_px and np.abs(inner - color).max() > 24 else 0

    top = depth(lambda i: img[i])
    bottom = h - depth(lambda i: img[h - 1 - i])
    left = depth(lambda i: img[:, i])
    right = w - depth(lambda i: img[:, w - 1 - i])
    return left, top, right, bottom


def _scrollbar(strip: np.ndarray) -> int:
    """Width of a scrollbar at the outer (last) columns of `strip`, 0 if none.

    A scrollbar thumb is a run of columns that, over a good part of the height,
    is one flat colour clearly darker / different from the page next to it."""
    h, w = strip.shape[:2]
    gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY).astype(float)
    page = np.median(gray[:, : max(1, w - 24)], axis=1)  # the page just inside the strip
    thumb_cols = []
    for x in range(max(0, w - 24), w):
        col = gray[:, x]
        rows = np.abs(col - page) > 35
        if rows.mean() > 0.12:
            run = col[rows]
            if run.std() < 12:  # a flat thumb, not content
                thumb_cols.append(x)
    if len(thumb_cols) < 4:
        return 0
    # a scrollbar is one narrow run of columns hugging the edge (only track padding outside it)
    last = max(thumb_cols)
    run = [x for x in thumb_cols if x >= last - 20]
    first = last
    while first - 1 in run:
        first -= 1
    if not (4 <= last - first + 1 <= 18) or w - 1 - last > 6:
        return 0
    # rows of the thumb must be flat across its width (no text / image crossing it)
    thumb = gray[:, first : last + 1]
    flat = thumb.std(axis=1) < 10
    if flat.mean() < 0.85:
        return 0
    return w - max(0, first - 3)  # include the track padding left of the thumb


def trim_frame(img: np.ndarray) -> tuple[int, int, int, int]:
    """(x0, y0, x1, y1) of the page inside a screenshot: no window border, no scrollbars."""
    x0, y0, x1, y1 = _strip_border(img)
    inner = img[y0:y1, x0:x1]
    if inner.size == 0:
        return 0, 0, img.shape[1], img.shape[0]
    v = _scrollbar(inner[:, -min(60, inner.shape[1]) :])
    x1 -= v
    inner = img[y0:y1, x0:x1]
    hbar = _scrollbar(np.ascontiguousarray(np.transpose(inner[-min(60, inner.shape[0]) :], (1, 0, 2))))
    y1 -= hbar
    # what was left between a removed scrollbar and the border (track padding) is gone too
    return x0, y0, x1, y1


# ------------------------------------------------------------------ images


@dataclass
class ImageBox:
    x: int
    y: int
    w: int
    h: int

    @property
    def area(self) -> int:
        return self.w * self.h


def _background(img: np.ndarray) -> np.ndarray:
    """Expected background per pixel: interpolated between the left and right gutters, row by row."""
    h, w = img.shape[:2]
    m = max(2, int(w * 0.02))
    f = img.astype(np.float32)
    left = np.median(f[:, :m], axis=1)
    right = np.median(f[:, -m:], axis=1)
    t = np.linspace(0, 1, w, dtype=np.float32)[None, :, None]
    return left[:, None, :] * (1 - t) + right[:, None, :] * t


def _remove_rules(mask: np.ndarray, max_height: int = 40) -> np.ndarray:
    """Zero thin full-width bands (rails, dividers, borders) that would glue objects together."""
    h, w = mask.shape
    wide = (mask > 0).mean(axis=1) > 0.8
    y = 0
    while y < h:
        if wide[y]:
            end = y
            while end < h and wide[end]:
                end += 1
            if end - y < max_height:
                mask[y:end] = 0
            y = end
        else:
            y += 1
    return mask


def _runs(active: np.ndarray, min_len: int, max_gap: int) -> list[tuple[int, int]]:
    runs: list[list[int]] = []
    for x, on in enumerate(active):
        if not on:
            continue
        if runs and x - runs[-1][1] <= max_gap:
            runs[-1][1] = x + 1
        else:
            runs.append([x, x + 1])
    return [(a, b) for a, b in runs if b - a >= min_len]


def _split_row(edges: np.ndarray, x: int, y: int, bw: int, bh: int) -> list[ImageBox]:
    """Split a wide blob into the objects standing side by side in it (products on a rail or
    shelf, cards with soft shadows): shadows are smooth, objects have edges."""
    region = edges[y : y + bh, x : x + bw] > 0
    profile = np.convolve(region.mean(axis=0), np.ones(5) / 5, mode="same")
    if profile.max() <= 0:
        return []
    active = profile >= max(0.03, profile.max() * 0.15)
    parts = _runs(active, min_len=max(24, bh // 10), max_gap=4)
    if len(parts) < 2:
        return []
    # each object reaches to the middle of the gap next to it: soft edges, shadows and
    # overlapping sleeves stay in the picture instead of being cut off
    bounds = [0] + [(parts[i][1] + parts[i + 1][0]) // 2 for i in range(len(parts) - 1)] + [bw]
    boxes = []
    for i, (a, b) in enumerate(parts):
        rows = np.flatnonzero(region[:, a:b].mean(axis=1) > 0.02)
        if len(rows) == 0:
            continue
        left, right = bounds[i], bounds[i + 1]
        # shared top line (rail, shelf) and the blob's full height, so soft shadows under the
        # objects are inside the crops instead of being cut by a visible edge
        boxes.append(ImageBox(x + left, y, right - left, bh))
    return boxes


def _is_picture(img: np.ndarray, bg: np.ndarray, box: ImageBox) -> bool:
    """Photos / illustrations have shading: many colours, none dominant. UI surfaces, icons
    and text are a few flat colours."""
    region = img[box.y : box.y + box.h, box.x : box.x + box.w].astype(np.float32)
    local_bg = bg[box.y : box.y + box.h, box.x : box.x + box.w]
    fg = region[np.linalg.norm(region - local_bg, axis=2) > 18]
    if len(fg) < 200:
        return False
    q = (fg // 16).astype(int)
    counts = np.sort(np.bincount(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]))[::-1]
    share = np.cumsum(counts) / counts.sum()
    colours = int(np.searchsorted(share, 0.9)) + 1
    return colours >= 6 and counts[0] / counts.sum() < 0.6


def find_images(img: np.ndarray, text: list[TextLine] | None = None) -> list[ImageBox]:
    """Photographic / illustrative regions: large, filled, shaded blobs that are not text or rules."""
    h, w = img.shape[:2]
    bg = _background(img)
    diff = np.linalg.norm(img.astype(np.float32) - bg, axis=2) > 18
    mask = diff.astype(np.uint8) * 255
    for line in text or []:  # big headlines on a gradient are text, not pictures
        mask[max(0, line.y - 4) : line.y + line.h + 4, max(0, line.x - 4) : line.x + line.w + 4] = 0
    # opening removes strokes of text, hairlines, hooks and borders; closing fills the objects
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    mask = _remove_rules(mask)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.dilate(cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 30, 90), np.ones((3, 3), np.uint8))

    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    min_side = max(40, int(min(w, h) * 0.04))
    candidates: list[ImageBox] = []
    for i in range(1, count):
        x, y, bw, bh, _ = (int(v) for v in stats[i])
        if bw < min_side or bh < min_side:
            continue
        if bw > w * 0.9 and bh < h * 0.12:  # a full-width rule / rail, not a picture
            continue
        if bw * bh > w * h * 0.85:  # the whole page differs: it is a background, not an image
            continue
        parts = _split_row(edges, x, y, bw, bh) if bw > bh * 1.2 else []
        candidates.extend(parts or [ImageBox(x, y, bw, bh)])

    boxes: list[ImageBox] = []
    for box in candidates:
        if box.w < min_side * 0.6 or box.h < min_side:
            continue
        fill = float(diff[box.y : box.y + box.h, box.x : box.x + box.w].mean())
        if fill < 0.3 or not _is_picture(img, bg, box):
            continue
        boxes.append(box)
    boxes.sort(key=lambda b: (b.y // 40, b.x))
    return boxes


def is_cutout(img: np.ndarray, box: ImageBox) -> bool:
    """True when the crop's border is the page background (an object standing on the page,
    like a product on a rail) rather than the edge of a framed photo."""
    region = img[box.y : box.y + box.h, box.x : box.x + box.w].astype(np.float32)
    bg = _background(img)[box.y : box.y + box.h, box.x : box.x + box.w]
    if region.shape[0] < 4 or region.shape[1] < 4:
        return False
    ring = np.concatenate([region[0], region[-1], region[:, 0], region[:, -1]])
    ring_bg = np.concatenate([bg[0], bg[-1], bg[:, 0], bg[:, -1]])
    return float((np.linalg.norm(ring - ring_bg, axis=1) < 24).mean()) > 0.5


def crop(img: np.ndarray, box: ImageBox, pad: int = 4) -> np.ndarray:
    h, w = img.shape[:2]
    return img[max(0, box.y - pad) : min(h, box.y + box.h + pad), max(0, box.x - pad) : min(w, box.x + box.w + pad)]


# --------------------------------------------------------------- together


def analyze_content(img: np.ndarray) -> tuple[list[ImageBox], list[TextLine] | None]:
    """Pictures and text of a page. Text is read first so headlines are never cut out as
    pictures; text inside a picture (a logo on a product) is then dropped."""
    if not ocr_available():
        return find_images(img), None
    lines = read_text(img)
    images = find_images(img, lines)

    def inside(line: TextLine) -> bool:
        cx, cy = line.x + line.w / 2, line.y + line.h / 2
        return any(b.x <= cx <= b.x + b.w and b.y <= cy <= b.y + b.h for b in images)

    return images, [line for line in lines if not inside(line)]


# -------------------------------------------------------------------- text


@dataclass
class TextLine:
    text: str
    x: int
    y: int
    w: int
    h: int
    confidence: float
    color: str = "#111111"
    background: str | None = None  # set when the line sits on its own surface (button / badge)
    words: list[str] = field(default_factory=list)


def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def _languages() -> str:
    try:
        out = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return "eng"
    langs = {line.strip() for line in out.splitlines()[1:]}
    return "+".join(lang for lang in ("eng", "fas") if lang in langs) or "eng"


def _tesseract(gray: np.ndarray, scale: float, psm: str = "11") -> list[tuple]:
    with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
        cv2.imwrite(tmp.name, gray)
        try:
            proc = subprocess.run(
                ["tesseract", tmp.name, "stdout", "-l", _languages(), "--psm", psm, "tsv"],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except (OSError, subprocess.SubprocessError) as e:
            log.warning("OCR failed: %s", e)
            return []
    words = []
    for row in csv.DictReader(io.StringIO(proc.stdout), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        try:
            conf = float(row.get("conf") or -1)
        except ValueError:
            continue
        if not text or conf < 55:
            continue
        x, y, w, h = (int(round(int(row[k]) / scale)) for k in ("left", "top", "width", "height"))
        if h >= 6:
            words.append((x, y, w, h, text, conf))
    return words


def _iou(a: tuple, b: tuple) -> float:
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / max(1, a[2] * a[3] + b[2] * b[3] - inter)


def _same_word(a: tuple, b: tuple) -> bool:
    """Two readings of one word: overlapping boxes, or the same text on the same spot."""
    if _iou(a, b) > 0.3:
        return True
    ix = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    iy = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    if ix <= 0 or iy <= 0:
        return False
    smaller = min(a[2] * a[3], b[2] * b[3]) or 1
    return a[4] == b[4] or ix * iy / smaller > 0.6


def read_text(img: np.ndarray, masks: list[ImageBox] | None = None) -> list[TextLine]:
    """Text lines via Tesseract, from several readings of the page (per word the most confident
    one wins). `masks` (picture regions) are blanked first."""
    if not ocr_available():
        return []
    work = img.copy()
    bg = _background(img).astype(np.uint8)
    for box in masks or []:
        work[box.y : box.y + box.h, box.x : box.x + box.w] = bg[box.y : box.y + box.h, box.x : box.x + box.w]
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    # wherever the local background is dark (dark bands, black pill buttons) invert it, so all
    # text is dark on light, which is what Tesseract reads well
    local = cv2.medianBlur(gray, 31)
    normalized = np.where(local < 110, 255 - gray, gray).astype(np.uint8)
    # Several readings, best per word: at the original size with page layout analysis (what
    # Persian / Arabic script needs) and upscaled with sparse-text mode (small Latin UI text);
    # the untouched image keeps light buttons inside dark bands readable.
    upscale = 2.0 if work.shape[1] < 1600 else 1.0
    readings = [(normalized, 1.0, "3"), (gray, 1.0, "3"), (normalized, upscale, "11"), (gray, upscale, "11")]
    words: list[tuple] = []
    for image, scale, psm in readings:
        if scale != 1.0:
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        for candidate in _tesseract(image, scale, psm):
            clash = [w for w in words if _same_word(w, candidate)]
            if not clash:
                words.append(candidate)
            elif all(candidate[5] > w[5] for w in clash):
                words = [w for w in words if w not in clash] + [candidate]
    return _group_lines(img, words)


def _group_lines(img: np.ndarray, words: list[tuple]) -> list[TextLine]:
    """Words on the same baseline and close to each other form one line."""
    words.sort(key=lambda t: (t[1] + t[3] / 2, t[0]))
    lines: list[list[tuple]] = []
    for word in words:
        x, y, w, h = word[:4]
        cy = y + h / 2
        for line in lines:
            lx, ly, lw, lh = _bbox(line)
            overlap = min(y + h, ly + lh) - max(y, ly)
            same_row = overlap >= 0.6 * min(h, lh) and ly <= cy <= ly + lh
            gap = max(h, lh) * 3.0  # letter-spaced eyebrows and separators widen word gaps
            close = x - (lx + lw) < gap and x + w > lx - gap
            similar = 0.3 < h / max(1, lh) < 3.0  # x-height words ("can", "on") vs capitals
            if same_row and close and similar:
                line.append(word)
                break
        else:
            lines.append([word])
    # words were attached greedily; join line fragments that sit on one baseline
    merged = True
    while merged:
        merged = False
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                ax, ay, aw, ah = _bbox(lines[i])
                bx, by, bw, bh = _bbox(lines[j])
                overlap = min(ay + ah, by + bh) - max(ay, by)
                gap = max(bx - (ax + aw), ax - (bx + bw))
                if overlap >= 0.6 * min(ah, bh) and gap < max(ah, bh) * 3.0:
                    lines[i].extend(lines.pop(j))
                    merged = True
                    break
            if merged:
                break
    out: list[TextLine] = []
    height = img.shape[0]
    for line in lines:
        line = _clean_words(line)
        if not line:
            continue
        _, top, _, tall = _bbox(line)
        if top <= 1 or top + tall >= height - 2:
            continue  # cut off by the edge of the screenshot: only half the glyphs are there
        rtl = sum(_arabic(ch) for t in line for ch in t[4]) > sum(
            ch.isascii() and ch.isalpha() for t in line for ch in t[4]
        )
        line.sort(key=lambda t: -t[0] if rtl else t[0])  # reading order: right to left for Persian
        x, y, w, h = _bbox(line)
        text = " ".join(t[4] for t in line)
        confidence = float(np.mean([t[5] for t in line]))
        meaningful = sum(ch.isalpha() for ch in text)
        visible = sum(not ch.isspace() for ch in text) or 1
        tokens = text.split()
        if meaningful < 2 or (len(text) <= 3 and confidence < 85):
            continue  # stray glyphs, digits read inside pictures
        if meaningful / visible < 0.6 or sum(len(t) for t in tokens) / len(tokens) < 2.5:
            continue  # noise: symbols and one-letter fragments read from shapes
        out.append(
            TextLine(
                text=text,
                x=x,
                y=y,
                w=w,
                h=h,
                confidence=confidence,
                color=_ink(img, x, y, w, h),
                background=_surface(img, x, y, w, h),
                words=[t[4] for t in line],
            )
        )
    out.sort(key=lambda t: (t.y, t.x))
    return out


_SHORT_WORDS = {
    "a",
    "i",
    "an",
    "at",
    "be",
    "by",
    "do",
    "go",
    "he",
    "if",
    "in",
    "is",
    "it",
    "me",
    "my",
    "no",
    "of",
    "on",
    "or",
    "so",
    "to",
    "up",
    "us",
    "we",
    "و",
    "در",
    "به",
    "از",
    "تا",
    "با",
    "که",
}


def _arabic(ch: str) -> bool:
    return "\u0600" <= ch <= "\u06ff" or "\u0750" <= ch <= "\u077f" or "\ufb50" <= ch <= "\ufeff"


def _clean_words(line: list[tuple]) -> list[tuple]:
    """Drop the noise Tesseract reads from shapes: symbols, the other script's fragments in a
    line, and very short low-confidence pieces."""
    letters = "".join(t[4] for t in line)
    arabic = sum(_arabic(ch) for ch in letters if ch.isalpha())
    latin = sum(ch.isascii() for ch in letters if ch.isalpha())
    majority_arabic = arabic > latin
    kept = []
    for word in line:
        text, conf = word[4], word[5]
        if not any(ch.isalnum() for ch in text):
            continue  # "|", "—", stray punctuation
        word_arabic = any(_arabic(ch) for ch in text)
        if (arabic or latin) and word_arabic != majority_arabic and len(line) > 1:
            continue  # "۱۱۱" inside an English sentence, or Latin debris in Persian
        core = text.strip(".,;:!?“”\"'()")
        if len(core) <= 2 and core.lower() not in _SHORT_WORDS and not core.isdigit() and conf < 90:
            continue
        kept.append(word)
    return kept


def _bbox(items: list[tuple]) -> tuple[int, int, int, int]:
    x0 = min(t[0] for t in items)
    y0 = min(t[1] for t in items)
    x1 = max(t[0] + t[2] for t in items)
    y1 = max(t[1] + t[3] for t in items)
    return x0, y0, x1 - x0, y1 - y0


def _ink(img: np.ndarray, x: int, y: int, w: int, h: int) -> str:
    patch = img[y : y + h, x : x + w].reshape(-1, 3).astype(float)
    if len(patch) == 0:
        return "#111111"
    bg = np.median(patch, axis=0)
    far = patch[np.linalg.norm(patch - bg, axis=1) > 60]
    return imaging.to_hex(np.median(far, axis=0) if len(far) > 5 else bg)


def _surface(img: np.ndarray, x: int, y: int, w: int, h: int) -> str | None:
    """Colour of a pill / button behind the line if it differs from the page around it."""
    H, W = img.shape[:2]
    pad_in, pad_out = max(4, h // 2), max(14, h)
    inner = img[max(0, y - pad_in) : min(H, y + h + pad_in), max(0, x - pad_in) : min(W, x + w + pad_in)]
    ring = np.concatenate(
        [
            img[max(0, y - pad_out) : max(0, y - pad_out) + 3, max(0, x - pad_out) : min(W, x + w + pad_out)].reshape(
                -1, 3
            ),
            img[
                min(H - 3, y + h + pad_out) : min(H, y + h + pad_out + 3), max(0, x - pad_out) : min(W, x + w + pad_out)
            ].reshape(-1, 3),
        ]
    )
    if inner.size == 0 or len(ring) == 0:
        return None
    # border pixels of the inner box = the surface the text sits on
    edge = np.concatenate([inner[0], inner[-1], inner[:, 0], inner[:, -1]]).astype(float)
    surface = imaging.to_hex(np.median(edge, axis=0))
    around = imaging.to_hex(np.median(ring.astype(float), axis=0))
    if edge.std(axis=0).max() > 30:
        return None
    # a button ends next to its label; a coloured band continues on both sides
    gap = pad_out + 2 * h
    sides = [img[y + h // 2, max(0, x - gap)], img[y + h // 2, min(W - 1, x + w + gap)]]
    if all(imaging.delta_e(imaging.to_hex(px), surface) < 12 for px in sides):
        return None
    return surface if imaging.delta_e(surface, around) > 25 else None
