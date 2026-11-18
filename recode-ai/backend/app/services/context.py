"""Shared plumbing for background jobs: task status, progress, logs, usage."""

from __future__ import annotations

import logging
import traceback
from datetime import UTC, datetime
from typing import Any

from app.ai.providers.base import LLMResult, estimate_cost
from app.ai.router import ModelRouter
from app.core.config import Settings, get_settings
from app.core.db import session_scope
from app.core.events import emit
from app.core.storage import Storage, get_storage
from app.models import AITask, ModelUsage, Project

log = logging.getLogger(__name__)


class TaskContext:
    def __init__(self, project_id: str, task_id: str, settings: Settings | None = None, storage: Storage | None = None):
        self.project_id = project_id
        self.task_id = task_id
        self.settings = settings or get_settings()
        self.storage = storage or get_storage()
        with session_scope() as db:
            project = db.get(Project, project_id)
            self.project_settings: dict[str, Any] = dict(project.settings or {}) if project else {}
        self.router = ModelRouter(
            self.settings, overrides=self.project_settings.get("models"), recorder=self._record_usage
        )
        self._step = ""

    # ------------------------------------------------------------- lifecycle

    def start(self) -> None:
        with session_scope() as db:
            task = db.get(AITask, self.task_id)
            task.status, task.started_at = "running", datetime.now(UTC)
        emit(self.project_id, "task", task_id=self.task_id, status="running")

    def progress(self, value: float, step: str | None = None, message: str | None = None, **data: Any) -> None:
        if step:
            self._step = step
        with session_scope() as db:
            task = db.get(AITask, self.task_id)
            task.progress = round(max(task.progress, min(1.0, value)), 4)
            task.step = self._step
            if message:
                task.logs = [
                    *task.logs,
                    {
                        "t": datetime.now(UTC).isoformat(),
                        "step": self._step,
                        "message": message,
                        **({"data": data} if data else {}),
                    },
                ][-300:]
        emit(
            self.project_id,
            "progress",
            task_id=self.task_id,
            progress=round(value, 4),
            step=self._step,
            message=message,
            **data,
        )

    def log(self, message: str, **data: Any) -> None:
        self.progress(0.0, None, message, **data)

    def set_project_status(self, status: str) -> None:
        with session_scope() as db:
            db.get(Project, self.project_id).status = status
        emit(self.project_id, "project", status=status)

    def succeed(self, output: dict[str, Any]) -> None:
        with session_scope() as db:
            task = db.get(AITask, self.task_id)
            task.status, task.progress, task.output = "succeeded", 1.0, output
            task.finished_at = datetime.now(UTC)
        emit(self.project_id, "task", task_id=self.task_id, status="succeeded", output=output)

    def fail(self, error: BaseException) -> None:
        log.error("task %s failed: %s\n%s", self.task_id, error, traceback.format_exc())
        with session_scope() as db:
            task = db.get(AITask, self.task_id)
            task.status, task.error, task.finished_at = "failed", str(error)[:4000], datetime.now(UTC)
        emit(self.project_id, "task", task_id=self.task_id, status="failed", error=str(error)[:500])

    # ------------------------------------------------------------------ usage

    def _record_usage(self, role: str, agent: str, result: LLMResult) -> None:
        cost = estimate_cost(result.model, result.input_tokens, result.output_tokens, result.cache_read_tokens)
        with session_scope() as db:
            db.add(
                ModelUsage(
                    project_id=self.project_id,
                    task_id=self.task_id,
                    provider=result.provider,
                    model=result.model,
                    role=role,
                    agent=agent,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                    cache_read_tokens=result.cache_read_tokens,
                    cost_usd=cost,
                    latency_ms=result.latency_ms,
                )
            )
        emit(
            self.project_id,
            "usage",
            agent=agent,
            model=result.model,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=cost,
        )
