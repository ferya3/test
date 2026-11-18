from __future__ import annotations

import mimetypes
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import owned_project
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import decode_token, preview_token
from app.core.storage import get_storage
from app.export.exporters import GitHubExportError, build_zip, push_to_github
from app.models import CodeFile, Project, ProjectVersion
from app.schemas.api import FileOut, FilesSaveIn, GithubExportIn, VersionOut
from app.security.code_scan import UnsafePath, normalize_path, scan_files
from app.services import jobs, versions
from app.services.tasks import create_task

router = APIRouter(tags=["files"])


def _version(db: Session, project: Project, version_id: str | None) -> ProjectVersion:
    vid = version_id or project.current_version_id
    version = db.get(ProjectVersion, vid) if vid else None
    if version is None or version.project_id != project.id:
        raise HTTPException(404, "Version not found")
    return version


@router.get("/api/projects/{project_id}/files", response_model=list[FileOut])
def list_files(version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    version = _version(db, project, version_id)
    rows = db.scalars(select(CodeFile).where(CodeFile.version_id == version.id).order_by(CodeFile.path)).all()
    return [FileOut(path=r.path, size=r.size, sha=r.sha) for r in rows]


@router.get("/api/projects/{project_id}/file", response_model=FileOut)
def read_file(
    path: str, version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)
):
    version = _version(db, project, version_id)
    row = db.scalar(select(CodeFile).where(CodeFile.version_id == version.id, CodeFile.path == path))
    if row is None:
        raise HTTPException(404, "File not found")
    return FileOut(path=row.path, size=row.size, sha=row.sha, content=row.content)


@router.put("/api/projects/{project_id}/files", response_model=VersionOut)
def save_files(body: FilesSaveIn, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    """Manual edits from the Monaco editor become a new version authored by the user."""
    base = versions.get_files(db, project.current_version_id)
    changes = dict(body.files)
    changes.update({p: "" for p in body.deleted})
    try:
        merged = versions.apply_changes(base, changes)
    except UnsafePath as e:
        raise HTTPException(422, str(e)) from e
    scan = scan_files(merged)
    if scan.blocked_build:
        raise HTTPException(422, {"message": "Security scan rejected these files", "issues": scan.issues})
    version = versions.create_version(
        db, project, merged, message=body.message, author="user", parent_id=project.current_version_id
    )
    db.commit()
    task_id = create_task(project.id, "qa", "visual-qa", {"version_id": version.id})
    jobs.dispatch("qa", project_id=project.id, task_id=task_id, version_id=version.id)
    return version


@router.get("/api/projects/{project_id}/versions", response_model=list[VersionOut])
def list_versions(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    return db.scalars(
        select(ProjectVersion).where(ProjectVersion.project_id == project.id).order_by(ProjectVersion.number.desc())
    ).all()


@router.post("/api/projects/{project_id}/versions/{version_id}/restore", response_model=VersionOut)
def restore_version(version_id: str, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    old = _version(db, project, version_id)
    files = versions.get_files(db, old.id)
    version = versions.create_version(
        db,
        project,
        files,
        message=f"Restored version {old.number}",
        author="restore",
        parent_id=project.current_version_id,
        score=old.score,
        meta={k: v for k, v in old.meta.items() if k in ("build_prefix", "build_files", "spec_id")},
    )
    db.commit()
    return version


@router.get("/api/projects/{project_id}/preview-url")
def preview_url(
    version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)
):
    version = _version(db, project, version_id)
    token = preview_token(project.id, version.id)
    built = project.framework == "react-vite"
    ready = (not built) or bool(version.meta.get("build_prefix"))
    return {
        "url": f"{get_settings().public_api_url}/api/preview/{token}/index.html",
        "version_id": version.id,
        "ready": ready,
        "message": None if ready else "This version has not been built (Docker sandbox required)",
    }


_PREVIEW_CSP = (
    "default-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; "
    "script-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"
)


@router.get("/api/preview/{token}/{path:path}")
def serve_preview(token: str, path: str, db: Session = Depends(get_db)):
    """Live preview, loaded in a sandboxed iframe. The token scopes it to one version."""
    claims = decode_token(token, "preview")
    if not claims:
        raise HTTPException(403, "Preview link expired")
    project = db.get(Project, claims["sub"])
    version = db.get(ProjectVersion, claims.get("ver"))
    if project is None or version is None or version.project_id != project.id:
        raise HTTPException(404, "Not found")
    try:
        path = normalize_path(path or "index.html")
    except UnsafePath as e:
        raise HTTPException(400, "Bad path") from e
    prefix = version.meta.get("build_prefix")
    if prefix:
        if path not in set(version.meta.get("build_files") or []):
            raise HTTPException(404, "Not found")
        body: bytes = get_storage().get(f"{prefix}/{path}")
    else:
        row = db.scalar(select(CodeFile).where(CodeFile.version_id == version.id, CodeFile.path == path))
        if row is None and not re.search(r"\.[a-z0-9]+$", path):
            row = db.scalar(select(CodeFile).where(CodeFile.version_id == version.id, CodeFile.path == f"{path}.html"))
        if row is None:
            raise HTTPException(404, "Not found")
        body = row.content.encode()
    media = "text/javascript" if path.endswith((".js", ".mjs")) else (mimetypes.guess_type(path)[0] or "text/plain")
    ancestors = " ".join(get_settings().cors_origins) or "'none'"
    return Response(
        body,
        media_type=media,
        headers={
            "Content-Security-Policy": f"{_PREVIEW_CSP}; frame-ancestors {ancestors}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )


@router.get("/api/media/{token}")
def serve_media(token: str):
    claims = decode_token(token, "media")
    if not claims:
        raise HTTPException(403, "Link expired")
    key = claims["sub"]
    try:
        data = get_storage().get(key)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(404, "Not found") from e
    return Response(
        data,
        media_type=mimetypes.guess_type(key)[0] or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/api/projects/{project_id}/export.zip")
def export_zip(version_id: str | None = None, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    version = _version(db, project, version_id)
    files = versions.get_files(db, version.id)
    slug = re.sub(r"[^a-z0-9-]+", "-", project.name.lower()).strip("-") or "recode-project"
    data = build_zip(files, slug, project.framework)
    return Response(
        data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slug}-v{version.number}.zip"'},
    )


@router.post("/api/projects/{project_id}/export/github")
def export_github(
    body: GithubExportIn,
    version_id: str | None = None,
    project: Project = Depends(owned_project),
    db: Session = Depends(get_db),
):
    version = _version(db, project, version_id)
    files = versions.get_files(db, version.id)
    from app.export.exporters import deploy_files

    files = {**deploy_files(project.framework), **files}
    try:
        url = push_to_github(
            files,
            token=body.token,
            repo=body.repo,
            branch=body.branch,
            private=body.private,
            create=body.create,
            message=body.message,
        )
    except GitHubExportError as e:
        raise HTTPException(400, str(e)) from e
    return {"url": url, "version": version.number}
