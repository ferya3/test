"""Build the auditory stimuli embedded in js/audio-data.js.

The app has to run from file:// (double-clicking index.html), where fetch()
cannot read neighbouring files, so the four clips are embedded as base64 WAV.

The sources in iva2/audio/ are left untouched. Each embedded clip is trimmed
the same way the in-app recorder trims a custom voice (trim() in js/audio.js):
leading silence removed so the sound starts on the stimulus onset, capped below
the 500 ms stimulus duration with a short fade. All four clips are then brought
to the same RMS loudness.

Usage (from the repository root):

    python3 iva2/tools/build_audio.py            # re-embed iva2/audio/*.wav
    python3 iva2/tools/build_audio.py --synth    # first re-synthesize with espeak-ng

--synth needs `pip install espeakng-loader` (bundles libespeak-ng + its data).
To use a human voice instead, replace iva2/audio/{fa,en}-{1,2}.wav with mono
16-bit recordings and run without --synth.
"""
import argparse
import array
import base64
import io
import math
import os
import sys
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, 'audio')
OUT_JS = os.path.join(ROOT, 'js', 'audio-data.js')

WORDS = {
    'fa': ('fa', {'1': 'یک', '2': 'دو'}),
    'en': ('en-us', {'1': 'one', '2': 'two'}),
}

MAX_MS = 480        # must stay below the 500 ms auditory stimulus duration
FADE_IN_MS = 2
FADE_OUT_MS = 20
TARGET_RMS = 0.12   # of full scale, before the shared peak limit below
PEAK_LIMIT = 0.89   # about -1 dBFS


def synthesize():
    import ctypes
    import espeakng_loader as loader

    lib = ctypes.cdll.LoadLibrary(loader.get_library_path())
    lib.espeak_Initialize.restype = ctypes.c_int
    lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    rate = lib.espeak_Initialize(2, 0, loader.get_data_path().encode(), 0)  # AUDIO_OUTPUT_SYNCHRONOUS
    if rate <= 0:
        sys.exit('espeak-ng failed to initialise')

    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    samples = []

    @callback_type
    def on_audio(wav, count, _events):
        if wav and count > 0:
            samples.extend(wav[i] for i in range(count))
        return 0

    lib.espeak_SetSynthCallback(on_audio)
    lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    lib.espeak_Synth.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int,
                                 ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]

    os.makedirs(AUDIO_DIR, exist_ok=True)
    for lang, (voice, words) in WORDS.items():
        lib.espeak_SetVoiceByName(voice.encode())
        lib.espeak_SetParameter(1, 150, 0)  # espeakRATE, words per minute
        for digit, word in words.items():
            samples.clear()
            text = word.encode('utf-8') + b'\0'
            lib.espeak_Synth(text, len(text), 0, 0, 0, 1, None, None)  # espeakCHARS_UTF8
            lib.espeak_Synchronize()
            write_wav(os.path.join(AUDIO_DIR, f'{lang}-{digit}.wav'), rate, [s / 32768 for s in samples])


def read_wav(path):
    with wave.open(path, 'rb') as w:
        if w.getsampwidth() != 2:
            sys.exit(f'{path}: expected 16-bit PCM')
        rate, channels = w.getframerate(), w.getnchannels()
        frames = array.array('h', w.readframes(w.getnframes()))
    if sys.byteorder == 'big':
        frames.byteswap()
    # Down-mix to mono.
    mono = [sum(frames[i:i + channels]) / channels / 32768 for i in range(0, len(frames), channels)]
    return rate, mono


def write_wav(path, rate, samples):
    data = array.array('h', (max(-32768, min(32767, round(s * 32767))) for s in samples))
    if sys.byteorder == 'big':
        data.byteswap()
    target = path if isinstance(path, io.BytesIO) else open(path, 'wb')
    with wave.open(target, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())
    if not isinstance(path, io.BytesIO):
        target.close()


def trim(rate, samples):
    """Mirror of trim() in js/audio.js: 5 ms RMS envelope; start 5 ms before the
    first window at 10% of the loudest, end 20 ms after the last above 5%;
    capped at MAX_MS, then faded in and out."""
    size = max(1, round(rate * 0.005))
    envelope = []
    for start in range(0, len(samples), size):
        chunk = samples[start:start + size]
        envelope.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)))
    loudest = max(envelope, default=0)
    if loudest <= 0.005:
        sys.exit('silent clip')
    first = next(i for i, v in enumerate(envelope) if v >= loudest * 0.1)
    last = len(envelope) - 1
    while last > first and envelope[last] < loudest * 0.05:
        last -= 1
    start = max(0, first * size - round(rate * 0.005))
    end = min(len(samples), (last + 1) * size + round(rate * 0.02), start + round(rate * MAX_MS / 1000))
    clip = samples[start:end]
    fade_in, fade_out = round(rate * FADE_IN_MS / 1000), round(rate * FADE_OUT_MS / 1000)
    for i in range(min(fade_in, len(clip))):
        clip[i] *= i / fade_in
    for i in range(min(fade_out, len(clip))):
        clip[-1 - i] *= i / fade_out
    return clip


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--synth', action='store_true', help='re-synthesize the source WAVs with espeak-ng first')
    args = parser.parse_args()

    if args.synth:
        synthesize()

    clips = {}
    for lang in WORDS:
        for digit in ('1', '2'):
            rate, samples = read_wav(os.path.join(AUDIO_DIR, f'{lang}-{digit}.wav'))
            clips[(lang, digit)] = (rate, trim(rate, samples))

    # Equal loudness across all four clips, then one shared gain so none clips.
    gains = {}
    for key, (_, clip) in clips.items():
        rms = math.sqrt(sum(s * s for s in clip) / len(clip))
        gains[key] = TARGET_RMS / rms
    loudest = max(max(abs(s) for s in clip) * gains[key] for key, (_, clip) in clips.items())
    shared = min(1.0, PEAK_LIMIT / loudest)

    lines = []
    for (lang, digit), (rate, clip) in clips.items():
        clip = [s * gains[(lang, digit)] * shared for s in clip]
        buffer = io.BytesIO()
        write_wav(buffer, rate, clip)
        encoded = base64.b64encode(buffer.getvalue()).decode()
        lines.append(f"    '{lang}-{digit}': '{encoded}',")
        print(f'{lang}-{digit}: {len(clip) / rate * 1000:.0f} ms, {len(encoded) // 1024} KiB base64')

    with open(OUT_JS, 'w', encoding='utf-8') as out:
        out.write('/* Generated by tools/build_audio.py — do not edit by hand.\n')
        out.write('   Built-in auditory stimuli (mono 16-bit WAV, base64): spoken 1 and 2\n')
        out.write('   in Persian (یک / دو) and English (one / two), synthesized with espeak-ng. */\n')
        out.write('window.IVA_AUDIO_DATA = {\n')
        out.write('\n'.join(lines) + '\n')
        out.write('};\n')


if __name__ == '__main__':
    main()
