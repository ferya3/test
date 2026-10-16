"""Command line entry point: python -m livesub {live,file,devices} ..."""

import argparse
import sys
from pathlib import Path

from .translate import RTL_LANGUAGES


def common_args() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(add_help=False)
    g = p.add_argument_group("speech recognition")
    g.add_argument("--lang", default=None, help="spoken language, e.g. en (default: detect automatically)")
    g.add_argument("--device", default="cuda", choices=["cuda", "cpu"], help="where Whisper runs (default: cuda)")
    g.add_argument(
        "--compute-type",
        default="int8_float16",
        help="int8_float16 (less VRAM, default), float16 (a bit more accurate), int8 (CPU)",
    )
    t = p.add_argument_group("translation")
    t.add_argument("--target", default="fa", help="language to translate into (default: fa)")
    t.add_argument(
        "--translator",
        default="ollama",
        choices=["ollama", "google"],
        help="ollama: local LLM, offline, best quality (default). google: free web API, no setup",
    )
    t.add_argument("--ollama-model", default="aya-expanse:8b", help="Ollama model (default: aya-expanse:8b)")
    t.add_argument("--ollama-host", default="http://localhost:11434")
    return p


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="livesub", description="Live and offline subtitle translation.")
    sub = parser.add_subparsers(dest="command", required=True)
    shared = common_args()

    live = sub.add_parser("live", parents=[shared], help="translate whatever the computer is playing, live")
    live.add_argument("--model", default="large-v3-turbo", help="Whisper model (default: large-v3-turbo)")
    live.add_argument("--speaker", default=None, help="record this speaker instead of the default one")
    live.add_argument("--mic", default=None, help="record this microphone instead of the speakers")
    live.add_argument("--max-chunk", type=float, default=8.0, help="longest piece of speech in seconds (default: 8)")
    live.add_argument("--font-size", type=int, default=28)
    live.add_argument("--hide-source", action="store_true", help="show only the translation")
    live.add_argument("--no-overlay", action="store_true", help="print to the terminal instead of a window")

    file = sub.add_parser("file", parents=[shared], help="make a translated .srt from a video or audio file")
    file.add_argument("input", type=Path)
    file.add_argument("-o", "--output", type=Path, help="default: <input>.<target>.srt")
    file.add_argument("--model", default="large-v3", help="Whisper model (default: large-v3)")
    file.add_argument("--keep-source", action="store_true", help="also write the original-language .srt")

    sub.add_parser("devices", help="list speakers and microphones")
    return parser


def make_translator(args):
    from .translate import make_translator

    return make_translator(args.translator, args.target, args.lang, args.ollama_model, args.ollama_host)


def make_transcriber(args):
    from .asr import Transcriber

    return Transcriber(args.model, device=args.device, compute_type=args.compute_type, language=args.lang)


def cmd_live(args) -> int:
    from .audio import AudioCapture
    from .pipeline import LivePipeline
    from .segmenter import SpeechSegmenter, silero_vad

    translator = make_translator(args)

    def build(on_source, on_translation, on_status):
        return LivePipeline(
            capture=AudioCapture(speaker=args.speaker, mic=args.mic),
            make_segmenter=lambda: SpeechSegmenter(silero_vad(), max_chunk=args.max_chunk),
            make_transcriber=lambda: make_transcriber(args),
            translator=translator,
            on_source=on_source,
            on_translation=on_translation,
            on_status=on_status,
        )

    if args.no_overlay:
        pipeline = build(
            on_source=lambda text: print(f"\n  {text}"),
            on_translation=lambda text, tr: print(f"> {tr}"),
            on_status=lambda text: print(f"[{text}]"),
        )
        pipeline.start()
        try:
            input("Press Enter to stop.\n")
        except KeyboardInterrupt:
            pass
        pipeline.stop()
        return 0

    from .overlay import run_overlay

    return run_overlay(
        lambda bridge: build(bridge.source.emit, bridge.translation.emit, bridge.status.emit),
        target=args.target,
        font_size=args.font_size,
        show_source=not args.hide_source,
    )


def cmd_file(args) -> int:
    from .srt import translate_file

    if not args.input.exists():
        print(f"File not found: {args.input}", file=sys.stderr)
        return 1
    output = args.output or args.input.with_suffix(f".{args.target}.srt")
    source = output.with_name(args.input.stem + ".source.srt") if args.keep_source else None
    translator = make_translator(args)
    print(f"Loading Whisper {args.model}...")
    translate_file(
        args.input,
        output,
        make_transcriber(args),
        translator,
        rtl=args.target in RTL_LANGUAGES,
        source_path=source,
    )
    return 0


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "devices":
        from .audio import list_devices

        list_devices()
        return 0
    if args.command == "live":
        return cmd_live(args)
    return cmd_file(args)


if __name__ == "__main__":
    sys.exit(main())
