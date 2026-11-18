"""Full flow through the HTTP API in offline mode:
register -> project -> upload recording -> analysis -> generate (QA loop) ->
files / versions / preview / tests -> natural-language edit -> export."""

import io
import time
import zipfile


def _wait(client, headers, project_id, task_id, timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = client.get(f"/api/projects/{project_id}/tasks/{task_id}", headers=headers).json()
        if task["status"] in ("succeeded", "failed"):
            return task
        time.sleep(0.5)
    raise AssertionError(f"task {task_id} timed out")


def test_full_flow(client, recording):
    path, _ = recording
    r = client.post("/api/auth/register", json={"email": "dev@example.com", "password": "correct-horse"})
    assert r.status_code == 201
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/projects", headers={}).status_code == 401

    meta = client.get("/api/meta", headers=headers).json()
    assert meta["roles"]["vision"]["offline"] is True

    project = client.post("/api/projects", headers=headers, json={"name": "Landing", "framework": "html"}).json()
    pid = project["id"]

    with open(path, "rb") as f:
        r = client.post(
            f"/api/projects/{pid}/assets", headers=headers, files={"file": ("recording.mp4", f, "video/mp4")}
        )
    assert r.status_code == 201, r.text
    bad = client.post(
        f"/api/projects/{pid}/assets", headers=headers, files={"file": ("evil.exe", b"MZ", "application/octet-stream")}
    )
    assert bad.status_code == 415

    tasks = client.get(f"/api/projects/{pid}/tasks", headers=headers).json()
    ingest = _wait(client, headers, pid, tasks[0]["id"])
    assert ingest["status"] == "succeeded", ingest["error"]
    assert ingest["output"]["pages"] == 1

    frames = client.get(f"/api/projects/{pid}/frames", headers=headers).json()
    assert any(f["kind"] == "stitched" for f in frames)
    img = client.get(frames[0]["url"].replace("http://localhost:8000", ""))
    assert img.status_code == 200 and img.content[:4] == b"\x89PNG"

    task = client.post(f"/api/projects/{pid}/generate", headers=headers, json={}).json()
    done = _wait(client, headers, pid, task["id"], timeout=300)
    assert done["status"] == "succeeded", done["error"]
    assert done["output"]["score"] > 70
    steps = {log["step"] for log in done["logs"]}
    assert {"ingest", "analyze", "architect", "frontend", "qa"} <= steps

    project = client.get(f"/api/projects/{pid}", headers=headers).json()
    assert project["status"] == "ready" and project["current_version_id"]

    spec = client.get(f"/api/projects/{pid}/spec", headers=headers).json()["spec"]
    kinds = [s["kind"] for s in spec["pages"][0]["sections"]]
    assert kinds[0] == "header" and kinds[-1] == "footer" and "card-grid" in kinds
    assert {b["effect"] for b in spec["behaviors"]} >= {"sticky-header", "menu-toggle"}

    files = {f["path"] for f in client.get(f"/api/projects/{pid}/files", headers=headers).json()}
    assert {"index.html", "styles.css", "app.js"} <= files

    tests = client.get(f"/api/projects/{pid}/tests", headers=headers).json()
    visual = [t for t in tests if t["kind"] == "visual"]
    assert visual and visual[0]["metrics"]["sections"]
    assert any(t["kind"] == "security" and t["passed"] for t in tests)

    preview = client.get(f"/api/projects/{pid}/preview-url", headers=headers).json()
    page = client.get(preview["url"].replace("http://localhost:8000", ""))
    assert page.status_code == 200 and 'data-section="header"' in page.text
    assert "frame-ancestors" in page.headers["content-security-policy"]
    css = client.get(preview["url"].replace("http://localhost:8000", "").replace("index.html", "styles.css"))
    assert css.headers["content-type"].startswith("text/css")
    assert client.get(
        preview["url"].replace("http://localhost:8000", "").replace("index.html", "..%2F..%2Fx")
    ).status_code in (400, 404)

    # natural-language edit (offline rule-based editor)
    before = len(client.get(f"/api/projects/{pid}/versions", headers=headers).json())
    msg = client.post(
        f"/api/projects/{pid}/messages", headers=headers, json={"content": "فاصله سکشن دوم را ۳۰ پیکسل بیشتر کن"}
    ).json()
    edit = _wait(client, headers, pid, msg["task_id"])
    assert edit["status"] == "succeeded", edit["error"]
    history = client.get(f"/api/projects/{pid}/messages", headers=headers).json()
    assert history[-1]["role"] == "assistant" and history[-1]["version_id"]
    assert len(client.get(f"/api/projects/{pid}/versions", headers=headers).json()) == before + 1

    # manual edit + restore
    versions = client.get(f"/api/projects/{pid}/versions", headers=headers).json()
    saved = client.put(
        f"/api/projects/{pid}/files", headers=headers, json={"files": {"notes.md": "hi\n"}, "message": "note"}
    )
    assert saved.status_code == 200
    restored = client.post(f"/api/projects/{pid}/versions/{versions[-1]['id']}/restore", headers=headers)
    assert restored.status_code == 200 and restored.json()["author"] == "restore"
    traversal = client.put(f"/api/projects/{pid}/files", headers=headers, json={"files": {"../x": "y"}})
    assert traversal.status_code == 422

    # export
    z = client.get(f"/api/projects/{pid}/export.zip", headers=headers)
    assert z.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert "landing/index.html" in names and "landing/Dockerfile" in names

    # isolation between users
    other = client.post("/api/auth/register", json={"email": "other@example.com", "password": "another-pass"})
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert client.get(f"/api/projects/{pid}", headers=other_headers).status_code == 404

    # wait for the background QA re-runs triggered by the manual save
    for t in client.get(f"/api/projects/{pid}/tasks", headers=headers).json():
        if t["status"] in ("queued", "running"):
            _wait(client, headers, pid, t["id"])


def test_prompt_only_project(client):
    r = client.post("/api/auth/register", json={"email": "prompt@example.com", "password": "correct-horse"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    pid = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "کافه نارنج", "source_type": "prompt", "description": "یک سایت برای کافه"},
    ).json()["id"]
    task = client.post(f"/api/projects/{pid}/generate", headers=headers, json={}).json()
    done = _wait(client, headers, pid, task["id"])
    assert done["status"] == "succeeded", done["error"]
    spec = client.get(f"/api/projects/{pid}/spec", headers=headers).json()["spec"]
    assert spec["direction"] == "rtl" and spec["tokens"]["fonts"]["body"] == "Vazirmatn"
