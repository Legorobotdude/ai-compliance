import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ParsedQs } from 'qs';
import { randomUUID } from 'crypto';
import { join } from 'node:path';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import {
  ApiController,
  ApiModuleFactory,
  type HttpRequest,
  type HttpResponse,
  aiParseDocumentSchema,
  aiRiskSummarySchema,
  aiSupplierEmailSchema,
  bomUploadSchema,
  certificateUploadSchema,
  documentUploadSchema,
  impactPredictSchema,
  supplierRequestSchema,
  uuidSchema,
  ragDocumentIngestSchema,
  aiChatSchema,
  validateWithSchema,
  RequestValidationError
} from '@certivo/gateway';
import type { BomUploadRequest, CertificateUploadRequest } from '@certivo/compliance';
import type { DocumentIngestRequest, SearchFilters } from '@certivo/search-rag';
import type { DocumentController, UploadRequest } from '@certivo/file-document';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import type { SupplierRequestInput } from '@certivo/supplier';
import type { AiParseDocumentRequest, AiRiskSummaryRequest, AiSupplierEmailRequest } from '@certivo/cora';
import {
  createTemporalWorkflowClient,
  type TemporalClientRuntime,
  type WorkflowTaskQueues
} from '@certivo/jobs-workflows';
import {
  createPgDatabaseClient,
  runWithTenantContext,
  type DatabaseClient,
  type TenantID,
  type UUID
} from '@certivo/lib-db';
import { createLogger, createRequestLogger, type Logger } from '@certivo/lib-logging';
import {
  AuthorizationError,
  JwtVerifier,
  extractBearerToken,
  type AuthenticatedUser
} from '@certivo/lib-auth';

const PORT = Number(process.env.PORT ?? 4000);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/certivo';
const API_VERSION = '2024-01-31';
const AUTH_ISSUER = process.env.AUTH_ISSUER ?? 'https://auth.certivo.local/';
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE;
const AUTH_JWKS_URL = process.env.AUTH_JWKS_URL;
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET;
const AUTH_TENANT_CLAIM = process.env.AUTH_TENANT_CLAIM;
const AUTH_ROLES_CLAIM = process.env.AUTH_ROLES_CLAIM;
const AUTH_EMAIL_CLAIM = process.env.AUTH_EMAIL_CLAIM;
const CORA_API_URL = process.env.CORA_API_URL ?? 'http://localhost:8082';
const CORA_API_KEY = process.env.CORA_API_KEY;
const CORA_API_TIMEOUT_MS = process.env.CORA_API_TIMEOUT_MS ? Number(process.env.CORA_API_TIMEOUT_MS) : undefined;
const DOCUMENTS_PUBLIC_BASE_URL =
  process.env.DOCUMENTS_PUBLIC_BASE_URL ?? process.env.CERTIVO_API_URL ?? `http://localhost:${PORT}`;
const DOCUMENTS_SIGNING_SECRET = process.env.DOCUMENTS_SIGNING_SECRET ?? AUTH_JWT_SECRET ?? 'dev-docs-secret';
const DOCUMENTS_DOWNLOAD_TTL_MS = process.env.DOCUMENTS_DOWNLOAD_TTL_MS
  ? Number(process.env.DOCUMENTS_DOWNLOAD_TTL_MS)
  : undefined;
const DOCUMENTS_LOCAL_ROOT =
  process.env.DOCUMENTS_LOCAL_ROOT ?? join(process.cwd(), '..', '..', '.certivo', 'documents');

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS;
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE;
const TEMPORAL_SUPPLIER_TASK_QUEUE = process.env.TEMPORAL_SUPPLIER_TASK_QUEUE;
const TEMPORAL_INGESTION_TASK_QUEUE = process.env.TEMPORAL_INGESTION_TASK_QUEUE;
type MetricLabel = 'method' | 'route' | 'status';

export async function startApiServer(): Promise<void> {
  const { db, pool } = createPgDatabaseClient({ connectionString: DATABASE_URL });
  const logger = createLogger({ name: 'certivo-api' });
  const metrics = createApiMetrics();
  let workflowRuntime: TemporalClientRuntime | null = null;
  try {
    const taskQueues: Partial<WorkflowTaskQueues> = {};
    if (TEMPORAL_SUPPLIER_TASK_QUEUE) {
      taskQueues.supplier = TEMPORAL_SUPPLIER_TASK_QUEUE;
    }
    if (TEMPORAL_INGESTION_TASK_QUEUE) {
      taskQueues.ingestion = TEMPORAL_INGESTION_TASK_QUEUE;
    }
    workflowRuntime = await createTemporalWorkflowClient({
      address: TEMPORAL_ADDRESS,
      namespace: TEMPORAL_NAMESPACE,
      taskQueues
    });
  } catch (error) {
    logger.error({ err: error }, 'api.temporal_connection_failed');
    throw error;
  }
  const workflowClient = workflowRuntime.client;
  if (!CORA_API_URL) {
    logger.error('CORA_API_URL must be set to reach the AI sidecar.');
    process.exit(1);
  }

  const { apiController, documentController } = ApiModuleFactory.create({
    db,
    workflowClient,
    cora: {
      baseUrl: CORA_API_URL,
      apiKey: CORA_API_KEY,
      timeoutMs: CORA_API_TIMEOUT_MS
    },
    documents: {
      localRoot: DOCUMENTS_LOCAL_ROOT,
      publicBaseUrl: DOCUMENTS_PUBLIC_BASE_URL,
      signingSecret: DOCUMENTS_SIGNING_SECRET,
      downloadTtlMs: DOCUMENTS_DOWNLOAD_TTL_MS
    }
  });
  if (!AUTH_JWKS_URL && !AUTH_JWT_SECRET) {
    logger.error(
      'Set AUTH_JWKS_URL (recommended) or AUTH_JWT_SECRET so the API can verify JWTs before starting the server.'
    );
    process.exit(1);
  }
  const jwtVerifier = new JwtVerifier({
    issuer: AUTH_ISSUER,
    audience: AUTH_AUDIENCE,
    jwksUrl: AUTH_JWKS_URL,
    sharedSecret: AUTH_JWT_SECRET,
    tenantClaim: AUTH_TENANT_CLAIM,
    rolesClaim: AUTH_ROLES_CLAIM,
    emailClaim: AUTH_EMAIL_CLAIM
  });
  const app = buildApp({
    controller: apiController,
    documentController,
    db,
    logger,
    metrics,
    jwtVerifier
  });

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, '[api] listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    server.close();
    if (workflowRuntime) {
      await workflowRuntime.shutdown();
    }
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

interface BuildAppOptions {
  controller: ApiController;
  documentController: DocumentController;
  db: DatabaseClient;
  logger: Logger;
  metrics: ApiMetrics;
  jwtVerifier: JwtVerifier;
}

interface AiChatHttpRequest {
  tenantId: string;
  conversationId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  topK?: number;
  filters?: SearchFilters;
}

function buildApp(options: BuildAppOptions): Express {
  const { controller, documentController, db, logger, metrics, jwtVerifier } = options;
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(requestContextMiddleware(logger));
  app.use(apiVersionMiddleware);
  app.use(metricsMiddleware(metrics));
  app.use(requestLoggingMiddleware);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', version: API_VERSION });
  });

  app.get('/readyz', readinessHandler(db));
  app.get('/metrics', metricsHandler(metrics));

  app.get('/documents/raw', async (req, res) => {
    const documentId = typeof req.query.doc === 'string' ? (req.query.doc as UUID) : null;
    const tenantId = typeof req.query.tenant === 'string' ? (req.query.tenant as TenantID) : null;
    const expiresParam = typeof req.query.expires === 'string' ? req.query.expires : null;
    const signature = typeof req.query.sig === 'string' ? req.query.sig : null;
    if (!documentId || !tenantId || !expiresParam || !signature) {
      res.status(400).json({ error: 'Missing signed download parameters' });
      return;
    }
    const expiresAt = Number(expiresParam);
    if (!Number.isFinite(expiresAt)) {
      res.status(400).json({ error: 'Invalid expires value' });
      return;
    }
    try {
      const result = await documentController.streamSignedDownload({
        documentId,
        tenantId,
        expiresAt,
        signature
      });
      res.setHeader('Content-Type', result.document.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${result.document.filename}"`);
      if (result.object.contentLength != null) {
        res.setHeader('Content-Length', String(result.object.contentLength));
      }
      result.object.stream.on('error', (error) => {
        logger.error({ err: error }, 'document.raw.stream_error');
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy(error as Error);
        }
      });
      result.object.stream.pipe(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      const status =
        message.includes('not found') ? 404 : message.includes('no longer available') ? 410 : 400;
      logger.warn({ err: error }, 'document.raw.failed');
      res.status(status).json({ error: message });
    }
  });

  app.use(authMiddleware(jwtVerifier));
  app.use(tenantContextMiddleware);

  app.post(
    '/bom/upload',
    route('POST /bom/upload', async (req, res) => {
      const httpReq = buildHttpRequest<BomUploadRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(bomUploadSchema, httpReq.body);
      await controller.postBomUpload(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/certs/upload',
    route('POST /certs/upload', async (req, res) => {
      const httpReq = buildHttpRequest<CertificateUploadRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(certificateUploadSchema, httpReq.body);
      await controller.postCertificateUpload(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/merged/:bomId',
    route('GET /merged/:bomId', async (req, res) => {
      validateWithSchema(uuidSchema(), req.params.bomId);
      const httpReq = buildHttpRequest<unknown, { bomId: string }>(req);
      await controller.getMerged(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/supplier/scorecard/:supplierId',
    route('GET /supplier/scorecard/:supplierId', async (req, res) => {
      validateWithSchema(uuidSchema(), req.params.supplierId);
      const httpReq = buildHttpRequest<unknown, { supplierId: string }>(req);
      await controller.getSupplierScorecard(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/supplier/request',
    route('POST /supplier/request', async (req, res) => {
      const httpReq = buildHttpRequest<SupplierRequestInput>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(supplierRequestSchema, httpReq.body);
      await controller.postSupplierRequest(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/impact/predict',
    route('POST /impact/predict', async (req, res) => {
      const httpReq = buildHttpRequest<ImpactPredictRequest>(req, {
        bodyOverrides: { tenantId: req.tenantId }
      });
      httpReq.body = validateWithSchema(impactPredictSchema, httpReq.body);
      await controller.postImpactPredict(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/documents/upload',
    route('POST /documents/upload', async (req, res) => {
      const httpReq = buildHttpRequest<UploadRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(documentUploadSchema, httpReq.body);
      await controller.postDocumentUpload(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/documents/:documentId',
    route('GET /documents/:documentId', async (req, res) => {
      validateWithSchema(uuidSchema(), req.params.documentId);
      const httpReq = buildHttpRequest<unknown, { documentId: string }>(req);
      await controller.getDocument(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/documents',
    route('GET /documents', async (req, res) => {
      const httpReq = buildHttpRequest<unknown, Record<string, string>, { limit?: string; offset?: string }>(req);
      await controller.getDocuments(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/documents/:documentId/download-url',
    route('GET /documents/:documentId/download-url', async (req, res) => {
      validateWithSchema(uuidSchema(), req.params.documentId);
      const httpReq = buildHttpRequest<unknown, { documentId: string }>(req);
      await controller.getDocumentDownloadUrl(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/rag/documents',
    route('POST /rag/documents', async (req, res) => {
      const httpReq = buildHttpRequest<DocumentIngestRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(ragDocumentIngestSchema, httpReq.body);
      await controller.postRagDocument(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/ai/parse-document',
    route('POST /ai/parse-document', async (req, res) => {
      const httpReq = buildHttpRequest<AiParseDocumentRequest>(req, {
        bodyOverrides: { tenantId: req.tenantId }
      });
      httpReq.body = validateWithSchema(aiParseDocumentSchema, httpReq.body);
      await controller.postAiParseDocument(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/ai/supplier-email',
    route('POST /ai/supplier-email', async (req, res) => {
      const httpReq = buildHttpRequest<AiSupplierEmailRequest>(req, {
        bodyOverrides: { tenantId: req.tenantId }
      });
      httpReq.body = validateWithSchema(aiSupplierEmailSchema, httpReq.body);
      await controller.postAiSupplierEmail(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/ai/risk-summary',
    route('POST /ai/risk-summary', async (req, res) => {
      const httpReq = buildHttpRequest<AiRiskSummaryRequest>(req, {
        bodyOverrides: { tenantId: req.tenantId }
      });
      httpReq.body = validateWithSchema(aiRiskSummarySchema, httpReq.body);
      await controller.postAiRiskSummary(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/ai/chat',
    route('POST /ai/chat', async (req, res) => {
      const httpReq = buildHttpRequest<AiChatHttpRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      httpReq.body = validateWithSchema(aiChatSchema, httpReq.body);
      await controller.postAiChat(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/search',
    route('GET /search', async (req, res) => {
      if (!req.query.q) {
        res.status(400).json({ error: 'Missing required query param q' });
        return;
      }
      const httpReq = buildHttpRequest<unknown, Record<string, string>, { q: string; topK?: string }>(req);
      if (httpReq.query.topK) {
        const topK = Number(httpReq.query.topK);
        if (Number.isNaN(topK) || topK <= 0 || topK > 20) {
          throw new RequestValidationError('Invalid topK value', [
            { path: 'query.topK', message: 'topK must be between 1 and 20' }
          ]);
        }
      }
      await controller.getSearch(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/dashboard/snapshot',
    route('GET /dashboard/snapshot', async (req, res) => {
      const httpReq = buildHttpRequest<unknown, Record<string, string>, { bomId?: string }>(req);
      await controller.getDashboardSnapshot(httpReq, createHttpResponse(res));
    })
  );

  app.use(createErrorHandler(logger));

  return app;
}

function authMiddleware(verifier: JwtVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req.header('authorization'));
      const user = await verifier.verify(token);
      const tenantReq = req as TenantRequest;
      tenantReq.user = user;
      tenantReq.tenantId = user.tenantId;
      if (tenantReq.log) {
        tenantReq.log = tenantReq.log.child({ tenantId: user.tenantId, userId: user.userId });
      }
      next();
    } catch (error) {
      const status = error instanceof AuthorizationError ? error.status : 401;
      const tenantReq = req as Partial<TenantRequest>;
      const logErr = error instanceof Error ? error : new Error('authorization failed');
      tenantReq.log?.warn({ err: logErr }, 'authorization.failed');
      res.status(status).json({ error: 'Unauthorized' });
    }
  };
}

function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantReq = req as TenantRequest;
  if (!tenantReq.tenantId) {
    res.status(500).json({ error: 'Tenant context missing' });
    return;
  }
  runWithTenantContext(
    {
      tenantId: tenantReq.tenantId,
      roles: tenantReq.user?.roles ?? [],
      userId: tenantReq.user?.userId,
      email: tenantReq.user?.email
    },
    () => next()
  );
}

function route(label: string, handler: (req: TenantRequest, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantReq = req as TenantRequest;
    tenantReq.routeLabel = label;
    if (tenantReq.log) {
      tenantReq.log = tenantReq.log.child({ route: label });
    }
    try {
      await handler(tenantReq, res);
    } catch (error) {
      next(error);
    }
  };
}

function createHttpResponse(res: Response): HttpResponse {
  return {
    status(code: number) {
      res.status(code);
      return this;
    },
    json(payload: unknown) {
      res.json(payload);
    }
  };
}

interface TenantRequest extends Request {
  tenantId: string;
  requestId: string;
  log: Logger;
  routeLabel?: string;
  user?: AuthenticatedUser;
}

function buildHttpRequest<TBody = unknown, TParams extends Record<string, string> = Record<string, string>, TQuery extends Record<string, string> = Record<string, string>>(
  req: TenantRequest,
  options?: { bodyOverrides?: Record<string, unknown> }
): HttpRequest<TBody, TParams, TQuery> {
  const body = { ...(req.body ?? {}), ...(options?.bodyOverrides ?? {}) };
  const paramsEntries = Object.entries(req.params).map(([key, value]) => [key, String(value)] as [string, string]);
  const params = Object.fromEntries(paramsEntries);
  const query = normalizeQuery(req.query);
  return {
    body: body as TBody,
    params: params as TParams,
    query: query as TQuery,
    tenantId: req.tenantId
  };
}

function normalizeQuery(query: Request['query']): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      normalized[key] = normalizeQueryValue(value[0]);
    } else if (value == null) {
      normalized[key] = '';
    } else {
      normalized[key] = normalizeQueryValue(value);
    }
  }
  return normalized;
}

function normalizeQueryValue(value: string | ParsedQs | undefined): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function apiVersionMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('x-api-version', API_VERSION);
  next();
}

function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    const tenantReq = req as TenantRequest;
    tenantReq.requestId = requestId;
    tenantReq.log = createRequestLogger(logger, { requestId });
    next();
  };
}

function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantReq = req as TenantRequest;
  const start = process.hrtime.bigint();
  tenantReq.log?.info({ method: req.method, path: req.path }, 'request.start');
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    tenantReq.log?.info(
      {
        statusCode: res.statusCode,
        durationMs,
        route: tenantReq.routeLabel ?? req.route?.path ?? req.path
      },
      'request.complete'
    );
  });
  next();
}

interface ApiMetrics {
  registry: Registry;
  httpDuration: Histogram<MetricLabel>;
  httpRequests: Counter<MetricLabel>;
}

function createApiMetrics(): ApiMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const httpDuration = new Histogram<MetricLabel>({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry]
  });
  const httpRequests = new Counter<MetricLabel>({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry]
  });
  return { registry, httpDuration, httpRequests };
}

function metricsMiddleware(metrics: ApiMetrics) {
  return (req: Request, res: Response, next: NextFunction) => {
    const endTimer = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const tenantReq = req as TenantRequest;
      const routeLabel = tenantReq.routeLabel ?? req.route?.path ?? req.path;
      const labels = { method: req.method, route: routeLabel, status: String(res.statusCode) };
      metrics.httpRequests.inc(labels);
      endTimer(labels);
    });
    next();
  };
}

function metricsHandler(metrics: ApiMetrics) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Content-Type', metrics.registry.contentType);
      res.send(await metrics.registry.metrics());
    } catch (error) {
      next(error);
    }
  };
}

function readinessHandler(db: DatabaseClient) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await db.query({ text: 'select 1' });
      res.json({ status: 'ready' });
    } catch {
      next(new ServiceUnavailableError('Database not ready'));
    }
  };
}

class ServiceUnavailableError extends Error {
  readonly status = 503;
}

function createErrorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const tenantReq = req as Partial<TenantRequest>;
    const log = tenantReq.log ?? logger;
    log.error({ err }, 'unhandled error');
    const status =
      typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
    const message =
      status >= 500 ? 'Internal Server Error' : err instanceof Error ? err.message : 'Request failed';
    const details =
      typeof err === 'object' && err && 'details' in err ? (err as { details?: unknown }).details : undefined;
    const payload =
      details && status < 500
        ? { error: message, details }
        : { error: message };
    res.status(status).json(payload);
  };
}

void startApiServer();
