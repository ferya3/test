"""منابع داده: فایل CSV، صرافی (اختیاری با ccxt)، یا بازار مصنوعی برای تست."""

import numpy as np
import pandas as pd

REQUIRED = ["open", "high", "low", "close"]

# رژیم‌های بازار مصنوعی: (میانگین بازده روزانه، نوسان، حداقل طول، حداکثر طول)
REGIMES = {
    "bull": (0.0015, 0.015, 40, 120),
    "bear": (-0.0015, 0.020, 30, 100),
    "sideways": (0.0, 0.010, 30, 90),
    "crash": (-0.012, 0.045, 5, 15),
    "euphoria": (0.005, 0.025, 10, 30),
}


def synthetic_market(bars: int = 1000, seed: int = 7, start_price: float = 100.0) -> pd.DataFrame:
    """بازاری ساختگی با فازهای صعودی، نزولی، رِنج، سقوط و حباب — برای آزمودن احساسات ربات."""
    rng = np.random.default_rng(seed)
    names = list(REGIMES)
    probs = np.array([0.3, 0.2, 0.3, 0.08, 0.12])
    mus, sigmas = [], []
    while len(mus) < bars:
        mu, sigma, lo, hi = REGIMES[names[rng.choice(len(names), p=probs)]]
        n = int(rng.integers(lo, hi + 1))
        mus += [mu] * n
        sigmas += [sigma] * n
    mus, sigmas = np.array(mus[:bars]), np.array(sigmas[:bars])

    log_ret = rng.normal(mus, sigmas)
    close = start_price * np.exp(np.cumsum(log_ret))
    prev = np.concatenate([[start_price], close[:-1]])
    open_ = prev * (1 + rng.normal(0, sigmas * 0.2))
    wick = np.abs(rng.normal(0, sigmas * 0.6, (2, bars)))
    high = np.maximum(open_, close) * (1 + wick[0])
    low = np.minimum(open_, close) * (1 - wick[1])
    volume = 1_000 * (1 + 3 * np.abs(log_ret) / sigmas) * rng.lognormal(0, 0.3, bars)

    idx = pd.date_range("2022-01-01", periods=bars, freq="D", name="time")
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume}, index=idx)


def load_csv(path: str) -> pd.DataFrame:
    """CSV با ستون‌های time/date/timestamp و open, high, low, close (و volume اختیاری)."""
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    time_col = next((c for c in ("time", "date", "datetime", "timestamp") if c in df.columns), None)
    if time_col:
        col = df[time_col]
        unit = "ms" if np.issubdtype(col.dtype, np.number) and col.max() > 1e11 else None
        df[time_col] = pd.to_datetime(col, unit=unit) if unit else pd.to_datetime(col)
        df = df.set_index(time_col).rename_axis("time")
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"ستون‌های لازم در CSV نیست: {missing}")
    return df.sort_index()


def fetch_exchange(exchange: str, symbol: str, timeframe: str = "1d", limit: int = 1000) -> pd.DataFrame:
    """دریافت کندل‌های عمومی از صرافی (نیاز به کلید API ندارد). نیازمند: pip install ccxt"""
    try:
        import ccxt
    except ImportError as e:
        raise SystemExit("برای داده‌ی زنده‌ی صرافی ابتدا نصب کنید:  pip install ccxt") from e
    client = getattr(ccxt, exchange)()
    rows = client.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume"])
    df["time"] = pd.to_datetime(df["time"], unit="ms")
    return df.set_index("time")


PERIODS_PER_YEAR = {"1m": 525_600, "5m": 105_120, "15m": 35_040, "1h": 8_760,
                    "4h": 2_190, "1d": 365, "1w": 52}
