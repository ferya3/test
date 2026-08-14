"""Dashboard sink - a rolling JSON snapshot of the last run.

Written to disk so any front end (a static page, a Grafana JSON source, a
cron-driven upload) can read the same state the Telegram messages came from.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..models import ScoredEvent, to_dict
from ..stages.impact_engine import describe_blend
from ..stages.market_data import AssetQuote

log = logging.getLogger(__name__)

MAX_EVENTS_RETAINED = 200


class DashboardSink:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def publish(
        self,
        scored: list[ScoredEvent],
        market: dict[str, AssetQuote],
        run_stats: dict[str, Any],
    ) -> None:
        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "run": run_stats,
            "market": {
                asset: {
                    "price": quote.price,
                    "change_pct_1d": quote.change_pct_1d,
                    "realized_vol_pct": quote.realized_vol_pct,
                    "regime": quote.regime,
                    "source": quote.source,
                }
                for asset, quote in market.items()
            },
            "events": [self._event_row(e) for e in scored],
            "net_bias": self._net_bias(scored),
        }

        previous = self._load_previous()
        payload["history"] = ([*previous, *payload["events"]])[-MAX_EVENTS_RETAINED:]

        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
        )
        log.info("dashboard: wrote %d events to %s", len(scored), self.path)

    # ------------------------------------------------------------------
    def _event_row(self, event: ScoredEvent) -> dict[str, Any]:
        return {
            "event_id": event.event.event_id,
            "published_at": event.event.published_at.isoformat(),
            "title": event.event.title,
            "source": event.event.source,
            "corroborating_sources": event.event.corroborating_sources,
            "url": event.event.url,
            "kind": event.event.kind.value,
            "importance": event.importance.value,
            "confidence": event.confidence,
            "confidence_breakdown": event.confidence_breakdown,
            "historical_sample": event.historical_sample,
            "summary_fa": event.analyzed.summary_fa,
            "summary_en": event.analyzed.summary_en,
            "model": event.analyzed.model,
            "validation_flags": event.analyzed.validation_flags,
            "macro": to_dict(event.event.macro) if event.event.macro else None,
            "assets": [
                {
                    "asset": v.asset,
                    "direction": v.direction.value,
                    "impact_pct": v.impact_pct,
                    "signed_impact_pct": round(v.signed_impact_pct, 3),
                    "horizon_hours": v.horizon_hours,
                    "rationale": v.rationale,
                    "blend": describe_blend(v),
                }
                for v in event.analyzed.assets
            ],
        }

    def _net_bias(self, scored: list[ScoredEvent]) -> dict[str, float]:
        totals: dict[str, float] = {}
        for event in scored:
            weight = event.confidence / 100.0
            for view in event.analyzed.assets:
                totals[view.asset] = totals.get(view.asset, 0.0) + view.signed_impact_pct * weight
        return {asset: round(value, 3) for asset, value in sorted(totals.items())}

    def _load_previous(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text(encoding="utf-8")).get("history", [])
        except (json.JSONDecodeError, OSError):
            return []
