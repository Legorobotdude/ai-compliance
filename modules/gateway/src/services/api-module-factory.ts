import type { DatabaseClient } from '@certivo/lib-db';
import { join } from 'node:path';
import { LocalFileStorage } from '@certivo/lib-storage';
import { ComplianceController, ComplianceRepository, ComplianceService } from '@certivo/compliance';
import { SupplierController, SupplierRepository, SupplierService } from '@certivo/supplier';
import { RiskImpactController, RiskImpactService, RiskRepository } from '@certivo/risk-impact';
import {
  DocumentController,
  DocumentRepository,
  DocumentService,
  DocumentUrlSigner
} from '@certivo/file-document';
import { SearchController, SearchRepository, SearchService } from '@certivo/search-rag';
import { WorkflowRepository, WorkflowService, type WorkflowClient } from '@certivo/jobs-workflows';
import { DashboardController, DashboardRepository, DashboardService } from '@certivo/dashboard';
import { CoraClient, CoraController, CoraService } from '@certivo/cora';
import { ApiController } from '../controllers/api-controller.js';

export interface ApiModuleOptions {
  db: DatabaseClient;
  workflowClient: WorkflowClient;
  cora: {
    baseUrl: string;
    apiKey?: string;
    timeoutMs?: number;
  };
  documents?: {
    localRoot?: string;
    publicBaseUrl?: string;
    signingSecret?: string;
    downloadTtlMs?: number;
  };
}

export interface ApiModule {
  apiController: ApiController;
  documentController: DocumentController;
}

export class ApiModuleFactory {
  static create(options: ApiModuleOptions): ApiModule {
    const coraClient = new CoraClient({
      baseUrl: options.cora.baseUrl,
      apiKey: options.cora.apiKey,
      timeoutMs: options.cora.timeoutMs
    });
    const coraService = new CoraService(coraClient);

    const documentsRoot =
      options.documents?.localRoot ??
      process.env.DOCUMENTS_LOCAL_ROOT ??
      join(process.cwd(), '.certivo', 'documents');
    const documentsBaseUrl =
      options.documents?.publicBaseUrl ??
      process.env.DOCUMENTS_PUBLIC_BASE_URL ??
      process.env.CERTIVO_API_URL ??
      'http://localhost:4000';
    const documentsSecret =
      options.documents?.signingSecret ?? process.env.DOCUMENTS_SIGNING_SECRET ?? 'dev-docs-secret';
    const docRepo = new DocumentRepository(options.db);
    const docStorage = new LocalFileStorage({ rootDirectory: documentsRoot });
    const docSigner = new DocumentUrlSigner({
      baseUrl: documentsBaseUrl,
      secret: documentsSecret,
      defaultTtlMs: options.documents?.downloadTtlMs
    });
    const docService = new DocumentService(docRepo, docStorage, docSigner);
    const docController = new DocumentController(docService);

    const complianceRepo = new ComplianceRepository(options.db);
    const complianceService = new ComplianceService(complianceRepo, coraService, docService);
    const complianceController = new ComplianceController(complianceService);

    const supplierRepo = new SupplierRepository(options.db);
    const supplierService = new SupplierService(supplierRepo);
    const supplierController = new SupplierController(supplierService);

    const riskRepo = new RiskRepository(options.db);
    const riskService = new RiskImpactService(riskRepo);
    const riskController = new RiskImpactController(riskService);

    const searchRepo = new SearchRepository(options.db);
    const searchService = new SearchService(searchRepo);
    const searchController = new SearchController(searchService);

    const dashboardRepo = new DashboardRepository(options.db);
    const dashboardService = new DashboardService(dashboardRepo, riskService);
    const dashboardController = new DashboardController(dashboardService);

    const workflowRepo = new WorkflowRepository(options.db);
    const workflowService = new WorkflowService(workflowRepo, options.workflowClient);
    // Workflow service is returned for worker wiring but not required by ApiController at the moment.
    void workflowService;

    const coraController = new CoraController(coraService);

    const apiController = new ApiController(
      complianceController,
      supplierController,
      riskController,
      docController,
      searchController,
      dashboardController,
      coraController
    );

    return { apiController, documentController: docController };
  }
}
