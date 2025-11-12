import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ParsedQs } from 'qs';
import { randomUUID } from 'crypto';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import {
  ApiController,
  ApiModuleFactory,
  type HttpRequest,
  type HttpResponse,
  bomUploadSchema,
  certificateUploadSchema,
  documentUploadSchema,
  impactPredictSchema,
  supplierRequestSchema,
  uuidSchema,
  validateWithSchema,
  RequestValidationError
} from '@certivo/gateway';
import type { BomUploadRequest, CertificateUploadRequest } from '@certivo/compliance';
import type { UploadRequest } from '@certivo/file-document';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import type { SupplierRequestInput } from '@certivo/supplier';
import type { WorkflowClient, IngestionRetryTrigger, SupplierWorkflowTrigger } from '@certivo/jobs-workflows';
import { createPgDatabaseClient, type DatabaseClient } from '@certivo/lib-db';
import { createLogger, createRequestLogger, type Logger } from '@certivo/lib-logging';

const PORT = Number(process.env.PORT ?? 4000);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/certivo';
const TENANT_HEADER = 'x-tenant-id';
const API_VERSION = '2024-01-31';
type MetricLabel = 'method' | 'route' | 'status';

class NoopWorkflowClient implements WorkflowClient {
  async scheduleSupplierWorkflow(_trigger: SupplierWorkflowTrigger): Promise<void> {
    // Intentionally noop for MVP bootstrap
  }

  async scheduleIngestionRetry(_trigger: IngestionRetryTrigger): Promise<void> {
    // Intentionally noop for MVP bootstrap
  }
}

export async function startApiServer(): Promise<void> {
  const { db, pool } = createPgDatabaseClient({ connectionString: DATABASE_URL });
  const logger = createLogger({ name: 'certivo-api' });
  const metrics = createApiMetrics();
  const workflowClient = new NoopWorkflowClient();
  const apiController = ApiModuleFactory.create({ db, workflowClient });
  const app = buildApp({ controller: apiController, db, logger, metrics });

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, '[api] listening');
  });

  const shutdown = async () => {
    logger.info('Shutting down API server');
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

interface BuildAppOptions {
  controller: ApiController;
  db: DatabaseClient;
  logger: Logger;
  metrics: ApiMetrics;
}

function buildApp(options: BuildAppOptions): Express {
  const { controller, db, logger, metrics } = options;
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

  app.use(tenantMiddleware);

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

  app.use(createErrorHandler(logger));

  return app;
}

function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.header(TENANT_HEADER) ?? undefined;
  if (!tenantId) {
    res.status(400).json({ error: 'Missing X-Tenant-Id header' });
    return;
  }
  const tenantReq = req as TenantRequest;
  tenantReq.tenantId = tenantId;
  if (tenantReq.log) {
    tenantReq.log = tenantReq.log.child({ tenantId });
  }
  next();
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
    } catch (error) {
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
