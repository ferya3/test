"""Content extraction on screenshots: window chrome, pictures, text."""

import cv2
import numpy as np
import pytest

from app.video import content


def _shaded_blob(img, x, y, w, h, color):
    """A product-photo stand-in: an ellipse with shading (many colours) and a soft shadow."""
    cv2.ellipse(img, (x + w // 2 + 6, y + h // 2 + 8), (w // 2, h // 2), 0, 0, 360, (225, 225, 225), -1)
    for i in range(h // 2, 0, -2):
        shade = tuple(int(c * (0.35 + 0.65 * i / (h / 2))) for c in color)
        cv2.ellipse(img, (x + w // 2, y + h // 2), (max(1, w * i // h), i), 0, 0, 360, shade, -1)


def _page() -> np.ndarray:
    page = np.full((700, 1180, 3), 250, np.uint8)
    for k, color in enumerate([(60, 80, 220), (40, 180, 90), (220, 140, 40), (170, 60, 210)]):
        _shaded_blob(page, 90 + k * 270, 200, 170, 320, color)
    cv2.rectangle(page, (420, 40), (760, 70), (30, 30, 30), -1)  # flat "text" bar: not a picture
    cv2.rectangle(page, (80, 600), (240, 640), (200, 120, 30), -1)  # flat button: not a picture
    return page


def _window(page: np.ndarray) -> np.ndarray:
    """The page as a screenshot of a browser window: dark frame + scrollbar on the right."""
    h, w = page.shape[:2]
    shot = np.full((h + 12, w + 12 + 16, 3), 23, np.uint8)
    shot[6 : 6 + h, 6 : 6 + w] = page
    shot[6 : 6 + h, 6 + w : 6 + w + 16] = 252  # track
    shot[40 : h - 40, 6 + w + 4 : 6 + w + 13] = 139  # thumb
    return shot


def test_trim_frame_removes_window_border_and_scrollbar():
    page = _page()
    x0, y0, x1, y1 = content.trim_frame(_window(page))
    assert (x0, y0) == (6, 6)
    assert abs((x1 - x0) - page.shape[1]) <= 4 and abs((y1 - y0) - page.shape[0]) <= 1


def test_trim_frame_keeps_a_page_without_chrome():
    page = _page()
    assert content.trim_frame(page) == (0, 0, page.shape[1], page.shape[0])


def test_find_images_takes_photos_not_flat_ui():
    boxes = content.find_images(_page())
    assert len(boxes) == 4
    assert all(170 <= b.h <= 380 for b in boxes)
    assert [b.x // 270 for b in sorted(boxes, key=lambda b: b.x)] == [0, 1, 2, 3]
    assert all(content.is_cutout(_page(), b) for b in boxes)


@pytest.mark.skipif(not content.ocr_available(), reason="tesseract is not installed")
def test_read_text_dark_and_light():
    img = np.full((220, 900, 3), 250, np.uint8)
    cv2.putText(img, "Clothing rail", (40, 80), cv2.FONT_HERSHEY_DUPLEX, 1.6, (20, 20, 20), 2, cv2.LINE_AA)
    img[120:220] = (120, 40, 90)
    cv2.putText(img, "Shop the edit", (40, 185), cv2.FONT_HERSHEY_DUPLEX, 1.6, (250, 250, 250), 2, cv2.LINE_AA)
    text = " ".join(line.text for line in content.read_text(img)).lower()
    assert "rail" in text  # dark on light
    assert "shop" in text  # light on dark: read from the inverted pass
