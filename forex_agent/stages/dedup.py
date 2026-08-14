"""DEDUP - collapse the same story reported by many outlets.

Two passes: an exact fingerprint check against the database, then a
token-overlap comparison so "Fed holds rates steady" from three wires
becomes one event with three corroborating sources. Corroboration count
feeds the confidence engine, so merging is preferable to dropping.
"""

from __future__ import annotations

import logging
import re

from ..config import Config
from ..models import NormalizedEvent
from ..storage import Storage

log = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9%.]+")

STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "was",
    "were", "as", "at", "by", "with", "from", "that", "this", "it", "its", "after",
    "amid", "says", "said", "new", "will", "be", "has", "have", "how", "why", "what",
}


def tokenize(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in STOPWORDS and len(t) > 2}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class Dedup:
    def __init__(self, config: Config, storage: Storage):
        self.config = config
        self.storage = storage

    def run(self, events: list[NormalizedEvent]) -> list[NormalizedEvent]:
        # Newest first so the survivor of a merge is the freshest report.
        events = sorted(events, key=lambda e: e.published_at, reverse=True)

        history = self.storage.recent_titles(self.config.dedup_window_hours)
        seen_tokens: list[tuple[set[str], str]] = [
            (set(row["title_tokens"].split()), row["source"]) for row in history
        ]
        seen_fingerprints = {row["fingerprint"] for row in history}

        kept: list[NormalizedEvent] = []
        batch_tokens: list[tuple[set[str], NormalizedEvent]] = []
        dropped_exact = 0
        merged = 0

        for event in events:
            if event.raw_fingerprint in seen_fingerprints or self.storage.has_fingerprint(
                event.raw_fingerprint
            ):
                dropped_exact += 1
                continue

            tokens = tokenize(event.title)

            # Same story already in this batch? Merge into the earlier keeper.
            twin = self._closest(tokens, [(t, e) for t, e in batch_tokens])
            if twin is not None:
                if event.source not in twin.corroborating_sources and event.source != twin.source:
                    twin.corroborating_sources.append(event.source)
                # Prefer the more authoritative outlet's framing.
                if event.source_tier < twin.source_tier:
                    twin.title, twin.url = event.title, event.url
                    twin.source, twin.source_tier = event.source, event.source_tier
                self._remember(event, tokens)
                merged += 1
                continue

            # Same story already published in an earlier run?
            prior = self._closest_history(tokens, seen_tokens)
            if prior is not None:
                dropped_exact += 1
                self._remember(event, tokens)
                continue

            kept.append(event)
            batch_tokens.append((tokens, event))
            self._remember(event, tokens)

        log.info(
            "dedup: %d in -> %d out (%d exact/stale, %d merged)",
            len(events), len(kept), dropped_exact, merged,
        )
        return kept

    # ------------------------------------------------------------------
    def _closest(
        self, tokens: set[str], candidates: list[tuple[set[str], NormalizedEvent]]
    ) -> NormalizedEvent | None:
        best: tuple[float, NormalizedEvent] | None = None
        for other_tokens, event in candidates:
            score = jaccard(tokens, other_tokens)
            if score >= self.config.dedup_similarity and (best is None or score > best[0]):
                best = (score, event)
        return best[1] if best else None

    def _closest_history(
        self, tokens: set[str], history: list[tuple[set[str], str]]
    ) -> str | None:
        for other_tokens, source in history:
            if jaccard(tokens, other_tokens) >= self.config.dedup_similarity:
                return source
        return None

    def _remember(self, event: NormalizedEvent, tokens: set[str]) -> None:
        self.storage.remember_item(
            fingerprint=event.raw_fingerprint,
            event_id=event.event_id,
            source=event.source,
            title=event.title,
            tokens=tokens,
            published_at=event.published_at,
        )
