from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.providers.base import PRICING
from app.ai.router import ModelRouter
from app.api.deps import current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.models import User
from app.preview.sandbox import DockerSandbox
from app.services.credentials import user_providers

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/meta")
def meta(user: User = Depends(current_user), db: Session = Depends(get_db)):
    settings = get_settings()
    providers, preferred = user_providers(db, user, settings)
    router_ = ModelRouter(
        settings, providers=providers, user_defaults=(user.settings or {}).get("models"), preferred_provider=preferred
    )
    anthropic = providers.get("anthropic")
    openai = providers.get("openai")
    return {
        "roles": router_.describe(),
        "providers": {
            "anthropic": {
                "available": bool(anthropic and anthropic.available()),
                "own_key": bool(anthropic and getattr(anthropic, "api_key", None)),
                "models": sorted(PRICING),
            },
            "openai": {
                "available": bool(openai and openai.available()),
                "own_key": bool(openai),
                "models": [openai.default_model] if openai and openai.default_model else [],
            },
            "heuristic": {"available": True, "models": ["computer-vision"]},
        },
        "preferred_provider": preferred,
        "server_key_allowed": settings.allow_server_key,
        "efforts": ["low", "medium", "high", "xhigh", "max"],
        "frameworks": ["html", "react-vite"],
        "sandbox": {"mode": settings.sandbox_mode, "available": DockerSandbox(settings).available()},
        "defaults": {
            "qa_threshold": settings.qa_threshold,
            "max_fix_iterations": settings.max_fix_iterations,
            "max_upload_mb": settings.max_upload_mb,
            "max_video_seconds": settings.max_video_seconds,
        },
    }
