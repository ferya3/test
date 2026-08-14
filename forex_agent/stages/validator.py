"""VALIDATOR - never let a malformed or implausible analysis through.

The model is capable and still occasionally invents an asset symbol,
returns a 40% move, or contradicts the release it was given. This stage
repairs what it can, drops what it cannot, and records every intervention
on the event so the confidence engine can discount it.
"""

from __future__ import annotations

import logging

from ..config import Config
from ..models import AnalyzedEvent, AssetView, Direction, EventKind, Importance
from .macro_data import surprise_is_hawkish

log = logging.getLogger(__name__)

# A move below this is noise and not worth reporting.
MIN_IMPACT_PCT = 0.01

# Assets that structurally move against the dollar. If the model says the
# dollar and one of these both rise on the same event, one of them is wrong.
DOLLAR_INVERSE = {"XAUUSD", "EURUSD", "GBPUSD"}


class Validator:
    def __init__(self, config: Config):
        self.config = config
        self.allowed = set(config.tracked_assets)

    def run(self, analyses: list[AnalyzedEvent]) -> list[AnalyzedEvent]:
        kept: list[AnalyzedEvent] = []
        for analysis in analyses:
            if self.validate(analysis):
                kept.append(analysis)
        log.info("validator: %d/%d analyses passed", len(kept), len(analyses))
        return kept

    # ------------------------------------------------------------------
    def validate(self, analysis: AnalyzedEvent) -> bool:
        flags = analysis.validation_flags
        views: list[AssetView] = []
        seen: set[str] = set()

        for view in analysis.assets:
            asset = view.asset.upper().strip()

            if asset not in self.allowed:
                flags.append(f"unknown_asset:{asset or '?'}")
                continue
            if asset in seen:
                flags.append(f"duplicate_asset:{asset}")
                continue

            if view.impact_pct < 0:
                # Direction carries the sign; a negative magnitude is a mix-up.
                view.impact_pct = abs(view.impact_pct)
                flags.append(f"negative_impact_fixed:{asset}")

            if view.impact_pct > self.config.max_impact_pct:
                flags.append(
                    f"impact_clamped:{asset}:{view.impact_pct:.2f}->{self.config.max_impact_pct}"
                )
                view.impact_pct = self.config.max_impact_pct

            if view.impact_pct < MIN_IMPACT_PCT and view.direction is not Direction.NEUTRAL:
                flags.append(f"impact_below_noise:{asset}")
                continue

            if view.direction is Direction.NEUTRAL and view.impact_pct > 0.5:
                # Neutral with a large move is incoherent; trust the magnitude
                # only when a direction backs it.
                flags.append(f"neutral_with_large_impact:{asset}")
                view.impact_pct = min(view.impact_pct, 0.15)

            view.asset = asset
            view.horizon_hours = min(max(view.horizon_hours, 0.5), 168.0)
            if view.ai_impact_pct is None:
                view.ai_impact_pct = view.impact_pct

            seen.add(asset)
            views.append(view)

        analysis.assets = views

        self._check_dollar_coherence(analysis)
        self._check_macro_coherence(analysis)
        self._check_importance(analysis)
        self._check_summaries(analysis)

        if not analysis.assets:
            flags.append("no_valid_assets")
            return False
        return True

    # ------------------------------------------------------------------
    def _check_dollar_coherence(self, analysis: AnalyzedEvent) -> None:
        """DXY and its inverses must not be called bullish together."""
        dxy = analysis.view("DXY")
        if dxy is None or dxy.direction is Direction.NEUTRAL:
            return

        for view in analysis.assets:
            if view.asset not in DOLLAR_INVERSE or view.direction is Direction.NEUTRAL:
                continue
            if view.direction is dxy.direction:
                # EURUSD/GBPUSD are mechanically inverse to the dollar; gold is
                # only usually so, which makes it the one worth flagging softly.
                if view.asset == "XAUUSD":
                    analysis.validation_flags.append("gold_dollar_same_direction")
                else:
                    analysis.validation_flags.append(f"dollar_incoherent:{view.asset}")
                    view.direction = (
                        Direction.BEARISH if dxy.direction is Direction.BULLISH
                        else Direction.BULLISH
                    )

    def _check_macro_coherence(self, analysis: AnalyzedEvent) -> None:
        """A hawkish surprise should not read as a dollar-negative call."""
        macro = analysis.event.macro
        if macro is None or not macro.has_result:
            return

        hawkish = surprise_is_hawkish(macro)
        if hawkish is None or abs(macro.surprise_z or 0.0) < 0.5:
            return

        dxy = analysis.view("DXY")
        if dxy is None or dxy.direction is Direction.NEUTRAL:
            return

        expected = Direction.BULLISH if hawkish else Direction.BEARISH
        if dxy.direction is not expected:
            # The model may have a defensible reason (priced in, revisions),
            # so this is recorded rather than overridden.
            analysis.validation_flags.append(
                f"dxy_against_surprise:z={macro.surprise_z:.2f}"
            )

    def _check_importance(self, analysis: AnalyzedEvent) -> None:
        """Importance and magnitude must agree."""
        peak = max((v.impact_pct for v in analysis.assets), default=0.0)

        if analysis.importance in (Importance.CRITICAL, Importance.HIGH) and peak < 0.15:
            analysis.validation_flags.append("importance_downgraded")
            analysis.importance = Importance.MEDIUM if peak >= 0.08 else Importance.LOW
        elif analysis.importance is Importance.LOW and peak >= 1.0:
            analysis.validation_flags.append("importance_upgraded")
            analysis.importance = Importance.HIGH

        # Stale commentary rarely deserves a high rating.
        if (
            analysis.event.kind is EventKind.MARKET_COMMENTARY
            and analysis.importance.rank > Importance.MEDIUM.rank
        ):
            analysis.validation_flags.append("commentary_capped")
            analysis.importance = Importance.MEDIUM

    def _check_summaries(self, analysis: AnalyzedEvent) -> None:
        if not analysis.summary_en:
            analysis.summary_en = analysis.event.title
            analysis.validation_flags.append("summary_en_missing")
        if not analysis.summary_fa:
            analysis.validation_flags.append("summary_fa_missing")
