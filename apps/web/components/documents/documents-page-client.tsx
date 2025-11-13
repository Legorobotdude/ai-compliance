'use client';

import { useState } from 'react';
import { SectionCard } from '@/components/ui/section-card';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList } from '@/components/documents/document-list';
import { DocumentViewer } from '@/components/documents/document-viewer';
import type { Document } from '@/lib/api/documents';

export function DocumentsPageClient() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const handleUploadComplete = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleDocumentSelect = (document: Document) => {
    setSelectedDocumentId(document.id);
  };

  return (
    <>
      {/* Upload Section */}
      <div className="lg:col-span-2 space-y-6">
        <SectionCard
          title="Upload Document"
          description="Upload compliance certificates, BOMs, SDSs, or any other document"
        >
          <DocumentUploader onUploadComplete={handleUploadComplete} />
        </SectionCard>

        <SectionCard
          title="All Documents"
          description="Browse and manage your uploaded documents"
        >
          <DocumentList
            refreshTrigger={refreshTrigger}
            onDocumentSelect={handleDocumentSelect}
          />
        </SectionCard>
      </div>

      {/* Document Viewer Section */}
      <div className="lg:col-span-1">
        <SectionCard
          title="Document Details"
          description="View metadata and download selected document"
        >
          <DocumentViewer
            documentId={selectedDocumentId}
            onClose={() => setSelectedDocumentId(null)}
          />
        </SectionCard>
      </div>
    </>
  );
}
