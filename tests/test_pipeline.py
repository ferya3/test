"""Stage-level tests. No network: sources are stubbed at the ingestion boundary."""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forex_agent.config import Config
from forex_agent.models import (
    AnalyzedEvent,
    AssetView,
    Direction,
    EventKind,
    Importance,
    RawItem,
)
from forex_agent.stages.alert_engine import AlertEngine, render_digest, render_instant
from forex_agent.stages.confidence import ConfidenceEngine
from forex_agent.stages.dedup import Dedup, jaccard, tokenize
from forex_agent.stages.historical import HistoricalEngine
from forex_agent.stages.impact_engine import ImpactEngine
from forex_agent.stages.macro_data import MacroData, surprise_is_hawkish
from forex_agent.stages.market_data import AssetQuote, _regime
from forex_agent.stages.normalizer import Normalizer, parse_number
from forex_agent.stages.validator import Validator
from forex_agent.storage import Storage

NOW = datetime.now(timezone.utc)


@pytest.fixture
def config():
    return Config(anthropic_api_key="", telegram_bot_token="", telegram_chat_id="", dry_run=True)


@pytest.fixture
def storage():
    with tempfile.TemporaryDirectory() as tmp:
        store = Storage(Path(tmp) / "test.db")
        yield store
        store.close()


def calendar_item(indicator="CPI m/m", actual="0.6%", forecast="0.3%", previous="0.2%"):
    return RawItem(
        source="EconomicCalendar",
        source_tier=1,
        title=f"USD {indicator}",
        body=f"USD {indicator} released.",
        published_at=NOW - timedelta(minutes=5),
        payload={
            "indicator": indicator,
            "country": "USD",
            "impact": "High",
            "actual": actual,
            "forecast": forecast,
            "previous": previous,
            "released": True,
            "is_calendar": True,
        },
    )


# ----------------------------------------------------------------------
# NORMALIZER
# ----------------------------------------------------------------------
class TestNormalizer:
    def test_strips_markup_and_entities(self):
        item = RawItem("X", 2, "<b>Gold</b> rallies", "<p>Risk&amp;reward</p>", published_at=NOW)
        event = Normalizer().normalize(item)
        assert event.title == "Gold rallies"
        assert event.body == "Risk&reward"

    def test_tags_currencies_from_hints(self):
        item = RawItem("X", 2, "Fed holds rates as gold climbs", published_at=NOW)
        event = Normalizer().normalize(item)
        assert "USD" in event.currencies
        assert "XAU" in event.currencies

    def test_classifies_central_bank_news(self):
        item = RawItem("X", 1, "FOMC minutes signal hawkish tilt", published_at=NOW)
        assert Normalizer().normalize(item).kind is EventKind.CENTRAL_BANK

    def test_classifies_geopolitical_news(self):
        item = RawItem("X", 1, "New sanctions announced amid conflict", published_at=NOW)
        assert Normalizer().normalize(item).kind is EventKind.GEOPOLITICAL

    def test_computes_surprise_from_calendar(self):
        event = Normalizer().normalize(calendar_item())
        assert event.macro.actual == 0.6
        assert event.macro.forecast == 0.3
        assert event.macro.surprise == pytest.approx(0.3)
        assert event.macro.surprise_z == pytest.approx(1.5)  # scale for CPI is 0.2

    def test_empty_title_is_dropped(self):
        assert Normalizer().normalize(RawItem("X", 2, "   ")) is None

    @pytest.mark.parametrize(
        "raw,expected",
        [("3.2%", 3.2), ("-14.5K", -14.5), ("1.25M", 1250.0), ("1,234", 1234.0), ("", None)],
    )
    def test_parse_number(self, raw, expected):
        assert parse_number(raw) == expected


# ----------------------------------------------------------------------
# DEDUP
# ----------------------------------------------------------------------
class TestDedup:
    def test_jaccard_of_paraphrases_is_high(self):
        a = tokenize("Fed holds interest rates steady at 5.5%")
        b = tokenize("Federal Reserve holds interest rates steady")
        assert jaccard(a, b) > 0.4

    def test_merges_same_story_from_two_outlets(self, config, storage):
        normalizer = Normalizer()
        events = [
            normalizer.normalize(RawItem("Reuters", 1, "Fed holds rates steady in July",
                                         url="http://a", published_at=NOW)),
            normalizer.normalize(RawItem("FXStreet", 2, "Fed holds rates steady in July",
                                         url="http://b", published_at=NOW - timedelta(minutes=2))),
        ]
        kept = Dedup(config, storage).run(events)
        assert len(kept) == 1
        assert kept[0].corroboration == 2

    def test_drops_item_seen_in_a_previous_run(self, config, storage):
        normalizer = Normalizer()
        item = RawItem("Reuters", 1, "ECB signals a pause", url="http://x", published_at=NOW)
        dedup = Dedup(config, storage)

        assert len(dedup.run([normalizer.normalize(item)])) == 1
        assert len(dedup.run([normalizer.normalize(item)])) == 0

    def test_distinct_stories_both_survive(self, config, storage):
        normalizer = Normalizer()
        events = [
            normalizer.normalize(RawItem("A", 1, "Gold hits record high on haven demand",
                                         url="http://1", published_at=NOW)),
            normalizer.normalize(RawItem("B", 1, "Oil slides as OPEC boosts output",
                                         url="http://2", published_at=NOW)),
        ]
        assert len(Dedup(config, storage).run(events)) == 2


# ----------------------------------------------------------------------
# MACRO DATA
# ----------------------------------------------------------------------
class TestMacroData:
    def test_inflation_beat_is_hawkish(self):
        event = Normalizer().normalize(calendar_item("CPI m/m", "0.6%", "0.3%"))
        assert surprise_is_hawkish(event.macro) is True

    def test_unemployment_beat_is_dovish(self):
        event = Normalizer().normalize(calendar_item("Unemployment Rate", "4.5%", "4.1%"))
        assert surprise_is_hawkish(event.macro) is False

    def test_news_item_inherits_calendar_numbers(self):
        normalizer = Normalizer()
        release = normalizer.normalize(calendar_item("CPI m/m", "0.6%", "0.3%"))
        news = normalizer.normalize(
            RawItem("Reuters", 1, "US CPI m/m comes in hot", published_at=NOW)
        )
        assert news.macro is None

        kept = MacroData().run([release, news])
        assert news.macro is not None
        assert news.macro.actual == 0.6
        assert news.kind is EventKind.ECONOMIC_RELEASE
        # The bare calendar row is dropped once a story carries its numbers.
        assert kept == [news]
        assert release.source in news.corroborating_sources

    def test_uncovered_release_is_kept(self):
        release = Normalizer().normalize(calendar_item("CPI m/m", "0.6%", "0.3%"))
        unrelated = Normalizer().normalize(
            RawItem("Reuters", 1, "Oil slides as OPEC boosts output", published_at=NOW)
        )
        kept = MacroData().run([release, unrelated])
        assert release in kept

    def test_surprise_z_is_clamped(self):
        event = Normalizer().normalize(calendar_item("CPI m/m", "50%", "0.3%"))
        MacroData().run([event])
        assert abs(event.macro.surprise_z) <= 6.0


# ----------------------------------------------------------------------
# VALIDATOR
# ----------------------------------------------------------------------
def make_analysis(views, importance=Importance.HIGH, macro_item=None):
    event = Normalizer().normalize(
        macro_item or RawItem("Reuters", 1, "Fed rate decision lands", published_at=NOW)
    )
    return AnalyzedEvent(
        event=event,
        importance=importance,
        summary_fa="خلاصه",
        summary_en="summary",
        assets=views,
        model="test",
    )


class TestValidator:
    def test_unknown_asset_is_dropped(self, config):
        analysis = make_analysis([
            AssetView("DOGECOIN", Direction.BULLISH, 1.0),
            AssetView("XAUUSD", Direction.BULLISH, 0.5),
        ])
        assert Validator(config).validate(analysis) is True
        assert [v.asset for v in analysis.assets] == ["XAUUSD"]
        assert any(f.startswith("unknown_asset") for f in analysis.validation_flags)

    def test_absurd_impact_is_clamped(self, config):
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 45.0)])
        Validator(config).validate(analysis)
        assert analysis.assets[0].impact_pct == config.max_impact_pct

    def test_dollar_incoherence_is_corrected(self, config):
        analysis = make_analysis([
            AssetView("DXY", Direction.BULLISH, 0.5),
            AssetView("EURUSD", Direction.BULLISH, 0.4),
        ])
        Validator(config).validate(analysis)
        assert analysis.view("EURUSD").direction is Direction.BEARISH
        assert "dollar_incoherent:EURUSD" in analysis.validation_flags

    def test_gold_against_dollar_is_flagged_not_forced(self, config):
        analysis = make_analysis([
            AssetView("DXY", Direction.BULLISH, 0.5),
            AssetView("XAUUSD", Direction.BULLISH, 0.4),
        ])
        Validator(config).validate(analysis)
        assert analysis.view("XAUUSD").direction is Direction.BULLISH
        assert "gold_dollar_same_direction" in analysis.validation_flags

    def test_high_importance_with_tiny_move_is_downgraded(self, config):
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.02)])
        Validator(config).validate(analysis)
        assert analysis.importance is Importance.LOW
        assert "importance_downgraded" in analysis.validation_flags

    def test_hawkish_surprise_with_bearish_dollar_is_flagged(self, config):
        analysis = make_analysis(
            [AssetView("DXY", Direction.BEARISH, 0.5)],
            macro_item=calendar_item("CPI m/m", "0.9%", "0.3%"),
        )
        Validator(config).validate(analysis)
        assert any(f.startswith("dxy_against_surprise") for f in analysis.validation_flags)

    def test_analysis_with_no_valid_assets_is_rejected(self, config):
        analysis = make_analysis([AssetView("BITCOIN", Direction.BULLISH, 1.0)])
        assert Validator(config).validate(analysis) is False


# ----------------------------------------------------------------------
# MARKET DATA
# ----------------------------------------------------------------------
class TestMarketData:
    def test_regime_classification(self):
        assert _regime(0.2, 0.85)[0] == "calm"
        assert _regime(0.85, 0.85)[0] == "normal"
        assert _regime(1.6, 0.85)[0] == "volatile"
        assert _regime(None, 0.85) == ("unknown", 1.0)

    def test_volatile_regime_scales_impact_up(self):
        _, multiplier = _regime(1.6, 0.85)
        assert multiplier > 1.0


# ----------------------------------------------------------------------
# HISTORICAL + IMPACT
# ----------------------------------------------------------------------
class TestImpactEngine:
    def test_model_estimate_survives_without_a_prior(self, config, storage):
        historical = HistoricalEngine(storage)
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.8, ai_impact_pct=0.8)])

        ImpactEngine(config, historical).run([analysis], {})
        assert analysis.assets[0].impact_pct == pytest.approx(0.8, abs=0.01)

    def test_prior_pulls_the_estimate_toward_history(self, config, storage):
        for i in range(15):
            storage.record_move(f"e{i}", None, EventKind.CENTRAL_BANK.value, "XAUUSD",
                                1.0, 0.2, 24.0)

        historical = HistoricalEngine(storage)
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 2.0, ai_impact_pct=2.0)])

        ImpactEngine(config, historical).run([analysis], {})
        assert analysis.assets[0].impact_pct < 2.0
        assert analysis.assets[0].historical_impact_pct == pytest.approx(0.2, abs=0.01)

    def test_volatile_regime_raises_the_final_number(self, config, storage):
        historical = HistoricalEngine(storage)
        engine = ImpactEngine(config, historical)

        calm = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 1.0, ai_impact_pct=1.0)])
        engine.run([calm], {"XAUUSD": AssetQuote("XAUUSD", price=2400.0, regime_multiplier=1.0)})

        hot = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 1.0, ai_impact_pct=1.0)])
        engine.run([hot], {"XAUUSD": AssetQuote("XAUUSD", price=2400.0, regime_multiplier=1.5)})

        assert hot.assets[0].impact_pct > calm.assets[0].impact_pct

    def test_importance_ceiling_applies(self, config, storage):
        analysis = make_analysis(
            [AssetView("XAUUSD", Direction.BULLISH, 5.0, ai_impact_pct=5.0)],
            importance=Importance.LOW,
        )
        ImpactEngine(config, HistoricalEngine(storage)).run([analysis], {})
        assert analysis.assets[0].impact_pct <= 0.4

    def test_corroboration_raises_the_estimate(self, config, storage):
        engine = ImpactEngine(config, HistoricalEngine(storage))

        single = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 1.0, ai_impact_pct=1.0)])
        engine.run([single], {})

        confirmed = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 1.0, ai_impact_pct=1.0)])
        confirmed.event.corroborating_sources = ["FXStreet", "Reuters"]
        engine.run([confirmed], {})

        assert confirmed.assets[0].impact_pct > single.assets[0].impact_pct


class TestHistoricalEngine:
    def test_prior_needs_a_minimum_sample(self, storage):
        storage.record_move("e1", "CPI m/m", "economic_release", "XAUUSD", 1.0, 0.5, 24.0)
        prior = HistoricalEngine(storage).prior(
            Normalizer().normalize(calendar_item()), "XAUUSD"
        )
        assert prior.is_usable is False

    def test_prior_uses_the_median_of_past_moves(self, storage):
        for move in (0.4, 0.5, 0.6, 0.5):
            storage.record_move("e", "CPI m/m", "economic_release", "XAUUSD", 1.5, move, 24.0)

        event = Normalizer().normalize(calendar_item("CPI m/m", "0.6%", "0.3%"))
        prior = HistoricalEngine(storage).prior(event, "XAUUSD")
        assert prior.is_usable
        assert prior.basis == "indicator"
        assert 0.4 <= prior.expected_move_pct <= 0.6

    def test_bigger_surprise_scales_the_prior_up(self, storage):
        for _ in range(10):
            storage.record_move("e", "CPI m/m", "economic_release", "XAUUSD", 1.0, 0.5, 24.0)

        engine = HistoricalEngine(storage)
        normal = engine.prior(Normalizer().normalize(calendar_item("CPI m/m", "0.5%", "0.3%")),
                              "XAUUSD")
        huge = engine.prior(Normalizer().normalize(calendar_item("CPI m/m", "1.1%", "0.3%")),
                            "XAUUSD")
        assert huge.expected_move_pct > normal.expected_move_pct


# ----------------------------------------------------------------------
# CONFIDENCE
# ----------------------------------------------------------------------
class TestConfidenceEngine:
    def test_score_is_bounded_and_broken_down(self, storage):
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        scored = ConfidenceEngine(HistoricalEngine(storage)).score(analysis, {})
        assert 0.0 <= scored.confidence <= 100.0
        assert set(scored.confidence_breakdown) >= {"source_quality", "freshness"}

    def test_corroborated_tier_one_beats_lone_aggregator(self, storage):
        engine = ConfidenceEngine(HistoricalEngine(storage))

        strong = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        strong.event.corroborating_sources = ["FXStreet", "DailyFX"]

        weak = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        weak.event.source_tier = 3

        assert engine.score(strong, {}).confidence > engine.score(weak, {}).confidence

    def test_stale_news_scores_lower(self, storage):
        engine = ConfidenceEngine(HistoricalEngine(storage))

        fresh = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        stale = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        stale.event.published_at = NOW - timedelta(hours=20)

        assert engine.score(fresh, {}).confidence > engine.score(stale, {}).confidence

    def test_fallback_analysis_is_discounted(self, storage):
        engine = ConfidenceEngine(HistoricalEngine(storage))

        normal = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        fallback = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        fallback.validation_flags.append("fallback_analysis")

        assert engine.score(fallback, {}).confidence < engine.score(normal, {}).confidence

    def test_live_market_data_helps(self, storage):
        engine = ConfidenceEngine(HistoricalEngine(storage))
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])

        blind = engine.score(analysis, {}).confidence
        seeing = engine.score(
            analysis, {"XAUUSD": AssetQuote("XAUUSD", price=2400.0, regime="normal")}
        ).confidence
        assert seeing > blind


# ----------------------------------------------------------------------
# ALERT ENGINE
# ----------------------------------------------------------------------
class TestAlertEngine:
    def _scored(self, storage, importance, confidence, impact):
        analysis = make_analysis(
            [AssetView("XAUUSD", Direction.BULLISH, impact)], importance=importance
        )
        scored = ConfidenceEngine(HistoricalEngine(storage)).score(analysis, {})
        scored.confidence = confidence
        return scored

    def test_high_impact_event_alerts_immediately(self, config, storage):
        event = self._scored(storage, Importance.CRITICAL, 80.0, 1.2)
        instant, held = AlertEngine(config, storage).route([event])
        assert len(instant) == 1 and not held

    def test_low_importance_waits_for_the_digest(self, config, storage):
        event = self._scored(storage, Importance.LOW, 90.0, 0.05)
        instant, held = AlertEngine(config, storage).route([event])
        assert not instant and len(held) == 1

    def test_low_confidence_waits_for_the_digest(self, config, storage):
        event = self._scored(storage, Importance.CRITICAL, 20.0, 1.5)
        instant, held = AlertEngine(config, storage).route([event])
        assert not instant and len(held) == 1

    def test_cooldown_suppresses_a_repeat(self, config, storage):
        engine = AlertEngine(config, storage)
        event = self._scored(storage, Importance.CRITICAL, 80.0, 1.2)

        instant, _ = engine.route([event])
        engine.mark_sent(instant[0])

        again, _ = engine.route([event])
        assert not again

    def test_hourly_budget_defers_the_overflow(self, config, storage):
        config.max_alerts_per_hour = 2
        engine = AlertEngine(config, storage)

        events = []
        for i in range(5):
            scored = self._scored(storage, Importance.CRITICAL, 80.0, 1.2)
            scored.analyzed.event.event_id = f"evt-{i}"
            events.append(scored)

        instant, held = engine.route(events)
        assert len(instant) == 2
        assert len(held) == 3


class TestRendering:
    def test_instant_message_carries_the_numbers(self, storage):
        analysis = make_analysis(
            [AssetView("XAUUSD", Direction.BULLISH, 0.85, rationale="Real yields fall")],
            macro_item=calendar_item("CPI m/m", "0.6%", "0.3%"),
        )
        scored = ConfidenceEngine(HistoricalEngine(storage)).score(analysis, {})
        text = render_instant(scored)

        assert "طلا" in text
        assert "0.85" in text
        assert "0.6" in text and "0.3" in text     # actual and forecast
        assert "σ" in text                          # surprise
        assert "اطمینان" in text

    def test_digest_lists_events_and_net_bias(self, storage):
        engine = ConfidenceEngine(HistoricalEngine(storage))
        events = [
            engine.score(make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)]), {}),
            engine.score(make_analysis([AssetView("DXY", Direction.BEARISH, 0.3)]), {}),
        ]
        text = render_digest(events, title="خلاصه", stamp="2026-08-14 12:00")

        assert "خلاصه" in text
        assert "جمع‌بندی خالص" in text
        assert "1." in text and "2." in text

    def test_html_is_escaped(self, storage):
        analysis = make_analysis([AssetView("XAUUSD", Direction.BULLISH, 0.5)])
        analysis.event.title = "Fed <script>alert(1)</script> decision"
        scored = ConfidenceEngine(HistoricalEngine(storage)).score(analysis, {})

        assert "<script>" not in render_instant(scored)
        assert "&lt;script&gt;" in render_instant(scored)


# ----------------------------------------------------------------------
# TELEGRAM
# ----------------------------------------------------------------------
class TestTelegramSplitting:
    def test_short_message_is_not_split(self):
        from forex_agent.sinks.telegram import split_message

        assert split_message("short") == ["short"]

    def test_long_message_splits_within_the_limit(self):
        from forex_agent.sinks.telegram import split_message

        text = "\n\n".join(f"paragraph {i} " + "x" * 200 for i in range(60))
        chunks = split_message(text)
        assert len(chunks) > 1
        assert all(len(c) <= 4096 for c in chunks)


# ----------------------------------------------------------------------
# STORAGE
# ----------------------------------------------------------------------
class TestStorage:
    def test_fingerprints_persist(self, storage):
        storage.remember_item("fp1", "e1", "Reuters", "Title", {"title"}, NOW)
        assert storage.has_fingerprint("fp1")
        assert not storage.has_fingerprint("fp2")

    def test_alert_cooldown_window(self, storage):
        storage.mark_alert_sent("key", "instant")
        assert storage.alert_sent_recently("key", 60)
        assert not storage.alert_sent_recently("other", 60)

    def test_price_lookup_finds_the_nearest_snapshot(self, storage):
        storage.save_price("XAUUSD", 2400.0, NOW)
        assert storage.price_near("XAUUSD", NOW, tolerance_hours=1.0) == 2400.0
        assert storage.price_near("XAUUSD", NOW - timedelta(days=5), tolerance_hours=1.0) is None
