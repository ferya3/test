"""Video worker jobs: analyse uploaded media, capture a URL."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from sqlalchemy import delete

from app.core.db import session_scope
from app.core.events import emit
from app.models import ProjectAsset, VideoFrame
from app.qa.render import launch_kwargs
from app.schemas.spec import VideoAnalysis
from app.services.context import TaskContext
from app.video.engine import ENGINE_VERSION, VideoIntelligenceEngine


def ingest_asset(ctx: TaskContext, asset_id: str) -> VideoAnalysis:
    with session_scope() as db:
        asset = db.get(ProjectAsset, asset_id)
        asset.status = "processing"
        kind, key = asset.kind, asset.storage_key
    emit(ctx.project_id, "asset", asset_id=asset_id, status="processing")
    engine = VideoIntelligenceEngine(ctx.settings, ctx.storage)
    prefix = f"projects/{ctx.project_id}/assets/{asset_id}"
    try:
        path = ctx.storage.local_path(key)
        if kind == "video":
            analysis = engine.analyze_video(path, prefix, progress=lambda p, m: ctx.progress(p * 0.95, "video", m))
        else:
            analysis = engine.analyze_image(path, prefix)
    except Exception:
        with session_scope() as db:
            db.get(ProjectAsset, asset_id).status = "failed"
        emit(ctx.project_id, "asset", asset_id=asset_id, status="failed")
        raise

    with session_scope() as db:
        db.execute(delete(VideoFrame).where(VideoFrame.asset_id == asset_id))
        for kf in analysis.keyframes:
            db.add(
                VideoFrame(
                    project_id=ctx.project_id,
                    asset_id=asset_id,
                    kind="keyframe",
                    frame_index=kf.index,
                    timestamp=kf.t,
                    storage_key=kf.storage_key,
                    width=kf.width,
                    height=kf.height,
                    meta={"reasons": kf.reasons, "scene": kf.scene},
                )
            )
        for page in analysis.pages:
            db.add(
                VideoFrame(
                    project_id=ctx.project_id,
                    asset_id=asset_id,
                    kind="stitched",
                    frame_index=page.scene,
                    timestamp=page.t_start,
                    storage_key=page.storage_key,
                    width=page.width,
                    height=page.height,
                    meta={"scene": page.scene, "t_end": page.t_end, "sticky_header_px": page.sticky_header_px},
                )
            )
        asset = db.get(ProjectAsset, asset_id)
        asset.meta = {
            **(asset.meta or {}),
            "probe": analysis.meta.model_dump(),
            "analysis": analysis.model_dump(mode="json"),
            "engine": ENGINE_VERSION,
        }
        asset.status = "analyzed"
    emit(
        ctx.project_id,
        "asset",
        asset_id=asset_id,
        status="analyzed",
        events=len(analysis.events),
        keyframes=len(analysis.keyframes),
    )
    return analysis


class BlockedURL(ValueError):
    pass


def assert_public_url(url: str) -> None:
    """SSRF guard: only public http(s) hosts may be captured."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise BlockedURL("Only http(s) URLs can be captured")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as e:
        raise BlockedURL(f"Cannot resolve {parsed.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise BlockedURL("URL resolves to a private or reserved address")


def capture_url(ctx: TaskContext, url: str) -> str:
    """Full-page screenshot of a public URL, stored as an image asset. Returns asset id."""
    from playwright.sync_api import sync_playwright

    assert_public_url(url)
    ctx.progress(0.05, "capture", f"Opening {url}")
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs(ctx.settings))
        try:
            page = browser.new_page(viewport={"width": 1440, "height": 900})

            def guard(route):
                try:
                    assert_public_url(route.request.url)
                    route.continue_()
                except BlockedURL:
                    route.abort()

            page.route("**/*", guard)
            page.goto(url, wait_until="networkidle", timeout=45000)
            # scroll through so lazy content and scroll-reveal animations load
            page.evaluate("""async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) {
                window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); }""")
            page.wait_for_timeout(500)
            png = page.screenshot(full_page=True)
        finally:
            browser.close()
    key = ctx.storage.put(f"projects/{ctx.project_id}/uploads/capture.png", png, "image/png")
    with session_scope() as db:
        asset = ProjectAsset(
            project_id=ctx.project_id,
            kind="image",
            filename="capture.png",
            storage_key=key,
            mime="image/png",
            size=len(png),
            meta={"source_url": url},
        )
        db.add(asset)
        db.flush()
        asset_id = asset.id
    ctx.progress(0.3, "capture", "Captured full page")
    return asset_id
