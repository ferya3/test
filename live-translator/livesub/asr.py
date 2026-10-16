"""Speech to text with faster-whisper."""

import numpy as np

# Whisper invents these on silence or music; drop them when they are the whole line.
_PHANTOM_LINES = {
    "thank you.",
    "thank you",
    "thanks for watching!",
    "thanks for watching.",
    "thank you for watching.",
    "thank you for watching!",
    "you",
    ".",
    "...",
}


class Transcriber:
    def __init__(
        self,
        model: str = "large-v3-turbo",
        device: str = "cuda",
        compute_type: str = "int8_float16",
        language: str | None = None,
    ):
        from .cuda_dlls import register_cuda_dlls

        register_cuda_dlls()
        from faster_whisper import WhisperModel

        if device == "cpu" and compute_type.endswith("float16"):
            compute_type = "int8"
        self.model = WhisperModel(model, device=device, compute_type=compute_type)
        self.language = language

    def transcribe(self, audio: np.ndarray, prompt: str | None = None) -> str:
        """Transcribe one utterance. `prompt` (the previous line) helps with names and spelling."""
        segments, _ = self.model.transcribe(
            audio,
            language=self.language,
            beam_size=5,
            initial_prompt=prompt,
            condition_on_previous_text=False,
            without_timestamps=True,
            vad_filter=False,  # the segmenter already did this
        )
        parts = [s.text.strip() for s in segments if not is_hallucination(s)]
        text = " ".join(p for p in parts if p)
        return "" if text.lower() in _PHANTOM_LINES else text


def is_hallucination(segment) -> bool:
    # Whisper's own heuristics: probably no speech, and not confident about the text.
    if segment.no_speech_prob > 0.6 and segment.avg_logprob < -1.0:
        return True
    # Highly repetitive output ("la la la la ...") compresses too well.
    return segment.compression_ratio > 2.4
