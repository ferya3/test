"""Binary files (extracted images, fonts) inside a project.

Project files are stored as text; binary ones are kept as data URIs
("data:image/jpeg;base64,...") and decoded wherever bytes leave the platform:
preview, rendering, ZIP and GitHub export."""

from __future__ import annotations

import base64
import mimetypes

BINARY_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".avif", ".woff", ".woff2", ".ttf", ".otf")


def is_binary(path: str) -> bool:
    return path.lower().endswith(BINARY_EXT)


def to_data_uri(data: bytes, path: str) -> str:
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def file_bytes(path: str, content: str) -> bytes:
    """The real bytes of a project file."""
    if is_binary(path) and content.startswith("data:") and ";base64," in content[:100]:
        return base64.b64decode(content.split(",", 1)[1])
    return content.encode()
