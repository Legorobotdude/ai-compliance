"""Domain services orchestrating repositories, guardrails, and LLM prompts."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from collections import Counter, defaultdict
from typing import Any, Iterable, Sequence
from uuid import UUID

from fastapi import HTTPException, status

from .config import Settings
from .llm import LLMClient
from .models import (
    BomRecord,
    CertificateStatusRow,
    DocumentParsePayload,
    DocumentParseRequest,
    DocumentParseResponse,
    DocumentRecord,
    LlmAgent,
    RiskSummaryRequest,
    RiskSummaryResponse,
    SupplierEmailRequest,
    SupplierEmailDraft,
    SupplierEmailResponse,
    SupplierGap,
    compute_due_date
)
from .prompts import (
    DOCUMENT_PARSE_SYSTEM,
    DOCUMENT_PARSE_USER_TEMPLATE,
    RISK_SUMMARY_SYSTEM,
    RISK_SUMMARY_USER_TEMPLATE,
    SUPPLIER_EMAIL_SYSTEM,
    SUPPLIER_EMAIL_USER_TEMPLATE
)
from .repositories import DocumentRepository, LlmLogRepository, RiskRepository, SupplierRepository
from .storage import StorageError
from .text_extractor import TextExtractor, TextExtractionError


class DocumentParserService:
    def __init__(
        self,
        *,
        llm: LLMClient,
        documents: DocumentRepository,
        text_extractor: TextExtractor,
        logger: LlmLogRepository,
        settings: Settings
    ) -> None:
        self._llm = llm
        self._documents = documents
        self._text_extractor = text_extractor
        self._logger = logger
        self._settings = settings

    async def parse(self, tenant_id: UUID, payload: DocumentParseRequest) -> DocumentParseResponse:
        document = await self._documents.fetch_document(tenant_id, payload.document_id)
        if not document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        excerpt = await self._load_excerpt(document)

        user_prompt = DOCUMENT_PARSE_USER_TEMPLATE.format(
            filename=document.filename,
            mime=document.mime,
            doc_ref=str(document.id),
            assembly_count="unknown",
            excerpt_chars=len(excerpt),
            excerpt=excerpt
        )

        llm_payload = await self._llm.complete_json(
            agent_name=LlmAgent.DOCUMENT_PARSE.value,
            system_prompt=DOCUMENT_PARSE_SYSTEM,
            user_prompt=user_prompt,
            response_model=DocumentParsePayload
        )
        normalized = self._normalize_findings(
            DocumentParseResponse(**llm_payload.payload.model_dump())
        )

        await self._documents.update_parsed_json(
            tenant_id,
            document.id,
            normalized.model_dump()
        )

        await self._logger.record_llm_call(
            tenant_id=tenant_id,
            agent=LlmAgent.DOCUMENT_PARSE,
            prompt_hash=llm_payload.prompt_hash,
            input_payload=payload.model_dump(),
            output_payload=normalized.model_dump(),
            model=llm_payload.model,
            latency_ms=llm_payload.latency_ms
        )
        await self._logger.append_audit_log(
            tenant_id=tenant_id,
            action="DOCUMENT_PARSED",
            target=str(document.id),
            payload={"schema": payload.schema, "doc_ref": normalized.doc_ref}
        )
        return normalized

    async def _load_excerpt(self, document: DocumentRecord) -> str:
        try:
            full_text = await self._text_extractor.extract_text(document)
        except StorageError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to read document from storage"
            ) from exc
        except TextExtractionError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc)
            ) from exc

        excerpt = full_text[: self._settings.document_text_char_budget]
        if not excerpt.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Document content is empty after extraction"
            )
        return excerpt

    def _normalize_findings(self, response: DocumentParseResponse) -> DocumentParseResponse:
        validation_report: list[str] = []
        for part in response.parts:
            for finding in part.findings:
                ppm = finding.concentration_ppm
                if ppm is None and finding.concentration_unit:
                    ppm = convert_to_ppm(finding.concentration_value, finding.concentration_unit)
                    finding.concentration_ppm = ppm
                if ppm is not None and (ppm < 0 or ppm > 2_000_000):
                    validation_report.append(
                        f"{part.part_number}:{finding.substance_name} has suspicious ppm {ppm}"
                    )
        response.validation_report = validation_report
        return response


class SupplierEmailService:
    def __init__(
        self,
        *,
        llm: LLMClient,
        suppliers: SupplierRepository,
        logger: LlmLogRepository,
        settings: Settings
    ) -> None:
        self._llm = llm
        self._suppliers = suppliers
        self._logger = logger
        self._settings = settings

    async def generate(self, tenant_id: UUID, payload: SupplierEmailRequest) -> SupplierEmailResponse:
        supplier = await self._suppliers.fetch_supplier(tenant_id, payload.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

        bom = await self._suppliers.fetch_bom(tenant_id, payload.bom_id)
        if not bom:
            raise HTTPException(status_code=404, detail="BOM not found")

        blocked_parts = await self._suppliers.blocked_parts(tenant_id, supplier.id, bom.id)
        if not blocked_parts:
            raise HTTPException(status_code=400, detail="No outstanding issues for this supplier/BOM")

        deadline = await self._suppliers.nearest_certificate_deadline(tenant_id, supplier.id)
        due_date = compute_due_date(supplier.response_avg_days)

        blocked_lines = "\n".join(
            f"- Assembly {row['assembly_id'] or 'n/a'} → part {row['part_number']} ({row['reason']})"
            for row in blocked_parts
        )

        expiry_note = (
            f"Certificate expires {deadline.certificate_expires_at.date().isoformat()}"
            if deadline.certificate_expires_at and (deadline.days_until_expiry or 999) <= 90
            else "No expiry within 90 days"
        )

        language = payload.language or supplier.language or "en"
        tone = payload.tone or "neutral"

        user_prompt = SUPPLIER_EMAIL_USER_TEMPLATE.format(
            supplier_name=supplier.name,
            country=supplier.country or "unknown",
            language=language,
            response_days=supplier.response_avg_days or "unknown",
            compliance_rate=f"{(supplier.compliance_rate or 0.0)*100:.0f}%",
            product_name=bom.product_name,
            bom_external_id=bom.bom_external_id,
            blocked_parts=blocked_lines,
            expiry_note=expiry_note,
            upload_url=self._settings.secure_upload_url,
            tone=tone
        )

        draft = await self._llm.complete_json(
            agent_name=LlmAgent.SUPPLIER_EMAIL.value,
            system_prompt=SUPPLIER_EMAIL_SYSTEM,
            user_prompt=user_prompt,
            response_model=SupplierEmailDraft
        )

        response = SupplierEmailResponse(
            supplier_id=supplier.id,
            bom_id=bom.id,
            subject=draft.payload.subject,
            body=draft.payload.body,
            due_date=due_date,
            language=language
        )

        await self._logger.record_llm_call(
            tenant_id=tenant_id,
            agent=LlmAgent.SUPPLIER_EMAIL,
            prompt_hash=draft.prompt_hash,
            input_payload={
                **payload.model_dump(),
                "context": {
                    "blocked_parts": blocked_parts,
                    "due_date": due_date.isoformat()
                }
            },
            output_payload=response.model_dump(),
            model=draft.model,
            latency_ms=draft.latency_ms
        )
        await self._logger.append_audit_log(
            tenant_id=tenant_id,
            action="SUPPLIER_EMAIL_DRAFTED",
            target=str(supplier.id),
            payload={"bom_id": str(bom.id), "due_date": due_date.isoformat()}
        )
        return response


class RiskSummaryService:
    def __init__(
        self,
        *,
        llm: LLMClient,
        risks: RiskRepository,
        logger: LlmLogRepository
    ) -> None:
        self._llm = llm
        self._risks = risks
        self._logger = logger

    async def summarize(self, tenant_id: UUID, payload: RiskSummaryRequest) -> RiskSummaryResponse:
        bom: BomRecord | None = None
        if payload.bom_id:
            bom = await self._risks.fetch_bom_by_id(tenant_id, payload.bom_id)
        elif payload.product_id:
            bom = await self._risks.fetch_latest_bom_for_product(tenant_id, payload.product_id)

        if not bom:
            raise HTTPException(status_code=404, detail="BOM/Product not found")

        rows = await self._risks.compliance_rows(tenant_id, bom.id)
        if not rows:
            raise HTTPException(status_code=400, detail="No compliance data for BOM")

        stats = Counter(row.status for row in rows)
        now = datetime.now(timezone.utc)
        upcoming = sum(
            1
            for row in rows
            if row.valid_until and 0 <= days_until(row.valid_until, now) <= 90
        )
        supplier_buckets: dict[str, dict[str, Any]] = defaultdict(lambda: {"parts": [], "reasons": set()})
        for row in rows:
            if row.supplier_name and row.status in {"MISSING", "OVER_LIMIT", "EXPIRED"}:
                bucket = supplier_buckets[row.supplier_name]
                bucket["parts"].append(row.part_number)
                bucket["reasons"].add(row.status)

        supplier_gap_lines = "\n".join(
            f"- {name}: {', '.join(list(bucket['parts'])[:5])} ({', '.join(bucket['reasons'])})"
            for name, bucket in list(supplier_buckets.items())[:3]
        )

        findings_lines = self._format_findings(rows)

        user_prompt = RISK_SUMMARY_USER_TEMPLATE.format(
            product_name=bom.product_name,
            bom_external_id=bom.bom_external_id,
            assembly_count=len({row.assembly_id for row in rows}),
            over_limit_count=stats.get("OVER_LIMIT", 0),
            missing_count=stats.get("MISSING", 0),
            expired_count=stats.get("EXPIRED", 0),
            upcoming_expirations=upcoming,
            supplier_gaps=supplier_gap_lines or "None",
            recent_findings=findings_lines or "No findings recorded"
        )

        result = await self._llm.complete_json(
            agent_name=LlmAgent.RISK_SUMMARY.value,
            system_prompt=RISK_SUMMARY_SYSTEM,
            user_prompt=user_prompt,
            response_model=RiskSummaryResponse
        )

        stats_payload = {
            "over_limit_parts": stats.get("OVER_LIMIT", 0),
            "missing_parts": stats.get("MISSING", 0),
            "expired_certs": stats.get("EXPIRED", 0),
            "upcoming_expirations": upcoming
        }
        response = RiskSummaryResponse(**{**result.payload.model_dump(), "stats": stats_payload})

        await self._logger.record_llm_call(
            tenant_id=tenant_id,
            agent=LlmAgent.RISK_SUMMARY,
            prompt_hash=result.prompt_hash,
            input_payload=payload.model_dump(),
            output_payload=response.model_dump(),
            model=result.model,
            latency_ms=result.latency_ms
        )
        await self._logger.append_audit_log(
            tenant_id=tenant_id,
            action="RISK_SUMMARY_GENERATED",
            target=str(bom.id),
            payload={"bom_id": str(bom.id)}
        )
        return response

    def _format_findings(self, rows: Sequence[CertificateStatusRow]) -> str:
        lines: list[str] = []
        for row in rows:
            if row.status == "OVER_LIMIT" and row.findings:
                findings_text = ", ".join(
                    f"{f.get('substance')}:{f.get('ppm')}" for f in row.findings[:2]
                )
                lines.append(f"{row.part_number} ({row.supplier_name}): {findings_text}")
            if len(lines) >= 5:
                break
        return "\n".join(lines)


class ServiceContainer:
    """Tiny service locator stored on the FastAPI app state."""

    def __init__(self, *, document_parser: DocumentParserService, supplier_email: SupplierEmailService, risk_summary: RiskSummaryService) -> None:
        self.document_parser = document_parser
        self.supplier_email = supplier_email
        self.risk_summary = risk_summary


def convert_to_ppm(value: float | None, unit: str | None) -> float | None:
    if value is None:
        return None
    if unit == "%":
        return value * 10_000
    if unit in ("ppm", "mg/kg"):
        return value
    return None


def days_until(value: datetime | date, now: datetime) -> int:
    if isinstance(value, datetime):
        target = value.astimezone(timezone.utc)
    else:
        target = datetime.combine(value, time.min, tzinfo=timezone.utc)
    return (target - now).days
