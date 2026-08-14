"""Data contracts that flow between pipeline stages.

The pipeline is a linear chain of transforms, so each stage consumes the
dataclass produced by the stage before it:

    RawItem -> NormalizedEvent -> AnalyzedEvent -> ScoredEvent -> Alert
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Importance(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

    @property
    def rank(self) -> int:
        return {"low": 0, "medium": 1, "high": 2, "critical": 3}[self.value]


class Direction(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"

    @property
    def sign(self) -> int:
        return {"bullish": 1, "bearish": -1, "neutral": 0}[self.value]


class EventKind(str, Enum):
    """What sort of thing the item is, which decides how it gets scored."""

    ECONOMIC_RELEASE = "economic_release"   # CPI, NFP, GDP ... has actual/forecast
    CENTRAL_BANK = "central_bank"           # rate decisions, speeches, minutes
    GEOPOLITICAL = "geopolitical"           # war, sanctions, elections
    MARKET_COMMENTARY = "market_commentary"  # analyst notes, flow reports
    OTHER = "other"


@dataclass
class RawItem:
    """Whatever a source handed us, before any cleaning."""

    source: str
    source_tier: int              # 1 = wire/official, 2 = major desk, 3 = aggregator
    title: str
    body: str = ""
    url: str = ""
    published_at: datetime | None = None
    fetched_at: datetime = field(default_factory=utcnow)
    # Calendar sources carry structured numbers; news sources leave this empty.
    payload: dict[str, Any] = field(default_factory=dict)

    @property
    def fingerprint(self) -> str:
        basis = (self.url or f"{self.source}:{self.title}").strip().lower()
        return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:32]


@dataclass
class MacroPoint:
    """The numbers behind an economic release."""

    indicator: str
    country: str
    actual: float | None = None
    forecast: float | None = None
    previous: float | None = None
    unit: str = ""
    # (actual - forecast) expressed in forecast units; None when we lack data.
    surprise: float | None = None
    # Surprise normalised by the indicator's typical revision size.
    surprise_z: float | None = None

    @property
    def has_result(self) -> bool:
        return self.actual is not None and self.forecast is not None


@dataclass
class NormalizedEvent:
    """A cleaned, deduped, currency-tagged event ready for analysis."""

    event_id: str
    source: str
    source_tier: int
    kind: EventKind
    title: str
    body: str
    url: str
    published_at: datetime
    currencies: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    macro: MacroPoint | None = None
    raw_fingerprint: str = ""
    # Set by DEDUP when this event merges duplicates from other outlets.
    corroborating_sources: list[str] = field(default_factory=list)

    @property
    def corroboration(self) -> int:
        return 1 + len(self.corroborating_sources)


@dataclass
class AssetView:
    """One asset's expected reaction to one event."""

    asset: str                 # "XAUUSD", "DXY", "EURUSD", ...
    direction: Direction
    impact_pct: float          # expected absolute move, in percent
    rationale: str = ""
    horizon_hours: float = 24.0
    # Filled in by the impact engine once priors are blended in.
    ai_impact_pct: float | None = None
    historical_impact_pct: float | None = None
    volatility_adjustment: float = 1.0

    @property
    def signed_impact_pct(self) -> float:
        return self.impact_pct * self.direction.sign


@dataclass
class AnalyzedEvent:
    """A normalized event plus the model's read on it."""

    event: NormalizedEvent
    importance: Importance
    summary_fa: str
    summary_en: str
    assets: list[AssetView] = field(default_factory=list)
    model: str = ""
    analysis_notes: str = ""
    # Populated by VALIDATOR with anything it had to repair or drop.
    validation_flags: list[str] = field(default_factory=list)

    def view(self, asset: str) -> AssetView | None:
        return next((a for a in self.assets if a.asset == asset), None)


@dataclass
class ScoredEvent:
    """Post impact + confidence engines: what actually gets published."""

    analyzed: AnalyzedEvent
    confidence: float               # 0..100
    confidence_breakdown: dict[str, float] = field(default_factory=dict)
    market_context: dict[str, Any] = field(default_factory=dict)
    historical_sample: int = 0

    @property
    def event(self) -> NormalizedEvent:
        return self.analyzed.event

    @property
    def importance(self) -> Importance:
        return self.analyzed.importance

    @property
    def peak_impact_pct(self) -> float:
        return max((a.impact_pct for a in self.analyzed.assets), default=0.0)


@dataclass
class Alert:
    """A rendered message plus the routing decision behind it."""

    kind: str                  # "instant" | "digest"
    text: str
    events: list[ScoredEvent] = field(default_factory=list)
    created_at: datetime = field(default_factory=utcnow)
    dedup_key: str = ""


def to_dict(obj: Any) -> Any:
    """asdict() that survives enums and datetimes (used by the dashboard)."""
    if hasattr(obj, "__dataclass_fields__"):
        return to_dict(asdict(obj))
    if isinstance(obj, dict):
        return {k: to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_dict(v) for v in obj]
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj
