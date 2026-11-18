"""Code worker / test worker jobs: natural-language edits and QA re-runs."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.ai.coding.editor import EditAgent
from app.core.db import session_scope
from app.core.events import emit
from app.models import Conversation, Project, ProjectVersion, TestResult
from app.preview.sandbox import BuildError, DockerSandbox, needs_build
from app.qa.visual import VisualQAEngine
from app.security.code_scan import scan_files
from app.services import versions
from app.services.context import TaskContext


def _site_files(ctx: TaskContext, framework: str, files: dict[str, str], version_id: str) -> dict[str, Any]:
    if not needs_build(framework):
        return files
    built, _ = DockerSandbox(ctx.settings).build(files)
    prefix = f"projects/{ctx.project_id}/builds/{version_id}"
    for path, data in built.items():
        ctx.storage.put(f"{prefix}/{path}", data)
    with session_scope() as db:
        v = db.get(ProjectVersion, version_id)
        v.meta = {**v.meta, "build_prefix": prefix, "build_files": sorted(built)}
    return built


def run_qa(ctx: TaskContext, version_id: str) -> dict[str, Any]:
    with session_scope() as db:
        project = db.get(Project, ctx.project_id)
        framework = project.framework
        files = versions.get_files(db, version_id)
        _, spec = versions.latest_spec(db, ctx.project_id)
    if spec is None:
        raise ValueError("Generate the project before running QA")
    ctx.progress(0.1, "qa", "Rendering version")
    try:
        site = _site_files(ctx, framework, files, version_id)
    except BuildError as e:
        with session_scope() as db:
            db.add(
                TestResult(
                    project_id=ctx.project_id,
                    version_id=version_id,
                    task_id=ctx.task_id,
                    kind="build",
                    score=0,
                    passed=False,
                    issues=[{"severity": "high", "message": str(e)[:4000]}],
                )
            )
        return {"score": 0, "build_error": str(e)}
    outcome = VisualQAEngine(ctx.settings, ctx.storage).run(
        spec, site, f"projects/{ctx.project_id}/qa/{version_id}", ctx.project_settings.get("qa_threshold")
    )
    report = outcome.report
    with session_scope() as db:
        db.add(
            TestResult(
                project_id=ctx.project_id,
                version_id=version_id,
                task_id=ctx.task_id,
                kind="visual",
                score=report.score,
                passed=report.passed,
                metrics={
                    "page_scores": report.page_scores,
                    "overflow": report.overflow,
                    "sections": [s.model_dump() for s in report.sections],
                    "behavior_checks": report.behavior_checks,
                },
                issues=[i.model_dump() for i in report.issues],
                artifacts=report.artifacts,
            )
        )
        db.get(ProjectVersion, version_id).score = report.score
    emit(ctx.project_id, "qa", version_id=version_id, score=report.score, passed=report.passed)
    ctx.progress(1.0, "qa", f"Score {report.score}")
    return {"score": report.score, "passed": report.passed, "issues": len(report.issues)}


def run_edit(ctx: TaskContext, message_id: str) -> dict[str, Any]:
    with session_scope() as db:
        project = db.get(Project, ctx.project_id)
        message = db.get(Conversation, message_id)
        instruction = message.content
        base_version_id = project.current_version_id
        files = versions.get_files(db, base_version_id)
        _, spec = versions.latest_spec(db, ctx.project_id)
        history = [
            (m.role, m.content)
            for m in db.scalars(
                select(Conversation).where(Conversation.project_id == ctx.project_id).order_by(Conversation.created_at)
            ).all()
            if m.id != message_id
        ]
    if spec is None or not files:
        raise ValueError("Generate the project before editing it")

    ctx.progress(0.1, "edit", "Finding the files this instruction touches")
    result = EditAgent(ctx.router).run(spec, files, instruction, history)
    new_version_id = None
    score = None
    result.files = {p: c for p, c in result.files.items() if files.get(p) != c or (c == "" and p in files)}
    if result.files:
        merged = versions.apply_changes(files, result.files)
        scan = scan_files(merged)
        if scan.blocked_build:
            result.reply += (
                "\n\n(Security scan blocked this change: "
                + "; ".join(i["message"] for i in scan.issues if i["severity"] == "high")[:500]
                + ")"
            )
        else:
            with session_scope() as db:
                project = db.get(Project, ctx.project_id)
                spec_id = None
                if result.spec is not None:
                    spec_id = versions.save_spec(db, ctx.project_id, result.spec, None, "edit").id
                version = versions.create_version(
                    db,
                    project,
                    merged,
                    message=instruction[:500],
                    author="ai",
                    parent_id=base_version_id,
                    meta={"task_id": ctx.task_id, "spec_id": spec_id, "edit": True},
                )
                new_version_id = version.id
            emit(ctx.project_id, "version", version_id=new_version_id)
            ctx.progress(0.6, "qa", "Re-testing after the edit")
            try:
                score = run_qa(ctx, new_version_id).get("score")
            except Exception as e:  # QA failure must not lose the edit
                ctx.log(f"QA after edit failed: {e}")

    with session_scope() as db:
        changed = sorted(p for p in result.files) if result.files else []
        db.add(
            Conversation(
                project_id=ctx.project_id,
                role="assistant",
                content=result.reply,
                task_id=ctx.task_id,
                version_id=new_version_id,
                meta={"changed_files": changed, "score": score},
            )
        )
    emit(ctx.project_id, "message", role="assistant", version_id=new_version_id)
    return {"version_id": new_version_id, "score": score, "changed_files": len(result.files)}
