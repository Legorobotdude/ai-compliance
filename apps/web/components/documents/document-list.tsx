'use client';

import { useState, useEffect } from 'react';
import {
  listDocuments,
  getDocumentDownloadUrl,
  formatBytes,
  getUploadStatusColor,
  getScanStatusColor,
  type Document
} from '@/lib/api/documents';

interface DocumentListProps {
  refreshTrigger?: number;
  onDocumentSelect?: (document: Document) => void;
}

export function DocumentList({ refreshTrigger = 0, onDocumentSelect }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [refreshTrigger]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId: string, filename: string) => {
    setDownloadingId(documentId);
    try {
      const url = await getDocumentDownloadUrl(documentId);

      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status: Document['uploadStatus']) => {
    const color = getUploadStatusColor(status);
    const colorClasses = {
      green: 'bg-green-900/20 text-green-300 border-green-800',
      blue: 'bg-blue-900/20 text-blue-300 border-blue-800',
      yellow: 'bg-yellow-900/20 text-yellow-300 border-yellow-800',
      red: 'bg-red-900/20 text-red-300 border-red-800',
      gray: 'bg-slate-800/50 text-slate-400 border-slate-700'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded border ${colorClasses[color as keyof typeof colorClasses]}`}>
        {status}
      </span>
    );
  };

  const getScanBadge = (status: Document['scanStatus']) => {
    const color = getScanStatusColor(status);
    const colorClasses = {
      green: 'bg-green-900/20 text-green-300',
      blue: 'bg-blue-900/20 text-blue-300',
      yellow: 'bg-yellow-900/20 text-yellow-300',
      red: 'bg-red-900/20 text-red-300',
      orange: 'bg-orange-900/20 text-orange-300',
      gray: 'bg-slate-800/50 text-slate-400'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colorClasses[color as keyof typeof colorClasses]}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-400 border-r-transparent"></div>
          <p className="mt-2 text-sm text-slate-400">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-900/20 border border-red-800 p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-300">Error loading documents</h3>
            <p className="mt-1 text-sm text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-lg">
        <svg
          className="mx-auto h-12 w-12 text-slate-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-slate-300">No documents</h3>
        <p className="mt-1 text-sm text-slate-500">Upload your first document to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={loadDocuments}
          className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-hidden border border-slate-800 rounded-lg">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Filename
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Upload Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Scan Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                className="hover:bg-slate-900/30 transition-colors cursor-pointer"
                onClick={() => onDocumentSelect?.(doc)}
              >
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 text-slate-500 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-slate-200 font-medium truncate max-w-xs" title={doc.filename}>
                      {doc.filename}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  <span className="font-mono text-xs">{doc.mime}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {formatBytes(doc.bytes)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {getStatusBadge(doc.uploadStatus)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {getScanBadge(doc.scanStatus)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {new Date(doc.uploadedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(doc.id, doc.filename);
                    }}
                    disabled={downloadingId === doc.id}
                    className="text-brand-400 hover:text-brand-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {downloadingId === doc.id ? (
                      <span className="inline-flex items-center gap-1">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Downloading...
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Download
                      </span>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
