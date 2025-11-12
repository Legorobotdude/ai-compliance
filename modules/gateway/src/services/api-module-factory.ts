import type { DatabaseClient } from '@certivo/lib-db';
import { ComplianceController, ComplianceRepository, ComplianceService } from '@certivo/compliance';
import { SupplierController, SupplierRepository, SupplierService } from '@certivo/supplier';
import { RiskImpactController, RiskImpactService, RiskRepository } from '@certivo/risk-impact';
import { DocumentController, DocumentRepository, DocumentService } from '@certivo/file-document';
import { SearchController, SearchRepository, SearchService } from '@certivo/search-rag';
import { WorkflowRepository, WorkflowService, type WorkflowClient } from '@certivo/jobs-workflows';
import { ApiController } from '../controllers/api-controller';

export interface ApiModuleOptions {
  db: DatabaseClient;
  workflowClient: WorkflowClient;
}

export class ApiModuleFactory {
  static create(options: ApiModuleOptions): ApiController {
    const complianceRepo = new ComplianceRepository(options.db);
    const complianceService = new ComplianceService(complianceRepo);
    const complianceController = new ComplianceController(complianceService);

    const supplierRepo = new SupplierRepository(options.db);
    const supplierService = new SupplierService(supplierRepo);
    const supplierController = new SupplierController(supplierService);

    const riskRepo = new RiskRepository(options.db);
    const riskService = new RiskImpactService(riskRepo);
    const riskController = new RiskImpactController(riskService);

    const docRepo = new DocumentRepository(options.db);
    const docService = new DocumentService(docRepo);
    const docController = new DocumentController(docService);

    const searchRepo = new SearchRepository(options.db);
    const searchService = new SearchService(searchRepo);
    const searchController = new SearchController(searchService);

    const workflowRepo = new WorkflowRepository(options.db);
    const workflowService = new WorkflowService(workflowRepo, options.workflowClient);
    // Workflow service is returned for worker wiring but not required by ApiController at the moment.
    void workflowService;

    return new ApiController(
      complianceController,
      supplierController,
      riskController,
      docController,
      searchController
    );
  }
}
