import numpy as np

from livesub.segmenter import SpeechSegmenter

SR = 16000


def energy_vad(audio):
    """Stand-in for Silero: any 32 ms window with signal counts as speech."""
    win = 512
    spans, start = [], None
    for i in range(0, len(audio), win):
        loud = np.abs(audio[i : i + win]).max(initial=0) > 0.1
        if loud and start is None:
            start = i
        elif not loud and start is not None:
            spans.append((start, i))
            start = None
    if start is not None:
        spans.append((start, len(audio)))
    return spans


def speech(seconds):
    return np.full(int(seconds * SR), 0.5, dtype=np.float32)


def silence(seconds):
    return np.zeros(int(seconds * SR), dtype=np.float32)


def stream(seg, audio, block=0.1):
    out = []
    step = int(block * SR)
    for i in range(0, len(audio), step):
        out += seg.feed(audio[i : i + step])
    return out


def test_cuts_at_pauses_between_phrases():
    seg = SpeechSegmenter(energy_vad)
    audio = np.concatenate([silence(1), speech(2), silence(1), speech(1.5), silence(1)])
    chunks = stream(seg, audio)
    assert [round(len(c) / SR, 1) for c in chunks] == [2.0, 1.5]


def test_waits_while_speech_continues():
    seg = SpeechSegmenter(energy_vad)
    assert stream(seg, np.concatenate([silence(0.5), speech(3)])) == []


def test_long_speech_is_cut_at_the_latest_gap():
    seg = SpeechSegmenter(energy_vad, max_chunk=8)
    # 10 s of talking with only short 0.2 s breaths, never a real pause.
    audio = np.concatenate([np.concatenate([speech(1.8), silence(0.2)]) for _ in range(5)])
    chunks = stream(seg, audio)
    assert chunks, "should not wait forever for a pause"
    assert all(len(c) <= 8 * SR for c in chunks)
    # Cut inside a breath, not in the middle of a word.
    first = chunks[0]
    assert np.abs(first[-100:]).max() == 0


def test_unbroken_speech_is_hard_cut_at_max_chunk():
    seg = SpeechSegmenter(energy_vad, max_chunk=4)
    chunks = stream(seg, speech(9))
    assert len(chunks) == 2
    assert all(len(c) <= 4.25 * SR for c in chunks)


def test_short_noises_are_dropped():
    seg = SpeechSegmenter(energy_vad, min_speech=0.3)
    audio = np.concatenate([silence(1), speech(0.1), silence(1), speech(1), silence(1)])
    chunks = stream(seg, audio)
    assert [round(len(c) / SR, 1) for c in chunks] == [1.0]


def test_silence_does_not_grow_the_buffer():
    seg = SpeechSegmenter(energy_vad)
    stream(seg, silence(60))
    assert len(seg.buffer) < SR


def test_flush_returns_unfinished_speech():
    seg = SpeechSegmenter(energy_vad)
    stream(seg, np.concatenate([silence(0.5), speech(2)]))
    assert [round(len(c) / SR, 1) for c in seg.flush()] == [2.0]
    assert seg.flush() == []
