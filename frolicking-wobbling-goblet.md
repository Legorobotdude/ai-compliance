# Implementation Plan: Supplier-Specific Document Repository

## Overview
Add supplier-specific document upload and management functionality to create a central repository for supplier documents (certifications, contracts, compliance reports, audits, etc.).

## User Requirements
- **Document Types**: CERTIFICATION, CONTRACT, COMPLIANCE_REPORT, AUDIT, OTHER
- **Schema**: Direct foreign key relationship (supplier_id + document_type columns on documents table)
- **Operations**: Upload, list/search, delete, replace, bulk upload, bulk download as zip
- **RAG Integration**: Automatic embedding for text documents (<750KB) for semantic search

## Design Decisions

### 1. Schema Approach
Add `supplier_id` and `document_type` columns to the existing `documents` table rather than creating a junction table. This follows the existing pattern where documents are referenced by other entities (BOMs use `source_doc_id`, certificates use `source_doc_id`).

**Rationale**: Simpler schema, easier queries, consistent with existing patterns, supports soft delete via existing `deleted_at` column.

### 2. API Structure
Create dedicated endpoints under `/suppliers/:supplierId/documents/*` for clear resource hierarchy and ownership.

### 3. Bulk Download
Synchronous streaming using the `archiver` library - creates zip on-the-fly without buffering entire archive. If this becomes a performance bottleneck, can refactor to background job later.

### 4. Module Organization
Add supplier document logic to `modules/supplier/src/` since business logic is supplier-centric. Reuse `DocumentService` via dependency injection for actual file storage.

## Implementation Steps

### Phase 1: Database Schema (Migration)

**Create:** `infra/db/migrations/006_supplier_documents.sql`

```sql
-- Add supplier document type enum
create type supplier_document_type as enum (
  'CERTIFICATION',
  'CONTRACT',
  'COMPLIANCE_REPORT',
  'AUDIT',
  'OTHER'
);

-- Add columns to documents table
alter table documents
  add column supplier_id uuid references suppliers(id) on delete cascade,
  add column document_type supplier_document_type;

-- Add indexes for efficient querying
create index idx_documents_supplier on documents (tenant_id, supplier_id, document_type)
  where deleted_at is null;

create index idx_documents_supplier_uploaded on documents (tenant_id, supplier_id, uploaded_at desc)
  where deleted_at is null;
```

**Verify:** RLS policies in `003_rls_policies.sql` already cover tenant_id scoping for documents table.

### Phase 2: Type Definitions

**Modify:** `libs/db/src/schema.ts`
- Add `SupplierDocumentType` type export
- Add `supplierId?: UUID | null` and `documentType?: SupplierDocumentType | null` to `Document` interface
- Update `DOCUMENT_COLUMNS` constant in document-repository.ts to include new fields

**Create:** `modules/supplier/src/dtos/supplier-documents-dtos.ts`
- Request/response types for upload, bulk upload, list, delete, replace, bulk download
- `SupplierDocumentsSummary` type for scorecard integration

**Create:** `modules/supplier/src/validation/supplier-documents-validation.ts`
- Zod schemas for all request types
- Validation rules (50MB max per file, 20 files max per bulk upload, 100 docs max per zip)

### Phase 3: Repository Layer

**Modify:** `modules/file-document/src/repositories/document-repository.ts`

Add methods:
- `updateSupplierAssociation()` - Link document to supplier with type
- `findBySupplier()` - Query documents by supplier with filters (type, date range, filename)
- `countBySupplier()` - Count documents matching filters
- `softDelete()` - Soft delete via deleted_at timestamp
- `findByIds()` - Fetch multiple documents by ID array
- Update `DOCUMENT_COLUMNS` constant to include `supplier_id, document_type`

**Modify:** `modules/supplier/src/repositories/supplier-repository.ts`

Add method:
- `getDocumentsSummary()` - Aggregate counts by type + recent uploads (uses window functions for efficiency)

### Phase 4: Service Layer

**Create:** `modules/supplier/src/services/supplier-documents-service.ts`

Core business logic:
- `uploadDocument()` - Validate supplier exists, delegate to DocumentService, link to supplier, record audit log
- `bulkUploadDocuments()` - Upload multiple documents, collect errors
- `listDocuments()` - List with filtering, pagination
- `deleteDocument()` - Verify ownership, soft delete, audit log
- `replaceDocument()` - Upload new first, then soft delete old (atomic)
- `streamBulkDownloadZip()` - Stream zip archive using archiver library

Dependencies: `SupplierRepository`, `DocumentRepository`, `DocumentService`

**Modify:** `modules/supplier/src/services/supplier-service.ts`

Update `getScorecard()` method:
- Add parallel fetch of `documentsSummary` via repository
- Include in response as `ScorecardResponseWithDocuments`

### Phase 5: Controller Layer

**Create:** `modules/supplier/src/controllers/supplier-documents-controller.ts`

Thin controller exposing service methods:
- `uploadDocument()`
- `bulkUploadDocuments()`
- `listDocuments()`
- `deleteDocument()`
- `replaceDocument()`
- `streamBulkDownloadZip()`

### Phase 6: API Routes & Gateway

**Modify:** `apps/api/src/main.ts`

Add routes:
- `POST /suppliers/:supplierId/documents` - Upload single
- `POST /suppliers/:supplierId/documents/bulk` - Bulk upload
- `GET /suppliers/:supplierId/documents` - List with filters (query params: documentType, uploadedAfter, uploadedBefore, filenameQuery, limit, offset)
- `DELETE /suppliers/:supplierId/documents/:documentId` - Delete
- `PUT /suppliers/:supplierId/documents/:documentId` - Replace
- `GET /suppliers/:supplierId/documents/download-zip` - Bulk download (query param: documentIds[])

**Modify:** `modules/gateway/src/api-controller.ts`

Add handler methods for each route (validation, tenant extraction, service call, response formatting)

**Modify:** `modules/gateway/src/api-module-factory.ts`

Wire up dependencies:
- Instantiate `SupplierDocumentsService` with repository + DocumentService
- Instantiate `SupplierDocumentsController`
- Pass controller to `ApiController` constructor

### Phase 7: External Dependencies

**Install packages:**
```bash
pnpm add archiver
pnpm add -D @types/archiver
```

### Phase 8: Testing

**Create:** `scripts/supplier-documents-smoke.mjs`

End-to-end smoke test covering:
1. Upload single document
2. List documents with filter
3. Bulk upload (multiple types)
4. Bulk download as zip
5. Replace document
6. Delete document
7. Verify RAG integration (text documents embedded)

**Add to package.json:**
```json
{
  "scripts": {
    "supplier-docs:test": "node scripts/supplier-documents-smoke.mjs"
  }
}
```

**Manual verification:**
- Test supplier scorecard includes documents summary
- Verify soft-deleted documents excluded from queries
- Check audit logs record all operations
- Confirm RAG embeddings created for text documents

## Critical Files to Modify

1. **`infra/db/migrations/006_supplier_documents.sql`** (NEW)
   - Schema changes: Add supplier_id and document_type to documents table

2. **`modules/supplier/src/services/supplier-documents-service.ts`** (NEW)
   - Core business logic for all supplier document operations

3. **`modules/file-document/src/repositories/document-repository.ts`** (MODIFY)
   - Add supplier-specific query methods (findBySupplier, countBySupplier, updateSupplierAssociation, softDelete, findByIds)
   - Update DOCUMENT_COLUMNS to include new fields

4. **`apps/api/src/main.ts`** (MODIFY)
   - Register 6 new API routes

5. **`libs/db/src/schema.ts`** (MODIFY)
   - Update Document interface with supplierId and documentType fields

6. **`modules/supplier/src/dtos/supplier-documents-dtos.ts`** (NEW)
   - All request/response type definitions

7. **`modules/supplier/src/validation/supplier-documents-validation.ts`** (NEW)
   - Zod validation schemas

8. **`modules/supplier/src/controllers/supplier-documents-controller.ts`** (NEW)
   - HTTP handler adapters

9. **`modules/supplier/src/repositories/supplier-repository.ts`** (MODIFY)
   - Add getDocumentsSummary() method

10. **`modules/supplier/src/services/supplier-service.ts`** (MODIFY)
    - Update getScorecard() to include documents summary

11. **`modules/gateway/src/api-controller.ts`** (MODIFY)
    - Add handler methods for supplier document routes

12. **`modules/gateway/src/api-module-factory.ts`** (MODIFY)
    - Wire up SupplierDocumentsService and controller

13. **`scripts/supplier-documents-smoke.mjs`** (NEW)
    - End-to-end smoke test

## Key Implementation Notes

### Document Replacement
- **Atomic operation**: Upload new document first, then soft-delete old
- **Preserves type**: Replacement inherits document_type from original
- **Audit trail**: Records both old and new document IDs

### RAG Integration
- Automatic via existing DocumentService.enqueueRagIngest() - no changes needed
- Text documents <750KB automatically embedded in pgvector
- Document metadata can be added to RAG for filtering in semantic search

### Bulk Download
- Uses `archiver` to stream zip creation without buffering
- Skips corrupted/missing files with warnings
- Sanitizes filenames to prevent path traversal
- 30-second default timeout (configurable)

### Soft Delete Pattern
- Uses existing `deleted_at` column from documents table
- All queries filter `WHERE deleted_at IS NULL`
- Consistent with existing document lifecycle

### Scorecard Integration
- Single efficient query with window functions
- Aggregates total, counts by type, recent uploads (5 most recent)
- No performance impact on existing scorecard

## Execution Order

1. Phase 1 (Database) - **MUST RUN FIRST** - Run migration via `pnpm db:migrate`
2. Phase 2 (Types) - Depends on Phase 1
3. Phase 3 (Repository) - Depends on Phase 2
4. Phase 4 (Service) - Depends on Phase 3
5. Phase 5 (Controller) - Depends on Phase 4
6. Phase 6 (Gateway/Routes) - Depends on Phase 5
7. Phase 7 (Dependencies) - Install packages: `pnpm add archiver && pnpm add -D @types/archiver`
8. Phase 8 (Testing) - Run after all above: `pnpm supplier-docs:test`

## Success Criteria

- ✅ Upload documents to suppliers with categorization
- ✅ List/search documents by type, date, filename
- ✅ Delete and replace documents with audit trail
- ✅ Bulk upload multiple documents at once
- ✅ Bulk download as zip archive
- ✅ Text documents automatically indexed for semantic search
- ✅ Supplier scorecard shows document summary
- ✅ All operations properly tenant-scoped with RLS
- ✅ Audit logs record all document operations
- ✅ Smoke test passes all scenarios
