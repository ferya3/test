"""موتور احساسات ربات: ترس و طمع.

ربات دو منبع احساس دارد، درست مثل یک معامله‌گر انسانی:
  ۱. «سرایت احساسی» از بازار — وقتی بازار می‌ترسد، او هم می‌ترسد
     (مگر اینکه خلاف‌جهت‌گرا باشد: «وقتی دیگران می‌ترسند طمع کن»).
  ۲. تجربه‌ی شخصی — ضررها ترس می‌سازند، بُردهای پشت‌سرهم طمع،
     افت سرمایه از سقف اضطراب، و سود باز روی پوزیشن وسوسه‌ی ماندن.

احساسات ناگهان صفر نمی‌شوند؛ «حافظه» دارند و به‌آرامی فروکش می‌کنند.
"""

from dataclasses import dataclass

import numpy as np


@dataclass
class Personality:
    """شخصیت ربات. همه‌ی مقادیر بین ۰ و ۱ (به جز حساسیت‌ها که ۰ تا ۲ معقول است)."""

    name: str = "متعادل"
    fear_sensitivity: float = 1.0   # چقدر زود می‌ترسد
    greed_sensitivity: float = 1.0  # چقدر زود طمع می‌کند
    discipline: float = 0.6         # ۱ = ربات بی‌احساس، ۰ = کاملاً احساسی
    contrarian: float = 0.3         # ۱ = کاملاً خلاف جمع (بافت‌وار)، ۰ = پیرو جمع
    memory: float = 0.85            # ۰ تا ۱؛ هرچه بیشتر، احساسات دیرتر فروکش می‌کنند

    @property
    def emotional_weight(self) -> float:
        return 1.0 - self.discipline


PERSONALITIES = {
    "robot": Personality("ربات بی‌احساس", discipline=1.0),
    "balanced": Personality("متعادل"),
    "emotional": Personality("احساسی", fear_sensitivity=1.4, greed_sensitivity=1.4,
                             discipline=0.15, contrarian=0.0, memory=0.9),
    "buffett": Personality("خلاف‌جهت (بافت)", fear_sensitivity=0.7, greed_sensitivity=0.9,
                           discipline=0.5, contrarian=0.9, memory=0.9),
    "coward": Personality("ترسو", fear_sensitivity=1.8, greed_sensitivity=0.5,
                          discipline=0.3, contrarian=0.1),
}


@dataclass
class EmotionalState:
    fear: float
    greed: float

    @property
    def bias(self) -> float:
        """مثبت = طمع غالب، منفی = ترس غالب. بین ۱- و ۱+."""
        return self.greed - self.fear

    @property
    def mood(self) -> str:
        if self.fear > 0.8:
            return "وحشت‌زده 😱"
        if self.greed > 0.8:
            return "سرمست / FOMO 🤑"
        b = self.bias
        if b < -0.35:
            return "ترسیده 😨"
        if b < -0.1:
            return "محتاط 😟"
        if b <= 0.1:
            return "آرام 😐"
        if b <= 0.35:
            return "مشتاق 🙂"
        return "طمع‌کار 😏"


class EmotionEngine:
    def __init__(self, personality: Personality | None = None):
        self.p = personality or Personality()
        self.fear = 0.2
        self.greed = 0.2
        self.win_streak = 0
        self.loss_streak = 0

    @property
    def state(self) -> EmotionalState:
        return EmotionalState(self.fear, self.greed)

    def update(self, market_fear_greed: float, equity_drawdown: float,
               open_position_return: float | None = None) -> EmotionalState:
        """یک گام زمانی: احساسات به سمت «هدف» فعلی حرکت می‌کنند.

        market_fear_greed     : شاخص بازار ۰..۱۰۰
        equity_drawdown       : افت سرمایه‌ی خود ربات از سقف (عدد مثبت، مثلاً 0.08)
        open_position_return  : سود/زیان درصدی پوزیشن باز (یا None)
        """
        p = self.p
        c = p.contrarian
        market_fear = max(0.0, (50 - market_fear_greed) / 50)
        market_greed = max(0.0, (market_fear_greed - 50) / 50)

        # سرایت از بازار؛ خلاف‌جهت‌گرا ترس جمع را فرصت می‌بیند و از طمع جمع می‌ترسد
        fear_t = (1 - c) * market_fear + c * market_greed * 0.7
        greed_t = (1 - c) * market_greed + c * market_fear * 0.7

        # تجربه‌ی شخصی
        fear_t += min(1.0, equity_drawdown / 0.15) * 0.5
        fear_t += min(self.loss_streak, 4) * 0.08
        greed_t += min(self.win_streak, 4) * 0.08
        if open_position_return is not None:
            if open_position_return < 0:
                fear_t += min(1.0, -open_position_return / 0.05) * 0.3
            else:
                greed_t += min(1.0, open_position_return / 0.08) * 0.3

        fear_t = float(np.clip(fear_t * p.fear_sensitivity, 0, 1))
        greed_t = float(np.clip(greed_t * p.greed_sensitivity, 0, 1))

        m = p.memory
        self.fear = float(np.clip(m * self.fear + (1 - m) * fear_t, 0, 1))
        self.greed = float(np.clip(m * self.greed + (1 - m) * greed_t, 0, 1))
        return self.state

    def on_trade_closed(self, pnl_pct: float) -> None:
        """شوک احساسی بعد از بسته شدن معامله."""
        if pnl_pct < 0:
            self.loss_streak += 1
            self.win_streak = 0
            shock = min(0.5, -pnl_pct * 6) * self.p.fear_sensitivity
            self.fear = min(1.0, self.fear + shock)
            self.greed = max(0.0, self.greed - shock / 2)
        else:
            self.win_streak += 1
            self.loss_streak = 0
            boost = min(0.4, pnl_pct * 4) * self.p.greed_sensitivity
            self.greed = min(1.0, self.greed + boost)
            self.fear = max(0.0, self.fear - boost / 2)
