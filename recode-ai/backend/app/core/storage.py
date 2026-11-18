"""Object storage: local filesystem for development, S3 / MinIO in production."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.core.config import get_settings


class Storage(Protocol):
    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str: ...
    def put_file(self, key: str, path: str, content_type: str = "application/octet-stream") -> str: ...
    def get(self, key: str) -> bytes: ...
    def local_path(self, key: str) -> str: ...
    def exists(self, key: str) -> bool: ...
    def delete_prefix(self, prefix: str) -> None: ...


def _safe_key(key: str) -> str:
    parts = [p for p in key.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    if not parts:
        raise ValueError("empty storage key")
    return "/".join(parts)


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / _safe_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("storage key escapes root")
        return path

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return _safe_key(key)

    def put_file(self, key: str, path: str, content_type: str = "application/octet-stream") -> str:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        if os.path.abspath(path) != str(target):
            with open(path, "rb") as src, open(target, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
        return _safe_key(key)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def local_path(self, key: str) -> str:
        return str(self._path(key))

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def delete_prefix(self, prefix: str) -> None:
        import shutil

        path = self._path(prefix)
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.exists():
            path.unlink()


class S3Storage:
    def __init__(self) -> None:
        import boto3

        s = get_settings()
        self.bucket = s.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint_url,
            aws_access_key_id=s.s3_access_key,
            aws_secret_access_key=s.s3_secret_key,
            region_name=s.s3_region,
        )
        self.cache = Path(s.storage_root, "_s3cache").resolve()
        self.cache.mkdir(parents=True, exist_ok=True)
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        key = _safe_key(key)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def put_file(self, key: str, path: str, content_type: str = "application/octet-stream") -> str:
        key = _safe_key(key)
        self.client.upload_file(path, self.bucket, key, ExtraArgs={"ContentType": content_type})
        return key

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=_safe_key(key))["Body"].read()

    def local_path(self, key: str) -> str:
        """Download once into a local cache; OpenCV / FFmpeg need a real file."""
        key = _safe_key(key)
        target = (self.cache / key).resolve()
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(self.bucket, key, str(target))
        return str(target)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=_safe_key(key))
            return True
        except Exception:
            return False

    def delete_prefix(self, prefix: str) -> None:
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=_safe_key(prefix)):
            objects = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objects:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects})


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    if settings.storage_backend == "s3":
        return S3Storage()
    return LocalStorage(settings.storage_root)
