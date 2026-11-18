"""Export & Deployment Engine: ZIP, GitHub, and a deployable container bundle."""

from __future__ import annotations

import base64
import io
import zipfile

import httpx

from app.core.binary import file_bytes, is_binary
from app.security.code_scan import normalize_path

STATIC_DOCKERFILE = """FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
"""

REACT_DOCKERFILE = """FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
"""

NGINX_CONF = """server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
  location / { try_files $uri $uri.html $uri/ /index.html; }
  location ~* \\.(css|js|svg|png|jpg|webp|woff2)$ { expires 7d; }
}
"""


def deploy_files(framework: str) -> dict[str, str]:
    return {
        "Dockerfile": REACT_DOCKERFILE if framework == "react-vite" else STATIC_DOCKERFILE,
        "nginx.conf": NGINX_CONF,
        ".dockerignore": "node_modules\n.git\n",
    }


def build_zip(files: dict[str, str], root: str, framework: str, include_deploy: bool = True) -> bytes:
    buf = io.BytesIO()
    payload = dict(files)
    if include_deploy:
        for path, content in deploy_files(framework).items():
            payload.setdefault(path, content)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(payload):
            zf.writestr(f"{root}/{normalize_path(path)}", file_bytes(path, payload[path]))
    return buf.getvalue()


class GitHubExportError(Exception):
    pass


def push_to_github(
    files: dict[str, str],
    *,
    token: str,
    repo: str,
    branch: str = "main",
    private: bool = True,
    create: bool = True,
    message: str = "Export from Recode AI",
) -> str:
    """Create (optionally) a repository and commit all files in one commit via the Git Data API.

    The user's token is used for this request only and is never stored."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "recode-ai-export",
    }
    with httpx.Client(base_url="https://api.github.com", headers=headers, timeout=60) as gh:
        me = gh.get("/user")
        if me.status_code != 200:
            raise GitHubExportError("GitHub token was rejected")
        owner, name = repo.split("/", 1) if "/" in repo else (me.json()["login"], repo)
        full = f"{owner}/{name}"
        existing = gh.get(f"/repos/{full}")
        if existing.status_code == 404:
            if not create:
                raise GitHubExportError(f"Repository {full} does not exist")
            endpoint = "/user/repos" if owner == me.json()["login"] else f"/orgs/{owner}/repos"
            created = gh.post(endpoint, json={"name": name, "private": private, "auto_init": True})
            if created.status_code not in (200, 201):
                raise GitHubExportError(f"Could not create repository: {created.text[:300]}")
        elif existing.status_code != 200:
            raise GitHubExportError(f"Cannot access {full}: {existing.status_code}")

        ref = gh.get(f"/repos/{full}/git/ref/heads/{branch}")
        parent = ref.json()["object"]["sha"] if ref.status_code == 200 else None
        if parent is None:
            default = gh.get(f"/repos/{full}").json().get("default_branch", "main")
            base = gh.get(f"/repos/{full}/git/ref/heads/{default}")
            parent = base.json()["object"]["sha"] if base.status_code == 200 else None
        tree = []
        for p, c in sorted(files.items()):
            if is_binary(p):  # pictures go up as base64 blobs; the tree API takes text only
                blob = gh.post(
                    f"/repos/{full}/git/blobs",
                    json={"content": base64.b64encode(file_bytes(p, c)).decode(), "encoding": "base64"},
                )
                if blob.status_code != 201:
                    raise GitHubExportError(f"Uploading {p} failed: {blob.text[:200]}")
                tree.append({"path": normalize_path(p), "mode": "100644", "type": "blob", "sha": blob.json()["sha"]})
            else:
                tree.append({"path": normalize_path(p), "mode": "100644", "type": "blob", "content": c})
        tree_resp = gh.post(f"/repos/{full}/git/trees", json={"tree": tree})
        if tree_resp.status_code != 201:
            raise GitHubExportError(f"Tree creation failed: {tree_resp.text[:300]}")
        commit = gh.post(
            f"/repos/{full}/git/commits",
            json={"message": message, "tree": tree_resp.json()["sha"], "parents": [parent] if parent else []},
        )
        if commit.status_code != 201:
            raise GitHubExportError(f"Commit failed: {commit.text[:300]}")
        sha = commit.json()["sha"]
        if ref.status_code == 200:
            upd = gh.patch(f"/repos/{full}/git/refs/heads/{branch}", json={"sha": sha, "force": False})
        else:
            upd = gh.post(f"/repos/{full}/git/refs", json={"ref": f"refs/heads/{branch}", "sha": sha})
        if upd.status_code not in (200, 201):
            raise GitHubExportError(f"Updating {branch} failed: {upd.text[:300]}")
        return f"https://github.com/{full}/tree/{branch}"
