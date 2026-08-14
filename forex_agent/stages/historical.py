"""HISTORICAL ENGINE - what did this kind of news actually do before?

Two jobs:

1. `prior()` - look up how much an asset moved after comparable past events
   and return an empirical expected move, scaled by how big this surprise is
   relative to the historical ones.
2. `learn()` - close the loop. Events recorded on earlier runs are revisited
   once enough time has passed, the realised move is measured against stored
   prices, and the result becomes tomorrow's prior.

With an empty database everything returns "no sample", and the impact engine
falls back to the model's estimate alone.
"""

from __future__ import annotations

import json
import logging
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from ..models import AnalyzedEvent, EventKind, NormalizedEvent
from ..storage import Storage

log = logging.getLogger(__name__)

# Minimum observations before a prior is trusted at full weight.
MIN_SAMPLE = 3
FULL_CONFIDENCE_SAMPLE = 12

# Hours after an event at which the move is measured.
MEASURE_HORIZON_H = 24.0
MAX_MEASURE_AGE_H = 96.0


@dataclass
class Prior:
    asset: str
    expected_move_pct: float | None
    sample_size: int
    dispersion: float | None = None   # stdev of past moves
    basis: str = "none"               # "indicator" | "kind" | "none"

    @property
    def is_usable(self) -> bool:
        return self.expected_move_pct is not None and self.sample_size >= MIN_SAMPLE

    @property
    def weight_scale(self) -> float:
        """How much of the configured historical weight this prior earns."""
        if not self.is_usable:
            return 0.0
        confidence = min(1.0, self.sample_size / FULL_CONFIDENCE_SAMPLE)
        return confidence if self.basis == "indicator" else confidence * 0.7


class HistoricalEngine:
    def __init__(self, storage: Storage):
        self.storage = storage

    # ------------------------------------------------------------------
    def prior(self, event: NormalizedEvent, asset: str) -> Prior:
        """Empirical expected move for this asset given this kind of event."""
        indicator = event.macro.indicator if event.macro else None
        rows, basis = [], "none"

        if indicator:
            rows = self.storage.moves_for_indicator(indicator, asset)
            basis = "indicator"
        if len(rows) < MIN_SAMPLE:
            rows = self.storage.moves_for_kind(event.kind.value, asset)
            basis = "kind"
        if len(rows) < MIN_SAMPLE:
            return Prior(asset, None, len(rows), basis="none")

        moves = [abs(float(r["move_pct"])) for r in rows]
        expected = statistics.median(moves)
        dispersion = statistics.pstdev(moves) if len(moves) > 1 else None

        # Scale by how this surprise compares to the historical ones. A 2-sigma
        # print should not inherit the average print's move.
        expected *= self._surprise_ratio(event, rows)

        return Prior(
            asset=asset,
            expected_move_pct=round(expected, 4),
            sample_size=len(moves),
            dispersion=dispersion,
            basis=basis,
        )

    def _surprise_ratio(self, event: NormalizedEvent, rows: list) -> float:
        current = abs(event.macro.surprise_z) if event.macro and event.macro.surprise_z else None
        if current is None:
            return 1.0

        past = [abs(float(r["surprise_z"])) for r in rows if r["surprise_z"] is not None]
        if not past:
            return 1.0

        typical = statistics.median(past)
        if typical <= 0.05:
            return 1.0
        # Bounded so one freak surprise cannot produce a 10x forecast.
        return max(0.4, min(2.5, current / typical))

    # ------------------------------------------------------------------
    def record(self, analyses: list[AnalyzedEvent]) -> None:
        """Store today's events so their outcome can be measured later."""
        for analysis in analyses:
            event = analysis.event
            self.storage.record_event(
                event_id=event.event_id,
                kind=event.kind.value,
                indicator=event.macro.indicator if event.macro else None,
                currencies=event.currencies,
                surprise_z=event.macro.surprise_z if event.macro else None,
                published_at=event.published_at,
                payload={
                    "title": event.title,
                    "importance": analysis.importance.value,
                    "predicted": {
                        v.asset: {"direction": v.direction.value, "impact_pct": v.impact_pct}
                        for v in analysis.assets
                    },
                },
            )

    # ------------------------------------------------------------------
    def learn(self, assets: tuple[str, ...]) -> int:
        """Measure realised moves for events that are now old enough.

        Returns the number of observations written.
        """
        pending = self.storage.events_awaiting_outcome(
            min_age_hours=MEASURE_HORIZON_H, max_age_hours=MAX_MEASURE_AGE_H
        )
        written = 0

        for row in pending:
            published = datetime.fromisoformat(row["published_at"])
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)

            for asset in assets:
                before = self.storage.price_near(asset, published, tolerance_hours=6.0)
                after = self.storage.price_near(
                    asset,
                    published + timedelta(hours=MEASURE_HORIZON_H),
                    tolerance_hours=12.0,
                )
                if not before or not after:
                    continue

                move_pct = (after / before - 1.0) * 100.0
                self.storage.record_move(
                    event_id=row["event_id"],
                    indicator=row["indicator"],
                    kind=row["kind"],
                    asset=asset,
                    surprise_z=row["surprise_z"],
                    move_pct=move_pct,
                    horizon_h=MEASURE_HORIZON_H,
                )
                written += 1

        if written:
            log.info("historical: recorded %d realised moves from %d events", written, len(pending))
        return written

    # ------------------------------------------------------------------
    def seed_from_json(self, path: str) -> int:
        """Load a bootstrap dataset of past event reactions.

        Format: [{"indicator": "CPI m/m", "kind": "economic_release",
                  "asset": "XAUUSD", "surprise_z": 1.4, "move_pct": -0.8}]
        """
        with open(path, encoding="utf-8") as handle:
            rows = json.load(handle)

        for i, row in enumerate(rows):
            self.storage.record_move(
                event_id=f"seed-{i}",
                indicator=row.get("indicator"),
                kind=row.get("kind", EventKind.ECONOMIC_RELEASE.value),
                asset=row["asset"],
                surprise_z=row.get("surprise_z"),
                move_pct=float(row["move_pct"]),
                horizon_h=float(row.get("horizon_h", MEASURE_HORIZON_H)),
            )
        log.info("historical: seeded %d observations from %s", len(rows), path)
        return len(rows)
