// Note: This module is for client-side use only
// It calls Next.js API routes (not the backend directly)

export interface Document {
  id: string;
  tenantId: string;
  filename: string;
  mime: string;
  bytes: number;
  storageUrl: string;
  storageBucket?: string | null;
  storageKey?: string | null;
  storageClass?: string | null;
  kmsKeyId?: string | null;
  sha256: string;
  uploadedAt: string;
  uploadStatus: 'PENDING_UPLOAD' | 'UPLOADED' | 'VALIDATED' | 'READY' | 'FAILED';
  uploadCompletedAt?: string | null;
  scanStatus: 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'CLEAN' | 'INFECTED' | 'ERROR';
  scanRequestedAt?: string | null;
  scanCompletedAt?: string | null;
  retentionExpiresAt?: string | null;
  deletedAt?: string | null;
  parsedJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface UploadDocumentRequest {
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
  storageUrl?: string;
  dataBase64?: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

/**
 * Upload a document with file content
 */
export async function uploadDocument(file: File): Promise<Document> {
  // Read file as base64
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Calculate SHA256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Convert to base64
  const dataBase64 = btoa(String.fromCharCode(...bytes));

  const payload: UploadDocumentRequest = {
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    bytes: file.size,
    sha256,
    dataBase64,
  };

  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

/**
 * Fetch document metadata by ID
 */
export async function fetchDocument(documentId: string): Promise<Document> {
  const response = await fetch(`/api/documents/${documentId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch document');
  }
  return response.json();
}

/**
 * List all documents for the current tenant
 */
export async function listDocuments(): Promise<Document[]> {
  const response = await fetch('/api/documents');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list documents');
  }
  const data: DocumentListResponse = await response.json();
  return data.documents;
}

/**
 * Get download URL for a document (signed, time-limited)
 */
export async function getDocumentDownloadUrl(documentId: string): Promise<string> {
  const response = await fetch(`/api/documents/${documentId}/download-url`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get download URL');
  }
  const data: { url: string } = await response.json();
  return data.url;
}

/**
 * Format file size in human-readable format
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get status badge color
 */
export function getUploadStatusColor(status: Document['uploadStatus']): string {
  switch (status) {
    case 'READY': return 'green';
    case 'UPLOADED': return 'blue';
    case 'VALIDATED': return 'blue';
    case 'PENDING_UPLOAD': return 'yellow';
    case 'FAILED': return 'red';
    default: return 'gray';
  }
}

/**
 * Get scan status badge color
 */
export function getScanStatusColor(status: Document['scanStatus']): string {
  switch (status) {
    case 'CLEAN': return 'green';
    case 'NOT_REQUIRED': return 'gray';
    case 'PENDING': return 'yellow';
    case 'IN_PROGRESS': return 'blue';
    case 'INFECTED': return 'red';
    case 'ERROR': return 'orange';
    default: return 'gray';
  }
}
