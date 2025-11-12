import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ParsedQs } from 'qs';
import { ApiController, ApiModuleFactory, type HttpRequest, type HttpResponse } from '@certivo/gateway';
import type { BomUploadRequest } from '@certivo/compliance';
import type { UploadRequest } from '@certivo/file-document';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import type { WorkflowClient, IngestionRetryTrigger, SupplierWorkflowTrigger } from '@certivo/jobs-workflows';
import type { SupplierRequestInput } from '@certivo/supplier';
import { createPgDatabaseClient } from '@certivo/lib-db';

const PORT = Number(process.env.PORT ?? 4000);
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost:5432/certivo';
const TENANT_HEADER = 'x-tenant-id';

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
  const workflowClient = new NoopWorkflowClient();
  const apiController = ApiModuleFactory.create({ db, workflowClient });
  const app = buildApp(apiController);

  const server = app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function buildApp(controller: ApiController): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(tenantMiddleware);

  app.post(
    '/bom/upload',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<BomUploadRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      await controller.postBomUpload(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/merged/:bomId',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<unknown, { bomId: string }>(req);
      await controller.getMerged(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/supplier/scorecard/:supplierId',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<unknown, { supplierId: string }>(req);
      await controller.getSupplierScorecard(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/supplier/request',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<SupplierRequestInput>(req, { bodyOverrides: { tenantId: req.tenantId } });
      await controller.postSupplierRequest(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/impact/predict',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<ImpactPredictRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      await controller.postImpactPredict(httpReq, createHttpResponse(res));
    })
  );

  app.post(
    '/documents/upload',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<UploadRequest>(req, { bodyOverrides: { tenantId: req.tenantId } });
      await controller.postDocumentUpload(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/documents/:documentId',
    route(async (req, res) => {
      const httpReq = buildHttpRequest<unknown, { documentId: string }>(req);
      await controller.getDocument(httpReq, createHttpResponse(res));
    })
  );

  app.get(
    '/search',
    route(async (req, res) => {
      if (!req.query.q) {
        res.status(400).json({ error: 'Missing required query param q' });
        return;
      }
      const httpReq = buildHttpRequest<unknown, Record<string, string>, { q: string; topK?: string }>(req);
      await controller.getSearch(httpReq, createHttpResponse(res));
    })
  );

  app.use(errorHandler);

  return app;
}

function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.header(TENANT_HEADER) ?? undefined;
  if (!tenantId) {
    res.status(400).json({ error: 'Missing X-Tenant-Id header' });
    return;
  }
  (req as TenantRequest).tenantId = tenantId;
  next();
}

function route(handler: (req: TenantRequest, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req as TenantRequest, res);
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

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[api] unhandled error', err);
  const status =
    typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : 500;
  const message =
    status >= 500 ? 'Internal Server Error' : err instanceof Error ? err.message : 'Request failed';
  res.status(status).json({ error: message });
}

void startApiServer();
