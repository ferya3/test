#!/usr/bin/env python3
"""Pick the Nth candle after a session open and analyse what price did afterwards.

Two ways to feed it data:

  1. A CSV exported from MetaTrader 5 or TradingView (recommended -- it is the
     exact data your chart shows, including your broker's clock):

       tools/candle-n.py --csv XAUUSD_M1.csv --session newyork --tz Etc/GMT-3

  2. Yahoo Finance, for a quick look without an export (1m history is limited
     to the last ~7 days):

       tools/candle-n.py --fetch XAUUSD=X --tf 1 --session newyork

The candle is counted 1-based from the first candle at or after the session
open, so --n 11 is the eleventh candle of the session.
"""

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, time, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python < 3.9
    ZoneInfo = None

# Local opening time of each session, in that session's own timezone.
SESSIONS = {
    "asia": (time(9, 0), "Asia/Tokyo"),
    "london": (time(8, 0), "Europe/London"),
    "newyork": (time(9, 30), "America/New_York"),
    "day": (time(0, 0), "UTC"),
}


class Candle:
    __slots__ = ("t", "o", "h", "l", "c", "v")

    def __init__(self, t, o, h, l, c, v=None):
        self.t, self.o, self.h, self.l, self.c, self.v = t, o, h, l, c, v

    @property
    def range(self):
        return self.h - self.l

    @property
    def body(self):
        return abs(self.c - self.o)

    @property
    def upper_wick(self):
        return self.h - max(self.o, self.c)

    @property
    def lower_wick(self):
        return min(self.o, self.c) - self.l

    @property
    def direction(self):
        if self.c > self.o:
            return "bullish"
        if self.c < self.o:
            return "bearish"
        return "doji"


# --------------------------------------------------------------------------- input

def parse_csv(path):
    """Read an MT5 or TradingView export. Both dialects, both column layouts."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        text = fh.read()

    sample = text[:4096]
    delim = "\t" if sample.count("\t") > sample.count(",") else ","
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    if not rows:
        raise SystemExit(f"{path}: empty file")

    header = [re.sub(r"[<>\s]", "", cell).lower() for cell in rows[0]]
    if not any(k in header for k in ("open", "o")):
        raise SystemExit(f"{path}: no header row with open/high/low/close columns")

    def column(*names):
        for name in names:
            if name in header:
                return header.index(name)
        return None

    i_date = column("date")
    i_time = column("time")
    i_dt = column("datetime", "timestamp")
    i_o, i_h, i_l, i_c = (column("open", "o"), column("high", "h"),
                          column("low", "l"), column("close", "c"))
    i_v = column("volume", "vol", "tickvol")
    if None in (i_o, i_h, i_l, i_c):
        raise SystemExit(f"{path}: missing one of open/high/low/close")

    # TradingView writes a single ISO 'time' column; MT5 writes date + time.
    if i_dt is None and i_date is None and i_time is not None:
        i_dt, i_time = i_time, None

    candles = []
    for row in rows[1:]:
        if not row or len(row) <= max(i for i in (i_o, i_h, i_l, i_c) if i is not None):
            continue
        try:
            if i_dt is not None:
                stamp = parse_datetime(row[i_dt])
            else:
                stamp = parse_datetime(row[i_date] + " " + (row[i_time] if i_time is not None else "00:00"))
            candles.append(Candle(stamp, float(row[i_o]), float(row[i_h]),
                                  float(row[i_l]), float(row[i_c]),
                                  float(row[i_v]) if i_v is not None and row[i_v] else None))
        except (ValueError, IndexError):
            continue  # blank lines, footers, '<n/a>' cells

    if not candles:
        raise SystemExit(f"{path}: no candle rows could be parsed")
    candles.sort(key=lambda c: c.t)
    return candles


def parse_datetime(raw):
    raw = raw.strip().replace("T", " ")
    if raw.endswith("Z"):
        raw = raw[:-1]
    raw = re.sub(r"[+-]\d{2}:?\d{2}$", "", raw).strip()
    if raw.isdigit():  # epoch seconds
        return datetime.fromtimestamp(int(raw), timezone.utc).replace(tzinfo=None)
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M",
                "%d.%m.%Y %H:%M", "%Y.%m.%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    raise ValueError(f"unrecognised timestamp: {raw!r}")


def fetch_yahoo(symbol, tf_minutes, days):
    interval = {1: "1m", 2: "2m", 5: "5m", 15: "15m", 30: "30m", 60: "60m", 90: "90m"}.get(tf_minutes)
    if interval is None:
        raise SystemExit(f"Yahoo has no {tf_minutes}m interval; export a CSV instead")
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
           f"?range={days}d&interval={interval}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
        raise SystemExit(f"could not reach Yahoo Finance ({err}); "
                         f"export a CSV from your platform and use --csv instead")

    result = (payload.get("chart") or {}).get("result")
    if not result:
        raise SystemExit(f"Yahoo returned no data for {symbol}: "
                         f"{(payload.get('chart') or {}).get('error')}")
    result = result[0]
    quote = result["indicators"]["quote"][0]
    candles = []
    for i, stamp in enumerate(result["timestamp"]):
        o, h, l, c = quote["open"][i], quote["high"][i], quote["low"][i], quote["close"][i]
        if None in (o, h, l, c):
            continue
        candles.append(Candle(datetime.fromtimestamp(stamp, timezone.utc).replace(tzinfo=None),
                              o, h, l, c, (quote.get("volume") or [None])[i]))
    if not candles:
        raise SystemExit(f"Yahoo returned no usable candles for {symbol}")
    return candles


# --------------------------------------------------------------------- session open

def session_open_in_data_tz(session, data_tz, day):
    """The session's opening bell, expressed on the data's own clock."""
    local_time, session_tz = SESSIONS[session]
    if session == "day":
        return datetime.combine(day, local_time)  # midnight on the chart's own clock
    if ZoneInfo is None:
        raise SystemExit("zoneinfo is unavailable; pass --open explicitly")
    aware = datetime.combine(day, local_time, tzinfo=ZoneInfo(session_tz))
    return aware.astimezone(ZoneInfo(data_tz)).replace(tzinfo=None)


def first_at_or_after(candles, when):
    return next((i for i, c in enumerate(candles) if c.t >= when), None)


def locate_session(candles, args):
    """Return (opening timestamp, index of the session's first candle).

    A session only counts if the data actually starts within a candle or two of
    the opening bell -- otherwise we would silently count from whatever candle
    happens to come first in the file.
    """
    span = f"{candles[0].t:%Y-%m-%d %H:%M} to {candles[-1].t:%Y-%m-%d %H:%M}"
    if args.open:
        start = parse_datetime(args.open)
        index = first_at_or_after(candles, start)
        if index is None:
            raise SystemExit(f"no candles at or after {start:%Y-%m-%d %H:%M} "
                             f"(data covers {span})")
        return start, index

    tolerance = timedelta(minutes=max(args.tf * 2, 5))
    if args.date:
        days = [parse_datetime(args.date).date()]
    else:
        days = sorted({c.t.date() for c in candles}, reverse=True)

    for day in days:
        start = session_open_in_data_tz(args.session, args.tz, day)
        index = first_at_or_after(candles, start)
        if index is not None and candles[index].t - start <= tolerance:
            return start, index

    raise SystemExit(f"no {args.session} open found in the data (covers {span}, "
                     f"timestamps read as {args.tz}). Check --tz, or set the "
                     f"opening candle yourself with --open.")


# ------------------------------------------------------------------------ analysis

def analyse(candles, index, digits, label):
    target = candles[index]
    after = candles[index + 1:]
    fmt = lambda x: f"{x:.{digits}f}"
    out = []
    w = out.append

    w(f"Candle #{label} of the session   {target.t:%Y-%m-%d %H:%M}")
    w("-" * 62)
    w(f"  open  {fmt(target.o)}      high  {fmt(target.h)}")
    w(f"  close {fmt(target.c)}      low   {fmt(target.l)}")
    w(f"  range {fmt(target.range)}   body {fmt(target.body)} "
      f"({target.body / target.range * 100:.0f}% of range)" if target.range else "  range 0")
    w(f"  wicks  upper {fmt(target.upper_wick)}   lower {fmt(target.lower_wick)}")
    w(f"  direction: {target.direction}")
    w("")

    if not after:
        w("No candles after this one -- nothing to analyse yet.")
        return "\n".join(out)

    high, low, mid = target.h, target.l, (target.h + target.l) / 2

    broke, broke_at = None, None
    for c in after:
        up, down = c.h > high, c.l < low
        if up and down:
            broke, broke_at = "both (same candle)", c
            break
        if up:
            broke, broke_at = "up", c
            break
        if down:
            broke, broke_at = "down", c
            break

    above = sum(1 for c in after if c.c > high)
    below = sum(1 for c in after if c.c < low)
    inside = len(after) - above - below
    peak = max(c.h for c in after)
    trough = min(c.l for c in after)
    last = after[-1]

    if last.c > high:
        where = f"above the high, by {fmt(last.c - high)}"
    elif last.c < low:
        where = f"below the low, by {fmt(low - last.c)}"
    else:
        pos = (last.c - low) / (high - low) * 100 if high > low else 50
        where = f"inside the range, {pos:.0f}% up from the low"

    w(f"What happened over the next {len(after)} candles")
    w("-" * 62)
    if broke_at is None:
        w(f"  range never broken -- price stayed between {fmt(low)} and {fmt(high)}")
    else:
        w(f"  first break: {broke} at {broke_at.t:%H:%M} "
          f"({(broke_at.t - target.t).total_seconds() / 60:.0f} min later)")
    w(f"  closes above high: {above}   below low: {below}   inside: {inside}")
    w(f"  highest high {fmt(peak)} (+{fmt(peak - high)} over the high)")
    w(f"  lowest low   {fmt(trough)} (-{fmt(low - trough)} under the low)")
    w(f"  last close   {fmt(last.c)} at {last.t:%H:%M} -- {where}")
    w("")

    up_room, down_room = peak - high, low - trough
    if last.c > high and up_room >= down_room:
        verdict = ("Bullish. Price broke the candle's high and is holding above it -- "
                   "the candle's high is acting as support.")
    elif last.c < low and down_room >= up_room:
        verdict = ("Bearish. Price broke the candle's low and is holding below it -- "
                   "the candle's low is acting as resistance.")
    elif above and below:
        verdict = ("Choppy. Price closed on both sides of the candle's range; "
                   "the level is not being respected in either direction.")
    elif last.c > high or last.c < low:
        verdict = ("Mixed. The break went one way but the bigger excursion went the "
                   "other -- treat the move as unconfirmed.")
    else:
        verdict = (f"Range-bound. {len(after)} candles later price is still inside "
                   f"{fmt(low)}-{fmt(high)}; that band is the decision zone.")

    w("Read")
    w("-" * 62)
    for line in wrap(verdict, 62):
        w(f"  {line}")
    w("")
    w(f"  levels to watch:  high {fmt(high)}   mid {fmt(mid)}   low {fmt(low)}")
    return "\n".join(out)


def wrap(text, width):
    words, line, lines = text.split(), "", []
    for word in words:
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        lines.append(line)
    return lines


def context_table(candles, index, digits, span=5):
    lo, hi = max(0, index - span), min(len(candles), index + span + 1)
    lines = ["", f"Context ({span} candles either side)", "-" * 62,
             "        time      open      high       low     close"]
    for i in range(lo, hi):
        c = candles[i]
        mark = ">>" if i == index else "  "
        lines.append(f"{mark} {c.t:%H:%M}  {c.o:9.{digits}f} {c.h:9.{digits}f} "
                     f"{c.l:9.{digits}f} {c.c:9.{digits}f}")
    return "\n".join(lines)


def infer_digits(candles):
    seen = 0
    for c in candles[:200]:
        for value in (c.o, c.h, c.l, c.c):
            text = f"{value!r}"
            if "." in text:
                seen = max(seen, len(text.split(".")[1].rstrip("0")))
    return min(max(seen, 2), 5)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="MT5 or TradingView CSV export")
    src.add_argument("--fetch", metavar="SYMBOL",
                     help="Yahoo Finance symbol, e.g. XAUUSD=X or GC=F")
    p.add_argument("--tf", type=int, default=1, help="timeframe in minutes (default 1)")
    p.add_argument("--days", type=int, default=5, help="days of history to fetch (default 5)")
    p.add_argument("--n", type=int, default=11, help="which candle of the session (default 11)")
    p.add_argument("--session", choices=sorted(SESSIONS), default="newyork",
                   help="session whose open starts the count (default newyork)")
    p.add_argument("--tz", default="UTC",
                   help="timezone of the timestamps in the data; for an MT5 export "
                        "this is your broker's server time, e.g. Etc/GMT-3 for UTC+3")
    p.add_argument("--date", help="session date, YYYY-MM-DD (default: last day in the data)")
    p.add_argument("--open", metavar="'YYYY-MM-DD HH:MM'",
                   help="exact opening timestamp, overriding --session/--tz/--date")
    p.add_argument("--after", type=int, metavar="K",
                   help="only analyse the K candles following the target")
    args = p.parse_args()

    if args.n < 1:
        raise SystemExit("--n must be 1 or greater")

    candles = parse_csv(args.csv) if args.csv else fetch_yahoo(args.fetch, args.tf, args.days)
    digits = infer_digits(candles)
    start, session_index = locate_session(candles, args)

    index = session_index + args.n - 1
    if index >= len(candles):
        raise SystemExit(f"the data only holds {len(candles) - session_index} candles "
                         f"after the open; cannot reach #{args.n}")

    first = candles[session_index]
    print(f"session open used: {start:%Y-%m-%d %H:%M} "
          f"(first candle {first.t:%H:%M}, timestamps in {args.tz})\n")

    window = candles[:index + 1 + args.after] if args.after else candles
    print(analyse(window, index, digits, args.n))
    print(context_table(candles, index, digits))


if __name__ == "__main__":
    main()
