"""INGESTION - pull raw items from every configured source.

Sources are polled independently and failures are contained: one dead feed
must never stop the run, so each fetcher returns what it got and logs the
rest.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any

import feedparser
import requests

from ..config import Config, RSSSource
from ..models import RawItem

log = logging.getLogger(__name__)

USER_AGENT = "forex-news-agent/1.0 (+https://github.com)"


class Ingestion:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT})

    # ------------------------------------------------------------------
    def collect(self) -> list[RawItem]:
        """Fetch every source in parallel and return the union of items."""
        items: list[RawItem] = []
        jobs: list[Any] = []

        with ThreadPoolExecutor(max_workers=8) as pool:
            for source in self.config.rss_sources:
                jobs.append(pool.submit(self._safe, self.fetch_rss, source))
            jobs.append(pool.submit(self._safe, self.fetch_calendar))

            for job in as_completed(jobs):
                items.extend(job.result())

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self.config.lookback_minutes)
        fresh = [i for i in items if i.published_at is None or i.published_at >= cutoff]
        log.info("ingestion: %d items fetched, %d within lookback window", len(items), len(fresh))
        return fresh

    @staticmethod
    def _safe(fn: Any, *args: Any) -> list[RawItem]:
        try:
            return fn(*args)
        except Exception as exc:  # a broken source is not a broken run
            log.warning("ingestion: %s failed: %s", getattr(fn, "__name__", fn), exc)
            return []

    # ------------------------------------------------------------------
    def fetch_rss(self, source: RSSSource) -> list[RawItem]:
        resp = self.session.get(source.url, timeout=self.config.http_timeout)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)

        items: list[RawItem] = []
        for entry in parsed.entries:
            published = _entry_time(entry)
            items.append(
                RawItem(
                    source=source.name,
                    source_tier=source.tier,
                    title=(entry.get("title") or "").strip(),
                    body=(entry.get("summary") or entry.get("description") or "").strip(),
                    url=(entry.get("link") or "").strip(),
                    published_at=published,
                )
            )
        log.debug("ingestion: %s -> %d entries", source.name, len(items))
        return items

    # ------------------------------------------------------------------
    def fetch_calendar(self) -> list[RawItem]:
        """The economic calendar, which carries actual/forecast/previous."""
        resp = self.session.get(self.config.calendar_url, timeout=self.config.http_timeout)
        resp.raise_for_status()
        rows = resp.json()

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=self.config.lookback_minutes)
        window_end = now + timedelta(hours=24)

        items: list[RawItem] = []
        for row in rows:
            when = _calendar_time(row.get("date"))
            if when is None or not (window_start <= when <= window_end):
                continue

            title = row.get("title", "").strip()
            country = (row.get("country") or "").strip().upper()
            impact = (row.get("impact") or "").strip()
            actual, forecast, previous = row.get("actual"), row.get("forecast"), row.get("previous")

            released = bool(str(actual or "").strip())
            label = "released" if released else "upcoming"
            body = (
                f"{country} {title} ({impact} impact, {label}). "
                f"Actual: {actual or 'n/a'}, Forecast: {forecast or 'n/a'}, "
                f"Previous: {previous or 'n/a'}."
            )

            items.append(
                RawItem(
                    source="EconomicCalendar",
                    source_tier=1,
                    title=f"{country} {title}",
                    body=body,
                    url=row.get("url", ""),
                    published_at=when,
                    payload={
                        "indicator": title,
                        "country": country,
                        "impact": impact,
                        "actual": actual,
                        "forecast": forecast,
                        "previous": previous,
                        "released": released,
                        "is_calendar": True,
                    },
                )
            )
        log.debug("ingestion: calendar -> %d entries in window", len(items))
        return items


# ----------------------------------------------------------------------
def _entry_time(entry: Any) -> datetime | None:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
    return None


def _calendar_time(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    # FairEconomy emits ISO-8601 with an offset, e.g. 2026-08-14T12:30:00-04:00
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
