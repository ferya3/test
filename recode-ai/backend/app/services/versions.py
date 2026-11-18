"""Versioned project files: every generation, fix, edit or restore is a new version."""

from __future__ import annotations

import hashlib
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CodeFile, DesignSpecRecord, Project, ProjectVersion
from app.schemas.spec import DesignSpec
from app.security.code_scan import normalize_path


def get_files(db: Session, version_id: str | None) -> dict[str, str]:
    if not version_id:
        return {}
    rows = db.scalars(select(CodeFile).where(CodeFile.version_id == version_id)).all()
    return {r.path: r.content for r in rows}


def create_version(
    db: Session,
    project: Project,
    files: dict[str, str],
    *,
    message: str,
    author: str = "ai",
    parent_id: str | None = None,
    score: float | None = None,
    meta: dict[str, Any] | None = None,
    make_current: bool = True,
) -> ProjectVersion:
    number = (
        db.scalar(select(func.max(ProjectVersion.number)).where(ProjectVersion.project_id == project.id)) or 0
    ) + 1
    version = ProjectVersion(
        project_id=project.id,
        number=number,
        parent_id=parent_id,
        message=message[:2000],
        author=author,
        score=score,
        meta=meta or {},
    )
    db.add(version)
    db.flush()
    for path, content in files.items():
        if content == "":
            continue  # deletion marker
        norm = normalize_path(path)
        data = content.encode()
        db.add(
            CodeFile(
                project_id=project.id,
                version_id=version.id,
                path=norm,
                content=content,
                sha=hashlib.sha256(data).hexdigest(),
                size=len(data),
            )
        )
    if make_current:
        project.current_version_id = version.id
    db.flush()
    return version


def apply_changes(base: dict[str, str], changes: dict[str, str]) -> dict[str, str]:
    merged = dict(base)
    for path, content in changes.items():
        norm = normalize_path(path)
        if content == "":
            merged.pop(norm, None)
        else:
            merged[norm] = content
    return merged


def latest_spec(db: Session, project_id: str) -> tuple[DesignSpecRecord | None, DesignSpec | None]:
    record = db.scalars(
        select(DesignSpecRecord)
        .where(DesignSpecRecord.project_id == project_id)
        .order_by(DesignSpecRecord.revision.desc())
        .limit(1)
    ).first()
    return record, (DesignSpec.model_validate(record.spec) if record else None)


def save_spec(
    db: Session, project_id: str, spec: DesignSpec, ui_analysis: dict | None, source: str
) -> DesignSpecRecord:
    revision = (
        db.scalar(select(func.max(DesignSpecRecord.revision)).where(DesignSpecRecord.project_id == project_id)) or 0
    ) + 1
    record = DesignSpecRecord(
        project_id=project_id,
        revision=revision,
        spec=spec.model_dump(mode="json"),
        ui_analysis=ui_analysis or {},
        source=source,
    )
    db.add(record)
    db.flush()
    return record
