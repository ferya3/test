from __future__ import annotations

import os
import tempfile
from collections import defaultdict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, media_url, owned_project
from app.core.config import get_settings
from app.core.db import get_db
from app.core.storage import get_storage
from app.models import AITask, ModelUsage, Project, ProjectAsset, ProjectVersion, TestResult, User, VideoFrame
from app.schemas.api import (
    AssetOut,
    FrameOut,
    GenerateIn,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TaskOut,
    TestResultOut,
)
from app.services import jobs, versions
from app.services.tasks import create_task
from app.video.probe import ALLOWED_IMAGE_EXT, ALLOWED_VIDEO_EXT

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_out(db: Session, p: Project) -> ProjectOut:
    out = ProjectOut.model_validate(p)
    frame = db.scalars(
        select(VideoFrame)
        .where(VideoFrame.project_id == p.id)
        .order_by(VideoFrame.kind.desc(), VideoFrame.timestamp)
        .limit(1)
    ).first()
    out.thumbnail_url = media_url(frame.storage_key) if frame else None
    if p.current_version_id:
        v = db.get(ProjectVersion, p.current_version_id)
        out.score = v.score if v else None
    return out


def _busy(db: Session, project_id: str) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(AITask)
            .where(
                AITask.project_id == project_id,
                AITask.status.in_(("queued", "running")),
                AITask.kind.in_(("pipeline", "capture")),
            )
        )
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())).all()
    return [_project_out(db, p) for p in rows]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.source_type == "url" and not body.source_url:
        raise HTTPException(422, "source_url is required for URL projects")
    project = Project(
        owner_id=user.id,
        name=body.name,
        description=body.description,
        source_type=body.source_type,
        source_url=body.source_url,
        framework=body.framework,
        settings=body.settings.model_dump(exclude_none=True),
    )
    db.add(project)
    db.commit()
    if body.source_type == "url":
        project.status = "processing"
        db.commit()
        task_id = create_task(project.id, "capture", "capture", {"url": body.source_url})
        jobs.dispatch("capture", project_id=project.id, task_id=task_id, url=body.source_url, then_generate=True)
    return _project_out(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    return _project_out(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(body: ProjectUpdate, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    data = body.model_dump(exclude_unset=True)
    if "settings" in data and data["settings"] is not None:
        project.settings = {**(project.settings or {}), **body.settings.model_dump(exclude_none=True)}
    for key in ("name", "description", "framework"):
        if data.get(key) is not None:
            setattr(project, key, data[key])
    db.commit()
    return _project_out(db, project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    pid = project.id
    db.delete(project)
    db.commit()
    get_storage().delete_prefix(f"projects/{pid}")


# ---------------------------------------------------------------- media


@router.post("/{project_id}/assets", response_model=AssetOut, status_code=201)
async def upload_asset(
    file: UploadFile = File(...), project: Project = Depends(owned_project), db: Session = Depends(get_db)
):
    settings = get_settings()
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext in ALLOWED_VIDEO_EXT:
        kind = "video"
    elif ext in ALLOWED_IMAGE_EXT:
        kind = "image"
    else:
        raise HTTPException(415, "Upload an MP4, MOV or WebM video, or a PNG/JPEG/WebP screenshot")
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB")
            tmp.write(chunk)
        tmp_path = tmp.name
    try:
        asset = ProjectAsset(
            project_id=project.id,
            kind=kind,
            filename=os.path.basename(file.filename or "upload"),
            storage_key="",
            mime=file.content_type or "application/octet-stream",
            size=size,
        )
        db.add(asset)
        db.flush()
        asset.storage_key = get_storage().put_file(
            f"projects/{project.id}/uploads/{asset.id}{ext}", tmp_path, asset.mime
        )
        project.status = "processing"
        db.commit()
    finally:
        os.unlink(tmp_path)
    task_id = create_task(project.id, "video", "video-intelligence", {"asset_id": asset.id})
    jobs.dispatch("ingest", project_id=project.id, task_id=task_id, asset_id=asset.id)
    out = AssetOut.model_validate(asset)
    out.url = media_url(asset.storage_key)
    return out


@router.get("/{project_id}/assets", response_model=list[AssetOut])
def list_assets(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ProjectAsset).where(ProjectAsset.project_id == project.id).order_by(ProjectAsset.created_at)
    ).all()
    out = []
    for a in rows:
        item = AssetOut.model_validate(a)
        item.meta = {k: v for k, v in (a.meta or {}).items() if k != "analysis"}
        analysis = (a.meta or {}).get("analysis") or {}
        item.meta["events"] = analysis.get("events", [])
        item.meta["viewport"] = analysis.get("viewport")
        item.url = media_url(a.storage_key)
        out.append(item)
    return out


@router.get("/{project_id}/frames", response_model=list[FrameOut])
def list_frames(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(VideoFrame).where(VideoFrame.project_id == project.id).order_by(VideoFrame.kind, VideoFrame.timestamp)
    ).all()
    out = []
    for f in rows:
        item = FrameOut.model_validate(f)
        item.url = media_url(f.storage_key)
        out.append(item)
    return out


# ------------------------------------------------------------ pipeline


@router.post("/{project_id}/generate", response_model=TaskOut, status_code=202)
def generate(body: GenerateIn | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    body = body or GenerateIn()
    if _busy(db, project.id):
        raise HTTPException(409, "A generation is already running for this project")
    pending = db.scalar(
        select(func.count())
        .select_from(ProjectAsset)
        .where(ProjectAsset.project_id == project.id, ProjectAsset.status.in_(("uploaded", "processing")))
    )
    if pending:
        raise HTTPException(409, "Media is still being analysed; try again when it is done")
    if (
        project.source_type != "prompt"
        and not db.scalar(select(func.count()).select_from(ProjectAsset).where(ProjectAsset.project_id == project.id))
        and not project.description
    ):
        raise HTTPException(422, "Upload a recording or screenshot first (or describe the site)")
    task_id = create_task(project.id, "pipeline", "orchestrator", body.model_dump())
    project.status = "analyzing"
    db.commit()
    jobs.dispatch(
        "pipeline",
        project_id=project.id,
        task_id=task_id,
        reuse_analysis=body.reuse_analysis,
        max_iterations=body.max_fix_iterations,
    )
    return db.get(AITask, task_id)


@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    return db.scalars(
        select(AITask).where(AITask.project_id == project.id).order_by(AITask.created_at.desc()).limit(50)
    ).all()


@router.get("/{project_id}/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: str, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    task = db.get(AITask, task_id)
    if task is None or task.project_id != project.id:
        raise HTTPException(404, "Task not found")
    return task


@router.get("/{project_id}/spec")
def get_spec(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    record, spec = versions.latest_spec(db, project.id)
    if record is None:
        return None  # not generated yet (a 404 here would be expected, but noisy in the browser console)
    data = spec.model_dump(mode="json")
    for page in data["pages"]:
        page["reference_url"] = media_url(page.get("reference_key"))
    return {
        "id": record.id,
        "revision": record.revision,
        "source": record.source,
        "spec": data,
        "created_at": record.created_at,
    }


@router.post("/{project_id}/qa", response_model=TaskOut, status_code=202)
def rerun_qa(version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    vid = version_id or project.current_version_id
    if not vid or db.get(ProjectVersion, vid) is None:
        raise HTTPException(404, "No version to test")
    task_id = create_task(project.id, "qa", "visual-qa", {"version_id": vid})
    jobs.dispatch("qa", project_id=project.id, task_id=task_id, version_id=vid)
    return db.get(AITask, task_id)


@router.get("/{project_id}/tests", response_model=list[TestResultOut])
def list_tests(version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    q = select(TestResult).where(TestResult.project_id == project.id)
    if version_id:
        q = q.where(TestResult.version_id == version_id)
    rows = db.scalars(q.order_by(TestResult.created_at.desc()).limit(100)).all()
    out = []
    for r in rows:
        item = TestResultOut.model_validate(r)
        item.artifacts = {k: media_url(v) for k, v in (r.artifacts or {}).items()}
        out.append(item)
    return out


@router.get("/{project_id}/usage")
def usage(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    rows = db.scalars(select(ModelUsage).where(ModelUsage.project_id == project.id)).all()
    by_agent: dict[str, dict[str, float]] = defaultdict(
        lambda: {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
    )
    for r in rows:
        a = by_agent[r.agent or r.role]
        a["calls"] += 1
        a["input_tokens"] += r.input_tokens
        a["output_tokens"] += r.output_tokens
        a["cost_usd"] = round(a["cost_usd"] + r.cost_usd, 6)
    return {
        "calls": len(rows),
        "input_tokens": sum(r.input_tokens for r in rows),
        "output_tokens": sum(r.output_tokens for r in rows),
        "cost_usd": round(sum(r.cost_usd for r in rows), 4),
        "by_agent": by_agent,
    }
