"""Database schema (multi-user from day one).

users · projects · project_assets · video_frames · design_specs · components ·
ai_tasks · code_files · project_versions · test_results · conversations ·
model_usage
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    settings: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)

    projects: Mapped[list[Project]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class ProviderCredential(TimestampMixin, Base):
    """A user's own key for a model provider (bring your own key). The key is encrypted."""

    __tablename__ = "provider_credentials"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(30))  # anthropic | openai
    api_key_encrypted: Mapped[str] = mapped_column(Text, default="")
    key_hint: Mapped[str] = mapped_column(String(40), default="")  # masked, for display
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)  # default model (openai)
    last_check: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # {ok, message, at}
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    # video | screenshot | url | prompt
    source_type: Mapped[str] = mapped_column(String(20), default="video")
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # html | react-vite
    framework: Mapped[str] = mapped_column(String(30), default="html")
    # draft | processing | analyzing | generating | testing | ready | failed
    status: Mapped[str] = mapped_column(String(20), default="draft")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped[User] = relationship(back_populates="projects")
    assets: Mapped[list[ProjectAsset]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectAsset(TimestampMixin, Base):
    __tablename__ = "project_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # video | image
    filename: Mapped[str] = mapped_column(String(500))
    storage_key: Mapped[str] = mapped_column(String(1000))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer, default=0)
    # uploaded | processing | analyzed | failed
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # probe + video analysis

    project: Mapped[Project] = relationship(back_populates="assets")


class VideoFrame(TimestampMixin, Base):
    __tablename__ = "video_frames"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("project_assets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # keyframe | stitched
    frame_index: Mapped[int] = mapped_column(Integer, default=0)
    timestamp: Mapped[float] = mapped_column(Float, default=0.0)
    storage_key: Mapped[str] = mapped_column(String(1000))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # reasons, scene, event ids


class DesignSpecRecord(TimestampMixin, Base):
    __tablename__ = "design_specs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    spec: Mapped[dict[str, Any]] = mapped_column(JSONType)
    ui_analysis: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    source: Mapped[str] = mapped_column(String(30), default="pipeline")  # pipeline | edit | qa-fix


class Component(TimestampMixin, Base):
    __tablename__ = "components"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    spec_id: Mapped[str] = mapped_column(ForeignKey("design_specs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(50))
    props: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    source: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # frame key + bbox


class AITask(TimestampMixin, Base):
    __tablename__ = "ai_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))  # video | pipeline | edit | qa | capture
    agent: Mapped[str] = mapped_column(String(50), default="")
    # queued | running | succeeded | failed
    status: Mapped[str] = mapped_column(String(20), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    step: Mapped[str] = mapped_column(String(100), default="")
    input: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    output: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    logs: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProjectVersion(TimestampMixin, Base):
    __tablename__ = "project_versions"
    __table_args__ = (UniqueConstraint("project_id", "number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(30), default="ai")  # ai | user | qa-fix | restore
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # build key, spec id


class CodeFile(TimestampMixin, Base):
    __tablename__ = "code_files"
    __table_args__ = (UniqueConstraint("version_id", "path"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("project_versions.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    sha: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)


class TestResult(TimestampMixin, Base):
    __tablename__ = "test_results"
    __test__ = False  # not a pytest class

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("project_versions.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))  # visual | security | build
    score: Mapped[float] = mapped_column(Float, default=0.0)
    passed: Mapped[bool] = mapped_column(default=False)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    issues: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    artifacts: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)  # storage keys


class Conversation(TimestampMixin, Base):
    """One chat message in the AI workspace of a project."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)


class ModelUsage(TimestampMixin, Base):
    __tablename__ = "model_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(30))
    agent: Mapped[str] = mapped_column(String(50), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
