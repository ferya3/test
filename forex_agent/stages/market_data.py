"""MARKET DATA ENGINE - live prices and the current volatility regime.

The impact engine needs to know whether a 0.5% move is large or ordinary
right now, so this stage fetches recent daily candles per asset and derives
realised volatility plus a regime multiplier. Prices come from Stooq's
key-less CSV endpoint, with Yahoo's chart JSON as a fallback.

Every asset is fetched independently and a failure degrades to "no context"
rather than stopping the run.
"""

from __future__ import annotations

import csv
import io
import logging
import statistics
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

from ..config import Config
from ..storage import Storage

log = logging.getLogger(__name__)

# Canonical asset -> provider symbols.
STOOQ_SYMBOLS: dict[str, str] = {
    "XAUUSD": "xauusd",
    "DXY": "dx.f",
    "EURUSD": "eurusd",
    "GBPUSD": "gbpusd",
    "USDJPY": "usdjpy",
    "WTI": "cl.f",
}
YAHOO_SYMBOLS: dict[str, str] = {
    "XAUUSD": "GC=F",
    "DXY": "DX-Y.NYB",
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "JPY=X",
    "WTI": "CL=F",
}

# Long-run daily volatility per asset, in percent. Used as the baseline the
# current regime is measured against.
BASELINE_VOL_PCT: dict[str, float] = {
    "XAUUSD": 0.85,
    "DXY": 0.35,
    "EURUSD": 0.45,
    "GBPUSD": 0.50,
    "USDJPY": 0.50,
    "WTI": 1.80,
}
DEFAULT_BASELINE_VOL = 0.60


@dataclass
class AssetQuote:
    asset: str
    price: float | None = None
    change_pct_1d: float | None = None
    realized_vol_pct: float | None = None
    regime: str = "unknown"          # "calm" | "normal" | "volatile"
    regime_multiplier: float = 1.0   # scales expected impact
    source: str = ""
    as_of: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_live(self) -> bool:
        return self.price is not None


class MarketData:
    def __init__(self, config: Config, storage: Storage | None = None):
        self.config = config
        self.storage = storage
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "forex-news-agent/1.0"})

    # ------------------------------------------------------------------
    def snapshot(self, assets: tuple[str, ...] | None = None) -> dict[str, AssetQuote]:
        targets = assets or self.config.tracked_assets
        with ThreadPoolExecutor(max_workers=6) as pool:
            quotes = list(pool.map(self._quote, targets))

        result = {q.asset: q for q in quotes}
        live = sum(1 for q in quotes if q.is_live)
        log.info("market_data: %d/%d assets priced", live, len(targets))

        if self.storage is not None:
            for quote in quotes:
                if quote.price is not None:
                    self.storage.save_price(quote.asset, quote.price, quote.as_of)
        return result

    # ------------------------------------------------------------------
    def _quote(self, asset: str) -> AssetQuote:
        for fetch, name in ((self._from_stooq, "stooq"), (self._from_yahoo, "yahoo")):
            try:
                closes = fetch(asset)
            except Exception as exc:
                log.debug("market_data: %s via %s failed: %s", asset, name, exc)
                continue
            if len(closes) >= 2:
                return self._build(asset, closes, source=name)
        log.warning("market_data: no price for %s", asset)
        return AssetQuote(asset=asset)

    def _build(self, asset: str, closes: list[float], source: str) -> AssetQuote:
        price = closes[-1]
        change = (closes[-1] / closes[-2] - 1.0) * 100.0 if closes[-2] else None

        returns = [
            (closes[i] / closes[i - 1] - 1.0) * 100.0
            for i in range(1, len(closes))
            if closes[i - 1]
        ]
        vol = statistics.pstdev(returns[-20:]) if len(returns) >= 5 else None

        baseline = BASELINE_VOL_PCT.get(asset, DEFAULT_BASELINE_VOL)
        regime, multiplier = _regime(vol, baseline)

        return AssetQuote(
            asset=asset,
            price=price,
            change_pct_1d=change,
            realized_vol_pct=vol,
            regime=regime,
            regime_multiplier=multiplier,
            source=source,
        )

    # ------------------------------------------------------------------
    def _from_stooq(self, asset: str) -> list[float]:
        symbol = STOOQ_SYMBOLS.get(asset)
        if not symbol:
            return []
        url = f"https://stooq.com/q/d/l/?s={symbol}&i=d"
        resp = self.session.get(url, timeout=self.config.http_timeout)
        resp.raise_for_status()

        rows = list(csv.DictReader(io.StringIO(resp.text)))
        closes = [float(r["Close"]) for r in rows[-40:] if r.get("Close") not in (None, "", "N/D")]
        return closes

    def _from_yahoo(self, asset: str) -> list[float]:
        symbol = YAHOO_SYMBOLS.get(asset)
        if not symbol:
            return []
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            "?range=2mo&interval=1d"
        )
        resp = self.session.get(url, timeout=self.config.http_timeout)
        resp.raise_for_status()

        result = resp.json()["chart"]["result"][0]
        raw = result["indicators"]["quote"][0]["close"]
        return [float(c) for c in raw if c is not None][-40:]


# ----------------------------------------------------------------------
def _regime(vol: float | None, baseline: float) -> tuple[str, float]:
    """Classify the volatility regime and how much it scales expected moves."""
    if vol is None or baseline <= 0:
        return "unknown", 1.0

    ratio = vol / baseline
    if ratio < 0.7:
        # Quiet tape: the same headline moves price less.
        return "calm", max(0.7, ratio)
    if ratio > 1.4:
        # Jumpy tape: the same headline moves price more.
        return "volatile", min(1.6, ratio)
    return "normal", 1.0
