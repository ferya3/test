"""خط فرمان ربات.

    python -m emotrader analyze  [--personality balanced]
    python -m emotrader backtest [--personality emotional] [--save-log log.csv]
    python -m emotrader compare
منبع داده: --csv FILE  یا  --exchange binance --symbol BTC/USDT --timeframe 1d
(بدون هیچ‌کدام، از بازار مصنوعی استفاده می‌شود.)
"""

import argparse
import sys

from .analyzer import fear_greed_label
from .data import PERIODS_PER_YEAR, fetch_exchange, load_csv, synthetic_market
from .emotions import PERSONALITIES
from .trader import BacktestResult, EmotionalTrader

ACTIONS = {"BUY": "🟢 خرید", "SELL": "🔴 فروش", "HOLD": "⚪ صبر"}


def bar(value: float, width: int = 20) -> str:
    n = round(max(0.0, min(1.0, value)) * width)
    return "█" * n + "░" * (width - n)


def load_data(args):
    if args.csv:
        return load_csv(args.csv), PERIODS_PER_YEAR.get(args.timeframe, 365)
    if args.exchange:
        return fetch_exchange(args.exchange, args.symbol, args.timeframe, args.bars), \
            PERIODS_PER_YEAR.get(args.timeframe, 365)
    return synthetic_market(args.bars, args.seed), 365


def summary_line(r: BacktestResult) -> str:
    return (f"{r.personality.name:<16} بازده {r.total_return:+8.1%} | افت حداکثر {r.max_drawdown:7.1%} | "
            f"شارپ {r.sharpe:5.2f} | معاملات {len(r.trades):3d} | برد {r.win_rate:4.0%} | "
            f"فروش هیجانی {r.panic_sells:2d}")


def cmd_analyze(args, df, ppy):
    trader = EmotionalTrader(PERSONALITIES[args.personality])
    snap, result = trader.analyze_now(df, periods_per_year=ppy)
    d = result.last_decision
    s = d.state if d else None

    print(f"\n══ تحلیل بازار ({df.index[-1]}) ══")
    print(f"قیمت: {snap.price:,.4f}   روند: {snap.trend}   امتیاز تحلیل: {snap.score:+.2f}")
    for reason in snap.reasons:
        print("  •", reason)

    print(f"\nشاخص ترس و طمع بازار: {snap.fear_greed:5.1f}/100  [{bar(snap.fear_greed / 100)}]  "
          f"{fear_greed_label(snap.fear_greed)}")

    if s is None:
        print("\nداده برای تصمیم‌گیری کافی نیست.")
        return
    print(f"\n══ حال و هوای ربات «{trader.personality.name}» ══")
    print(f"ترس  {s.fear:4.0%} [{bar(s.fear)}]")
    print(f"طمع  {s.greed:4.0%} [{bar(s.greed)}]")
    print(f"حالت: {s.mood}")

    in_pos = bool(result.log["in_position"].iloc[-1])
    print(f"\n══ تصمیم: {ACTIONS[d.action]} ══  (پوزیشن باز: {'بله' if in_pos else 'خیر'})")
    for note in d.notes:
        print("  →", note)
    if d.action == "BUY":
        print(f"  ضریب حجم: ×{d.size_mult:.2f}   حد ضرر: {d.stop_atr:.1f} ATR   حد سود: {d.take_profit_atr:.1f} ATR")
    print("\n⚠️  این خروجی آموزشی است و توصیه‌ی مالی نیست.")


def cmd_backtest(args, df, ppy):
    trader = EmotionalTrader(PERSONALITIES[args.personality])
    r = trader.backtest(df, periods_per_year=ppy)
    print(f"\n══ بک‌تست ربات «{r.personality.name}» روی {len(df)} کندل ══")
    print(summary_line(r))
    print(f"خرید و نگهداری (Buy & Hold): {r.buy_and_hold:+.1%}   ضریب سود: {r.profit_factor:.2f}")

    reasons = {}
    for t in r.trades:
        reasons[t.reason] = reasons.get(t.reason, 0) + 1
    names = {"stop": "حد ضرر", "take_profit": "حد سود", "signal": "سیگنال", "panic": "وحشت"}
    print("دلایل خروج:", "، ".join(f"{names.get(k, k)}: {v}" for k, v in reasons.items()) or "—")

    moods = r.log["mood"].value_counts(normalize=True)
    print("درصد زمان در هر حالت روحی:", "، ".join(f"{m} {p:.0%}" for m, p in moods.items()))

    print("\nآخرین معاملات:")
    for t in r.trades[-args.show_trades:]:
        print(f"  {t.entry_time:%Y-%m-%d} → {t.exit_time:%Y-%m-%d}  {t.pnl_pct:+6.1%}  "
              f"خروج: {names.get(t.reason, t.reason):<7} حال هنگام ورود: {t.mood_at_entry}")
    if args.save_log:
        r.log.to_csv(args.save_log, encoding="utf-8-sig")  # BOM تا اکسل فارسی را درست نشان دهد
        print(f"\nلاگ کامل (سرمایه، ترس، طمع، ...) ذخیره شد: {args.save_log}")


def cmd_compare(args, df, ppy):
    print(f"\n══ مقایسه‌ی شخصیت‌ها روی {len(df)} کندل ══")
    results = [EmotionalTrader(p).backtest(df, periods_per_year=ppy) for p in PERSONALITIES.values()]
    for r in results:
        print(summary_line(r))
    print(f"{'خرید و نگهداری':<16} بازده {results[0].buy_and_hold:+8.1%}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="emotrader", description="ربات معامله‌گر با احساس ترس و طمع")
    ap.add_argument("command", choices=["analyze", "backtest", "compare"])
    ap.add_argument("--personality", default="balanced", choices=list(PERSONALITIES))
    ap.add_argument("--csv")
    ap.add_argument("--exchange", help="مثلاً binance (نیازمند ccxt)")
    ap.add_argument("--symbol", default="BTC/USDT")
    ap.add_argument("--timeframe", default="1d")
    ap.add_argument("--bars", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=7, help="بذر بازار مصنوعی")
    ap.add_argument("--show-trades", type=int, default=8)
    ap.add_argument("--save-log")
    args = ap.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    df, ppy = load_data(args)
    {"analyze": cmd_analyze, "backtest": cmd_backtest, "compare": cmd_compare}[args.command](args, df, ppy)


if __name__ == "__main__":
    main()
