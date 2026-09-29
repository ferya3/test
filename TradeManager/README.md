# TradeManager (MT5 / MQL5)

A position manager. The automation never opens trades and there is no strategy, indicator, news or signal code.
It takes trades that already exist and manages them: initial SL, break-even, trailing, partial
closes, account-level protection, and recovery after a restart.

## Install

Copy this folder to `MQL5/Experts/TradeManager/` and compile `TradeManager.mq5` in MetaEditor.
Includes are relative (`../Broker/...`), so keep the folder structure intact.

## Layers

```
Broker      only place that touches MT5: symbol rules, ticks, account, CTrade
Position    scanner -> registry -> synchronizer; per-position state
Protection  StopLoss / BreakEven / Trailing / PartialClose: produce requests, never send them
Risk        calculator, drawdown, engine (measures) and guard (allows / blocks)
Execution   validate -> CTrade -> classify error -> retry or cool down
Persistence global variables per account + recovery against the live position
Core        Engine (wiring), EventDispatcher (routing), StateManager, Lifecycle, Config (inputs)
```

Pipeline per pass: `registry -> ProtectionEngine -> RiskGuard -> ExecutionEngine -> StateManager`.

| Event | Does |
|---|---|
| `OnTick` | break-even, trailing, partials, retries (throttled by `InpMinProcessMs`) |
| `OnTimer` | resync with account, refresh risk, cover symbols that are not ticking, purge stale state |
| `OnTradeTransaction` | resync on deal/position changes, refresh daily P/L |

## Rules worth knowing

- **R** is the distance between entry and the *initial* SL. Break-even and partial levels are in R.
  A position with no SL has no R until it gets one (`InpDefaultSLPoints`, or set it by hand).
- Break-even, partial and trailing are independent flags; several can be active at once.
- One request per position per pass: partial > initial SL > best of break-even / trailing.
  When both break-even and trailing fire, the tighter stop wins and both flags are set.
- Partial volumes are a percentage of the *initial* volume, floored to the volume step. A share
  smaller than one minimum lot is skipped; a remainder smaller than the minimum lot is closed.
- The guard only lets a stop move towards safety. It will not widen or remove one.
- Every SL is checked against stop level and freeze level before it is sent, and prices are
  normalized to the tick size.
- Retry policy: invalid stops / volume / no money -> no retry (cool-down); requote, timeout,
  connection, too many requests -> retry shortly; market closed / frozen -> retry later;
  position not found -> resynchronize.
- Recovery: state stored in terminal global variables (`TM_<login>_<ticket>_*`) is accepted only
  if the open time and volume still match the live position; break-even is also re-inferred from
  a stop already beyond the entry. Stored state for closed tickets is purged.
- Drawdown uses a persisted equity high-water mark. Delete `TM_<login>_PEAK` to reset it.
- Protection trips (daily loss, drawdown, equity, margin level) raise an alert and, if
  `InpCloseAllOnTrip` is set, close all managed positions once on the transition.

## Manual order entry (panel)

The panel has LOT / PRICE / SL / TP fields and BUY, SELL, BUY LIMIT, BUY STOP, SELL LIMIT and
SELL STOP buttons for the chart symbol. There is no confirmation: one click sends the order.
Blank SL/TP means none; PRICE is only used by pending orders. Orders are checked against lot
rules, stop distance and side-of-market, refused while a protection is active, and never
retried. `InpMaxOrderLot` caps the lot. New positions are then managed like any other
(e.g. `InpDefaultSLPoints` gives them an SL). Pending orders are not listed or managed.

## Extending trailing

The core only knows `CTrailingDistance::Distance()`. Fixed and percentage-of-profit are built in;
for ATR, derive from `CTrailingDistance` and pass it to `CTrailingManager::SetProvider()`.

## Status

Written without access to a MetaEditor compiler, so it has not been compiled or run against a
demo account. Compile it, then test on a demo account before using it live.
