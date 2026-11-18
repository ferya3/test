"""Preview Engine: build untrusted generated projects in an isolated container.

Static (html) projects need no build; the browser QA and the live preview
serve their files directly. Projects that need `npm run build` (react-vite)
are built in a throw-away Docker container:

  * dedicated container per build, removed afterwards
  * CPU / memory / PID limits, wall-clock timeout
  * all capabilities dropped, no-new-privileges, non-root user
  * no bind mounts: files go in and out with `docker cp`, so the container
    never sees the host filesystem or the platform's secrets
  * network only for `npm install` from the registry (configure an egress
    proxy / allow-list on the Docker network in production)

The build output (dist/) is then served statically, exactly like an html
project, so a running user server is never exposed."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from app.core.config import Settings
from app.security.code_scan import normalize_path


class BuildError(Exception):
    pass


class BuildUnavailable(BuildError):
    pass


def needs_build(framework: str) -> bool:
    return framework == "react-vite"


class DockerSandbox:
    def __init__(self, settings: Settings):
        self.settings = settings

    def available(self) -> bool:
        if self.settings.sandbox_mode != "docker" or not shutil.which("docker"):
            return False
        try:
            subprocess.run(["docker", "info"], capture_output=True, timeout=10, check=True)
            return True
        except (subprocess.SubprocessError, OSError):
            return False

    def build(self, files: dict[str, str], output_dir: str = "dist") -> tuple[dict[str, bytes], str]:
        if not self.available():
            raise BuildUnavailable("Docker sandbox is not configured (RECODE_SANDBOX_MODE=docker)")
        s = self.settings
        name = f"recode-build-{uuid.uuid4().hex[:12]}"
        with (
            tempfile.TemporaryDirectory(prefix="recode-src-") as src,
            tempfile.TemporaryDirectory(prefix="recode-out-") as out,
        ):
            for path, content in files.items():
                target = Path(src, normalize_path(path))
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            create = [
                "docker",
                "create",
                "--name",
                name,
                "--cpus",
                str(s.sandbox_cpus),
                "--memory",
                s.sandbox_memory,
                "--memory-swap",
                s.sandbox_memory,
                "--pids-limit",
                str(s.sandbox_pids),
                "--cap-drop",
                "ALL",
                "--security-opt",
                "no-new-privileges",
                "--user",
                "1000:1000",
                "--workdir",
                "/app",
                "--env",
                "CI=1",
                "--env",
                "NODE_ENV=development",
                s.sandbox_image,
                "sh",
                "-c",
                # sources arrive root-owned in /src (docker cp); build in the user-owned /app
                "cp -r /src/. /app && npm install --ignore-scripts --no-audit --no-fund --loglevel=error"
                " && npm run build",
            ]
            try:
                self._run(create, 60)
                self._run(["docker", "cp", f"{src}/.", f"{name}:/src"], 120)
                proc = subprocess.run(
                    ["docker", "start", "-a", name], capture_output=True, text=True, timeout=s.sandbox_timeout_s
                )
                log = (proc.stdout + proc.stderr)[-8000:]
                if proc.returncode != 0:
                    raise BuildError(f"Build failed (exit {proc.returncode}):\n{log}")
                self._run(["docker", "cp", f"{name}:/app/{output_dir}/.", out], 120)
            except subprocess.TimeoutExpired as e:
                raise BuildError(f"Build exceeded {s.sandbox_timeout_s}s") from e
            finally:
                subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)
            built: dict[str, bytes] = {}
            for root, _, names in os.walk(out):
                for n in names:
                    full = Path(root, n)
                    built[full.relative_to(out).as_posix()] = full.read_bytes()
        if "index.html" not in built:
            raise BuildError("Build produced no index.html")
        return built, log

    @staticmethod
    def _run(cmd: list[str], timeout: int) -> None:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if proc.returncode != 0:
            raise BuildError(f"{' '.join(cmd[:2])} failed: {proc.stderr[-2000:]}")
