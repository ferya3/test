"""EmoTrader — ربات معامله‌گر با احساس ترس و طمع."""

from .analyzer import Analysis, MarketAnalyzer
from .emotions import PERSONALITIES, EmotionEngine, EmotionalState, Personality
from .trader import BacktestResult, EmotionalTrader, RiskConfig

__all__ = [
    "Analysis", "MarketAnalyzer", "PERSONALITIES", "EmotionEngine", "EmotionalState",
    "Personality", "BacktestResult", "EmotionalTrader", "RiskConfig",
]
