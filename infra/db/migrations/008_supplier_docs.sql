create type supplier_document_type as enum ('CERTIFICATION', 'CONTRACT', 'COMPLIANCE_REPORT', 'AUDIT', 'OTHER');

alter table documents
    add column supplier_id uuid references suppliers(id) on delete cascade,
    add column document_type supplier_document_type;

create index idx_documents_supplier on documents (tenant_id, supplier_id, document_type)
    where deleted_at is null;

create index idx_documents_supplier_uploaded on documents (tenant_id, supplier_id, uploaded_at desc)
    where deleted_at is null;