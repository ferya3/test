from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import owned_project
from app.core.db import get_db
from app.models import AITask, Conversation, Project
from app.schemas.api import MessageIn, MessageOut
from app.services import jobs
from app.services.tasks import create_task

router = APIRouter(prefix="/api/projects/{project_id}/messages", tags=["workspace"])


@router.get("", response_model=list[MessageOut])
def list_messages(project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    return db.scalars(
        select(Conversation).where(Conversation.project_id == project.id).order_by(Conversation.created_at)
    ).all()


@router.post("", response_model=MessageOut, status_code=202)
def send_message(body: MessageIn, project: Project = Depends(owned_project), db: Session = Depends(get_db)):
    if not project.current_version_id:
        raise HTTPException(409, "Generate the project before asking for changes")
    running = db.scalar(
        select(func.count())
        .select_from(AITask)
        .where(
            AITask.project_id == project.id,
            AITask.kind.in_(("edit", "pipeline")),
            AITask.status.in_(("queued", "running")),
        )
    )
    if running:
        raise HTTPException(409, "Wait for the current task to finish")
    message = Conversation(project_id=project.id, role="user", content=body.content)
    db.add(message)
    db.commit()
    task_id = create_task(project.id, "edit", "edit", {"message_id": message.id})
    message.task_id = task_id
    db.commit()
    jobs.dispatch("edit", project_id=project.id, task_id=task_id, message_id=message.id)
    return message
