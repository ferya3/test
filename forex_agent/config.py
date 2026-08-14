"""Runtime configuration, read from environment with sane defaults.

Everything the agent needs to run lives here so the pipeline stages stay
free of environment lookups.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except ValueError:
        return default


def load_dotenv(path: str | Path = ".env") -> None:
    """Minimal .env loader so we don't take a dependency for four lines."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


@dataclass(frozen=True)
class RSSSource:
    name: str
    url: str
    tier: int = 2


# Free, key-less feeds. Tier drives source reliability in the confidence engine.
DEFAULT_RSS_SOURCES: tuple[RSSSource, ...] = (
    RSSSource("ForexLive", "https://www.forexlive.com/feed/news", tier=1),
    RSSSource("ForexLive-CB", "https://www.forexlive.com/feed/centralbank", tier=1),
    RSSSource("FXStreet", "https://www.fxstreet.com/rss/news", tier=2),
    RSSSource("Investing-Economy", "https://www.investing.com/rss/news_14.rss", tier=2),
    RSSSource("Investing-Forex", "https://www.investing.com/rss/news_1.rss", tier=2),
    RSSSource("DailyFX", "https://www.dailyfx.com/feeds/market-news", tier=2),
    RSSSource("Reuters-Business", "https://feeds.reuters.com/reuters/businessNews", tier=1),
    RSSSource("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories", tier=2),
)

# Forex Factory's weekly calendar, mirrored as key-less JSON by FairEconomy.
CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Assets the agent reports on. Keys are our canonical names; the market data
# engine maps them onto whatever tickers a given provider uses.
TRACKED_ASSETS: tuple[str, ...] = ("XAUUSD", "DXY", "EURUSD", "GBPUSD", "USDJPY", "WTI")


@dataclass
class Config:
    # --- credentials -------------------------------------------------
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    telegram_bot_token: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_TOKEN", ""))
    telegram_chat_id: str = field(default_factory=lambda: os.getenv("TELEGRAM_CHAT_ID", ""))

    # --- model -------------------------------------------------------
    model: str = field(default_factory=lambda: os.getenv("FOREX_MODEL", "claude-sonnet-5"))
    max_events_per_batch: int = field(default_factory=lambda: _env_int("FOREX_BATCH_SIZE", 8))

    # --- storage -----------------------------------------------------
    db_path: str = field(default_factory=lambda: os.getenv("FOREX_DB", "data/forex_agent.db"))
    dashboard_path: str = field(
        default_factory=lambda: os.getenv("FOREX_DASHBOARD", "data/dashboard.json")
    )

    # --- ingestion ---------------------------------------------------
    rss_sources: tuple[RSSSource, ...] = DEFAULT_RSS_SOURCES
    calendar_url: str = CALENDAR_URL
    lookback_minutes: int = field(default_factory=lambda: _env_int("FOREX_LOOKBACK_MIN", 90))
    http_timeout: float = field(default_factory=lambda: _env_float("FOREX_HTTP_TIMEOUT", 15.0))

    # --- dedup -------------------------------------------------------
    dedup_window_hours: int = field(default_factory=lambda: _env_int("FOREX_DEDUP_HOURS", 12))
    dedup_similarity: float = field(default_factory=lambda: _env_float("FOREX_DEDUP_SIM", 0.72))

    # --- impact blending ---------------------------------------------
    # Weight given to the model's estimate vs. the historical prior. They are
    # renormalised when a prior is missing, so this is a ratio, not a rule.
    ai_weight: float = field(default_factory=lambda: _env_float("FOREX_AI_WEIGHT", 0.6))
    historical_weight: float = field(default_factory=lambda: _env_float("FOREX_HIST_WEIGHT", 0.4))
    max_impact_pct: float = field(default_factory=lambda: _env_float("FOREX_MAX_IMPACT", 8.0))

    # --- alerting ----------------------------------------------------
    instant_min_importance: str = field(
        default_factory=lambda: os.getenv("FOREX_INSTANT_IMPORTANCE", "high")
    )
    instant_min_confidence: float = field(
        default_factory=lambda: _env_float("FOREX_INSTANT_CONFIDENCE", 55.0)
    )
    instant_min_impact_pct: float = field(
        default_factory=lambda: _env_float("FOREX_INSTANT_IMPACT", 0.35)
    )
    digest_max_events: int = field(default_factory=lambda: _env_int("FOREX_DIGEST_MAX", 12))
    alert_cooldown_minutes: int = field(default_factory=lambda: _env_int("FOREX_COOLDOWN_MIN", 45))
    max_alerts_per_hour: int = field(default_factory=lambda: _env_int("FOREX_MAX_ALERTS_HR", 12))

    # --- scheduling --------------------------------------------------
    poll_interval_minutes: int = field(default_factory=lambda: _env_int("FOREX_POLL_MIN", 15))

    # --- behaviour flags ---------------------------------------------
    dry_run: bool = field(default_factory=lambda: _env_bool("FOREX_DRY_RUN", False))
    language: str = field(default_factory=lambda: os.getenv("FOREX_LANG", "fa"))
    tracked_assets: tuple[str, ...] = TRACKED_ASSETS

    def validate(self) -> list[str]:
        """Return human-readable problems that would stop a live run."""
        problems: list[str] = []
        if not self.anthropic_api_key:
            problems.append("ANTHROPIC_API_KEY is not set - AI analysis will be skipped.")
        if not self.dry_run:
            if not self.telegram_bot_token:
                problems.append("TELEGRAM_BOT_TOKEN is not set - cannot deliver alerts.")
            if not self.telegram_chat_id:
                problems.append("TELEGRAM_CHAT_ID is not set - cannot deliver alerts.")
        return problems

    @classmethod
    def load(cls, dotenv: str | Path = ".env") -> "Config":
        load_dotenv(dotenv)
        return cls()
