"""AI ANALYZER - ask Claude what each event means for the tracked assets.

Events are analysed in batches with a strict JSON contract. The model is
asked for a direction and an expected percentage move per asset; those
numbers are treated as one opinion, not as truth - the impact engine
blends them with the historical prior afterwards.

If no API key is configured the stage falls back to a rule-based read so
the pipeline still produces output.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..config import Config
from ..models import (
    AnalyzedEvent,
    AssetView,
    Direction,
    EventKind,
    Importance,
    NormalizedEvent,
)
from .macro_data import indicator_weight, surprise_is_hawkish

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior FX and commodities strategist on a macro desk.
You read incoming news and economic releases and judge their effect on markets.

For each event you receive, decide:
1. importance: low | medium | high | critical - how much the market cares.
2. For each affected asset: the direction and the expected absolute move.

Assets you may reference (use these exact symbols):
XAUUSD (gold), DXY (dollar index), EURUSD, GBPUSD, USDJPY, WTI (crude oil).

Rules you must follow:
- impact_pct is the expected ABSOLUTE move in percent over the stated horizon.
  Realistic ranges: routine data 0.05-0.3, important surprises 0.3-1.0,
  central bank shocks or geopolitical escalation 1.0-3.0. Above 3.0 is rare.
- direction is from the asset's own perspective: "bullish" means the asset
  rises. A stronger dollar is bullish DXY and usually bearish XAUUSD/EURUSD.
- Only list assets that are genuinely affected. Two or three is normal.
- If an event is already priced in or is stale commentary, say so and use
  low importance with small impact numbers.
- summary_fa must be natural Persian (Farsi), 1-2 sentences, written for a
  trader. summary_en is the same content in English.
- Be conservative. Overstating impact is worse than understating it.

Respond with ONLY a JSON object, no prose and no code fences:
{
  "analyses": [
    {
      "event_id": "<the id given to you>",
      "importance": "low|medium|high|critical",
      "summary_fa": "...",
      "summary_en": "...",
      "notes": "what drives this call, one sentence",
      "assets": [
        {
          "asset": "XAUUSD",
          "direction": "bullish|bearish|neutral",
          "impact_pct": 0.45,
          "horizon_hours": 24,
          "rationale": "one short sentence"
        }
      ]
    }
  ]
}"""


class AIAnalyzer:
    def __init__(self, config: Config):
        self.config = config
        self._client: Any = None
        if config.anthropic_api_key:
            try:
                from anthropic import Anthropic

                self._client = Anthropic(api_key=config.anthropic_api_key)
            except ImportError:  # pragma: no cover - depends on environment
                log.warning("anthropic package missing; falling back to rule-based analysis")

    # ------------------------------------------------------------------
    def run(self, events: list[NormalizedEvent]) -> list[AnalyzedEvent]:
        if not events:
            return []

        if self._client is None:
            log.info("ai_analyzer: no API client, using rule-based fallback")
            return [self._fallback(e) for e in events]

        results: list[AnalyzedEvent] = []
        size = max(1, self.config.max_events_per_batch)
        for start in range(0, len(events), size):
            batch = events[start:start + size]
            try:
                results.extend(self._analyze_batch(batch))
            except Exception as exc:
                log.warning("ai_analyzer: batch failed (%s), falling back", exc)
                results.extend(self._fallback(e) for e in batch)

        log.info("ai_analyzer: %d events analyzed", len(results))
        return results

    # ------------------------------------------------------------------
    def _analyze_batch(self, batch: list[NormalizedEvent]) -> list[AnalyzedEvent]:
        payload = json.dumps(
            {"events": [self._describe(e) for e in batch]},
            ensure_ascii=False,
            indent=2,
        )

        response = self._client.messages.create(
            model=self.config.model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": payload}],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        )
        parsed = _extract_json(text)
        by_id = {e.event_id: e for e in batch}

        analyzed: list[AnalyzedEvent] = []
        for entry in parsed.get("analyses", []):
            event = by_id.pop(entry.get("event_id", ""), None)
            if event is None:
                continue
            analyzed.append(self._build(event, entry, model=self.config.model))

        # Anything the model skipped still deserves a record.
        for leftover in by_id.values():
            analyzed.append(self._fallback(leftover))
        return analyzed

    def _describe(self, event: NormalizedEvent) -> dict[str, Any]:
        item: dict[str, Any] = {
            "event_id": event.event_id,
            "headline": event.title,
            "detail": event.body[:800],
            "source": event.source,
            "kind": event.kind.value,
            "published_utc": event.published_at.isoformat(),
            "currencies": event.currencies,
            "reported_by_n_sources": event.corroboration,
        }
        if event.macro is not None:
            item["release"] = {
                "indicator": event.macro.indicator,
                "country": event.macro.country,
                "actual": event.macro.actual,
                "forecast": event.macro.forecast,
                "previous": event.macro.previous,
                "unit": event.macro.unit,
                "surprise": event.macro.surprise,
                "surprise_zscore": event.macro.surprise_z,
            }
        return item

    def _build(
        self, event: NormalizedEvent, entry: dict[str, Any], model: str
    ) -> AnalyzedEvent:
        views: list[AssetView] = []
        for raw in entry.get("assets", []):
            try:
                impact = float(raw.get("impact_pct", 0.0))
            except (TypeError, ValueError):
                continue
            views.append(
                AssetView(
                    asset=str(raw.get("asset", "")).upper().strip(),
                    direction=_direction(raw.get("direction")),
                    impact_pct=impact,
                    ai_impact_pct=impact,
                    rationale=str(raw.get("rationale", ""))[:280],
                    horizon_hours=_positive_float(raw.get("horizon_hours"), 24.0),
                )
            )

        return AnalyzedEvent(
            event=event,
            importance=_importance(entry.get("importance")),
            summary_fa=str(entry.get("summary_fa", "")).strip(),
            summary_en=str(entry.get("summary_en", "")).strip(),
            assets=views,
            model=model,
            analysis_notes=str(entry.get("notes", ""))[:400],
        )

    # ------------------------------------------------------------------
    def _fallback(self, event: NormalizedEvent) -> AnalyzedEvent:
        """Rule-based read used when the model is unavailable or silent.

        Deliberately crude: it exists so the pipeline degrades instead of
        stopping, and it marks itself so the confidence engine can discount it.
        """
        importance = Importance.LOW
        strength = 0.1
        hawkish: bool | None = None

        if event.macro is not None and event.macro.surprise_z is not None:
            magnitude = abs(event.macro.surprise_z)
            weight = indicator_weight(event.macro.indicator)
            strength = min(2.5, magnitude * weight * 0.45)
            hawkish = surprise_is_hawkish(event.macro)
            if magnitude >= 2.0 and weight >= 0.6:
                importance = Importance.CRITICAL
            elif magnitude >= 1.0 and weight >= 0.5:
                importance = Importance.HIGH
            elif magnitude >= 0.5:
                importance = Importance.MEDIUM
        elif event.kind is EventKind.CENTRAL_BANK:
            importance = Importance.HIGH
            strength = 0.4
            text = f"{event.title} {event.body}".lower()
            if "hawkish" in text or "hike" in text:
                hawkish = True
            elif "dovish" in text or "cut" in text:
                hawkish = False
        elif event.kind is EventKind.GEOPOLITICAL:
            importance = Importance.MEDIUM
            strength = 0.35

        views: list[AssetView] = []
        if hawkish is not None:
            dxy = Direction.BULLISH if hawkish else Direction.BEARISH
            gold = Direction.BEARISH if hawkish else Direction.BULLISH
            views = [
                AssetView("DXY", dxy, round(strength * 0.5, 3), ai_impact_pct=strength * 0.5,
                          rationale="Rule-based read of the policy implication."),
                AssetView("XAUUSD", gold, round(strength, 3), ai_impact_pct=strength,
                          rationale="Gold trades inverse to real-rate expectations."),
                AssetView("EURUSD", gold, round(strength * 0.6, 3), ai_impact_pct=strength * 0.6,
                          rationale="Euro moves opposite the dollar."),
            ]
        elif event.kind is EventKind.GEOPOLITICAL:
            views = [
                AssetView("XAUUSD", Direction.BULLISH, round(strength, 3),
                          ai_impact_pct=strength, rationale="Risk-off bid for havens."),
                AssetView("WTI", Direction.BULLISH, round(strength * 1.2, 3),
                          ai_impact_pct=strength * 1.2, rationale="Supply-risk premium."),
            ]

        return AnalyzedEvent(
            event=event,
            importance=importance,
            summary_fa="",
            summary_en=event.title,
            assets=views,
            model="rule-based-fallback",
            analysis_notes="Generated without model access.",
            validation_flags=["fallback_analysis"],
        )


# ----------------------------------------------------------------------
def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Model wrapped the object in prose - take the outermost braces.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError("model response contained no JSON object")


def _direction(value: object) -> Direction:
    try:
        return Direction(str(value).lower().strip())
    except ValueError:
        return Direction.NEUTRAL


def _importance(value: object) -> Importance:
    try:
        return Importance(str(value).lower().strip())
    except ValueError:
        return Importance.LOW


def _positive_float(value: object, default: float) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return number if number > 0 else default
