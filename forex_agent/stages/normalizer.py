"""NORMALIZER - turn raw items into a single clean shape.

Strips markup, resolves timestamps, classifies the event kind, and tags
which currencies the item is about. Everything downstream assumes these
fields are populated.
"""

from __future__ import annotations

import hashlib
import html
import logging
import re
from datetime import datetime, timezone

from ..models import EventKind, MacroPoint, NormalizedEvent, RawItem

log = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")

# Currency detection: explicit codes plus the words that imply them.
CURRENCY_HINTS: dict[str, tuple[str, ...]] = {
    "USD": ("usd", "dollar", "greenback", "federal reserve", "fed ", "fomc", "powell",
            "united states", "u.s.", "us "),
    "EUR": ("eur", "euro", "ecb", "lagarde", "eurozone", "germany", "german", "france"),
    "GBP": ("gbp", "sterling", "pound", "boe", "bank of england", "bailey", "britain", "uk "),
    "JPY": ("jpy", "yen", "boj", "bank of japan", "ueda", "japan"),
    "CHF": ("chf", "franc", "snb", "swiss"),
    "AUD": ("aud", "aussie", "rba", "australia"),
    "NZD": ("nzd", "kiwi", "rbnz", "new zealand"),
    "CAD": ("cad", "loonie", "boc", "bank of canada", "canada"),
    "CNY": ("cny", "yuan", "renminbi", "pboc", "china", "chinese"),
    "XAU": ("gold", "xau", "bullion", "precious metal"),
}

CENTRAL_BANK_TERMS = (
    "rate decision", "interest rate", "fomc", "ecb", "boe", "boj", "rba", "rbnz", "snb",
    "central bank", "monetary policy", "minutes", "rate cut", "rate hike", "hawkish",
    "dovish", "quantitative", "policy statement", "press conference",
)

GEOPOLITICAL_TERMS = (
    "war", "sanction", "tariff", "election", "conflict", "strike", "attack", "invasion",
    "opec", "embargo", "ceasefire", "coup", "shutdown", "default", "downgrade",
)

RELEASE_TERMS = (
    "cpi", "ppi", "gdp", "nfp", "non-farm", "nonfarm", "payroll", "unemployment", "jobless",
    "retail sales", "pmi", "ism", "inflation", "trade balance", "durable goods",
    "consumer confidence", "industrial production", "housing starts", "claims",
)

# Typical revision size per indicator family, used to scale the surprise into
# something comparable across indicators. Values are in the indicator's own
# units and come from the historical dispersion of forecast misses.
SURPRISE_SCALE: dict[str, float] = {
    "cpi": 0.2,
    "core cpi": 0.2,
    "ppi": 0.3,
    "gdp": 0.4,
    "payroll": 60.0,      # thousands of jobs
    "unemployment": 0.2,
    "retail sales": 0.4,
    "pmi": 1.5,
    "ism": 1.5,
    "claims": 20.0,       # thousands
    "trade balance": 3.0,
    "interest rate": 0.15,
}
DEFAULT_SURPRISE_SCALE = 1.0


class Normalizer:
    def run(self, items: list[RawItem]) -> list[NormalizedEvent]:
        events: list[NormalizedEvent] = []
        for item in items:
            event = self.normalize(item)
            if event is not None:
                events.append(event)
        log.info("normalizer: %d/%d items normalized", len(events), len(items))
        return events

    # ------------------------------------------------------------------
    def normalize(self, item: RawItem) -> NormalizedEvent | None:
        title = clean_text(item.title)
        if not title:
            return None

        body = clean_text(item.body)
        haystack = f"{title} {body}".lower()

        kind = self._classify(haystack, item)
        currencies = self._currencies(haystack, item)
        keywords = self._keywords(haystack)
        published = item.published_at or datetime.now(timezone.utc)
        macro = self._macro(item)

        return NormalizedEvent(
            event_id=_event_id(item, title, published),
            source=item.source,
            source_tier=item.source_tier,
            kind=kind,
            title=title,
            body=body[:2000],
            url=item.url,
            published_at=published,
            currencies=currencies,
            keywords=keywords,
            macro=macro,
            raw_fingerprint=item.fingerprint,
        )

    # ------------------------------------------------------------------
    def _classify(self, haystack: str, item: RawItem) -> EventKind:
        if item.payload.get("is_calendar"):
            if any(term in haystack for term in ("rate decision", "interest rate", "monetary")):
                return EventKind.CENTRAL_BANK
            return EventKind.ECONOMIC_RELEASE
        if any(term in haystack for term in CENTRAL_BANK_TERMS):
            return EventKind.CENTRAL_BANK
        if any(term in haystack for term in GEOPOLITICAL_TERMS):
            return EventKind.GEOPOLITICAL
        if any(term in haystack for term in RELEASE_TERMS):
            return EventKind.ECONOMIC_RELEASE
        if any(term in haystack for term in ("analysis", "forecast", "outlook", "technical")):
            return EventKind.MARKET_COMMENTARY
        return EventKind.OTHER

    def _currencies(self, haystack: str, item: RawItem) -> list[str]:
        found: list[str] = []
        country = str(item.payload.get("country") or "").upper()
        if country and country in CURRENCY_HINTS:
            found.append(country)

        for code, hints in CURRENCY_HINTS.items():
            if code in found:
                continue
            if any(hint in haystack for hint in hints):
                found.append(code)
        return found

    def _keywords(self, haystack: str) -> list[str]:
        terms = set()
        for group in (CENTRAL_BANK_TERMS, GEOPOLITICAL_TERMS, RELEASE_TERMS):
            terms.update(term.strip() for term in group if term in haystack)
        return sorted(terms)

    def _macro(self, item: RawItem) -> MacroPoint | None:
        if not item.payload.get("is_calendar"):
            return None

        indicator = str(item.payload.get("indicator") or "").strip()
        actual = parse_number(item.payload.get("actual"))
        forecast = parse_number(item.payload.get("forecast"))
        previous = parse_number(item.payload.get("previous"))

        point = MacroPoint(
            indicator=indicator,
            country=str(item.payload.get("country") or "").upper(),
            actual=actual,
            forecast=forecast,
            previous=previous,
            unit=detect_unit(item.payload.get("actual") or item.payload.get("forecast")),
        )
        if actual is not None and forecast is not None:
            point.surprise = actual - forecast
            point.surprise_z = point.surprise / surprise_scale(indicator)
        return point


# ----------------------------------------------------------------------
def clean_text(text: str) -> str:
    if not text:
        return ""
    text = html.unescape(text)
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def parse_number(value: object) -> float | None:
    """Parse calendar values like '3.2%', '-14.5K', '1.25M', '<0.1'."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    match = _NUM_RE.search(text.replace(",", ""))
    if not match:
        return None

    number = float(match.group())
    tail = text[match.end():].strip().upper()
    if tail.startswith("K"):
        number *= 1.0          # calendars already quote thousands; keep the unit
    elif tail.startswith("M"):
        number *= 1000.0       # express millions in thousands for comparability
    elif tail.startswith("B"):
        number *= 1_000_000.0
    return number


def detect_unit(value: object) -> str:
    text = str(value or "")
    if "%" in text:
        return "%"
    for suffix in ("K", "M", "B"):
        if suffix in text.upper():
            return suffix
    return ""


def surprise_scale(indicator: str) -> float:
    key = indicator.lower()
    for name, scale in SURPRISE_SCALE.items():
        if name in key:
            return scale
    return DEFAULT_SURPRISE_SCALE


def _event_id(item: RawItem, title: str, published: datetime) -> str:
    basis = f"{item.source}|{title.lower()}|{published.strftime('%Y-%m-%dT%H')}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:24]
