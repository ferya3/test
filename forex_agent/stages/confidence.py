"""CONFIDENCE ENGINE - how much should the reader trust this call?

Confidence is separate from impact on purpose: a headline can imply a large
move that we are unsure about, and a small move we are certain of. The score
is a weighted sum of independent signals, each in 0..1, reported alongside
its breakdown so the reasoning stays inspectable.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..models import AnalyzedEvent, ScoredEvent
from .historical import HistoricalEngine
from .impact_engine import describe_blend
from .market_data import AssetQuote

log = logging.getLogger(__name__)

# Component weights; they sum to 1.0.
WEIGHTS = {
    "source_quality": 0.18,
    "data_completeness": 0.20,
    "historical_support": 0.20,
    "model_agreement": 0.17,
    "freshness": 0.10,
    "market_context": 0.10,
    "validation_health": 0.05,
}

SOURCE_TIER_SCORE = {1: 1.0, 2: 0.75, 3: 0.5}


class ConfidenceEngine:
    def __init__(self, historical: HistoricalEngine):
        self.historical = historical

    def run(
        self,
        analyses: list[AnalyzedEvent],
        market: dict[str, AssetQuote],
    ) -> list[ScoredEvent]:
        scored = [self.score(a, market) for a in analyses]
        scored.sort(
            key=lambda s: (s.importance.rank, s.peak_impact_pct, s.confidence),
            reverse=True,
        )
        log.info("confidence: scored %d events", len(scored))
        return scored

    # ------------------------------------------------------------------
    def score(self, analysis: AnalyzedEvent, market: dict[str, AssetQuote]) -> ScoredEvent:
        parts: dict[str, float] = {
            "source_quality": self._source_quality(analysis),
            "data_completeness": self._data_completeness(analysis),
            "historical_support": self._historical_support(analysis),
            "model_agreement": self._model_agreement(analysis),
            "freshness": self._freshness(analysis),
            "market_context": self._market_context(analysis, market),
            "validation_health": self._validation_health(analysis),
        }
        total = sum(WEIGHTS[name] * value for name, value in parts.items()) * 100.0

        # A fallback analysis is a structural discount, not a component score.
        if "fallback_analysis" in analysis.validation_flags:
            total *= 0.6

        sample = max(
            (
                self.historical.prior(analysis.event, v.asset).sample_size
                for v in analysis.assets
            ),
            default=0,
        )

        return ScoredEvent(
            analyzed=analysis,
            confidence=round(max(0.0, min(100.0, total)), 1),
            confidence_breakdown={k: round(v, 3) for k, v in parts.items()},
            market_context=self._context_payload(analysis, market),
            historical_sample=sample,
        )

    # ------------------------------------------------------------------
    def _source_quality(self, analysis: AnalyzedEvent) -> float:
        base = SOURCE_TIER_SCORE.get(analysis.event.source_tier, 0.4)
        # Independent confirmation is worth more than the outlet's reputation.
        corroboration_bonus = min(0.25, 0.12 * len(analysis.event.corroborating_sources))
        return min(1.0, base + corroboration_bonus)

    def _data_completeness(self, analysis: AnalyzedEvent) -> float:
        macro = analysis.event.macro
        if macro is None:
            # A pure news item can still be complete if it has real body text.
            return 0.55 if len(analysis.event.body) > 120 else 0.35

        score = 0.4
        if macro.actual is not None:
            score += 0.25
        if macro.forecast is not None:
            score += 0.2
        if macro.previous is not None:
            score += 0.1
        if macro.surprise_z is not None:
            score += 0.05
        return min(1.0, score)

    def _historical_support(self, analysis: AnalyzedEvent) -> float:
        priors = [self.historical.prior(analysis.event, v.asset) for v in analysis.assets]
        usable = [p for p in priors if p.is_usable]
        if not usable:
            return 0.3  # no evidence either way, not evidence against

        best = max(usable, key=lambda p: p.sample_size)
        score = min(1.0, 0.4 + 0.05 * best.sample_size)
        if best.basis == "kind":
            score *= 0.8  # a looser match deserves less credit
        return score

    def _model_agreement(self, analysis: AnalyzedEvent) -> float:
        """How closely the model's estimate matched the empirical prior."""
        gaps: list[float] = []
        for view in analysis.assets:
            if view.ai_impact_pct is None or view.historical_impact_pct is None:
                continue
            denominator = max(view.ai_impact_pct, view.historical_impact_pct, 0.05)
            gaps.append(abs(view.ai_impact_pct - view.historical_impact_pct) / denominator)

        if not gaps:
            return 0.5  # nothing to compare against

        average_gap = sum(gaps) / len(gaps)
        return max(0.0, 1.0 - average_gap)

    def _freshness(self, analysis: AnalyzedEvent) -> float:
        age_h = (
            datetime.now(timezone.utc) - analysis.event.published_at
        ).total_seconds() / 3600.0
        if age_h <= 0.5:
            return 1.0
        if age_h >= 12.0:
            return 0.1
        return max(0.1, 1.0 - (age_h - 0.5) / 11.5)

    def _market_context(self, analysis: AnalyzedEvent, market: dict[str, AssetQuote]) -> float:
        quotes = [market.get(v.asset) for v in analysis.assets]
        live = [q for q in quotes if q is not None and q.is_live]
        if not live:
            return 0.2  # we are forecasting without seeing the tape

        score = 0.6 + 0.4 * (len(live) / max(1, len(quotes)))
        # An unknown regime means the multiplier was a guess.
        if all(q.regime == "unknown" for q in live):
            score *= 0.8
        return min(1.0, score)

    def _validation_health(self, analysis: AnalyzedEvent) -> float:
        serious = [
            f for f in analysis.validation_flags
            if f.startswith(("unknown_asset", "dollar_incoherent", "dxy_against_surprise",
                             "importance_", "neutral_with_large"))
        ]
        return max(0.0, 1.0 - 0.25 * len(serious))

    # ------------------------------------------------------------------
    def _context_payload(
        self, analysis: AnalyzedEvent, market: dict[str, AssetQuote]
    ) -> dict:
        payload: dict = {}
        for view in analysis.assets:
            quote = market.get(view.asset)
            payload[view.asset] = {
                "price": quote.price if quote else None,
                "change_pct_1d": quote.change_pct_1d if quote else None,
                "regime": quote.regime if quote else "unknown",
                "blend": describe_blend(view),
                "direction": view.direction.value,
                "signed_impact_pct": round(view.signed_impact_pct, 3),
            }
        return payload
