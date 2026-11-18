"""Job entry points + dispatch (inline thread for dev, Celery queues in production).

Queues mirror the worker split of the architecture:
  video -> media analysis, URL capture        (CPU, FFmpeg/OpenCV)
  ai    -> the full generation pipeline       (LLM-bound, long)
  code  -> natural-language edits             (LLM-bound, short)
  test  -> visual QA re-runs                  (Chromium)"""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

from app.core.config import get_settings
from app.services.context import TaskContext


def job_ingest(project_id: str, task_id: str, asset_id: str) -> dict[str, Any]:
    from app.services.media import ingest_asset

    ctx = TaskContext(project_id, task_id)
    ctx.start()
    try:
        ctx.set_project_status("processing")
        analysis = ingest_asset(ctx, asset_id)
        ctx.set_project_status("draft")
        out = {"events": len(analysis.events), "keyframes": len(analysis.keyframes), "pages": len(analysis.pages)}
        ctx.succeed(out)
        return out
    except Exception as e:
        ctx.fail(e)
        ctx.set_project_status("failed")
        raise


def job_capture(project_id: str, task_id: str, url: str, then_generate: bool = True) -> dict[str, Any]:
    from app.services.media import capture_url, ingest_asset

    ctx = TaskContext(project_id, task_id)
    ctx.start()
    try:
        asset_id = capture_url(ctx, url)
        ingest_asset(ctx, asset_id)
        ctx.succeed({"asset_id": asset_id})
    except Exception as e:
        ctx.fail(e)
        ctx.set_project_status("failed")
        raise
    if then_generate:
        from app.services.tasks import create_task

        task = create_task(project_id, "pipeline", "orchestrator", {"reuse_analysis": True})
        dispatch("pipeline", project_id=project_id, task_id=task, reuse_analysis=True, max_iterations=None)
    return {"asset_id": asset_id}


def job_pipeline(
    project_id: str, task_id: str, reuse_analysis: bool = True, max_iterations: int | None = None
) -> dict[str, Any]:
    from app.services.pipeline import run_pipeline

    return run_pipeline(project_id, task_id, reuse_analysis=reuse_analysis, max_iterations=max_iterations)


def job_edit(project_id: str, task_id: str, message_id: str) -> dict[str, Any]:
    from app.services.edit import run_edit

    ctx = TaskContext(project_id, task_id)
    ctx.start()
    try:
        out = run_edit(ctx, message_id)
        ctx.succeed(out)
        return out
    except Exception as e:
        ctx.fail(e)
        raise


def job_qa(project_id: str, task_id: str, version_id: str) -> dict[str, Any]:
    from app.services.edit import run_qa

    ctx = TaskContext(project_id, task_id)
    ctx.start()
    try:
        out = run_qa(ctx, version_id)
        ctx.succeed(out)
        return out
    except Exception as e:
        ctx.fail(e)
        raise


JOBS: dict[str, tuple[Callable[..., Any], str, str]] = {
    # kind: (function, celery task name, queue)
    "ingest": (job_ingest, "recode.video.ingest", "video"),
    "capture": (job_capture, "recode.video.capture", "video"),
    "pipeline": (job_pipeline, "recode.ai.pipeline", "ai"),
    "edit": (job_edit, "recode.code.edit", "code"),
    "qa": (job_qa, "recode.test.qa", "test"),
}


def _safe(fn: Callable[..., Any], kwargs: dict[str, Any]) -> None:
    try:
        fn(**kwargs)
    except Exception:
        pass  # already recorded on the task row by the job


def dispatch(kind: str, **kwargs: Any) -> None:
    fn, name, queue = JOBS[kind]
    if get_settings().task_mode == "celery":
        from app.workers.celery_app import celery_app

        celery_app.send_task(name, kwargs=kwargs, queue=queue)
    else:
        threading.Thread(target=_safe, args=(fn, kwargs), name=f"job-{kind}", daemon=True).start()
