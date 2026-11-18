import cv2

from app.core.config import get_settings
from app.core.storage import get_storage
from app.video import imaging
from app.video.engine import VideoIntelligenceEngine
from tests.synthetic import PAGE_H, make_site_image


def test_timeline_scroll_menu_and_stitch(recording):
    path, _ = recording
    analysis = VideoIntelligenceEngine(get_settings(), get_storage()).analyze_video(path, "t/video")

    assert analysis.meta.width == 1280 and analysis.meta.height == 720
    assert analysis.viewport == {"width": 1280, "height": 720}

    scrolls = [e for e in analysis.events if e.kind == "scroll"]
    assert [e.direction for e in scrolls] == ["down", "down"]
    assert abs(scrolls[0].distance_px - 1200) < 30  # recorded: 1200 px
    assert abs(scrolls[1].distance_px - 680) < 30  # recorded: 680 px

    menus = [e for e in analysis.events if e.kind == "interaction"]
    assert menus, "the dropdown opening must be detected"
    opening = menus[0]
    assert opening.hint in ("dropdown-menu", "menu-toggle")
    assert opening.bbox[0] > 0.6 and opening.bbox[1] < 0.2  # top-right
    assert 0.2 <= opening.t_end - opening.t_start <= 0.8  # ~300 ms animation, 200 ms sampling
    # temporal order is preserved
    assert scrolls[0].t_end <= opening.t_start < scrolls[1].t_start

    reasons = {r for k in analysis.keyframes for r in k.reasons}
    assert {"first-frame", "before-interaction", "after-interaction"} <= reasons

    assert len(analysis.pages) == 1
    page = analysis.pages[0]
    assert abs(page.height - PAGE_H) < 40
    assert page.sticky_header_px >= 70  # 80 px sticky header

    stitched = imaging.decode_image(get_storage().get(page.storage_key))
    truth = make_site_image()
    h = min(stitched.shape[0], truth.shape[0])
    score, _ = imaging.ssim(cv2.resize(stitched[:h], (320, h // 4)), cv2.resize(truth[:h], (320, h // 4)))
    assert score > 0.8  # mp4v compression + 4x downscale; unrelated images score ~0.3


def test_bands_and_columns():
    bands = imaging.bands(make_site_image())
    assert len(bands) == 6
    assert [b.columns for b in bands] == [1, 1, 3, 1, 2, 1]
    assert abs(bands[1].y0 - 80) <= 4 and abs(bands[2].y0 - 680) <= 4
    assert imaging.delta_e(bands[3].bg, "#2563eb") < 6  # cta blue


def test_image_asset(tmpdir_session):
    path = f"{tmpdir_session}/shot.png"
    cv2.imwrite(path, make_site_image())
    analysis = VideoIntelligenceEngine(get_settings(), get_storage()).analyze_image(path, "t/image")
    assert analysis.pages[0].height == PAGE_H
    assert analysis.viewport["width"] == 1280


def test_blank_lead_and_fast_jump(tmpdir_session):
    """Real browser recordings start blank and can scroll further than a viewport
    between two samples; neither may split the page into fake scenes."""
    from tests.synthetic import make_recording

    path = f"{tmpdir_session}/jumpy.mp4"
    make_recording(path, blank_lead=True, jump_end=True)
    analysis = VideoIntelligenceEngine(get_settings(), get_storage()).analyze_video(path, "t/jumpy")
    assert not [e for e in analysis.events if e.kind == "cut"]
    scrolls = [e for e in analysis.events if e.kind == "scroll"]
    assert len(scrolls) == 2
    assert abs(scrolls[1].distance_px - 680) < 30
    assert len(analysis.pages) == 1
    assert abs(analysis.pages[0].height - PAGE_H) < 40
    assert all(k.t > 0.05 for k in analysis.keyframes)  # no keyframe of the blank lead


def test_bands_on_a_real_browser_recording():
    """Stitched page from a real Chromium screen recording of scripts/demo/site.html:
    diagonal-gradient hero, low-contrast cards of unequal height, two-sided footer."""
    import os

    img = cv2.imread(os.path.join(os.path.dirname(__file__), "fixtures", "northwind-page.png"))
    measured = imaging.bands(img)
    heights = [b.y1 - b.y0 for b in measured]
    assert len(measured) == 6
    assert abs(heights[0] - 72) <= 2  # header: 72px in the CSS
    assert abs(heights[1] - 560) <= 3  # hero gradient stays one band
    assert [b.columns for b in measured[1:5]] == [1, 3, 1, 2]  # hero, features, cta, testimonials
    assert measured[1].gradient and measured[1].gradient.startswith("linear-gradient(135deg")
    assert [b.gradient for b in measured if b is not measured[1]] == [None] * 5
