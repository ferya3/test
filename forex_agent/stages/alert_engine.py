"""ALERT ENGINE - decide what gets sent, and render it.

Routing has three gates: importance, confidence, and expected impact. An
event clearing all three is sent immediately; everything else waits for the
digest. Rate limiting and per-event cooldowns are enforced here so a noisy
news cycle cannot flood the channel.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..config import Config
from ..models import Alert, Direction, Importance, ScoredEvent
from ..storage import Storage

log = logging.getLogger(__name__)

IMPORTANCE_EMOJI = {
    Importance.CRITICAL: "🚨",
    Importance.HIGH: "🔴",
    Importance.MEDIUM: "🟠",
    Importance.LOW: "🟡",
}

IMPORTANCE_FA = {
    Importance.CRITICAL: "بحرانی",
    Importance.HIGH: "بالا",
    Importance.MEDIUM: "متوسط",
    Importance.LOW: "پایین",
}

DIRECTION_FA = {
    Direction.BULLISH: ("صعودی", "📈"),
    Direction.BEARISH: ("نزولی", "📉"),
    Direction.NEUTRAL: ("خنثی", "➖"),
}

ASSET_FA = {
    "XAUUSD": "طلا",
    "DXY": "شاخص دلار",
    "EURUSD": "یورو/دلار",
    "GBPUSD": "پوند/دلار",
    "USDJPY": "دلار/ین",
    "WTI": "نفت",
}


class AlertEngine:
    def __init__(self, config: Config, storage: Storage):
        self.config = config
        self.storage = storage
        self.min_importance = _importance(config.instant_min_importance)

    # ------------------------------------------------------------------
    def route(self, scored: list[ScoredEvent]) -> tuple[list[Alert], list[ScoredEvent]]:
        """Split scored events into instant alerts and digest material."""
        instant: list[Alert] = []
        digest_pool: list[ScoredEvent] = []
        budget = max(0, self.config.max_alerts_per_hour - self.storage.alerts_in_last_hour())

        for event in scored:
            if not self._qualifies(event):
                digest_pool.append(event)
                continue

            key = f"instant:{event.event.event_id}"
            if self.storage.alert_sent_recently(key, self.config.alert_cooldown_minutes):
                log.debug("alert: %s suppressed by cooldown", event.event.event_id)
                continue

            if budget <= 0:
                log.info("alert: hourly budget spent, deferring %s", event.event.event_id)
                digest_pool.append(event)
                continue

            instant.append(
                Alert(
                    kind="instant",
                    text=render_instant(event),
                    events=[event],
                    dedup_key=key,
                )
            )
            budget -= 1

        log.info("alert: %d instant, %d held for digest", len(instant), len(digest_pool))
        return instant, digest_pool

    def _qualifies(self, event: ScoredEvent) -> bool:
        return (
            event.importance.rank >= self.min_importance.rank
            and event.confidence >= self.config.instant_min_confidence
            and event.peak_impact_pct >= self.config.instant_min_impact_pct
        )

    # ------------------------------------------------------------------
    def build_digest(self, events: list[ScoredEvent], title: str = "خلاصه بازار") -> Alert | None:
        if not events:
            return None
        selected = events[: self.config.digest_max_events]
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        return Alert(
            kind="digest",
            text=render_digest(selected, title=title, stamp=stamp),
            events=selected,
            dedup_key=f"digest:{stamp}",
        )

    def mark_sent(self, alert: Alert) -> None:
        self.storage.mark_alert_sent(alert.dedup_key, alert.kind)


# ----------------------------------------------------------------------
# Rendering (Telegram HTML parse mode)
# ----------------------------------------------------------------------
def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def asset_label(asset: str) -> str:
    fa = ASSET_FA.get(asset)
    return f"{fa} ({asset})" if fa else asset


def render_asset_line(view) -> str:
    word, arrow = DIRECTION_FA[view.direction]
    line = f"{arrow} <b>{asset_label(view.asset)}</b>: {word} — تأثیر ≈ {view.impact_pct:.2f}٪"
    if view.rationale:
        line += f"\n   <i>{escape(view.rationale)}</i>"
    return line


def render_instant(event: ScoredEvent) -> str:
    analysis = event.analyzed
    emoji = IMPORTANCE_EMOJI[event.importance]
    stamp = event.event.published_at.strftime("%H:%M UTC")

    lines = [
        f"{emoji} <b>خبر فوری فارکس</b> | اهمیت: {IMPORTANCE_FA[event.importance]}",
        "",
        f"<b>{escape(event.event.title)}</b>",
    ]

    summary = analysis.summary_fa or analysis.summary_en
    if summary and summary.strip() != event.event.title.strip():
        lines += ["", escape(summary)]

    if event.event.macro and event.event.macro.has_result:
        macro = event.event.macro
        unit = macro.unit
        lines += [
            "",
            "📊 <b>ارقام منتشرشده</b>",
            f"   واقعی: {macro.actual}{unit} | پیش‌بینی: {macro.forecast}{unit}"
            + (f" | قبلی: {macro.previous}{unit}" if macro.previous is not None else ""),
        ]
        if macro.surprise_z is not None:
            lines.append(f"   انحراف از انتظار: {macro.surprise_z:+.2f}σ")

    if analysis.assets:
        lines += ["", "💹 <b>تأثیر بر بازارها</b>"]
        lines += [render_asset_line(v) for v in analysis.assets]

    lines += [
        "",
        f"🎯 اطمینان تحلیل: <b>{event.confidence:.0f}٪</b>"
        + (f" | نمونه تاریخی: {event.historical_sample}" if event.historical_sample else ""),
        f"🕒 {stamp} | منبع: {escape(event.event.source)}"
        + (f" (+{len(event.event.corroborating_sources)} منبع دیگر)"
           if event.event.corroborating_sources else ""),
    ]

    if event.event.url:
        lines.append(f'🔗 <a href="{escape(event.event.url)}">مشاهده خبر</a>')

    return "\n".join(lines)


def render_digest(events: list[ScoredEvent], title: str, stamp: str) -> str:
    lines = [f"📋 <b>{title}</b> — {stamp} UTC", ""]

    for i, event in enumerate(events, start=1):
        emoji = IMPORTANCE_EMOJI[event.importance]
        lines.append(f"{emoji} <b>{i}. {escape(event.event.title)}</b>")

        summary = event.analyzed.summary_fa or event.analyzed.summary_en
        # The fallback analyzer echoes the headline; printing it twice is noise.
        if summary and summary.strip() != event.event.title.strip():
            lines.append(f"   {escape(summary)}")

        top_views = [v for v in event.analyzed.assets if v.direction is not Direction.NEUTRAL][:3]
        if top_views:
            pieces = []
            for view in top_views:
                _, arrow = DIRECTION_FA[view.direction]
                pieces.append(f"{arrow} {asset_label(view.asset)} {view.impact_pct:.2f}٪")
            lines.append("   " + " • ".join(pieces))

        lines.append(f"   <i>اطمینان {event.confidence:.0f}٪ | {escape(event.event.source)}</i>")
        lines.append("")

    lines.append(_net_bias_line(events))
    return "\n".join(lines)


def _net_bias_line(events: list[ScoredEvent]) -> str:
    """Aggregate signed impact per asset to give the session's net lean."""
    totals: dict[str, float] = {}
    for event in events:
        weight = event.confidence / 100.0
        for view in event.analyzed.assets:
            totals[view.asset] = totals.get(view.asset, 0.0) + view.signed_impact_pct * weight

    ranked = sorted(totals.items(), key=lambda kv: abs(kv[1]), reverse=True)[:4]
    if not ranked:
        return "⚖️ <b>جمع‌بندی</b>: سیگنال قابل‌توجهی ثبت نشد."

    pieces = []
    for asset, net in ranked:
        arrow = "📈" if net > 0.02 else "📉" if net < -0.02 else "➖"
        pieces.append(f"{arrow} {asset_label(asset)} {net:+.2f}٪")
    return "⚖️ <b>جمع‌بندی خالص</b>: " + " | ".join(pieces)


def _importance(value: str) -> Importance:
    try:
        return Importance(value.lower().strip())
    except ValueError:
        return Importance.HIGH
