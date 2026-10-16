"""Cut a live audio stream into utterances at the pauses between sentences.

Whisper is far more accurate on a whole phrase than on fixed 2-second slices
that split words in half, so we wait for a pause (found by Silero VAD) before
sending audio on. A cap on the chunk length keeps latency bounded when the
speaker never pauses.
"""

from collections.abc import Callable

import numpy as np

from . import SAMPLE_RATE

# (start, end) sample offsets of the speech regions in an audio buffer.
Spans = list[tuple[int, int]]
VadFn = Callable[[np.ndarray], Spans]


def silero_vad(threshold: float = 0.5) -> VadFn:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    options = VadOptions(threshold=threshold, min_silence_duration_ms=250, speech_pad_ms=100)

    def detect(audio: np.ndarray) -> Spans:
        return [(s["start"], s["end"]) for s in get_speech_timestamps(audio, options)]

    return detect


class SpeechSegmenter:
    def __init__(
        self,
        vad: VadFn,
        min_silence: float = 0.5,
        max_chunk: float = 8.0,
        min_speech: float = 0.3,
        check_every: float = 0.25,
        sample_rate: int = SAMPLE_RATE,
    ):
        self.vad = vad
        self.sr = sample_rate
        self.min_silence = int(min_silence * sample_rate)
        self.max_chunk = int(max_chunk * sample_rate)
        self.min_speech = int(min_speech * sample_rate)
        self.check_every = int(check_every * sample_rate)
        self.keep_tail = int(0.3 * sample_rate)
        self.buffer = np.zeros(0, dtype=np.float32)
        self._unchecked = 0

    def feed(self, block: np.ndarray) -> list[np.ndarray]:
        """Add audio; return the utterances that are now complete."""
        self.buffer = np.concatenate([self.buffer, block])
        self._unchecked += len(block)
        if self._unchecked < self.check_every:
            return []
        self._unchecked = 0

        out = []
        while (chunk := self._cut()) is not None:
            if len(chunk):
                out.append(chunk)
        return out

    def flush(self) -> list[np.ndarray]:
        """Return whatever speech is left in the buffer (call when stopping)."""
        spans = self.vad(self.buffer) if len(self.buffer) else []
        chunk, self.buffer = self.buffer, np.zeros(0, dtype=np.float32)
        return [chunk] if self._speech_len(spans) >= self.min_speech else []

    def _speech_len(self, spans: Spans) -> int:
        return sum(end - start for start, end in spans)

    def _cut(self) -> np.ndarray | None:
        """Split one utterance off the front of the buffer, or return None to wait.

        An empty array means "dropped a non-speech piece, look again".
        """
        spans = self.vad(self.buffer)
        if not spans:
            # Silence or music: keep only a short tail, in case speech is starting.
            self.buffer = self.buffer[-self.keep_tail :]
            return None

        # Drop the silence in front of the first word.
        lead = spans[0][0]
        if lead > 0:
            self.buffer = self.buffer[lead:]
            spans = [(s - lead, e - lead) for s, e in spans]

        last_end = spans[-1][1]
        if len(self.buffer) - last_end >= self.min_silence:
            cut = last_end
        elif len(self.buffer) >= self.max_chunk:
            # No pause long enough yet: cut in the middle of the latest gap
            # between words, or hard-cut if the speech is one unbroken run.
            if len(spans) > 1:
                cut = (spans[-2][1] + spans[-1][0]) // 2
            else:
                cut = len(self.buffer)
            spans = [(s, min(e, cut)) for s, e in spans if s < cut]
        else:
            return None
        if cut <= 0:
            return None

        chunk, self.buffer = self.buffer[:cut], self.buffer[cut:]
        if self._speech_len(spans) < self.min_speech:
            return np.zeros(0, dtype=np.float32)  # a click or a cough, not speech
        return chunk
