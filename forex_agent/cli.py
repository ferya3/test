"""Command line entry point.

    python -m forex_agent run           # one pass, instant alerts only
    python -m forex_agent digest        # one pass, send a summary
    python -m forex_agent loop          # poll forever on the configured interval
    python -m forex_agent check         # verify config and connectivity
    python -m forex_agent seed FILE     # load historical reactions
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from datetime import datetime, timezone

from .config import Config
from .pipeline import Pipeline

log = logging.getLogger("forex_agent")

_stop = False


def _handle_signal(signum: int, _frame: object) -> None:
    global _stop
    _stop = True
    log.info("received signal %s, finishing current run then exiting", signum)


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


# ----------------------------------------------------------------------
def cmd_run(config: Config, args: argparse.Namespace) -> int:
    pipeline = Pipeline(config)
    try:
        result = pipeline.run_once(deliver=not args.no_send, digest=False)
        _report(result)
        return 0
    finally:
        pipeline.close()


def cmd_digest(config: Config, args: argparse.Namespace) -> int:
    pipeline = Pipeline(config)
    try:
        result = pipeline.run_digest(deliver=not args.no_send)
        _report(result)
        return 0
    finally:
        pipeline.close()


def cmd_loop(config: Config, args: argparse.Namespace) -> int:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    interval = max(60, config.poll_interval_minutes * 60)
    digest_hours = {int(h) for h in args.digest_at.split(",") if h.strip().isdigit()}
    sent_digest_for: int | None = None

    pipeline = Pipeline(config)
    log.info(
        "loop: polling every %d min; digests at UTC hours %s",
        interval // 60, sorted(digest_hours) or "none",
    )

    try:
        while not _stop:
            hour = datetime.now(timezone.utc).hour
            want_digest = hour in digest_hours and sent_digest_for != hour

            try:
                result = pipeline.run_once(deliver=not args.no_send, digest=want_digest)
                _report(result)
                if want_digest:
                    sent_digest_for = hour
            except Exception:
                log.exception("loop: run failed, continuing")

            # Sleep in slices so a signal is honoured promptly.
            for _ in range(interval):
                if _stop:
                    break
                time.sleep(1)
        return 0
    finally:
        pipeline.close()


def cmd_check(config: Config, args: argparse.Namespace) -> int:
    problems = config.validate()
    print("Configuration")
    print(f"  model:            {config.model}")
    print(f"  db:               {config.db_path}")
    print(f"  dashboard:        {config.dashboard_path}")
    print(f"  poll interval:    {config.poll_interval_minutes} min")
    print(f"  lookback:         {config.lookback_minutes} min")
    print(f"  tracked assets:   {', '.join(config.tracked_assets)}")
    print(f"  dry run:          {config.dry_run}")
    print(f"  anthropic key:    {'set' if config.anthropic_api_key else 'MISSING'}")
    print(f"  telegram token:   {'set' if config.telegram_bot_token else 'MISSING'}")
    print(f"  telegram chat id: {'set' if config.telegram_chat_id else 'MISSING'}")

    for problem in problems:
        print(f"  ! {problem}")

    print("\nConnectivity")
    pipeline = Pipeline(config)
    try:
        raw = pipeline.ingestion.collect()
        print(f"  ingestion:  {len(raw)} items from {len({i.source for i in raw})} sources")

        market = pipeline.market.snapshot()
        for asset, quote in market.items():
            if quote.is_live:
                print(
                    f"  {asset:<8} {quote.price:>10.3f}  "
                    f"vol {quote.realized_vol_pct or 0:.2f}%  regime {quote.regime}"
                )
            else:
                print(f"  {asset:<8} unavailable")

        if not args.no_send and pipeline.telegram.enabled:
            ok = pipeline.telegram.send_text("✅ اتصال ایجنت اخبار فارکس برقرار است.")
            print(f"  telegram:   {'delivered' if ok else 'FAILED'}")
    finally:
        pipeline.close()

    return 1 if problems else 0


def cmd_seed(config: Config, args: argparse.Namespace) -> int:
    pipeline = Pipeline(config)
    try:
        count = pipeline.historical.seed_from_json(args.path)
        print(f"seeded {count} historical observations")
        return 0
    finally:
        pipeline.close()


def _report(result) -> None:
    print(
        f"run {result.started_at:%Y-%m-%d %H:%M} UTC | "
        f"{result.counts} | delivered={result.delivered} | "
        f"{result.duration_s:.1f}s"
    )
    for alert in result.instant_alerts:
        log.debug("instant alert:\n%s", alert.text)


# ----------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="forex_agent", description="Forex news analysis agent"
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--env", default=".env", help="path to the env file")
    parser.add_argument(
        "--no-send", action="store_true", help="analyse but do not deliver to Telegram"
    )

    # Repeated on every subcommand so the flags work on either side of it.
    # SUPPRESS keeps an omitted flag from overwriting the value already parsed
    # at the top level, which is argparse's default behaviour for subparsers.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="store_true", default=argparse.SUPPRESS)
    common.add_argument("--env", default=argparse.SUPPRESS, help="path to the env file")
    common.add_argument(
        "--no-send",
        action="store_true",
        default=argparse.SUPPRESS,
        help="analyse but do not deliver to Telegram",
    )

    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run", parents=[common], help="single pass, instant alerts only")
    sub.add_parser("digest", parents=[common], help="single pass, deliver a summary")

    loop = sub.add_parser("loop", parents=[common], help="poll continuously")
    loop.add_argument(
        "--digest-at",
        default="6,15",
        help="comma-separated UTC hours to send a digest (default: 6,15)",
    )

    sub.add_parser("check", parents=[common], help="validate config and connectivity")

    seed = sub.add_parser("seed", parents=[common], help="load historical reactions from JSON")
    seed.add_argument("path")

    return parser


COMMANDS = {
    "run": cmd_run,
    "digest": cmd_digest,
    "loop": cmd_loop,
    "check": cmd_check,
    "seed": cmd_seed,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    setup_logging(args.verbose)
    config = Config.load(args.env)
    return COMMANDS[args.command](config, args)


if __name__ == "__main__":
    sys.exit(main())
