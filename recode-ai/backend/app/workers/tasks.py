from __future__ import annotations

from app.services import jobs
from app.workers.celery_app import celery_app


@celery_app.task(name="recode.video.ingest")
def ingest(project_id: str, task_id: str, asset_id: str):
    return jobs.job_ingest(project_id, task_id, asset_id)


@celery_app.task(name="recode.video.capture")
def capture(project_id: str, task_id: str, url: str, then_generate: bool = True):
    return jobs.job_capture(project_id, task_id, url, then_generate)


@celery_app.task(name="recode.ai.pipeline")
def pipeline(project_id: str, task_id: str, reuse_analysis: bool = True, max_iterations: int | None = None):
    return jobs.job_pipeline(project_id, task_id, reuse_analysis, max_iterations)


@celery_app.task(name="recode.code.edit")
def edit(project_id: str, task_id: str, message_id: str):
    return jobs.job_edit(project_id, task_id, message_id)


@celery_app.task(name="recode.test.qa")
def qa(project_id: str, task_id: str, version_id: str):
    return jobs.job_qa(project_id, task_id, version_id)
