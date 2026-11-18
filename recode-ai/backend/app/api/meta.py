from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.providers.base import PRICING
from app.ai.router import ModelRouter
from app.api.deps import current_user
from app.core.config import get_settings
from app.models import User
from app.preview.sandbox import DockerSandbox

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/meta")
def meta(_: User = Depends(current_user)):
    settings = get_settings()
    router_ = ModelRouter(settings)
    return {
        "roles": router_.describe(),
        "providers": {
            "anthropic": {"available": router_.providers["anthropic"].available(), "models": sorted(PRICING)},
            "heuristic": {"available": True, "models": ["computer-vision"]},
        },
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
