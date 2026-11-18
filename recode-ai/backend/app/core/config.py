"""Central configuration. Every value can be overridden with a RECODE_* env var."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RECODE_", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    secret_key: str = "dev-secret-change-me"
    access_token_ttl_minutes: int = 60 * 24 * 7
    media_token_ttl_minutes: int = 60 * 6

    # --- persistence -------------------------------------------------------
    database_url: str = "sqlite:///./data/recode.db"
    redis_url: str | None = None

    # --- task execution ----------------------------------------------------
    # "inline": run jobs in a background thread of the API process (dev / tests)
    # "celery": dispatch to the video / ai / code / test worker queues
    task_mode: Literal["inline", "celery"] = "inline"

    # --- object storage ----------------------------------------------------
    storage_backend: Literal["local", "s3"] = "local"
    storage_root: str = "./data/storage"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "recode"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "us-east-1"

    max_upload_mb: int = 500
    cors_origins: list[str] = ["http://localhost:3000"]
    # prefix of links the API hands out (media, previews); "" = same origin behind a proxy
    public_api_url: str = "http://localhost:8000"

    # --- AI model routing (one model per role, swappable) ------------------
    # "anthropic" calls Claude; "heuristic" is the offline computer-vision
    # fallback that needs no key (used by tests and for demos without a key).
    ai_provider: Literal["anthropic", "heuristic"] = "anthropic"
    allow_offline_fallback: bool = True
    model_vision: str = "claude-opus-5-5"
    model_reasoning: str = "claude-opus-5-5"
    model_coding: str = "claude-opus-5-5"
    model_qa: str = "claude-opus-5-5"
    effort_vision: str = "high"
    effort_reasoning: str = "high"
    effort_coding: str = "high"
    effort_qa: str = "medium"
    anthropic_server_fallback: bool = True

    # --- video intelligence ------------------------------------------------
    analysis_fps: float = 5.0
    analysis_width: int = 320
    max_keyframes: int = 24
    stitch_max_width: int = 1280
    max_video_seconds: int = 300

    # --- visual QA / auto-fix loop -----------------------------------------
    qa_threshold: float = 88.0
    max_fix_iterations: int = 3
    chromium_path: str | None = None
    # Chromium's own sandbox needs user namespaces, which most containers do not
    # grant; inside a locked-down, non-root worker container this is the usual
    # Playwright setup (the container is then the isolation boundary).
    chromium_no_sandbox: bool = False
    render_allowed_hosts: list[str] = [
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "cdn.jsdelivr.net",
        "unpkg.com",
        "cdnjs.cloudflare.com",
    ]

    # --- preview sandbox ---------------------------------------------------
    sandbox_mode: Literal["docker", "none"] = "none"
    sandbox_image: str = "recode-sandbox:latest"
    sandbox_cpus: float = 1.0
    sandbox_memory: str = "1g"
    sandbox_pids: int = 512
    sandbox_timeout_s: int = 300

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
