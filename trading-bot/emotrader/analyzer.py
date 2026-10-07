"""تحلیل‌گر بازار: روند، مومنتوم، نوسان و «شاخص ترس و طمع» خود بازار.

خروجی اصلی دو عدد است:
  * score      : بین ۱- (فروش قوی) تا ۱+ (خرید قوی)
  * fear_greed : بین ۰ (ترس شدید بازار) تا ۱۰۰ (طمع شدید بازار)
هر دو فقط از داده‌های گذشته و همان کندل محاسبه می‌شوند (بدون نگاه به آینده).
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import indicators as ind


def _scale(x, lo, hi):
    """نگاشت خطی x از بازه‌ی [lo, hi] به [0, 100] با برش دو سر."""
    return np.clip((x - lo) / (hi - lo), 0, 1) * 100


def fear_greed_label(value: float) -> str:
    if value < 20:
        return "ترس شدید"
    if value < 40:
        return "ترس"
    if value < 60:
        return "خنثی"
    if value < 80:
        return "طمع"
    return "طمع شدید"


@dataclass
class Analysis:
    price: float
    score: float
    trend: str
    rsi: float
    fear_greed: float
    volatility_ratio: float
    drawdown: float
    reasons: list = field(default_factory=list)

    @property
    def fear_greed_label(self) -> str:
        return fear_greed_label(self.fear_greed)


class MarketAnalyzer:
    def __init__(self, fast: int = 20, slow: int = 50, vol_window: int = 20, vol_baseline: int = 100):
        self.fast = fast
        self.slow = slow
        self.vol_window = vol_window
        self.vol_baseline = vol_baseline

    def analyze(self, df: pd.DataFrame) -> pd.DataFrame:
        """همه‌ی ویژگی‌ها را برای تمام کندل‌ها محاسبه می‌کند."""
        out = df.copy()
        close = out["close"]

        out["ema_fast"] = ind.ema(close, self.fast)
        out["ema_slow"] = ind.ema(close, self.slow)
        out["rsi"] = ind.rsi(close)
        out = out.join(ind.macd(close)).join(ind.bollinger(close))
        out["atr"] = ind.atr(out)
        out["atr_pct"] = out["atr"] / close

        returns = close.pct_change()
        vol = returns.rolling(self.vol_window, min_periods=5).std()
        vol_base = vol.rolling(self.vol_baseline, min_periods=self.vol_window).mean()
        out["vol_ratio"] = (vol / vol_base).fillna(1.0)
        out["drawdown"] = close / close.rolling(self.slow, min_periods=1).max() - 1

        # --- امتیاز سیگنال: ترکیب وزن‌دار چهار جزء، هر کدام در [-1, 1]
        trend = np.tanh((out["ema_fast"] / out["ema_slow"] - 1) * 40)
        momentum = np.tanh(out["macd_hist"] / out["atr"].replace(0, np.nan) * 2).fillna(0)
        r = out["rsi"]
        # RSI در محدوده‌ی عادی تأییدکننده‌ی روند است، در نواحی اشباع نشانه‌ی برگشت
        rsi_part = np.where(
            (r - 50).abs() > 20,
            np.tanh((50 - r) / 15),
            (r - 50) / 40,
        )
        bb_part = np.clip(0.5 - out["bb_pctb"].fillna(0.5), -1, 1)
        out["score"] = np.clip(0.4 * trend + 0.3 * momentum + 0.15 * rsi_part + 0.15 * bb_part, -1, 1)
        out["trend_score"] = trend

        # --- شاخص ترس و طمع بازار (۰..۱۰۰)، مشابه ایده‌ی شاخص CNN
        parts = [
            100 - _scale(out["vol_ratio"], 0.6, 1.8),             # نوسان بالا = ترس
            100 - _scale(-out["drawdown"], 0.0, 0.25),            # افت از سقف = ترس
            _scale(close / ind.sma(close, self.slow).fillna(close) - 1, -0.1, 0.1),  # بالای میانگین = طمع
            _scale(out["rsi"], 25, 75),                            # RSI بالا = طمع
        ]
        if "volume" in out and out["volume"].notna().any():
            vol_z = out["volume"] / out["volume"].rolling(self.vol_window, min_periods=5).mean()
            # حجم سنگین در کندل نزولی = فروش هیجانی (ترس)، در کندل صعودی = هجوم خریدار (طمع)
            direction = np.sign(returns.fillna(0))
            parts.append(50 + direction * _scale(vol_z.fillna(1), 1.0, 3.0) / 2)
        out["fear_greed"] = sum(parts) / len(parts)
        return out

    def snapshot(self, analyzed: pd.DataFrame, i: int = -1) -> Analysis:
        """خلاصه‌ی قابل خواندن برای یک کندل (پیش‌فرض: آخرین کندل)."""
        row = analyzed.iloc[i]
        reasons = []

        if row["ema_fast"] > row["ema_slow"]:
            trend = "صعودی"
            reasons.append(f"میانگین {self.fast} بالای میانگین {self.slow} است (روند صعودی).")
        else:
            trend = "نزولی"
            reasons.append(f"میانگین {self.fast} زیر میانگین {self.slow} است (روند نزولی).")

        if row["rsi"] >= 70:
            reasons.append(f"RSI = {row['rsi']:.0f} → اشباع خرید، احتمال اصلاح.")
        elif row["rsi"] <= 30:
            reasons.append(f"RSI = {row['rsi']:.0f} → اشباع فروش، احتمال برگشت.")
        else:
            reasons.append(f"RSI = {row['rsi']:.0f} در محدوده‌ی عادی.")

        reasons.append("مومنتوم MACD " + ("مثبت" if row["macd_hist"] > 0 else "منفی") + " است.")

        if row["vol_ratio"] > 1.4:
            reasons.append(f"نوسان {row['vol_ratio']:.1f} برابر حالت عادی است — بازار ملتهب.")
        elif row["vol_ratio"] < 0.75:
            reasons.append("نوسان کمتر از حد عادی — بازار آرام (شاید قبل از حرکت بزرگ).")

        if row["drawdown"] < -0.1:
            reasons.append(f"قیمت {abs(row['drawdown']):.0%} زیر سقف اخیر است.")

        return Analysis(
            price=float(row["close"]),
            score=float(row["score"]),
            trend=trend,
            rsi=float(row["rsi"]),
            fear_greed=float(row["fear_greed"]),
            volatility_ratio=float(row["vol_ratio"]),
            drawdown=float(row["drawdown"]),
            reasons=reasons,
        )
