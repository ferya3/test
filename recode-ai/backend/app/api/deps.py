from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import decode_token, media_token
from app.models import Project, User

bearer = HTTPBearer(auto_error=False)


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    payload = decode_token(creds.credentials, "access") if creds else None
    user = db.get(User, payload["sub"]) if payload else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return user


def owned_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.owner_id != user.id:  # same answer for "missing" and "not yours"
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


def media_url(storage_key: str | None) -> str | None:
    if not storage_key:
        return None
    return f"{get_settings().public_api_url}/api/media/{media_token(storage_key)}"
