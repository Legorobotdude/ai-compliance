"""Repositories for Postgres access."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any, Sequence
from uuid import UUID

import orjson

from .db import Database
from .models import (
    BomRecord,
    CertificateStatusRow,
    DocumentRecord,
    LlmAgent,
    SupplierDeadline,
    SupplierRecord
)


class DocumentRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def fetch_document(self, tenant_id: UUID, document_id: UUID) -> DocumentRecord | None:
        row = await self._db.fetchrow(
            """
            select id, tenant_id, filename, mime, bytes, storage_url, sha256, parsed_json
            from documents
            where tenant_id = $1 and id = $2
            """,
            tenant_id,
            document_id
        )
        if not row:
            return None
        return DocumentRecord(
            id=row["id"],
            tenant_id=row["tenant_id"],
            filename=row["filename"],
            mime=row["mime"],
            byte_size=row["bytes"],
            storage_url=row["storage_url"],
            sha256=row["sha256"],
            parsed_json=row["parsed_json"]
        )

    async def update_parsed_json(self, tenant_id: UUID, document_id: UUID, payload: dict[str, Any]) -> None:
        await self._db.execute(
            """
            update documents
            set parsed_json = $3::jsonb
            where tenant_id = $1 and id = $2
            """,
            tenant_id,
            document_id,
            _json_dump(payload)
        )


class SupplierRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def fetch_supplier(self, tenant_id: UUID, supplier_id: UUID) -> SupplierRecord | None:
        row = await self._db.fetchrow(
            """
            select id, tenant_id, name, language, country, response_avg_days, compliance_rate
            from suppliers
            where tenant_id = $1 and id = $2
            """,
            tenant_id,
            supplier_id
        )
        if not row:
            return None
        return SupplierRecord(
            id=row["id"],
            tenant_id=row["tenant_id"],
            name=row["name"],
            language=row["language"],
            country=row["country"],
            response_avg_days=row["response_avg_days"],
            compliance_rate=row["compliance_rate"]
        )

    async def fetch_bom(self, tenant_id: UUID, bom_id: UUID) -> BomRecord | None:
        row = await self._db.fetchrow(
            """
            select b.id, b.tenant_id, b.product_id, b.bom_external_id, p.product_name
            from boms b
            join products p on p.id = b.product_id
            where b.tenant_id = $1 and b.id = $2
            """,
            tenant_id,
            bom_id
        )
        if not row:
            return None
        return BomRecord(
            id=row["id"],
            tenant_id=row["tenant_id"],
            product_id=row["product_id"],
            bom_external_id=row["bom_external_id"],
            product_name=row["product_name"]
        )

    async def blocked_parts(self, tenant_id: UUID, supplier_id: UUID, bom_id: UUID) -> Sequence[dict[str, Any]]:
        return await self._db.fetch(
            """
            select part_number, assembly_id, reason
            from v_blocked_supplier_parts
            where tenant_id = $1 and supplier_id = $2 and bom_id = $3
            order by part_number
            """,
            tenant_id,
            supplier_id,
            bom_id
        )

    async def nearest_certificate_deadline(self, tenant_id: UUID, supplier_id: UUID) -> SupplierDeadline:
        row = await self._db.fetchrow(
            """
            select min(valid_until) as expires_at
            from certificates
            where tenant_id = $1 and supplier_id = $2 and valid_until >= current_date
            """,
            tenant_id,
            supplier_id
        )
        if not row or not row["expires_at"]:
            return SupplierDeadline(certificate_expires_at=None, days_until_expiry=None)
        expires_at_value = row["expires_at"]
        if isinstance(expires_at_value, datetime):
            expires_at = expires_at_value.astimezone(timezone.utc)
        else:
            expires_at = datetime.combine(expires_at_value, time.min, tzinfo=timezone.utc)
        utc_now = datetime.now(timezone.utc)
        days = (expires_at.date() - utc_now.date()).days
        return SupplierDeadline(certificate_expires_at=expires_at, days_until_expiry=days)


class RiskRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def fetch_bom_by_id(self, tenant_id: UUID, bom_id: UUID) -> BomRecord | None:
        return await SupplierRepository(self._db).fetch_bom(tenant_id, bom_id)

    async def fetch_latest_bom_for_product(self, tenant_id: UUID, product_id: UUID) -> BomRecord | None:
        row = await self._db.fetchrow(
            """
            select b.id, b.tenant_id, b.product_id, b.bom_external_id, p.product_name
            from boms b
            join products p on p.id = b.product_id
            where b.tenant_id = $1 and b.product_id = $2
            order by b.uploaded_at desc
            limit 1
            """,
            tenant_id,
            product_id
        )
        if not row:
            return None
        return BomRecord(
            id=row["id"],
            tenant_id=row["tenant_id"],
            product_id=row["product_id"],
            bom_external_id=row["bom_external_id"],
            product_name=row["product_name"]
        )

    async def compliance_rows(self, tenant_id: UUID, bom_id: UUID) -> Sequence[CertificateStatusRow]:
        rows = await self._db.fetch(
            """
            select
                v.part_number,
                v.assembly_id,
                s.name as supplier_name,
                v.supplier_id,
                v.status,
                v.status as reason,
                v.findings,
                v.valid_until
            from v_compliance_status v
            left join suppliers s
              on s.id = v.supplier_id
             and s.tenant_id = v.tenant_id
            where v.tenant_id = $1 and v.bom_id = $2
            order by v.part_number
            """,
            tenant_id,
            bom_id
        )
        return [
            CertificateStatusRow(
                part_number=row["part_number"],
                assembly_id=row["assembly_id"],
                supplier_name=row["supplier_name"],
                supplier_id=row["supplier_id"],
                status=row["status"],
                reason=row["reason"],
                findings=row["findings"] or [],
                valid_until=row["valid_until"]
            )
            for row in rows
        ]


class LlmLogRepository:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def record_llm_call(
        self,
        *,
        tenant_id: UUID,
        agent: LlmAgent,
        prompt_hash: str,
        input_payload: dict[str, Any],
        output_payload: dict[str, Any],
        model: str,
        latency_ms: int
    ) -> None:
        await self._db.execute(
            """
            insert into llm_calls (tenant_id, agent, prompt_hash, input_json, output_json, model, latency_ms)
            values ($1, $2::llm_agent, $3, $4::jsonb, $5::jsonb, $6, $7)
            """,
            tenant_id,
            agent.value,
            prompt_hash,
            _json_dump(input_payload),
            _json_dump(output_payload),
            model,
            latency_ms
        )

    async def append_audit_log(
        self,
        *,
        tenant_id: UUID,
        action: str,
        target: str,
        payload: dict[str, Any]
    ) -> None:
        await self._db.execute(
            """
            insert into audit_logs (tenant_id, actor_user_id, action, target, payload_json)
            values ($1, null, $2, $3, $4::jsonb)
            """,
            tenant_id,
            action,
            target,
            _json_dump(payload)
        )


def _json_dump(payload: Any) -> str:
    return orjson.dumps(payload, default=str).decode()
