"""FastAPI dependency helpers."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Header, HTTPException, Request, status

from .config import Settings, get_settings
from .models import TenantContext
from .services import ServiceContainer


def get_settings_dependency() -> Settings:
    return get_settings()


def get_service_container(request: Request) -> ServiceContainer:
    container = getattr(request.app.state, "services", None)
    if not container:
        raise RuntimeError("Service container not configured on app state")
    return container


async def get_tenant_context(x_tenant_id: Annotated[str | None, Header(convert_underscores=False, alias="X-Tenant-Id")] = None) -> TenantContext:
    if not x_tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Tenant-Id header is required")
    try:
        tenant_uuid = UUID(x_tenant_id)
    except ValueError as ex:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tenant id") from ex
    return TenantContext(tenant_id=tenant_uuid)
