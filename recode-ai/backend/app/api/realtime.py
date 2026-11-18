from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.db import get_sessionmaker
from app.core.events import get_bus
from app.core.security import decode_token
from app.models import Project

router = APIRouter(tags=["realtime"])


@router.websocket("/api/ws/projects/{project_id}")
async def project_events(websocket: WebSocket, project_id: str, token: str = ""):
    claims = decode_token(token, "access")
    db = get_sessionmaker()()
    try:
        project = db.get(Project, project_id)
        allowed = bool(claims and project and project.owner_id == claims["sub"])
    finally:
        db.close()
    if not allowed:
        await websocket.close(code=4403)
        return
    await websocket.accept()

    async def pump() -> None:
        async for event in get_bus().subscribe(project_id):
            await websocket.send_json(event)

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(25)
            await websocket.send_json({"type": "ping"})

    tasks = [asyncio.create_task(pump()), asyncio.create_task(heartbeat())]
    try:
        while True:
            await websocket.receive_text()  # client pings / close
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await t
