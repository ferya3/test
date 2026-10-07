import unittest

import numpy as np
import pandas as pd

from emotrader import (PERSONALITIES, EmotionalState, EmotionalTrader, EmotionEngine, MarketAnalyzer,
                       Personality)
from emotrader.data import synthetic_market
from emotrader.indicators import rsi


class IndicatorTests(unittest.TestCase):
    def test_rsi_stays_in_bounds(self):
        df = synthetic_market(500, seed=1)
        r = rsi(df["close"])
        self.assertTrue(((r >= 0) & (r <= 100)).all())

    def test_rsi_is_100_on_a_straight_rally(self):
        close = pd.Series(np.arange(1, 50, dtype=float))
        self.assertEqual(rsi(close).iloc[-1], 100.0)


class AnalyzerTests(unittest.TestCase):
    def test_market_panic_reads_as_fear(self):
        calm = np.full(150, 100.0)
        crash = 100 * np.cumprod(np.tile([0.90, 1.02], 15))  # سقوط پرنوسان
        close = pd.Series(np.concatenate([calm + np.sin(np.arange(150)), crash]))
        df = pd.DataFrame({"open": close, "high": close * 1.01, "low": close * 0.99, "close": close})
        a = MarketAnalyzer().analyze(df)
        self.assertLess(a["fear_greed"].iloc[-1], 25)
        self.assertLess(a["score"].iloc[-1], 0)

    def test_no_lookahead(self):
        df = synthetic_market(400, seed=3)
        full = MarketAnalyzer().analyze(df)
        cut = MarketAnalyzer().analyze(df.iloc[:300])
        pd.testing.assert_series_equal(full["score"].iloc[:300], cut["score"])
        pd.testing.assert_series_equal(full["fear_greed"].iloc[:300], cut["fear_greed"])


class EmotionTests(unittest.TestCase):
    def test_loss_creates_fear_and_win_creates_greed(self):
        e = EmotionEngine(Personality())
        before = e.state
        e.on_trade_closed(-0.05)
        self.assertGreater(e.fear, before.fear)
        e2 = EmotionEngine(Personality())
        e2.on_trade_closed(+0.08)
        self.assertGreater(e2.greed, before.greed)

    def test_herd_follower_catches_market_fear_contrarian_does_not(self):
        herd = EmotionEngine(Personality(contrarian=0.0))
        contra = EmotionEngine(Personality(contrarian=1.0))
        for _ in range(30):
            herd.update(5, 0.0)
            contra.update(5, 0.0)
        self.assertGreater(herd.fear, contra.fear)
        self.assertGreater(contra.greed, herd.greed)

    def test_emotions_stay_in_range(self):
        e = EmotionEngine(PERSONALITIES["emotional"])
        for _ in range(50):
            e.on_trade_closed(-0.2)
            e.update(0, 0.5, -0.3)
        self.assertTrue(0 <= e.fear <= 1 and 0 <= e.greed <= 1)


class TraderTests(unittest.TestCase):
    def test_fear_makes_bot_pickier_and_smaller(self):
        t = EmotionalTrader(PERSONALITIES["emotional"])
        calm = t.decide(0.3, 50, EmotionalState(0.1, 0.1), False, None)
        scared = t.decide(0.3, 50, EmotionalState(0.9, 0.0), False, None)
        greedy = t.decide(0.3, 50, EmotionalState(0.0, 0.9), False, None)
        self.assertGreater(scared.threshold, calm.threshold)
        self.assertLess(scared.size_mult, calm.size_mult)
        self.assertLess(greedy.threshold, calm.threshold)
        self.assertGreater(greedy.size_mult, calm.size_mult)

    def test_robot_ignores_emotions(self):
        t = EmotionalTrader(PERSONALITIES["robot"])
        a = t.decide(0.3, 50, EmotionalState(0.0, 0.0), False, None)
        b = t.decide(0.3, 50, EmotionalState(1.0, 0.0), False, None)
        self.assertEqual((a.threshold, a.size_mult), (b.threshold, b.size_mult))

    def test_panic_sell_only_when_losing(self):
        t = EmotionalTrader(PERSONALITIES["emotional"])
        state = EmotionalState(0.95, 0.0)
        self.assertTrue(t.decide(0.5, 50, state, True, -0.02).panic)
        self.assertFalse(t.decide(0.5, 50, state, True, +0.02).panic)

    def test_backtest_is_deterministic_and_sane(self):
        df = synthetic_market(600, seed=11)
        r1 = EmotionalTrader().backtest(df)
        r2 = EmotionalTrader().backtest(df)
        self.assertEqual(r1.total_return, r2.total_return)
        self.assertEqual(len(r1.log), len(df))
        self.assertTrue((r1.log["equity"] > 0).all())
        for t in r1.trades:
            self.assertLess(t.entry_time, t.exit_time)


if __name__ == "__main__":
    unittest.main()
