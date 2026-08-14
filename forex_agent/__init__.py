"""Forex news analysis agent: ingest, analyse, score, and publish."""

from .config import Config
from .pipeline import Pipeline, RunResult
from .storage import Storage

__all__ = ["Config", "Pipeline", "RunResult", "Storage"]
__version__ = "1.0.0"
