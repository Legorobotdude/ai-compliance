"""Object storage helpers for fetching document bytes."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import Settings

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ModuleNotFoundError:  # pragma: no cover - boto3 optional in some envs
    boto3 = None  # type: ignore[assignment]

    class BotoCoreError(Exception):
        ...

    class ClientError(Exception):
        ...


class StorageError(RuntimeError):
    """Raised when object storage retrieval fails."""


class StorageClient:
    """Supports http(s), file://, and s3:// URIs (with sample data fallback)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._http = httpx.AsyncClient(timeout=settings.storage_http_timeout_seconds)
        self._s3_client: Any | None = None
        self._closed = False
        self._sample_dir = (
            Path(settings.storage_sample_data_dir).expanduser()
            if settings.storage_sample_data_dir
            else None
        )
        if self._sample_dir and not self._sample_dir.exists():
            logger.warning("Sample data directory %s not found", self._sample_dir)
            self._sample_dir = None

    async def close(self) -> None:
        if not self._closed:
            await self._http.aclose()
            self._closed = True

    async def fetch_bytes(self, storage_url: str) -> bytes:
        parsed = urlparse(storage_url)
        scheme = (parsed.scheme or "").lower()

        if scheme in {"http", "https"}:
            return await self._fetch_http(storage_url)

        if scheme == "file":
            return await self._read_local_file(Path(parsed.path))

        if scheme == "s3":
            bucket = parsed.netloc
            key = parsed.path.lstrip("/")
            return await self._fetch_s3(bucket, key)

        if not scheme:
            return await self._read_local_file(Path(storage_url))

        raise StorageError(f"Unsupported storage scheme: {scheme}")

    async def _fetch_http(self, url: str) -> bytes:
        try:
            response = await self._http.get(url)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise StorageError(f"HTTP fetch failed for {url}") from exc
        return response.content

    async def _read_local_file(self, path: Path) -> bytes:
        if not path.exists():
            raise StorageError(f"Local file not found: {path}")
        return await asyncio.to_thread(path.read_bytes)

    async def _fetch_s3(self, bucket: str, key: str) -> bytes:
        if bucket == "sample" and self._sample_dir:
            local_path = (self._sample_dir / key).resolve()
            return await self._read_local_file(local_path)

        client = self._ensure_s3_client()

        def _download() -> bytes:
            try:
                response = client.get_object(Bucket=bucket, Key=key)
                body = response["Body"].read()
                if not isinstance(body, bytes):
                    raise StorageError(f"S3 body for s3://{bucket}/{key} is not bytes")
                return body
            except (BotoCoreError, ClientError) as exc:
                raise StorageError(f"S3 fetch failed for s3://{bucket}/{key}") from exc

        return await asyncio.to_thread(_download)

    def _ensure_s3_client(self):
        if self._s3_client is None:
            if boto3 is None:
                raise StorageError("boto3 is required for s3:// URLs but is not installed")
            kwargs: dict[str, Any] = {}
            if self._settings.storage_s3_region:
                kwargs["region_name"] = self._settings.storage_s3_region
            if self._settings.storage_s3_endpoint_url:
                kwargs["endpoint_url"] = self._settings.storage_s3_endpoint_url
            self._s3_client = boto3.client("s3", **kwargs)
        return self._s3_client
