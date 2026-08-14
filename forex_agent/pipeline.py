"""Pipeline orchestration - wires the stages together.

    NEWS SOURCES -> INGESTION -> NORMALIZER -> DEDUP ------.
                                                            > AI ANALYZER
                                              MACRO DATA --'      |
                                                                  v
                                                              VALIDATOR
                                                                  |
                              MARKET DATA + HISTORICAL -----> IMPACT ENGINE
                                                                  |
                                                          CONFIDENCE ENGINE
                                                                  |
                                                            ALERT ENGINE
                                                                  |
                                                      Telegram / Dashboard
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .config import Config
from .models import Alert, ScoredEvent
from .sinks.dashboard import DashboardSink
from .sinks.telegram import TelegramSink
from .stages.ai_analyzer import AIAnalyzer
from .stages.alert_engine import AlertEngine
from .stages.confidence import ConfidenceEngine
from .stages.dedup import Dedup
from .stages.historical import HistoricalEngine
from .stages.impact_engine import ImpactEngine
from .stages.ingestion import Ingestion
from .stages.macro_data import MacroData
from .stages.market_data import MarketData
from .stages.normalizer import Normalizer
from .stages.validator import Validator
from .storage import Storage

log = logging.getLogger(__name__)


@dataclass
class RunResult:
    started_at: datetime
    duration_s: float = 0.0
    counts: dict[str, int] = field(default_factory=dict)
    scored: list[ScoredEvent] = field(default_factory=list)
    instant_alerts: list[Alert] = field(default_factory=list)
    digest: Alert | None = None
    delivered: int = 0

    def as_stats(self) -> dict[str, Any]:
        return {
            "started_at": self.started_at.isoformat(),
            "duration_s": round(self.duration_s, 2),
            "delivered": self.delivered,
            **self.counts,
        }


class Pipeline:
    def __init__(self, config: Config, storage: Storage | None = None):
        self.config = config
        self.storage = storage or Storage(config.db_path)

        self.ingestion = Ingestion(config)
        self.normalizer = Normalizer()
        self.dedup = Dedup(config, self.storage)
        self.macro = MacroData()
        self.analyzer = AIAnalyzer(config)
        self.validator = Validator(config)
        self.market = MarketData(config, self.storage)
        self.historical = HistoricalEngine(self.storage)
        self.impact = ImpactEngine(config, self.historical)
        self.confidence = ConfidenceEngine(self.historical)
        self.alerts = AlertEngine(config, self.storage)
        self.telegram = TelegramSink(config)
        self.dashboard = DashboardSink(config.dashboard_path)

    # ------------------------------------------------------------------
    def run_once(self, deliver: bool = True, digest: bool = False) -> RunResult:
        started = datetime.now(timezone.utc)
        clock = time.monotonic()
        counts: dict[str, int] = {}

        # --- read the world ------------------------------------------
        raw = self.ingestion.collect()
        counts["ingested"] = len(raw)

        events = self.normalizer.run(raw)
        counts["normalized"] = len(events)

        events = self.dedup.run(events)
        counts["after_dedup"] = len(events)

        events = self.macro.run(events)
        counts["with_macro"] = sum(1 for e in events if e.macro is not None)

        if not events:
            log.info("pipeline: nothing new this run")
            result = RunResult(started_at=started, counts=counts)
            result.duration_s = time.monotonic() - clock
            self.dashboard.publish([], {}, result.as_stats())
            return result

        # --- understand it -------------------------------------------
        analyses = self.analyzer.run(events)
        counts["analyzed"] = len(analyses)

        analyses = self.validator.run(analyses)
        counts["validated"] = len(analyses)

        # --- price it ------------------------------------------------
        market = self.market.snapshot()
        counts["assets_priced"] = sum(1 for q in market.values() if q.is_live)

        analyses = self.impact.run(analyses, market)
        scored = self.confidence.run(analyses, market)
        counts["scored"] = len(scored)

        # --- remember it, so tomorrow's priors are better -------------
        self.historical.record(analyses)
        counts["learned_moves"] = self.historical.learn(self.config.tracked_assets)

        # --- publish -------------------------------------------------
        instant, held = self.alerts.route(scored)
        result = RunResult(
            started_at=started,
            counts=counts,
            scored=scored,
            instant_alerts=instant,
        )

        if digest:
            result.digest = self.alerts.build_digest(
                held or scored, title=_digest_title()
            )

        if deliver:
            result.delivered = self._deliver(result)

        result.duration_s = time.monotonic() - clock
        self.dashboard.publish(scored, market, result.as_stats())
        log.info("pipeline: run complete in %.1fs (%s)", result.duration_s, counts)
        return result

    # ------------------------------------------------------------------
    def run_digest(self, deliver: bool = True) -> RunResult:
        """A digest-only run: analyse everything new, send one summary."""
        return self.run_once(deliver=deliver, digest=True)

    def _deliver(self, result: RunResult) -> int:
        sent = 0
        for alert in result.instant_alerts:
            if self.telegram.send_alert(alert):
                self.alerts.mark_sent(alert)
                sent += 1

        if result.digest is not None and self.telegram.send_alert(result.digest):
            self.alerts.mark_sent(result.digest)
            sent += 1
        return sent

    def close(self) -> None:
        self.storage.close()


def _digest_title() -> str:
    hour = datetime.now(timezone.utc).hour
    if hour < 11:
        return "خلاصه صبح بازار"
    if hour < 18:
        return "خلاصه میان‌روز بازار"
    return "خلاصه پایان روز بازار"
