"""IMPACT ENGINE - turn opinions into one number per asset.

The model gives an estimate, the historical engine gives an empirical
prior, and the market data engine says whether the tape is calm or jumpy.
This stage blends the three:

    blended = (w_ai * ai_estimate + w_hist * prior) / (w_ai + w_hist)
    final   = blended * volatility_regime_multiplier

The historical weight is scaled by sample size, so a prior built from three
observations counts for less than one built from twenty, and a missing prior
leaves the model's estimate untouched.
"""

from __future__ import annotations

import logging

from ..config import Config
from ..models import AnalyzedEvent, AssetView, Direction, Importance
from .historical import HistoricalEngine, Prior
from .market_data import AssetQuote

log = logging.getLogger(__name__)

# Corroboration bonus: a story confirmed by several wires is more likely real.
CORROBORATION_BONUS = {1: 1.0, 2: 1.06, 3: 1.10}
MAX_CORROBORATION_BONUS = 1.15

# Importance acts as a sanity ceiling on the magnitude.
IMPORTANCE_CEILING_PCT = {
    Importance.LOW: 0.4,
    Importance.MEDIUM: 1.2,
    Importance.HIGH: 3.0,
    Importance.CRITICAL: 8.0,
}


class ImpactEngine:
    def __init__(self, config: Config, historical: HistoricalEngine):
        self.config = config
        self.historical = historical

    def run(
        self,
        analyses: list[AnalyzedEvent],
        market: dict[str, AssetQuote],
    ) -> list[AnalyzedEvent]:
        for analysis in analyses:
            for view in analysis.assets:
                prior = self.historical.prior(analysis.event, view.asset)
                quote = market.get(view.asset)
                self._blend(analysis, view, prior, quote)
            self._rank_assets(analysis)
        log.info("impact: blended estimates for %d analyses", len(analyses))
        return analyses

    # ------------------------------------------------------------------
    def _blend(
        self,
        analysis: AnalyzedEvent,
        view: AssetView,
        prior: Prior,
        quote: AssetQuote | None,
    ) -> None:
        ai_estimate = view.ai_impact_pct if view.ai_impact_pct is not None else view.impact_pct
        view.ai_impact_pct = ai_estimate
        view.historical_impact_pct = prior.expected_move_pct if prior.is_usable else None

        # --- blend model estimate with the empirical prior ---------------
        w_ai = self.config.ai_weight
        w_hist = self.config.historical_weight * prior.weight_scale

        if w_hist > 0 and prior.expected_move_pct is not None:
            blended = (w_ai * ai_estimate + w_hist * prior.expected_move_pct) / (w_ai + w_hist)
        else:
            blended = ai_estimate

        # --- scale by the current volatility regime ---------------------
        multiplier = quote.regime_multiplier if quote is not None else 1.0
        view.volatility_adjustment = multiplier
        adjusted = blended * multiplier

        # --- corroboration ---------------------------------------------
        corroboration = analysis.event.corroboration
        adjusted *= CORROBORATION_BONUS.get(corroboration, MAX_CORROBORATION_BONUS)

        # --- ceilings ---------------------------------------------------
        ceiling = min(
            IMPORTANCE_CEILING_PCT.get(analysis.importance, self.config.max_impact_pct),
            self.config.max_impact_pct,
        )
        view.impact_pct = round(min(adjusted, ceiling), 3)

        # A neutral call carries no magnitude worth publishing.
        if view.direction is Direction.NEUTRAL:
            view.impact_pct = round(min(view.impact_pct, 0.1), 3)

    def _rank_assets(self, analysis: AnalyzedEvent) -> None:
        analysis.assets.sort(key=lambda v: v.impact_pct, reverse=True)


def describe_blend(view: AssetView) -> str:
    """Human-readable account of how a number was produced (for the dashboard)."""
    parts = []
    if view.ai_impact_pct is not None:
        parts.append(f"model {view.ai_impact_pct:.2f}%")
    if view.historical_impact_pct is not None:
        parts.append(f"historical {view.historical_impact_pct:.2f}%")
    if abs(view.volatility_adjustment - 1.0) > 0.01:
        parts.append(f"vol x{view.volatility_adjustment:.2f}")
    return " | ".join(parts) or "model only"
