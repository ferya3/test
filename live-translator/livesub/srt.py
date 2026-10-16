"""File mode: turn a movie into a translated .srt, ahead of time.

There is no rush here, so we use the biggest Whisper model and let it see the
whole file. The result is much better than live mode; use this for anything
you have on disk.
"""

import sys
import time
from collections import deque
from pathlib import Path

RLE = "‫"  # makes Windows players lay out punctuation in RTL lines correctly


def format_timestamp(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def srt_entry(index: int, start: float, end: float, text: str) -> str:
    return f"{index}\n{format_timestamp(start)} --> {format_timestamp(end)}\n{text}\n\n"


def translate_file(
    input_path: Path,
    output_path: Path,
    transcriber,
    translator,
    rtl: bool,
    source_path: Path | None = None,
    history_size: int = 3,
) -> None:
    segments, info = transcriber.model.transcribe(
        str(input_path),
        language=transcriber.language,
        beam_size=5,
        vad_filter=True,
    )
    print(f"Language: {info.language} ({info.language_probability:.0%}), length {format_timestamp(info.duration)}")

    history: deque[tuple[str, str]] = deque(maxlen=history_size)
    started = time.monotonic()
    index = 0
    # utf-8-sig: the BOM makes older players and editors read Persian text correctly.
    out = open(output_path, "w", encoding="utf-8-sig")
    src = open(source_path, "w", encoding="utf-8-sig") if source_path else None
    try:
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            translation = translator.translate(text, list(history))
            history.append((text, translation))
            index += 1
            out.write(srt_entry(index, seg.start, seg.end, (RLE + translation) if rtl else translation))
            out.flush()
            if src:
                src.write(srt_entry(index, seg.start, seg.end, text))

            done = seg.end / info.duration if info.duration else 0
            elapsed = time.monotonic() - started
            print(f"\r[{done:6.1%}] {format_timestamp(seg.end)}  ({elapsed:.0f}s)", end="", file=sys.stderr)
    finally:
        out.close()
        if src:
            src.close()
    print(f"\nWrote {index} subtitles to {output_path}")
