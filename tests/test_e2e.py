"""End-to-end run of the whole pipeline with the network boundary stubbed.

Ingestion and market data are the only stages that touch the outside world,
so replacing those two exercises every other stage for real: normalizer,
dedup, macro join, analyzer fallback, validator, historical, impact,
confidence, alert routing, rendering, and both sinks.
"""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forex_agent.config import Config
from forex_agent.models import RawItem
from forex_agent.pipeline import Pipeline
from forex_agent.stages.market_data import AssetQuote

NOW = datetime.now(timezone.utc)


def sample_feed() -> list[RawItem]:
    """A realistic minute of the wire: a release, its coverage, and noise."""
    return [
        RawItem(
            source="EconomicCalendar",
            source_tier=1,
            title="USD Core CPI m/m",
            body="USD Core CPI m/m (High impact, released).",
            published_at=NOW - timedelta(minutes=4),
            payload={
                "indicator": "Core CPI m/m",
                "country": "USD",
                "impact": "High",
                "actual": "0.6%",
                "forecast": "0.3%",
                "previous": "0.3%",
                "released": True,
                "is_calendar": True,
            },
        ),
        RawItem(
            source="Reuters-Business",
            source_tier=1,
            title="US core CPI m/m jumps to 0.6%, well above forecast",
            body="Core consumer prices rose faster than expected in July, "
                 "reviving bets on a longer hold from the Federal Reserve.",
            url="https://example.com/cpi",
            published_at=NOW - timedelta(minutes=3),
        ),
        RawItem(
            source="FXStreet",
            source_tier=2,
            title="US core CPI m/m jumps to 0.6% above forecast",
            body="Hotter core inflation lifts the dollar.",
            url="https://example.com/cpi-2",
            published_at=NOW - timedelta(minutes=2),
        ),
        RawItem(
            source="ForexLive",
            source_tier=1,
            title="New sanctions announced, escalating the conflict",
            body="Risk assets slipped as fresh sanctions were announced.",
            url="https://example.com/geo",
            published_at=NOW - timedelta(minutes=6),
        ),
        RawItem(
            source="DailyFX",
            source_tier=2,
            title="EUR/USD technical analysis: outlook for the week ahead",
            body="A look at the weekly chart structure.",
            url="https://example.com/ta",
            published_at=NOW - timedelta(minutes=30),
        ),
    ]


def sample_market() -> dict[str, AssetQuote]:
    return {
        "XAUUSD": AssetQuote("XAUUSD", 2412.5, -0.42, 0.95, "normal", 1.0, "stub"),
        "DXY": AssetQuote("DXY", 104.8, 0.31, 0.52, "volatile", 1.45, "stub"),
        "EURUSD": AssetQuote("EURUSD", 1.0854, -0.28, 0.41, "normal", 1.0, "stub"),
        "GBPUSD": AssetQuote("GBPUSD", 1.2731, -0.19, 0.48, "normal", 1.0, "stub"),
        "USDJPY": AssetQuote("USDJPY", 156.2, 0.35, 0.55, "normal", 1.0, "stub"),
        "WTI": AssetQuote("WTI", 78.4, 1.10, 2.10, "normal", 1.0, "stub"),
    }


@pytest.fixture
def pipeline(monkeypatch):
    with tempfile.TemporaryDirectory() as tmp:
        config = Config(
            anthropic_api_key="",          # forces the rule-based path
            telegram_bot_token="",
            telegram_chat_id="",
            dry_run=True,
            db_path=str(Path(tmp) / "e2e.db"),
            dashboard_path=str(Path(tmp) / "dashboard.json"),
        )
        pipe = Pipeline(config)
        monkeypatch.setattr(pipe.ingestion, "collect", sample_feed)
        monkeypatch.setattr(pipe.market, "snapshot", lambda *a, **k: sample_market())
        yield pipe
        pipe.close()


class TestEndToEnd:
    def test_full_run_produces_scored_events(self, pipeline):
        result = pipeline.run_once(deliver=True, digest=True)

        assert result.counts["ingested"] == 5
        # The two CPI stories collapse into one, so fewer survive dedup.
        assert result.counts["after_dedup"] < result.counts["normalized"]
        assert result.counts["scored"] >= 1
        assert result.duration_s > 0

    def test_duplicate_coverage_is_merged_with_corroboration(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        cpi = [e for e in result.scored if "CPI" in e.event.title.upper()]
        assert cpi, "the CPI story should survive"
        assert any(e.event.corroboration >= 2 for e in cpi)

    def test_calendar_numbers_reach_the_scored_event(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        with_macro = [e for e in result.scored if e.event.macro and e.event.macro.has_result]
        assert with_macro
        assert with_macro[0].event.macro.actual == 0.6
        assert with_macro[0].event.macro.surprise_z is not None

    def test_hot_inflation_reads_as_dollar_positive_gold_negative(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        release = next(
            (e for e in result.scored if e.event.macro and e.event.macro.has_result), None
        )
        assert release is not None

        dxy = release.analyzed.view("DXY")
        gold = release.analyzed.view("XAUUSD")
        assert dxy is not None and gold is not None
        assert dxy.direction.sign == 1      # hotter CPI lifts the dollar
        assert gold.direction.sign == -1    # and weighs on gold

    def test_every_event_carries_a_confidence_score(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        for event in result.scored:
            assert 0.0 <= event.confidence <= 100.0
            assert event.confidence_breakdown

    def test_impact_percentages_stay_plausible(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        for event in result.scored:
            for view in event.analyzed.assets:
                assert 0.0 <= view.impact_pct <= pipeline.config.max_impact_pct

    def test_volatile_regime_is_applied_to_the_dollar(self, pipeline):
        result = pipeline.run_once(deliver=False, digest=False)
        dxy_views = [
            v for e in result.scored for v in e.analyzed.assets if v.asset == "DXY"
        ]
        assert dxy_views
        assert all(v.volatility_adjustment > 1.0 for v in dxy_views)

    def test_digest_is_rendered_and_delivered(self, pipeline):
        result = pipeline.run_once(deliver=True, digest=True)
        assert result.digest is not None
        assert "جمع‌بندی خالص" in result.digest.text
        assert result.delivered >= 1

    def test_dashboard_snapshot_is_written(self, pipeline):
        pipeline.run_once(deliver=False, digest=False)
        payload = json.loads(Path(pipeline.config.dashboard_path).read_text(encoding="utf-8"))

        assert payload["events"]
        assert payload["market"]["XAUUSD"]["price"] == 2412.5
        assert "net_bias" in payload
        assert payload["run"]["ingested"] == 5

    def test_second_run_suppresses_the_same_stories(self, pipeline):
        first = pipeline.run_once(deliver=False, digest=False)
        second = pipeline.run_once(deliver=False, digest=False)

        assert first.counts["after_dedup"] > 0
        assert second.counts["after_dedup"] == 0

    def test_events_are_recorded_for_future_priors(self, pipeline):
        pipeline.run_once(deliver=False, digest=False)
        rows = pipeline.storage.events_awaiting_outcome(min_age_hours=0.0, max_age_hours=99.0)
        assert rows

    def test_empty_feed_is_handled(self, pipeline, monkeypatch):
        monkeypatch.setattr(pipeline.ingestion, "collect", list)
        result = pipeline.run_once(deliver=True, digest=True)

        assert result.counts["ingested"] == 0
        assert result.scored == []
        assert result.delivered == 0
