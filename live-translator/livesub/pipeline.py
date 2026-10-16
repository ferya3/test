"""Live mode: capture -> segment -> transcribe -> translate, each stage on its own thread.

Transcription and translation run in parallel, so a slow LLM never makes us
drop audio. If translation falls behind, the lines waiting for it are merged
and translated together, so the subtitles catch up instead of lagging further.
"""

import queue
import threading
import traceback
from collections import deque
from collections.abc import Callable


class LivePipeline:
    def __init__(
        self,
        capture,
        make_segmenter: Callable,
        make_transcriber: Callable,
        translator,
        on_source: Callable[[str], None],
        on_translation: Callable[[str, str], None],
        on_status: Callable[[str], None],
        history_size: int = 3,
    ):
        self.capture = capture
        self.make_segmenter = make_segmenter
        self.make_transcriber = make_transcriber
        self.translator = translator
        self.on_source = on_source
        self.on_translation = on_translation
        self.on_status = on_status
        self.history: deque[tuple[str, str]] = deque(maxlen=history_size)
        self.lines: queue.Queue[str | None] = queue.Queue()

    def start(self) -> None:
        threading.Thread(target=self._guard(self._listen), name="asr", daemon=True).start()
        threading.Thread(target=self._guard(self._translate), name="translate", daemon=True).start()

    def stop(self) -> None:
        self.capture.stop()

    def _guard(self, fn):
        def run():
            try:
                fn()
            except Exception as exc:
                traceback.print_exc()
                self.on_status(f"Error: {exc}")

        return run

    def _listen(self) -> None:
        self.on_status("Loading speech model...")
        transcriber = self.make_transcriber()
        segmenter = self.make_segmenter()
        self.capture.start()
        self.on_status("Listening...")

        prompt = None
        while True:
            block = self.capture.blocks.get()
            if block is None:
                utterances = segmenter.flush()
            else:
                utterances = segmenter.feed(block)
            for audio in utterances:
                text = transcriber.transcribe(audio, prompt=prompt)
                if text:
                    prompt = text
                    self.on_source(text)
                    self.lines.put(text)
            if block is None:
                self.lines.put(None)
                if self.capture.error:
                    raise RuntimeError(f"audio capture failed: {self.capture.error}")
                return

    def _translate(self) -> None:
        done = False
        while not done:
            batch = [self.lines.get()]
            # Take everything else already waiting, so we catch up in one call.
            while True:
                try:
                    batch.append(self.lines.get_nowait())
                except queue.Empty:
                    break
            if None in batch:
                done = True
                batch = [line for line in batch if line is not None]
            if not batch:
                continue

            text = " ".join(batch)
            try:
                translation = self.translator.translate(text, list(self.history))
            except Exception as exc:
                self.on_status(f"Translation error: {exc}")
                continue
            self.history.append((text, translation))
            self.on_translation(text, translation)
