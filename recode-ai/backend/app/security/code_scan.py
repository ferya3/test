"""Static checks on AI-generated code before it is stored, built or exported."""

from __future__ import annotations

import json
import posixpath
import re
from dataclasses import dataclass, field

MAX_FILES = 300
MAX_FILE_BYTES = 2_000_000
ALLOWED_EXT = {
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".md",
    ".txt",
    ".svg",
    ".py",
    ".toml",
    ".yml",
    ".yaml",
    ".gitignore",
    ".env.example",
    ".xml",
    ".webmanifest",
}
ALLOWED_DEPENDENCIES = {
    "react",
    "react-dom",
    "vite",
    "@vitejs/plugin-react",
    "typescript",
    "@types/react",
    "@types/react-dom",
    "tailwindcss",
    "@tailwindcss/vite",
    "postcss",
    "autoprefixer",
    "framer-motion",
    "motion",
    "clsx",
    "lucide-react",
    "gsap",
    "swiper",
    "lenis",
}
_INSTALL_SCRIPTS = {"preinstall", "install", "postinstall", "prepare", "prepublish", "prepack"}

RULES: list[tuple[str, str, str]] = [
    (
        r"require\(\s*['\"]child_process['\"]\)|from\s+['\"]child_process['\"]",
        "high",
        "spawns processes (child_process)",
    ),
    (r"\b(coinhive|cryptonight|coin-hive|webminer|minero\.cc)\b", "high", "crypto-miner signature"),
    (r"(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}['\"]", "high", "hard-coded secret"),
    (r"\beval\s*\(", "medium", "uses eval()"),
    (r"new\s+Function\s*\(", "medium", "uses new Function()"),
    (r"document\.cookie", "medium", "reads or writes cookies"),
    (r"navigator\.sendBeacon|google-analytics\.com|googletagmanager\.com|facebook\.net", "medium", "tracking / beacon"),
    (r"<iframe[^>]+src=[\"']https?://", "low", "embeds an external iframe"),
    (r"(?:fetch|axios\.\w+)\(\s*[\"']https?://(?!fonts\.)", "low", "requests an external URL"),
    (r"\bimport\s+os\b.*\bos\.system\(|subprocess\.(run|Popen|call)\(", "medium", "runs shell commands"),
]


@dataclass
class ScanResult:
    passed: bool
    issues: list[dict] = field(default_factory=list)
    blocked_build: bool = False


class UnsafePath(ValueError):
    pass


def normalize_path(path: str) -> str:
    """Relative POSIX path inside the project; refuses traversal and absolute paths."""
    p = path.replace("\\", "/").strip()
    if not p or p.startswith("/") or re.match(r"^[A-Za-z]:", p):
        raise UnsafePath(f"absolute or empty path: {path!r}")
    norm = posixpath.normpath(p)
    if norm.startswith("..") or "/../" in f"/{norm}/" or norm in (".", ""):
        raise UnsafePath(f"path escapes the project: {path!r}")
    if any(part.startswith(".git") and part not in (".gitignore",) for part in norm.split("/")):
        raise UnsafePath(f"refusing VCS internals: {path!r}")
    return norm


def _ext(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name in (".gitignore", ".env.example"):
        return name
    return "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""


def scan_files(files: dict[str, str]) -> ScanResult:
    issues: list[dict] = []
    blocked = False
    if len(files) > MAX_FILES:
        issues.append({"severity": "high", "file": "*", "message": f"{len(files)} files exceeds {MAX_FILES}"})
    for path, content in files.items():
        try:
            normalize_path(path)
        except UnsafePath as e:
            issues.append({"severity": "high", "file": path, "message": str(e)})
            continue
        if _ext(path) not in ALLOWED_EXT:
            issues.append({"severity": "medium", "file": path, "message": "unexpected file type"})
        if len(content.encode()) > MAX_FILE_BYTES:
            issues.append({"severity": "medium", "file": path, "message": "file larger than 2 MB"})
        for pattern, severity, message in RULES:
            if re.search(pattern, content):
                issues.append({"severity": severity, "file": path, "message": message})
        if path.endswith("package.json"):
            try:
                pkg = json.loads(content)
            except json.JSONDecodeError:
                issues.append({"severity": "high", "file": path, "message": "package.json is not valid JSON"})
                blocked = True
                continue
            scripts = set((pkg.get("scripts") or {}).keys()) & _INSTALL_SCRIPTS
            if scripts:
                blocked = True
                issues.append(
                    {
                        "severity": "high",
                        "file": path,
                        "message": f"install-time scripts are not allowed: {sorted(scripts)}",
                    }
                )
            deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
            for name, version in deps.items():
                if name not in ALLOWED_DEPENDENCIES:
                    issues.append(
                        {"severity": "medium", "file": path, "message": f"dependency not on allow-list: {name}"}
                    )
                if isinstance(version, str) and re.match(r"^(git|http|file|link):|/", version):
                    blocked = True
                    issues.append(
                        {
                            "severity": "high",
                            "file": path,
                            "message": f"dependency {name} comes from a non-registry source",
                        }
                    )
    high = any(i["severity"] == "high" for i in issues)
    return ScanResult(passed=not high, issues=issues, blocked_build=blocked or high)
