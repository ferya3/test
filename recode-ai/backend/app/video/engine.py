"""Video Intelligence Engine.

Turns a screen recording into:
  * a *timeline* of events (scrolls, scene cuts, local interactions) in order,
  * keyframes that document each event (before / during / after),
  * one stitched full-page image per scene (scroll recordings -> whole page),
  * a colour palette.

Ordering is the point: a dropdown that appears 300 ms after a change in the
top-right corner is a behaviour with a trigger and a duration, not just a
second screenshot."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass

import cv2
import numpy as np

from app.core.config import Settings
from app.core.storage import Storage
from app.schemas.spec import Keyframe, StitchedPage, TimelineEvent, VideoAnalysis, VideoMeta
from app.video import imaging
from app.video.motion import STILL_RATIO, PairMetrics, compare_frames, interaction_hint
from app.video.probe import VideoError, guess_dpr, probe_video

log = logging.getLogger(__name__)

Progress = Callable[[float, str], None]

_REASON_PRIORITY = {
    "first-frame": 0,
    "scene-start": 1,
    "before-interaction": 2,
    "after-interaction": 2,
    "mid-transition": 4,
    "scroll-end": 3,
    "last-frame": 5,
}


@dataclass
class Sample:
    index: int
    t: float
    gray: np.ndarray  # float32, analysis width


class VideoIntelligenceEngine:
    def __init__(self, settings: Settings, storage: Storage):
        self.settings = settings
        self.storage = storage

    # ------------------------------------------------------------------ public

    def analyze_video(self, path: str, key_prefix: str, progress: Progress | None = None) -> VideoAnalysis:
        progress = progress or (lambda p, m: None)
        meta = probe_video(path)
        if meta.duration > self.settings.max_video_seconds:
            raise VideoError(f"Video is {meta.duration:.0f}s; the limit is {self.settings.max_video_seconds}s")
        progress(0.05, f"{meta.width}x{meta.height} @ {meta.fps:g} fps, {meta.duration:.1f}s")

        samples = self._sample(path, meta, progress)
        if len(samples) < 1:
            raise VideoError("No frames could be decoded")
        progress(0.45, f"Sampled {len(samples)} frames, measuring motion")

        pairs = [compare_frames(samples[i].gray, samples[i + 1].gray) for i in range(len(samples) - 1)]
        scale_to_video = meta.width / samples[0].gray.shape[1]
        events, scenes, positions = self._timeline(samples, pairs, scale_to_video)
        progress(0.6, f"Detected {len(events)} events across {max(scenes) + 1} scene(s)")

        keyframe_samples = self._select_keyframes(samples, pairs, events, scenes)
        dpr = guess_dpr(meta.width, meta.height)
        analysis = VideoAnalysis(
            meta=meta,
            dpr=dpr,
            viewport={"width": int(round(meta.width / dpr)), "height": int(round(meta.height / dpr))},
            sample_fps=round(meta.fps / max(1, self._step(meta)), 3),
            events=events,
        )
        self._materialize(path, meta, samples, keyframe_samples, scenes, positions, analysis, key_prefix)
        progress(0.95, f"Saved {len(analysis.keyframes)} keyframes and {len(analysis.pages)} page image(s)")
        return analysis

    def analyze_image(self, path: str, key_prefix: str) -> VideoAnalysis:
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            raise VideoError("Unreadable image")
        h, w = img.shape[:2]
        dpr = guess_dpr(w, min(h, int(w * 0.75)) if h > w * 1.2 else h)
        if w >= 2400:
            dpr = 2.0
        stitched_w = min(w, self.settings.stitch_max_width)
        page = imaging.resize_to_width(img, stitched_w)
        key = self.storage.put(f"{key_prefix}/pages/scene-0.png", imaging.encode_png(page), "image/png")
        viewport_h = int(min(h, w * 9 / 16) / dpr)
        meta = VideoMeta(width=w, height=h, fps=0, duration=0, frame_count=1, codec="image")
        return VideoAnalysis(
            meta=meta,
            dpr=dpr,
            viewport={"width": int(round(w / dpr)), "height": viewport_h},
            sample_fps=0,
            keyframes=[
                Keyframe(
                    index=0,
                    t=0,
                    scene=0,
                    reasons=["screenshot"],
                    storage_key=key,
                    width=page.shape[1],
                    height=page.shape[0],
                )
            ],
            pages=[
                StitchedPage(
                    scene=0,
                    t_start=0,
                    t_end=0,
                    storage_key=key,
                    width=page.shape[1],
                    height=page.shape[0],
                    viewport_height=int(page.shape[1] * viewport_h / max(1, w / dpr)),
                )
            ],
            palette=imaging.palette(img),
        )

    # ----------------------------------------------------------------- sampling

    def _step(self, meta: VideoMeta) -> int:
        return max(1, int(round((meta.fps or 30) / self.settings.analysis_fps)))

    def _sample(self, path: str, meta: VideoMeta, progress: Progress) -> list[Sample]:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise VideoError("Unreadable video file")
        step = self._step(meta)
        fps = meta.fps or 30.0
        width = self.settings.analysis_width
        samples: list[Sample] = []
        index = 0
        total = max(1, meta.frame_count)
        try:
            while True:
                if not cap.grab():
                    break
                if index % step == 0:
                    ok, frame = cap.retrieve()
                    if not ok:
                        break
                    small = imaging.resize_to_width(frame, width)
                    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
                    samples.append(Sample(index=index, t=round(index / fps, 3), gray=gray))
                    if len(samples) % 25 == 0:
                        progress(0.05 + 0.4 * min(1.0, index / total), f"Reading frame {index}/{total}")
                index += 1
        finally:
            cap.release()
        return samples

    # ----------------------------------------------------------------- timeline

    def _timeline(
        self, samples: list[Sample], pairs: list[PairMetrics], scale: float
    ) -> tuple[list[TimelineEvent], list[int], list[float]]:
        scenes = [0] * len(samples)
        positions = [0.0] * len(samples)  # scroll offset in analysis px, per scene
        scene = 0
        for i, pair in enumerate(pairs):
            if pair.kind == "cut":
                scene += 1
                positions[i + 1] = 0.0
            elif pair.kind == "scroll":
                positions[i + 1] = positions[i] - pair.dy
            else:
                positions[i + 1] = positions[i]
            scenes[i + 1] = scene

        events: list[TimelineEvent] = []
        h, w = samples[0].gray.shape
        i = 0
        while i < len(pairs):
            kind = pairs[i].kind
            if kind == "still":
                i += 1
                continue
            if kind == "cut":
                events.append(
                    TimelineEvent(
                        id=f"e{len(events) + 1}",
                        kind="cut",
                        t_start=samples[i].t,
                        t_end=samples[i + 1].t,
                        frames=[samples[i + 1].index],
                    )
                )
                i += 1
                continue
            # group a run of the same kind, tolerating one still pair inside it
            j = i
            while j + 1 < len(pairs):
                nxt = pairs[j + 1].kind
                if nxt == kind:
                    j += 1
                elif nxt == "still" and j + 2 < len(pairs) and pairs[j + 2].kind == kind:
                    j += 2
                else:
                    break
            group = [p for p in pairs[i : j + 1] if p.kind == kind]
            t0, t1 = samples[i].t, samples[j + 1].t
            if kind == "scroll":
                distance = -sum(p.dy for p in group) * scale
                if abs(distance) >= 4:
                    events.append(
                        TimelineEvent(
                            id=f"e{len(events) + 1}",
                            kind="scroll",
                            t_start=t0,
                            t_end=t1,
                            direction="down" if distance > 0 else "up",
                            distance_px=round(abs(distance), 1),
                            frames=[samples[i].index, samples[j + 1].index],
                        )
                    )
            else:
                boxes = [b for p in group for b in p.boxes]
                if boxes:
                    x0 = min(b[0] for b in boxes)
                    y0 = min(b[1] for b in boxes)
                    x1 = max(b[0] + b[2] for b in boxes)
                    y1 = max(b[1] + b[3] for b in boxes)
                    bbox = [round(x0 / w, 4), round(y0 / h, 4), round((x1 - x0) / w, 4), round((y1 - y0) / h, 4)]
                    frames = [samples[i].index, samples[j + 1].index]
                    if j > i:
                        frames.insert(1, samples[(i + j + 1) // 2].index)
                    events.append(
                        TimelineEvent(
                            id=f"e{len(events) + 1}",
                            kind="interaction",
                            t_start=t0,
                            t_end=t1,
                            bbox=bbox,
                            area_ratio=round(bbox[2] * bbox[3], 4),
                            hint=interaction_hint(bbox),
                            frames=frames,
                        )
                    )
            i = j + 1
        return events, scenes, positions

    def _select_keyframes(
        self, samples: list[Sample], pairs: list[PairMetrics], events: list[TimelineEvent], scenes: list[int]
    ) -> dict[int, list[str]]:
        by_index = {s.index: n for n, s in enumerate(samples)}
        chosen: dict[int, set[str]] = {0: {"first-frame"}}
        for n, pair in enumerate(pairs):
            if pair.kind == "cut":
                chosen.setdefault(n + 1, set()).add("scene-start")
        for ev in events:
            if ev.kind == "interaction":
                chosen.setdefault(by_index[ev.frames[0]], set()).add("before-interaction")
                chosen.setdefault(by_index[ev.frames[-1]], set()).add("after-interaction")
                if len(ev.frames) == 3:
                    chosen.setdefault(by_index[ev.frames[1]], set()).add("mid-transition")
            elif ev.kind == "scroll":
                chosen.setdefault(by_index[ev.frames[-1]], set()).add("scroll-end")
        chosen.setdefault(len(samples) - 1, set()).add("last-frame")

        # drop visually identical neighbours within a scene
        ordered = sorted(chosen)
        kept: list[int] = []
        for n in ordered:
            if kept and scenes[kept[-1]] == scenes[n]:
                prev = samples[kept[-1]].gray
                same = (np.abs(prev - samples[n].gray) > 24).mean() < STILL_RATIO
                if same and not ({"before-interaction", "after-interaction"} & chosen[n]):
                    chosen[kept[-1]] |= chosen[n]
                    continue
            kept.append(n)

        limit = self.settings.max_keyframes
        if len(kept) > limit:
            kept.sort(key=lambda n: (min(_REASON_PRIORITY.get(r, 9) for r in chosen[n]), n))
            kept = sorted(kept[:limit])
        return {n: sorted(chosen[n]) for n in kept}

    # ------------------------------------------------------------ materialize

    def _materialize(
        self,
        path: str,
        meta: VideoMeta,
        samples: list[Sample],
        keyframe_samples: dict[int, list[str]],
        scenes: list[int],
        positions: list[float],
        analysis: VideoAnalysis,
        key_prefix: str,
    ) -> None:
        analysis_w = samples[0].gray.shape[1]
        stitch_w = min(meta.width, self.settings.stitch_max_width)
        stitch_scale = stitch_w / analysis_w

        # which scenes scroll far enough to deserve a stitched full page
        scene_ids = sorted(set(scenes))
        scene_samples = {s: [n for n in range(len(samples)) if scenes[n] == s] for s in scene_ids}
        stitch_scenes: dict[int, dict] = {}
        small_h = samples[0].gray.shape[0]
        for s, members in scene_samples.items():
            pos = [positions[n] for n in members]
            span = max(pos) - min(pos)
            if span > small_h * 0.25:
                stitch_scenes[s] = {"min": min(pos), "span": span, "canvas": None, "filled": 0}

        needed = set(keyframe_samples) | {n for s in stitch_scenes for n in scene_samples[s]}
        wanted_index = {samples[n].index: n for n in needed}

        cap = cv2.VideoCapture(path)
        index = 0
        first_full: np.ndarray | None = None
        try:
            while wanted_index:
                if not cap.grab():
                    break
                if index in wanted_index:
                    ok, frame = cap.retrieve()
                    if not ok:
                        break
                    n = wanted_index.pop(index)
                    if first_full is None:
                        first_full = frame
                    if n in keyframe_samples:
                        key = self.storage.put(
                            f"{key_prefix}/keyframes/{samples[n].index:06d}.png", imaging.encode_png(frame), "image/png"
                        )
                        analysis.keyframes.append(
                            Keyframe(
                                index=samples[n].index,
                                t=samples[n].t,
                                scene=scenes[n],
                                reasons=keyframe_samples[n],
                                storage_key=key,
                                width=frame.shape[1],
                                height=frame.shape[0],
                            )
                        )
                    state = stitch_scenes.get(scenes[n])
                    if state is not None:
                        self._paste(state, imaging.resize_to_width(frame, stitch_w), positions[n], stitch_scale)
                index += 1
        finally:
            cap.release()

        analysis.keyframes.sort(key=lambda k: k.index)

        for s in scene_ids:
            members = scene_samples[s]
            t0, t1 = samples[members[0]].t, samples[members[-1]].t
            state = stitch_scenes.get(s)
            if state is not None and state["canvas"] is not None:
                canvas = state["canvas"][: state["filled"]]
                sticky = self._sticky_header(samples, members, positions) * stitch_scale
                key = self.storage.put(f"{key_prefix}/pages/scene-{s}.png", imaging.encode_png(canvas), "image/png")
                analysis.pages.append(
                    StitchedPage(
                        scene=s,
                        t_start=t0,
                        t_end=t1,
                        storage_key=key,
                        width=canvas.shape[1],
                        height=canvas.shape[0],
                        viewport_height=int(round(small_h * stitch_scale)),
                        sticky_header_px=int(round(sticky)),
                    )
                )
            else:
                # no scrolling: the first keyframe of the scene is the page
                kf = next((k for k in analysis.keyframes if k.scene == s), None)
                if kf is not None:
                    img = imaging.decode_image(self.storage.get(kf.storage_key))
                    img = imaging.resize_to_width(img, stitch_w)
                    key = self.storage.put(f"{key_prefix}/pages/scene-{s}.png", imaging.encode_png(img), "image/png")
                    analysis.pages.append(
                        StitchedPage(
                            scene=s,
                            t_start=t0,
                            t_end=t1,
                            storage_key=key,
                            width=img.shape[1],
                            height=img.shape[0],
                            viewport_height=img.shape[0],
                        )
                    )

        if analysis.pages:
            page_img = imaging.decode_image(self.storage.get(analysis.pages[0].storage_key))
            analysis.palette = imaging.palette(page_img)
        elif first_full is not None:
            analysis.palette = imaging.palette(first_full)

    @staticmethod
    def _paste(state: dict, frame: np.ndarray, pos: float, scale: float) -> None:
        h, w = frame.shape[:2]
        if state["canvas"] is None:
            total = h + int(np.ceil(state["span"] * scale)) + 4
            state["canvas"] = np.zeros((total, w, 3), dtype=np.uint8)
        canvas = state["canvas"]
        y = int(round((pos - state["min"]) * scale))
        y = max(0, min(y, canvas.shape[0] - h))
        start = max(state["filled"], y)
        end = y + h
        if end > start:
            canvas[start:end] = frame[start - y : h]
            state["filled"] = end

    @staticmethod
    def _sticky_header(samples: list[Sample], members: list[int], positions: list[float]) -> int:
        """Rows at the top that stay identical while the page scrolls."""
        first = members[0]
        furthest = max(members, key=lambda n: abs(positions[n] - positions[first]))
        a, b = samples[first].gray, samples[furthest].gray
        h = a.shape[0]
        if abs(positions[furthest] - positions[first]) < h * 0.3:
            return 0
        row_diff = np.abs(a - b).mean(axis=1)
        rows = 0
        while rows < h // 3 and row_diff[rows] < 3.0:
            rows += 1
        return rows if rows >= h * 0.04 else 0
