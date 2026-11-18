from __future__ import annotations

import os
import shutil
import tempfile

import pytest

_TMP = tempfile.mkdtemp(prefix="recode-test-")
os.environ.update(
    {
        "RECODE_ENV": "test",
        "RECODE_DATABASE_URL": f"sqlite:///{_TMP}/test.db",
        "RECODE_STORAGE_ROOT": f"{_TMP}/storage",
        "RECODE_AI_PROVIDER": "heuristic",
        "RECODE_TASK_MODE": "inline",
        "RECODE_SECRET_KEY": "test-secret-0123456789-abcdefghijklmnop",
        "RECODE_MAX_FIX_ITERATIONS": "2",
    }
)
if not os.environ.get("RECODE_CHROMIUM_PATH") and os.path.exists("/opt/pw-browsers/chromium"):
    os.environ["RECODE_CHROMIUM_PATH"] = "/opt/pw-browsers/chromium"
os.environ.pop("RECODE_REDIS_URL", None)


@pytest.fixture(scope="session")
def tmpdir_session():
    yield _TMP
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(scope="session")
def recording(tmpdir_session):
    from tests.synthetic import make_recording

    path = os.path.join(tmpdir_session, "recording.mp4")
    info = make_recording(path)
    return path, info


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
