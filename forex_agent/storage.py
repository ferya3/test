"""SQLite persistence: dedup memory, event history, alert rate limiting.

One small database backs three stages that all need to remember what
happened before: DEDUP, HISTORICAL ENGINE, and ALERT ENGINE.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS seen_items (
    fingerprint   TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL,
    source        TEXT NOT NULL,
    title         TEXT NOT NULL,
    title_tokens  TEXT NOT NULL,
    published_at  TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seen_published ON seen_items(published_at);

CREATE TABLE IF NOT EXISTS event_history (
    event_id     TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    indicator    TEXT,
    currencies   TEXT NOT NULL,
    surprise_z   REAL,
    published_at TEXT NOT NULL,
    payload      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_indicator ON event_history(indicator);

CREATE TABLE IF NOT EXISTS observed_moves (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id     TEXT NOT NULL,
    indicator    TEXT,
    kind         TEXT NOT NULL,
    asset        TEXT NOT NULL,
    surprise_z   REAL,
    move_pct     REAL NOT NULL,
    horizon_h    REAL NOT NULL,
    observed_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moves_lookup ON observed_moves(indicator, asset);
CREATE INDEX IF NOT EXISTS idx_moves_kind ON observed_moves(kind, asset);

CREATE TABLE IF NOT EXISTS sent_alerts (
    dedup_key  TEXT NOT NULL,
    kind       TEXT NOT NULL,
    sent_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_sent ON sent_alerts(sent_at);

CREATE TABLE IF NOT EXISTS price_snapshots (
    asset       TEXT NOT NULL,
    price       REAL NOT NULL,
    taken_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_asset ON price_snapshots(asset, taken_at);
"""


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


class Storage:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.path))
        self._conn.row_factory = sqlite3.Row
        with closing(self._conn.cursor()) as cur:
            cur.executescript(SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> "Storage":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # DEDUP support
    # ------------------------------------------------------------------
    def has_fingerprint(self, fingerprint: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM seen_items WHERE fingerprint = ?", (fingerprint,)
        ).fetchone()
        return row is not None

    def recent_titles(self, hours: int) -> list[sqlite3.Row]:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(hours=hours))
        return list(
            self._conn.execute(
                "SELECT fingerprint, event_id, source, title, title_tokens, published_at "
                "FROM seen_items WHERE published_at >= ? ORDER BY published_at DESC",
                (cutoff,),
            )
        )

    def remember_item(
        self,
        fingerprint: str,
        event_id: str,
        source: str,
        title: str,
        tokens: Iterable[str],
        published_at: datetime,
    ) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO seen_items "
            "(fingerprint, event_id, source, title, title_tokens, published_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                fingerprint,
                event_id,
                source,
                title,
                " ".join(sorted(tokens)),
                _iso(published_at),
                _iso(datetime.now(timezone.utc)),
            ),
        )
        self._conn.commit()

    # ------------------------------------------------------------------
    # HISTORICAL ENGINE support
    # ------------------------------------------------------------------
    def record_event(
        self,
        event_id: str,
        kind: str,
        indicator: str | None,
        currencies: list[str],
        surprise_z: float | None,
        published_at: datetime,
        payload: dict[str, Any],
    ) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO event_history "
            "(event_id, kind, indicator, currencies, surprise_z, published_at, payload) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                event_id,
                kind,
                indicator,
                ",".join(currencies),
                surprise_z,
                _iso(published_at),
                json.dumps(payload, ensure_ascii=False, default=str),
            ),
        )
        self._conn.commit()

    def record_move(
        self,
        event_id: str,
        indicator: str | None,
        kind: str,
        asset: str,
        surprise_z: float | None,
        move_pct: float,
        horizon_h: float,
        observed_at: datetime | None = None,
    ) -> None:
        self._conn.execute(
            "INSERT INTO observed_moves "
            "(event_id, indicator, kind, asset, surprise_z, move_pct, horizon_h, observed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                event_id,
                indicator,
                kind,
                asset,
                surprise_z,
                move_pct,
                horizon_h,
                _iso(observed_at or datetime.now(timezone.utc)),
            ),
        )
        self._conn.commit()

    def moves_for_indicator(self, indicator: str, asset: str, limit: int = 40) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT move_pct, surprise_z, horizon_h FROM observed_moves "
                "WHERE indicator = ? AND asset = ? ORDER BY observed_at DESC LIMIT ?",
                (indicator, asset, limit),
            )
        )

    def moves_for_kind(self, kind: str, asset: str, limit: int = 60) -> list[sqlite3.Row]:
        return list(
            self._conn.execute(
                "SELECT move_pct, surprise_z, horizon_h FROM observed_moves "
                "WHERE kind = ? AND asset = ? ORDER BY observed_at DESC LIMIT ?",
                (kind, asset, limit),
            )
        )

    def events_awaiting_outcome(self, min_age_hours: float, max_age_hours: float) -> list[sqlite3.Row]:
        """Events old enough to measure, but not so old the price is gone."""
        now = datetime.now(timezone.utc)
        newest = _iso(now - timedelta(hours=min_age_hours))
        oldest = _iso(now - timedelta(hours=max_age_hours))
        return list(
            self._conn.execute(
                "SELECT e.* FROM event_history e "
                "WHERE e.published_at BETWEEN ? AND ? "
                "AND NOT EXISTS (SELECT 1 FROM observed_moves m WHERE m.event_id = e.event_id) "
                "ORDER BY e.published_at DESC",
                (oldest, newest),
            )
        )

    # ------------------------------------------------------------------
    # MARKET DATA support
    # ------------------------------------------------------------------
    def save_price(self, asset: str, price: float, taken_at: datetime | None = None) -> None:
        self._conn.execute(
            "INSERT INTO price_snapshots (asset, price, taken_at) VALUES (?, ?, ?)",
            (asset, price, _iso(taken_at or datetime.now(timezone.utc))),
        )
        self._conn.commit()

    def price_near(self, asset: str, when: datetime, tolerance_hours: float = 3.0) -> float | None:
        lo = _iso(when - timedelta(hours=tolerance_hours))
        hi = _iso(when + timedelta(hours=tolerance_hours))
        row = self._conn.execute(
            "SELECT price FROM price_snapshots WHERE asset = ? AND taken_at BETWEEN ? AND ? "
            "ORDER BY ABS(JULIANDAY(taken_at) - JULIANDAY(?)) LIMIT 1",
            (asset, lo, hi, _iso(when)),
        ).fetchone()
        return float(row["price"]) if row else None

    # ------------------------------------------------------------------
    # ALERT ENGINE support
    # ------------------------------------------------------------------
    def alert_sent_recently(self, dedup_key: str, minutes: int) -> bool:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(minutes=minutes))
        row = self._conn.execute(
            "SELECT 1 FROM sent_alerts WHERE dedup_key = ? AND sent_at >= ?",
            (dedup_key, cutoff),
        ).fetchone()
        return row is not None

    def alerts_in_last_hour(self) -> int:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(hours=1))
        row = self._conn.execute(
            "SELECT COUNT(*) AS n FROM sent_alerts WHERE sent_at >= ?", (cutoff,)
        ).fetchone()
        return int(row["n"])

    def mark_alert_sent(self, dedup_key: str, kind: str) -> None:
        self._conn.execute(
            "INSERT INTO sent_alerts (dedup_key, kind, sent_at) VALUES (?, ?, ?)",
            (dedup_key, kind, _iso(datetime.now(timezone.utc))),
        )
        self._conn.commit()

    def prune(self, days: int = 120) -> None:
        cutoff = _iso(datetime.now(timezone.utc) - timedelta(days=days))
        for table, column in (
            ("seen_items", "published_at"),
            ("sent_alerts", "sent_at"),
            ("price_snapshots", "taken_at"),
        ):
            self._conn.execute(f"DELETE FROM {table} WHERE {column} < ?", (cutoff,))
        self._conn.commit()
