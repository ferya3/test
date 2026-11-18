from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: str
    email: str
    name: str


class RoleModel(BaseModel):
    provider: Literal["anthropic", "openai", "heuristic"] | None = None
    model: str | None = None
    effort: Literal["low", "medium", "high", "xhigh", "max"] | None = None


class ProjectSettings(BaseModel):
    models: dict[Literal["vision", "reasoning", "coding", "qa"], RoleModel] = Field(default_factory=dict)
    qa_threshold: float | None = Field(default=None, ge=0, le=100)
    max_fix_iterations: int | None = Field(default=None, ge=0, le=10)
    language: str | None = None
    direction: Literal["ltr", "rtl"] | None = None
    font_override: str | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    source_type: Literal["video", "screenshot", "url", "prompt"] = "video"
    source_url: str | None = None
    framework: Literal["html", "react-vite"] = "html"
    settings: ProjectSettings = Field(default_factory=ProjectSettings)

    @field_validator("source_url")
    @classmethod
    def _http_only(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("source_url must be http(s)")
        return v


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    framework: Literal["html", "react-vite"] | None = None
    settings: ProjectSettings | None = None


class ProjectOut(ORM):
    id: str
    name: str
    description: str
    source_type: str
    source_url: str | None
    framework: str
    status: str
    settings: dict[str, Any]
    current_version_id: str | None
    created_at: datetime
    updated_at: datetime
    thumbnail_url: str | None = None
    score: float | None = None


class AssetOut(ORM):
    id: str
    kind: str
    filename: str
    mime: str
    size: int
    status: str
    meta: dict[str, Any]
    created_at: datetime
    url: str | None = None


class FrameOut(ORM):
    id: str
    asset_id: str
    kind: str
    frame_index: int
    timestamp: float
    width: int
    height: int
    meta: dict[str, Any]
    url: str | None = None


class TaskOut(ORM):
    id: str
    project_id: str
    kind: str
    agent: str
    status: str
    progress: float
    step: str
    output: dict[str, Any]
    logs: list[dict[str, Any]]
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class VersionOut(ORM):
    id: str
    number: int
    parent_id: str | None
    message: str
    author: str
    score: float | None
    meta: dict[str, Any]
    created_at: datetime


class FileOut(BaseModel):
    path: str
    size: int
    sha: str
    content: str | None = None


class FilesSaveIn(BaseModel):
    files: dict[str, str]
    deleted: list[str] = Field(default_factory=list)
    message: str = "Manual edit"


class TestResultOut(ORM):
    id: str
    version_id: str
    kind: str
    score: float
    passed: bool
    metrics: dict[str, Any]
    issues: list[dict[str, Any]]
    artifacts: dict[str, Any]
    created_at: datetime


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class MessageOut(ORM):
    id: str
    role: str
    content: str
    task_id: str | None
    version_id: str | None
    meta: dict[str, Any]
    created_at: datetime


class GenerateIn(BaseModel):
    reuse_analysis: bool = True
    max_fix_iterations: int | None = Field(default=None, ge=0, le=10)


class GithubExportIn(BaseModel):
    token: str = Field(min_length=10)
    repo: str = Field(pattern=r"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$")
    branch: str = "main"
    private: bool = True
    create: bool = True
    message: str = "Export from Recode AI"
