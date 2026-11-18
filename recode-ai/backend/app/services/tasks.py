from __future__ import annotations

from typing import Any

from app.core.db import session_scope
from app.models import AITask


def create_task(project_id: str, kind: str, agent: str, input: dict[str, Any] | None = None) -> str:
    with session_scope() as db:
        task = AITask(project_id=project_id, kind=kind, agent=agent, input=input or {})
        db.add(task)
        db.flush()
        return task.id
