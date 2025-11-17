"""API router exposing /ai endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .dependencies import get_service_container, get_tenant_context
from .models import (
    ChatRequest,
    ChatResponse,
    DocumentParseRequest,
    DocumentParseResponse,
    RiskSummaryRequest,
    RiskSummaryResponse,
    SupplierEmailRequest,
    SupplierEmailResponse,
    TenantContext
)
from .services import ServiceContainer

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/parse-document", response_model=DocumentParseResponse)
async def parse_document(
    payload: DocumentParseRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    services: ServiceContainer = Depends(get_service_container)
) -> DocumentParseResponse:
    return await services.document_parser.parse(tenant.tenant_id, payload)


@router.post("/supplier-email", response_model=SupplierEmailResponse)
async def supplier_email(
    payload: SupplierEmailRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    services: ServiceContainer = Depends(get_service_container)
) -> SupplierEmailResponse:
    return await services.supplier_email.generate(tenant.tenant_id, payload)


@router.post("/risk-summary", response_model=RiskSummaryResponse)
async def risk_summary(
    payload: RiskSummaryRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    services: ServiceContainer = Depends(get_service_container)
) -> RiskSummaryResponse:
    return await services.risk_summary.summarize(tenant.tenant_id, payload)


@router.post("/chat", response_model=ChatResponse)
async def chat_completion(
    payload: ChatRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    services: ServiceContainer = Depends(get_service_container)
) -> ChatResponse:
    return await services.chat.respond(tenant.tenant_id, payload)
