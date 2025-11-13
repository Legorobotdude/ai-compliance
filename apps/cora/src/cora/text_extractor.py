"""Utilities to convert stored documents into prompt-friendly text."""

from __future__ import annotations

import asyncio
from io import BytesIO
from typing import Final

from .models import DocumentRecord
from .storage import StorageClient

try:
    from pypdf import PdfReader  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - dependency optional in some envs
    PdfReader = None  # type: ignore[assignment]


class TextExtractionError(RuntimeError):
    """Raised when document bytes cannot be converted to text."""


class TextExtractor:
    _TEXTUAL_MIME_PREFIXES: Final[tuple[str, ...]] = ("text/",)
    _TEXTUAL_MIME_EXACT: Final[set[str]] = {
        "application/json",
        "application/xml",
        "application/xhtml+xml",
        "application/csv",
        "application/x-yaml",
        "application/yaml"
    }

    def __init__(self, storage: StorageClient) -> None:
        self._storage = storage

    async def extract_text(self, document: DocumentRecord) -> str:
        raw = await self._storage.fetch_bytes(document.storage_url)
        if not raw:
            return ""
        mime = (document.mime or "").lower()

        if self._is_plaintext_mime(mime):
            return raw.decode("utf-8", errors="ignore")

        if mime == "application/pdf":
            return await self._pdf_to_text(raw)

        # Default: attempt utf-8 decode even for unknown application types.
        return raw.decode("utf-8", errors="ignore")

    def _is_plaintext_mime(self, mime: str) -> bool:
        return mime.startswith(self._TEXTUAL_MIME_PREFIXES) or mime in self._TEXTUAL_MIME_EXACT

    async def _pdf_to_text(self, data: bytes) -> str:
        if PdfReader is None:
            raise TextExtractionError("PDF support requires the pypdf dependency")

        def _extract() -> str:
            try:
                reader = PdfReader(BytesIO(data))
                pages = []
                for page in reader.pages:
                    pages.append(page.extract_text() or "")
                return "\n".join(pages).strip()
            except Exception as exc:  # pragma: no cover - pdf parsing errors
                raise TextExtractionError("Failed to extract text from PDF") from exc

        return await asyncio.to_thread(_extract)
