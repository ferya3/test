"""Pictures cut out of the reference, as project files."""

from __future__ import annotations

import logging

from app.core.binary import to_data_uri
from app.core.storage import Storage
from app.schemas.spec import DesignSpec

log = logging.getLogger(__name__)


def asset_files(spec: DesignSpec, storage: Storage) -> dict[str, str]:
    """{project path: data URI} for every extracted picture of the spec."""
    out: dict[str, str] = {}
    for path, key in spec.assets.items():
        try:
            data = storage.get(key)
        except (FileNotFoundError, ValueError, OSError):
            log.warning("extracted image %s is missing from storage", key)
            continue
        target = f"public/{path}" if spec.framework == "react-vite" else path  # Vite serves public/ at /
        out[target] = to_data_uri(data, path)
    return out
