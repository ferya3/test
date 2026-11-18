from __future__ import annotations

import json
import shutil
import subprocess
from fractions import Fraction

import cv2

from app.schemas.spec import VideoMeta

ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".mkv"}
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


class VideoError(Exception):
    pass


def _fraction(value: str | None) -> float:
    try:
        f = float(Fraction(value or "0"))
    except (ValueError, ZeroDivisionError):
        return 0.0
    return f


def probe_video(path: str) -> VideoMeta:
    """Resolution, FPS and duration via ffprobe, OpenCV as a fallback."""
    if shutil.which("ffprobe"):
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode == 0:
            data = json.loads(proc.stdout or "{}")
            streams = data.get("streams", [])
            video = next((s for s in streams if s.get("codec_type") == "video"), None)
            if video:
                fps = _fraction(video.get("avg_frame_rate")) or _fraction(video.get("r_frame_rate"))
                duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
                frames = int(video.get("nb_frames") or 0) or int(round(duration * fps))
                return VideoMeta(
                    width=int(video["width"]),
                    height=int(video["height"]),
                    fps=round(fps or 30.0, 3),
                    duration=round(duration, 3),
                    frame_count=frames,
                    codec=video.get("codec_name", ""),
                    has_audio=any(s.get("codec_type") == "audio" for s in streams),
                )
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise VideoError("Unreadable video file")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    finally:
        cap.release()
    if not width or not height:
        raise VideoError("Video has no decodable frames")
    return VideoMeta(width=width, height=height, fps=fps, duration=frames / fps if fps else 0, frame_count=frames)


def guess_dpr(width: int, height: int) -> float:
    """Screen recordings from retina / phone screens are 2-3x CSS pixels."""
    long_side, short_side = max(width, height), min(width, height)
    if height > width:  # portrait -> phone
        if short_side >= 1000:
            return 3.0
        if short_side >= 640:
            return 2.0
        return 1.0
    if long_side >= 2400:
        return 2.0
    return 1.0
