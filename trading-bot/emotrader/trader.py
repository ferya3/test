"""ربات معامله‌گر احساسی + بک‌تستر.

تحلیل تکنیکال می‌گوید «چه» کار کنیم؛ احساسات می‌گویند «با چه جراتی»:
  * ترس   → آستانه‌ی ورود سخت‌گیرانه‌تر، حجم کمتر، حد ضرر تنگ‌تر، سیو سود زودتر،
             و در حالت وحشت، فروش هیجانی.
  * طمع   → ورود راحت‌تر (FOMO)، حجم بیشتر، حد ضرر شل‌تر، نگه داشتن طولانی‌تر.
  * انضباط (discipline) تعیین می‌کند احساسات چقدر روی تصمیم اثر بگذارند.

معاملات فقط خرید (long-only) هستند. سفارش‌ها در قیمت باز شدن کندل بعدی
اجرا می‌شوند تا ربات از آینده تقلب نکند.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .analyzer import MarketAnalyzer
from .emotions import EmotionEngine, EmotionalState, Personality


@dataclass
class RiskConfig:
    initial_capital: float = 10_000.0
    risk_per_trade: float = 0.01   # درصد سرمایه که در صورت خوردن حد ضرر از دست می‌رود
    entry_threshold: float = 0.25  # حداقل امتیاز تحلیل برای خرید
    exit_threshold: float = -0.10  # زیر این امتیاز، پوزیشن بسته می‌شود
    stop_atr: float = 2.0
    take_profit_atr: float = 4.0
    max_position: float = 1.0      # حداکثر کسری از سرمایه در یک پوزیشن (بدون اهرم)
    fee: float = 0.001
    slippage: float = 0.0005


@dataclass
class Decision:
    action: str                     # BUY / SELL / HOLD
    score: float
    threshold: float
    size_mult: float
    stop_atr: float
    take_profit_atr: float
    state: EmotionalState
    notes: list = field(default_factory=list)
    panic: bool = False


@dataclass
class Trade:
    entry_time: object
    exit_time: object
    entry_price: float
    exit_price: float
    pnl_pct: float
    reason: str
    mood_at_entry: str


@dataclass
class BacktestResult:
    personality: Personality
    log: pd.DataFrame
    trades: list
    last_decision: Decision | None
    periods_per_year: int

    @property
    def total_return(self) -> float:
        eq = self.log["equity"]
        return float(eq.iloc[-1] / eq.iloc[0] - 1)

    @property
    def buy_and_hold(self) -> float:
        c = self.log["close"]
        return float(c.iloc[-1] / c.iloc[0] - 1)

    @property
    def max_drawdown(self) -> float:
        eq = self.log["equity"]
        return float((eq / eq.cummax() - 1).min())

    @property
    def win_rate(self) -> float:
        if not self.trades:
            return 0.0
        return sum(t.pnl_pct > 0 for t in self.trades) / len(self.trades)

    @property
    def profit_factor(self) -> float:
        wins = sum(t.pnl_pct for t in self.trades if t.pnl_pct > 0)
        losses = -sum(t.pnl_pct for t in self.trades if t.pnl_pct < 0)
        return float("inf") if losses == 0 and wins > 0 else (wins / losses if losses else 0.0)

    @property
    def sharpe(self) -> float:
        r = self.log["equity"].pct_change().dropna()
        if r.std() == 0 or len(r) < 2:
            return 0.0
        return float(r.mean() / r.std() * np.sqrt(self.periods_per_year))

    @property
    def panic_sells(self) -> int:
        return sum(t.reason == "panic" for t in self.trades)


class EmotionalTrader:
    def __init__(self, personality: Personality | None = None, risk: RiskConfig | None = None,
                 analyzer: MarketAnalyzer | None = None):
        self.personality = personality or Personality()
        self.risk = risk or RiskConfig()
        self.analyzer = analyzer or MarketAnalyzer()

    # ------------------------------------------------------------------ تصمیم
    def decide(self, score: float, market_fg: float, state: EmotionalState,
               in_position: bool, position_return: float | None) -> Decision:
        r, w = self.risk, self.personality.emotional_weight
        f, g = state.fear, state.greed
        notes = []

        threshold = max(0.05, r.entry_threshold * (1 + w * (1.2 * f - 0.8 * g)))
        size_mult = float(np.clip(1 + w * (1.5 * g - 1.2 * f), 0.2, 2.5))
        stop_atr = r.stop_atr * (1 - 0.4 * w * f + 0.4 * w * g)
        tp_atr = r.take_profit_atr * (1 - 0.4 * w * f + 0.6 * w * g)
        exit_threshold = r.exit_threshold - 0.3 * w * g + 0.2 * w * f

        action, panic = "HOLD", False
        if in_position:
            if w * f > 0.55 and (position_return or 0) < 0:
                action, panic = "SELL", True
                notes.append("ترس بر عقل غلبه کرد — فروش هیجانی (panic sell)!")
            elif score < exit_threshold:
                action = "SELL"
                notes.append(f"امتیاز تحلیل ({score:+.2f}) زیر آستانه‌ی خروج ({exit_threshold:+.2f}) رفت.")
            else:
                notes.append("پوزیشن حفظ می‌شود.")
        else:
            if score >= threshold:
                action = "BUY"
                if g > f and threshold < r.entry_threshold:
                    notes.append("طمع آستانه‌ی ورود را پایین آورد — کمی FOMO در کار است.")
                notes.append(f"امتیاز تحلیل ({score:+.2f}) از آستانه‌ی ورود ({threshold:.2f}) بالاتر است.")
            elif score >= r.entry_threshold and threshold > score:
                notes.append("تحلیل می‌گوید بخر، اما ترس اجازه نمی‌دهد.")
            else:
                notes.append(f"سیگنال کافی نیست (امتیاز {score:+.2f} < آستانه {threshold:.2f}).")

        if market_fg < 25 and self.personality.contrarian > 0.6:
            notes.append("بازار در ترس شدید است — از نگاه خلاف‌جهت، این یعنی فرصت.")
        elif market_fg > 75 and self.personality.contrarian > 0.6:
            notes.append("بازار در طمع شدید است — وقت احتیاط است.")

        return Decision(action, score, threshold, size_mult, stop_atr, tp_atr, state, notes, panic)

    # ------------------------------------------------------------------ بک‌تست
    def backtest(self, df: pd.DataFrame, warmup: int = 60, periods_per_year: int = 365) -> BacktestResult:
        r = self.risk
        a = self.analyzer.analyze(df)
        engine = EmotionEngine(self.personality)

        times = a.index
        o, h, l, c = (a[k].to_numpy(float) for k in ("open", "high", "low", "close"))
        score = a["score"].to_numpy(float)
        fg = a["fear_greed"].to_numpy(float)
        atr_pct = a["atr_pct"].to_numpy(float)

        cash, qty = r.initial_capital, 0.0
        entry_price = stop = tp = 0.0
        entry_time, entry_mood = None, ""
        equity_peak = r.initial_capital
        pending: Decision | None = None
        pending_atr = 0.0
        trades, rows = [], []
        decision = None

        def close_position(i, price, reason):
            nonlocal cash, qty
            fill = price * (1 - r.slippage)
            cash += qty * fill * (1 - r.fee)
            pnl = fill * (1 - r.fee) / (entry_price * (1 + r.fee)) - 1
            trades.append(Trade(entry_time, times[i], entry_price, fill, pnl, reason, entry_mood))
            engine.on_trade_closed(pnl)
            qty = 0.0

        for i in range(len(a)):
            # ۱) اجرای سفارش تصمیم‌گرفته‌شده در کندل قبل، با قیمت باز شدن این کندل
            if pending is not None:
                if pending.action == "BUY" and qty == 0:
                    fill = o[i] * (1 + r.slippage)
                    stop_dist = max(pending.stop_atr * pending_atr, 1e-4)
                    risk_cash = cash * r.risk_per_trade * pending.size_mult
                    value = min(risk_cash / stop_dist, cash * r.max_position)
                    qty = value * (1 - r.fee) / fill
                    cash -= value
                    entry_price, entry_time = fill, times[i]
                    entry_mood = pending.state.mood
                    stop = fill * (1 - stop_dist)
                    tp = fill * (1 + pending.take_profit_atr * pending_atr)
                elif pending.action == "SELL" and qty > 0:
                    close_position(i, o[i], "panic" if pending.panic else "signal")
                pending = None

            # ۲) حد ضرر / حد سود داخل کندل (اول حد ضرر — فرض محافظه‌کارانه)
            if qty > 0:
                if l[i] <= stop:
                    close_position(i, min(o[i], stop), "stop")
                elif h[i] >= tp:
                    close_position(i, max(o[i], tp), "take_profit")

            # ۳) ارزش‌گذاری و به‌روزرسانی احساسات
            equity = cash + qty * c[i]
            equity_peak = max(equity_peak, equity)
            pos_ret = c[i] / entry_price - 1 if qty > 0 else None
            state = engine.update(fg[i], 1 - equity / equity_peak, pos_ret)

            # ۴) تصمیم برای کندل بعد
            if i >= warmup and not np.isnan(score[i]):
                decision = self.decide(score[i], fg[i], state, qty > 0, pos_ret)
                if decision.action != "HOLD":
                    pending, pending_atr = decision, atr_pct[i]

            rows.append((times[i], c[i], equity, qty > 0, fg[i], state.fear, state.greed, state.mood))

        log = pd.DataFrame(rows, columns=["time", "close", "equity", "in_position",
                                          "market_fear_greed", "fear", "greed", "mood"]).set_index("time")
        return BacktestResult(self.personality, log, trades, decision, periods_per_year)

    # ------------------------------------------------------------------ تحلیل لحظه‌ای
    def analyze_now(self, df: pd.DataFrame, **kw):
        """کل تاریخچه را مرور می‌کند تا ربات «خاطرات» و احساساتش را بسازد،
        سپس تحلیل و تصمیم آخرین کندل را برمی‌گرداند."""
        result = self.backtest(df, **kw)
        snap = self.analyzer.snapshot(self.analyzer.analyze(df))
        return snap, result


__all__ = ["EmotionalTrader", "RiskConfig", "Decision", "Trade", "BacktestResult"]
