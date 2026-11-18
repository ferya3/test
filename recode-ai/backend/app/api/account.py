"""The user's own model-provider keys (bring your own key) and account defaults."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers.base import ProviderError
from app.api.deps import current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.core.secrets import encrypt, mask
from app.models import ProviderCredential, User
from app.schemas.api import RoleModel
from app.services.credentials import UnsafeEndpoint, build_provider, check_endpoint

router = APIRouter(prefix="/api/account", tags=["account"])
Provider = Literal["anthropic", "openai"]


class ProviderIn(BaseModel):
    api_key: str | None = Field(default=None, max_length=500)  # None keeps the stored key
    base_url: str | None = Field(default=None, max_length=500)
    model: str | None = Field(default=None, max_length=200)


class ProviderOut(BaseModel):
    provider: str
    configured: bool
    key_hint: str | None = None
    base_url: str | None = None
    model: str | None = None
    last_check: dict = Field(default_factory=dict)
    updated_at: datetime | None = None


class AccountSettings(BaseModel):
    preferred_provider: Provider | None = None
    models: dict[Literal["vision", "reasoning", "coding", "qa"], RoleModel] = Field(default_factory=dict)


def _out(provider: str, cred: ProviderCredential | None) -> ProviderOut:
    if cred is None:
        return ProviderOut(provider=provider, configured=False)
    return ProviderOut(
        provider=provider,
        configured=True,
        key_hint=cred.key_hint or None,
        base_url=cred.base_url,
        model=cred.model,
        last_check=cred.last_check or {},
        updated_at=cred.updated_at,
    )


def _get(db: Session, user: User, provider: str) -> ProviderCredential | None:
    return db.scalar(
        select(ProviderCredential).where(ProviderCredential.user_id == user.id, ProviderCredential.provider == provider)
    )


@router.get("/providers", response_model=list[ProviderOut])
def list_providers(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [_out(p, _get(db, user, p)) for p in ("anthropic", "openai")]


@router.put("/providers/{provider}", response_model=ProviderOut)
def save_provider(
    provider: Provider, body: ProviderIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    settings = get_settings()
    cred = _get(db, user, provider)
    key = (body.api_key or "").strip() or None
    if cred is None and not key and provider == "anthropic":
        raise HTTPException(422, "Enter an API key")
    base_url = None
    if body.base_url and body.base_url.strip():
        try:
            base_url = check_endpoint(body.base_url, settings)
        except UnsafeEndpoint as e:
            raise HTTPException(422, str(e)) from e
    if provider == "openai":
        if not base_url:
            raise HTTPException(422, "Enter the base URL of the OpenAI-compatible endpoint")
        if not (body.model or (cred and cred.model)):
            raise HTTPException(422, "Enter the model to use (e.g. gpt-4o or google/gemini-2.5-pro)")
    if cred is None:
        cred = ProviderCredential(user_id=user.id, provider=provider)
        db.add(cred)
    if key:
        cred.api_key_encrypted = encrypt(key)
        cred.key_hint = mask(key) or ""
    cred.base_url = base_url
    if body.model is not None:
        cred.model = body.model.strip() or None
    cred.last_check = {}
    db.commit()
    return _out(provider, cred)


@router.delete("/providers/{provider}", status_code=204)
def delete_provider(provider: Provider, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cred = _get(db, user, provider)
    if cred is not None:
        db.delete(cred)
        db.commit()


@router.post("/providers/{provider}/test")
def test_provider(provider: Provider, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Checks the stored key against the provider with a cheap call (listing models)."""
    cred = _get(db, user, provider)
    if cred is None:
        raise HTTPException(404, "No key saved for this provider")
    client = build_provider(cred, get_settings())
    if client is None:
        raise HTTPException(422, "The saved settings are incomplete or the endpoint is not allowed")
    try:
        models = client.list_models()  # type: ignore[attr-defined]
        result = {"ok": True, "message": f"Connected. {len(models)} model(s) available.", "models": models[:200]}
    except ProviderError as e:
        result = {"ok": False, "message": str(e), "models": []}
    except Exception as e:  # network surprises are a failed check, not a server error
        result = {"ok": False, "message": f"Check failed: {e.__class__.__name__}", "models": []}
    if result["ok"] and provider == "openai" and cred.model and result["models"] and cred.model not in result["models"]:
        result["message"] += f" Note: '{cred.model}' is not in the endpoint's model list."
    cred.last_check = {"ok": result["ok"], "message": result["message"], "at": datetime.now(UTC).isoformat()}
    db.commit()
    return result


@router.get("/settings", response_model=AccountSettings)
def get_account_settings(user: User = Depends(current_user)):
    return AccountSettings.model_validate(
        {k: v for k, v in (user.settings or {}).items() if k in ("preferred_provider", "models")}
    )


@router.put("/settings", response_model=AccountSettings)
def save_account_settings(body: AccountSettings, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.settings = {**(user.settings or {}), **body.model_dump(exclude_none=True)}
    db.commit()
    return body
