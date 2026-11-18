"""Realtime project events.

Workers publish progress (pipeline steps, logs, new versions, QA scores);
the WebSocket endpoint relays them to the browser. With Redis configured the
bus is Redis pub/sub (works across API + Celery processes); without it an
in-process bus is used (inline task mode)."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections import defaultdict
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

from app.core.config import get_settings


def channel(project_id: str) -> str:
    return f"recode:project:{project_id}"


class InMemoryBus:
    def __init__(self) -> None:
        self._subs: dict[str, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = defaultdict(list)
        self._lock = threading.Lock()

    def publish(self, project_id: str, event: dict[str, Any]) -> None:
        with self._lock:
            subs = list(self._subs.get(project_id, []))
        for loop, queue in subs:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError:
                pass  # loop closed

    async def subscribe(self, project_id: str) -> AsyncIterator[dict[str, Any]]:
        queue: asyncio.Queue = asyncio.Queue()
        entry = (asyncio.get_running_loop(), queue)
        with self._lock:
            self._subs[project_id].append(entry)
        try:
            while True:
                yield await queue.get()
        finally:
            with self._lock:
                self._subs[project_id].remove(entry)


class RedisBus:
    def __init__(self, url: str) -> None:
        import redis

        self._url = url
        self._client = redis.Redis.from_url(url)

    def publish(self, project_id: str, event: dict[str, Any]) -> None:
        self._client.publish(channel(project_id), json.dumps(event, default=str))

    async def subscribe(self, project_id: str) -> AsyncIterator[dict[str, Any]]:
        import redis.asyncio as aioredis

        client = aioredis.Redis.from_url(self._url)
        pubsub = client.pubsub()
        await pubsub.subscribe(channel(project_id))
        try:
            async for message in pubsub.listen():
                if message.get("type") == "message":
                    yield json.loads(message["data"])
        finally:
            await pubsub.unsubscribe(channel(project_id))
            await client.aclose()


@lru_cache
def get_bus() -> InMemoryBus | RedisBus:
    url = get_settings().redis_url
    return RedisBus(url) if url else InMemoryBus()


def emit(project_id: str, type_: str, **data: Any) -> None:
    """Fire-and-forget; realtime is best-effort and must never break a job."""
    try:
        get_bus().publish(project_id, {"type": type_, "ts": time.time(), **data})
    except Exception:
        pass
