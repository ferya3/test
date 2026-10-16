"""Capture what the computer is playing (WASAPI loopback) or a microphone."""

import queue
import sys
import threading

import numpy as np

from . import SAMPLE_RATE


def _init_com() -> None:
    # soundcard talks to WASAPI through COM, and COM must be initialised on the
    # thread that uses it. The capture runs on its own thread, so do it here.
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.ole32.CoInitializeEx(None, 0)  # COINIT_MULTITHREADED


def list_devices() -> None:
    import soundcard as sc

    print("Speakers (use with --speaker):")
    default = sc.default_speaker()
    for spk in sc.all_speakers():
        mark = "  * " if spk.id == default.id else "    "
        print(f"{mark}{spk.name}")
    print("\nMicrophones (use with --mic):")
    for mic in sc.all_microphones():
        print(f"    {mic.name}")


class AudioCapture:
    """Records 16 kHz mono float32 blocks into `self.blocks` on a background thread.

    By default it records the default speaker's loopback, i.e. whatever is
    playing: YouTube, a video player, a call. Pass `mic` to record a microphone.
    """

    def __init__(self, speaker: str | None = None, mic: str | None = None, block_seconds: float = 0.1):
        self.speaker = speaker
        self.mic = mic
        self.block_frames = int(SAMPLE_RATE * block_seconds)
        # None marks the end of the stream (capture stopped or failed).
        self.blocks: queue.Queue[np.ndarray | None] = queue.Queue()
        self.error: Exception | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="audio-capture", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _open_recorder(self):
        import soundcard as sc

        if self.mic:
            device = sc.get_microphone(self.mic)
        else:
            spk = sc.get_speaker(self.speaker) if self.speaker else sc.default_speaker()
            device = sc.get_microphone(id=str(spk.name), include_loopback=True)
        return device.recorder(samplerate=SAMPLE_RATE, blocksize=self.block_frames)

    def _run(self) -> None:
        try:
            _init_com()
            with self._open_recorder() as rec:
                while not self._stop.is_set():
                    data = rec.record(numframes=self.block_frames)
                    mono = data.mean(axis=1) if data.ndim == 2 else data
                    self.blocks.put(mono.astype(np.float32, copy=False))
        except Exception as exc:  # surfaced to the user by the pipeline
            self.error = exc
            self.blocks.put(None)
