"""FastAPI application wiring for CORA."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings, get_settings
from .db import Database
from .llm import LLMClient
from .repositories import DocumentRepository, LlmLogRepository, RiskRepository, SupplierRepository
from .routes import router as ai_router
from .services import (
    ChatAssistantService,
    DocumentParserService,
    RiskSummaryService,
    ServiceContainer,
    SupplierEmailService
)
from .storage import StorageClient
from .text_extractor import TextExtractor


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    database = Database(settings.database_url)
    llm_client = LLMClient(settings)
    storage_client = StorageClient(settings)
    text_extractor = TextExtractor(storage_client)

    documents = DocumentRepository(database)
    suppliers = SupplierRepository(database)
    risks = RiskRepository(database)
    logger = LlmLogRepository(database)

    services = ServiceContainer(
        document_parser=DocumentParserService(
            llm=llm_client,
            documents=documents,
            text_extractor=text_extractor,
            logger=logger,
            settings=settings
        ),
        supplier_email=SupplierEmailService(llm=llm_client, suppliers=suppliers, logger=logger, settings=settings),
        risk_summary=RiskSummaryService(llm=llm_client, risks=risks, logger=logger),
        chat=ChatAssistantService(llm=llm_client, logger=logger)
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await database.connect()
        try:
            yield
        finally:
            await database.disconnect()
            await storage_client.close()

    app = FastAPI(
        title="CORA AI Sidecar",
        version="0.1.0",
        lifespan=lifespan
    )

    app.state.settings = settings
    app.state.database = database
    app.state.llm_client = llm_client
    app.state.storage_client = storage_client
    app.state.services = services

    @app.get("/healthz", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(ai_router)

    return app
