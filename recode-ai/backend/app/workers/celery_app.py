"""Celery application. Start one worker per queue:

celery -A app.workers.celery_app worker -Q video -c 2
celery -A app.workers.celery_app worker -Q ai    -c 4
celery -A app.workers.celery_app worker -Q code  -c 4
celery -A app.workers.celery_app worker -Q test  -c 2
"""

from __future__ import annotations

from celery import Celery

from app.core.config import get_settings
from app.core.db import init_db

_settings = get_settings()
_broker = _settings.redis_url or "redis://localhost:6379/0"

celery_app = Celery("recode", broker=_broker, backend=_broker, include=["app.workers.tasks"])
celery_app.conf.update(
    task_acks_late=True,  # a crashed worker hands the job to another one
    worker_prefetch_multiplier=1,  # jobs are long; don't hoard them
    task_track_started=True,
    task_time_limit=60 * 60,
    task_soft_time_limit=55 * 60,
    task_routes={
        "recode.video.*": {"queue": "video"},
        "recode.ai.*": {"queue": "ai"},
        "recode.code.*": {"queue": "code"},
        "recode.test.*": {"queue": "test"},
    },
)

init_db()
