import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp, type BuildAppOptions } from './main.js';
import type { ApiController } from '@certivo/gateway';
import type { DocumentController } from '@certivo/file-document';
import type { DatabaseClient } from '@certivo/lib-db';
import type { Logger } from '@certivo/lib-logging';
import { JwtVerifier } from '@certivo/lib-auth';
import { Registry, Histogram, Counter } from 'prom-client';

// Mock dependencies
const mockDb = {
    query: vi.fn(),
    pool: { end: vi.fn() },
} as unknown as DatabaseClient;

const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnThis(),
} as unknown as Logger;

const mockApiController = {
    postBomUpload: vi.fn(),
    postCertificateUpload: vi.fn(),
    getMerged: vi.fn(),
    getSupplierScorecard: vi.fn(),
    postSupplierRequest: vi.fn(),
    postImpactPredict: vi.fn(),
    postDocumentUpload: vi.fn(),
    getDocument: vi.fn(),
    getDocuments: vi.fn(),
    getDocumentDownloadUrl: vi.fn(),
    postRagDocument: vi.fn(),
    postAiParseDocument: vi.fn(),
    postAiSupplierEmail: vi.fn(),
    postAiRiskSummary: vi.fn(),
    postAiChat: vi.fn(),
    getSearch: vi.fn(),
    getDashboardSnapshot: vi.fn(),
} as unknown as ApiController;

const mockDocumentController = {
    streamSignedDownload: vi.fn(),
} as unknown as DocumentController;

const mockMetrics = {
    registry: new Registry(),
    httpDuration: { startTimer: vi.fn().mockReturnValue(vi.fn()) } as unknown as Histogram<string>,
    httpRequests: { inc: vi.fn() } as unknown as Counter<string>,
};

const mockJwtVerifier = {
    verify: vi.fn(),
} as unknown as JwtVerifier;

describe('API Server', () => {
    let app: ReturnType<typeof buildApp>;

    beforeEach(() => {
        vi.clearAllMocks();
        app = buildApp({
            controller: mockApiController,
            documentController: mockDocumentController,
            db: mockDb,
            logger: mockLogger,
            metrics: mockMetrics,
            jwtVerifier: mockJwtVerifier,
        });
    });

    describe('GET /healthz', () => {
        it('should return 200 OK', async () => {
            const response = await request(app).get('/healthz');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'ok', version: '2024-01-31' });
        });
    });

    describe('GET /readyz', () => {
        it('should return 200 OK when db is ready', async () => {
            (mockDb.query as any).mockResolvedValueOnce({ rows: [] });
            const response = await request(app).get('/readyz');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'ready' });
        });

        it('should return 503 when db is not ready', async () => {
            (mockDb.query as any).mockRejectedValueOnce(new Error('DB Error'));
            const response = await request(app).get('/readyz');
            expect(response.status).toBe(503);
        });
    });

    describe('Protected Routes', () => {
        it('should return 401 if no token provided', async () => {
            const response = await request(app).get('/documents');
            expect(response.status).toBe(401);
        });

        it('should return 401 if invalid token provided', async () => {
            (mockJwtVerifier.verify as any).mockRejectedValueOnce(new Error('Invalid token'));
            const response = await request(app)
                .get('/documents')
                .set('Authorization', 'Bearer invalid');
            expect(response.status).toBe(401);
        });

        it('should allow access with valid token', async () => {
            (mockJwtVerifier.verify as any).mockResolvedValueOnce({
                tenantId: 'tenant-1',
                roles: ['user'],
                userId: 'user-1',
            });

            // Mock controller response
            (mockApiController.getDocuments as any).mockImplementation(async (req: any, res: any) => {
                res.json({ documents: [] });
            });

            const response = await request(app)
                .get('/documents')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(mockJwtVerifier.verify).toHaveBeenCalled();
            expect(mockApiController.getDocuments).toHaveBeenCalled();
        });
    });
});
