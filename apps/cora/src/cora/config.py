"""Application configuration and environment loading."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_SAMPLE_DATA = _REPO_ROOT / "Sample Data"


class Settings(BaseSettings):
    """Configuration for the CORA sidecar (Architecture.md §4)."""

    model_config = SettingsConfigDict(env_prefix="CORA_", env_file=".env", extra="allow")

    app_name: str = "cora-ai"
    environment: Literal["local", "dev", "staging", "prod"] = "local"

    database_url: str = Field(..., description="Postgres connection string.")

    openai_api_key: str = Field(..., description="API key for OpenAI LLM access.")
    openai_model: str = Field(
        default="gpt-4o-mini",
        description="Model used for JSON/structured prompts."
    )
    openai_temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Default sampling temperature when not overridden per-tenant."
    )
    openai_top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    openai_max_output_tokens: int = Field(default=1200, ge=256, le=4096)
    openai_request_timeout_seconds: float = Field(default=300.0, ge=5.0, le=1000.0)
    openai_max_retries: int = Field(default=3, ge=0, le=6)

    document_text_char_budget: int = Field(default=20_000, ge=2_000, le=80_000)
    supplier_email_word_limit: int = Field(default=200)
    secure_upload_url: HttpUrl | None = Field(
        default="https://app.certivo.com/uploads",
        description="Link referenced in supplier outreach emails."
    )

    rate_limit_per_tenant_per_minute: int = Field(default=120, ge=30, le=600)
    storage_http_timeout_seconds: float = Field(default=30.0, ge=5.0, le=120.0)
    storage_sample_data_dir: str | None = Field(
        default=str(_DEFAULT_SAMPLE_DATA) if _DEFAULT_SAMPLE_DATA.exists() else None,
        description="Local directory fallback for sample S3 URLs."
    )
    storage_s3_endpoint_url: str | None = Field(
        default=None,
        description="Optional override for S3-compatible endpoint (e.g., MinIO)."
    )
    storage_s3_region: str | None = Field(
        default=None,
        description="AWS region for S3 client; falls back to boto defaults."
    )

@lru_cache(1)
def get_settings() -> Settings:
    """Return cached settings instance."""

    return Settings()  # type: ignore[arg-type]
