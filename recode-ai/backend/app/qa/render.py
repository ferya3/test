"""Headless Chromium rendering of a generated site, served from memory.

Files are fulfilled through request interception, so rendering needs no web
server and the page can only reach an allow-list of hosts (fonts / CDNs)."""

from __future__ import annotations

import mimetypes
import os
from dataclasses import dataclass, field
from urllib.parse import urlparse

import numpy as np
from playwright.sync_api import Route, sync_playwright

from app.core.binary import file_bytes, is_binary
from app.core.config import Settings
from app.video.imaging import decode_image

BASE = "http://preview.recode.local/"

MEASURE_JS = """() => Array.from(document.querySelectorAll('[data-section]')).map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.getAttribute('data-section'), top: r.top + window.scrollY, height: r.height,
           bg: getComputedStyle(el).backgroundColor };
})"""

OVERFLOW_JS = "() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"


@dataclass
class PageRender:
    page_id: str
    url: str
    full: np.ndarray
    viewport: np.ndarray
    sections: list[dict]
    doc_height: int


@dataclass
class SiteRender:
    pages: dict[str, PageRender] = field(default_factory=dict)
    console_errors: list[str] = field(default_factory=list)
    overflow: dict[str, int] = field(default_factory=dict)
    behavior_checks: list[dict] = field(default_factory=list)


def _mime(path: str) -> str:
    if path.endswith((".js", ".mjs", ".jsx")):
        return "text/javascript"
    return mimetypes.guess_type(path)[0] or "application/octet-stream"


def launch_kwargs(settings: Settings) -> dict:
    kwargs: dict = {}
    path = settings.chromium_path or os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
    if path:
        kwargs["executable_path"] = path
    if settings.chromium_no_sandbox or (hasattr(os, "geteuid") and os.geteuid() == 0):
        kwargs["args"] = ["--no-sandbox"]  # Chromium refuses its sandbox as root (dev containers)
    return kwargs


class SiteRenderer:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _handler(self, files: dict[str, bytes | str]):
        allowed = set(self.settings.render_allowed_hosts)

        def handle(route: Route) -> None:
            url = route.request.url
            if url.startswith(BASE):
                path = urlparse(url).path.lstrip("/") or "index.html"
                if path.endswith("/"):
                    path += "index.html"
                body = files.get(path)
                if isinstance(body, str) and is_binary(path):
                    body = file_bytes(path, body)
                if body is None:
                    route.fulfill(status=404, body="not found")
                    return
                route.fulfill(status=200, body=body, headers={"content-type": _mime(path)})
                return
            if urlparse(url).hostname in allowed:
                route.continue_()
                return
            route.abort()

        return handle

    def render(
        self,
        files: dict[str, bytes | str],
        pages: list[tuple[str, str]],  # (page_id, relative url e.g. "index.html" or "index.html#/about")
        viewport: dict[str, int],
        behaviors: list[dict] | None = None,
        timeout_ms: int = 20000,
    ) -> SiteRender:
        result = SiteRender()
        width, height = int(viewport.get("width", 1280)), int(viewport.get("height", 720))
        with sync_playwright() as p:
            browser = p.chromium.launch(**launch_kwargs(self.settings))
            try:
                # 1) settled-state screenshots (reduced motion -> no half-finished animations)
                ctx = browser.new_context(
                    viewport={"width": width, "height": height}, device_scale_factor=1, reduced_motion="reduce"
                )
                ctx.route("**/*", self._handler(files))
                page = ctx.new_page()
                page.set_default_timeout(timeout_ms)
                page.on("console", lambda m: m.type == "error" and result.console_errors.append(m.text[:300]))
                page.on("pageerror", lambda e: result.console_errors.append(str(e)[:300]))
                for page_id, rel in pages:
                    url = BASE + rel
                    page.goto(url, wait_until="load")
                    page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true")
                    page.wait_for_timeout(250)
                    viewport_png = page.screenshot(animations="disabled")
                    full_png = page.screenshot(full_page=True, animations="disabled")
                    sections = page.evaluate(MEASURE_JS)
                    doc_h = page.evaluate("() => document.documentElement.scrollHeight")
                    result.pages[page_id] = PageRender(
                        page_id, url, decode_image(full_png), decode_image(viewport_png), sections, int(doc_h)
                    )
                ctx.close()

                # 2) responsive: horizontal overflow at common widths
                first = pages[0][1] if pages else "index.html"
                for w in (390, 768, 1024):
                    ctx = browser.new_context(viewport={"width": w, "height": 844}, reduced_motion="reduce")
                    ctx.route("**/*", self._handler(files))
                    pg = ctx.new_page()
                    pg.goto(BASE + first, wait_until="load")
                    result.overflow[str(w)] = int(pg.evaluate(OVERFLOW_JS))
                    ctx.close()

                # 3) behaviours: does the recorded trigger exist and produce a visible change?
                for behavior in behaviors or []:
                    if behavior.get("trigger") != "click":
                        continue
                    result.behavior_checks.append(self._check_click(browser, files, first, width, height, behavior))
            finally:
                browser.close()
        return result

    def _check_click(self, browser, files, rel: str, width: int, height: int, behavior: dict) -> dict:
        check = {"behavior": behavior.get("id"), "effect": behavior.get("effect"), "passed": False}
        ctx = browser.new_context(viewport={"width": width, "height": height})
        ctx.route("**/*", self._handler(files))
        try:
            pg = ctx.new_page()
            pg.goto(BASE + rel, wait_until="load")
            trigger = pg.query_selector("[data-menu-toggle], [data-trigger], .menu-toggle, [aria-haspopup]")
            if trigger is None or not trigger.is_visible():
                check["message"] = "No visible trigger for this behaviour was found"
                return check
            before = decode_image(pg.screenshot())
            trigger.click()
            pg.wait_for_timeout(int(behavior.get("duration_ms") or 300) + 250)
            after = decode_image(pg.screenshot())
            changed = float((np.abs(before.astype(int) - after.astype(int)).max(axis=2) > 24).mean())
            check["changed_ratio"] = round(changed, 4)
            check["passed"] = changed > 0.003
            check["message"] = "Trigger produces a visible change" if check["passed"] else "Click had no visible effect"
        except Exception as e:  # a broken page is a QA finding, not a crash
            check["message"] = f"Interaction failed: {e}"[:300]
        finally:
            ctx.close()
        return check
