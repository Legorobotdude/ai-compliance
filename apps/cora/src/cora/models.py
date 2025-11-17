"""Shared request/response schemas and lightweight domain records."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, AnyUrl, BaseModel, Field, FieldValidationInfo, PositiveInt, field_validator


class LlmAgent(str, Enum):
    DOCUMENT_PARSE = "DOCUMENT_PARSE"
    SUPPLIER_EMAIL = "SUPPLIER_EMAIL"
    RISK_SUMMARY = "RISK_SUMMARY"
    CHAT = "CHAT"


class TenantContext(BaseModel):
    tenant_id: UUID


class CertificateFinding(BaseModel):
    substance_name: str
    concentration_value: float | None = None
    concentration_unit: Optional[Literal["%", "ppm", "mg/kg"]] = None
    concentration_ppm: float | None = None
    notes: str | None = None

    @field_validator("concentration_value")
    @classmethod
    def validate_positive(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if value < 0:
            raise ValueError("concentration_value must be >= 0")
        return value


class DocumentPartFinding(BaseModel):
    part_number: str
    findings: list[CertificateFinding]


class DocumentParsePayload(BaseModel):
    doc_ref: str
    parts: list[DocumentPartFinding]
    ambiguities: list[str] = Field(default_factory=list)


class DocumentParseRequest(BaseModel):
    document_id: UUID
    schema: Literal["certificate_v1"] = "certificate_v1"
    download_url: AnyUrl | None = None

    @field_validator("download_url")
    @classmethod
    def ensure_supported_scheme(cls, value: AnyUrl | None) -> AnyUrl | None:
        if value is None:
            return value
        if value.scheme not in {"http", "https", "s3", "file"}:
            raise ValueError("URL scheme should be http, https, s3, or file")
        return value


class DocumentParseResponse(DocumentParsePayload):
    validation_report: list[str] = Field(default_factory=list)


class SupplierEmailRequest(BaseModel):
    supplier_id: UUID
    bom_id: UUID
    language: str | None = None
    tone: Literal["formal", "neutral", "friendly"] | None = None


class SupplierEmailResponse(BaseModel):
    supplier_id: UUID
    bom_id: UUID
    subject: str
    body: str
    due_date: datetime
    language: str


class SupplierEmailDraft(BaseModel):
    subject: str
    body: str


class RiskSummaryRequest(BaseModel):
    bom_id: UUID | None = None
    product_id: UUID | None = None

    @field_validator("product_id")
    @classmethod
    def ensure_one_identifier(cls, value: UUID | None, info: FieldValidationInfo) -> UUID | None:
        if value is None and info.data.get("bom_id") is None:
            raise ValueError("Either bom_id or product_id must be provided.")
        return value


class SupplierGap(BaseModel):
    supplier_name: str = Field(validation_alias=AliasChoices("supplier_name", "supplier"))
    reason: Literal["MISSING", "EXPIRED", "OVER_LIMIT"]
    part_numbers: list[str]
    eta_days: PositiveInt

    @field_validator("reason", mode="before")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        if isinstance(value, str):
            cleaned = value.strip().upper().replace("-", "_").replace(" ", "_")
            mapping = {
                "MISSING": "MISSING",
                "SUPPLIER_MISSING": "MISSING",
                "MISSING_CERTIFICATES": "MISSING",
                "EXPIRED": "EXPIRED",
                "EXPIRED_CERTIFICATES": "EXPIRED",
                "EXPIRED_CERTIFICATE": "EXPIRED",
                "OVER_LIMIT": "OVER_LIMIT",
                "OVER_LIMITS": "OVER_LIMIT",
                "OVER_LIMIT_PARTS": "OVER_LIMIT",
                "OVER_LIMITED": "OVER_LIMIT",
                "OVERLIMIT": "OVER_LIMIT"
            }
            normalized = mapping.get(cleaned)
            if normalized:
                return normalized
            keywords = ("MISSING", "EXPIRED", "OVER_LIMIT")
            matches: list[tuple[int, str]] = []
            for keyword in keywords:
                try:
                    idx = cleaned.index(keyword)
                except ValueError:
                    continue
                matches.append((idx, keyword))
            if matches:
                matches.sort(key=lambda item: item[0])
                return matches[0][1]
        return value


class RiskSummaryResponse(BaseModel):
    summary: str
    exec_summary: str
    top_gaps: list[SupplierGap]
    stats: dict[str, float | int]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatContextChunk(BaseModel):
    chunk_id: UUID
    content: str
    source_title: str
    source_url: str | None = None
    score: float | None = None


class ChatCitation(BaseModel):
    chunk_id: UUID
    quote: str
    relevance: float | None = None


class ChatRequest(BaseModel):
    conversation_id: UUID | None = None
    messages: list[ChatMessage]
    context_chunks: list[ChatContextChunk] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: UUID
    message_id: UUID
    answer: str
    citations: list[ChatCitation]


@dataclass(slots=True)
class DocumentRecord:
    id: UUID
    tenant_id: UUID
    filename: str
    mime: str
    byte_size: int
    storage_url: str
    sha256: str
    parsed_json: dict | None


@dataclass(slots=True)
class SupplierRecord:
    id: UUID
    tenant_id: UUID
    name: str
    language: str | None
    country: str | None
    response_avg_days: float | None
    compliance_rate: float | None


@dataclass(slots=True)
class BomRecord:
    id: UUID
    tenant_id: UUID
    product_id: UUID
    bom_external_id: str
    product_name: str


@dataclass(slots=True)
class CertificateStatusRow:
    part_number: str
    assembly_id: str | None
    supplier_name: str | None
    supplier_id: UUID | None
    status: str
    reason: str | None
    findings: list[dict]
    valid_until: datetime | date | None


@dataclass(slots=True)
class SupplierDeadline:
    certificate_expires_at: datetime | None
    days_until_expiry: int | None


def compute_due_date(avg_response_days: float | None) -> datetime:
    """Use Architecture.md guardrail: avg response + 2 day buffer."""

    baseline = avg_response_days or 7.0
    buffer_days = baseline + 2
    return datetime.utcnow() + timedelta(days=buffer_days)
