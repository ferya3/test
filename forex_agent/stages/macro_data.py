"""MACRO DATA - attach the numeric context an analyst would look up.

Calendar events arrive with actual/forecast/previous already parsed. News
items do not, so this stage back-fills them: when a headline is about an
indicator that also appears on the calendar, the release's numbers are
joined onto the news item, and the surprise is scored.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import timedelta

from ..models import EventKind, MacroPoint, NormalizedEvent
from .normalizer import surprise_scale

log = logging.getLogger(__name__)

# How much a given release family tends to matter to the dollar complex.
# Used when no historical sample exists yet (cold start).
INDICATOR_WEIGHT: dict[str, float] = {
    "interest rate": 1.0,
    "non-farm": 0.95,
    "nonfarm": 0.95,
    "payroll": 0.95,
    "cpi": 0.9,
    "core cpi": 0.9,
    "gdp": 0.75,
    "ppi": 0.6,
    "retail sales": 0.6,
    "unemployment": 0.6,
    "ism": 0.55,
    "pmi": 0.5,
    "claims": 0.35,
    "consumer confidence": 0.3,
    "trade balance": 0.25,
    "housing": 0.25,
}
DEFAULT_INDICATOR_WEIGHT = 0.2


def indicator_weight(indicator: str) -> float:
    key = (indicator or "").lower()
    for name, weight in INDICATOR_WEIGHT.items():
        if name in key:
            return weight
    return DEFAULT_INDICATOR_WEIGHT


class MacroData:
    """Joins calendar numbers onto news, and scores every surprise."""

    def __init__(self, join_window_hours: float = 6.0):
        self.join_window = timedelta(hours=join_window_hours)

    def run(self, events: list[NormalizedEvent]) -> list[NormalizedEvent]:
        calendar = [e for e in events if e.macro is not None]
        enriched = 0
        absorbed: set[str] = set()

        for event in events:
            if event.macro is not None:
                self._rescore(event.macro)
                continue

            match = self._match_calendar(event, calendar)
            if match is not None and match.macro is not None:
                # Copy, so the news item and the release keep separate records.
                event.macro = replace(match.macro)
                event.kind = EventKind.ECONOMIC_RELEASE
                if match.source not in event.corroborating_sources:
                    event.corroborating_sources.append(match.source)
                # The news item now carries both the numbers and the narrative,
                # so the bare calendar row would only repeat it.
                absorbed.add(match.event_id)
                enriched += 1

        kept = [e for e in events if e.event_id not in absorbed]
        log.info(
            "macro: %d calendar events, %d news items enriched, %d calendar rows absorbed",
            len(calendar), enriched, len(absorbed),
        )
        return kept

    # ------------------------------------------------------------------
    def _match_calendar(
        self, event: NormalizedEvent, calendar: list[NormalizedEvent]
    ) -> NormalizedEvent | None:
        """Find the release a headline is most likely reporting on."""
        title = event.title.lower()
        best: tuple[float, NormalizedEvent] | None = None

        for candidate in calendar:
            if candidate.macro is None or not candidate.macro.has_result:
                continue
            if abs(candidate.published_at - event.published_at) > self.join_window:
                continue

            indicator = candidate.macro.indicator.lower()
            terms = [t for t in indicator.split() if len(t) > 2]
            if not terms:
                continue

            overlap = sum(1 for t in terms if t in title) / len(terms)
            country_match = bool(
                candidate.macro.country
                and candidate.macro.country in event.currencies
            )
            score = overlap + (0.25 if country_match else 0.0)

            if score >= 0.6 and (best is None or score > best[0]):
                best = (score, candidate)

        return best[1] if best else None

    def _rescore(self, macro: MacroPoint) -> None:
        """Recompute the surprise so it is comparable across indicators."""
        if macro.actual is None or macro.forecast is None:
            macro.surprise = None
            macro.surprise_z = None
            return

        macro.surprise = macro.actual - macro.forecast
        scale = surprise_scale(macro.indicator)
        macro.surprise_z = macro.surprise / scale if scale else 0.0

        # Guard against a bad scale producing an absurd z-score.
        macro.surprise_z = max(-6.0, min(6.0, macro.surprise_z))


def surprise_is_hawkish(macro: MacroPoint) -> bool | None:
    """Whether the surprise argues for tighter policy (dollar-positive).

    Growth and inflation beats are hawkish; unemployment and jobless-claims
    beats are the opposite, since a higher print is weaker data.
    """
    if macro.surprise is None:
        return None

    inverted = any(
        term in macro.indicator.lower()
        for term in ("unemployment", "claims", "jobless")
    )
    hawkish = macro.surprise > 0
    return not hawkish if inverted else hawkish
