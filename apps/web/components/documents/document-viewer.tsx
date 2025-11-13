'use client';

import { useState, useEffect } from 'react';
import { fetchDocument, getDocumentDownloadUrl, formatBytes, type Document } from '@/lib/api/documents';

interface DocumentViewerProps {
  documentId: string | null;
  onClose?: () => void;
}

export function DocumentViewer({ documentId, onClose }: DocumentViewerProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (documentId) {
      loadDocument();
    } else {
      setDocument(null);
    }
  }, [documentId]);

  const loadDocument = async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);
    try {
      const doc = await fetchDocument(documentId);
      setDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    setDownloading(true);
    try {
      const url = await getDocumentDownloadUrl(document.id);

      // Create temporary link and trigger download
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.filename;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!documentId) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
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
        <p className="mt-2 text-sm text-slate-400">Select a document to view details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-400 border-r-transparent"></div>
            <p className="mt-2 text-sm text-slate-400">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6">
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
              <h3 className="text-sm font-medium text-red-300">Error loading document</h3>
              <p className="mt-1 text-sm text-red-400">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-brand-900/20 rounded-lg">
            <svg
              className="h-8 w-8 text-brand-400"
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
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{document.filename}</h3>
            <p className="text-sm text-slate-400 font-mono">{document.mime}</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Document ID</p>
            <p className="text-sm text-slate-300 font-mono break-all">{document.id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">File Size</p>
            <p className="text-sm text-slate-300">{formatBytes(document.bytes)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Upload Status</p>
            <p className="text-sm">
              <span
                className={`px-2 py-1 text-xs font-medium rounded border ${
                  document.uploadStatus === 'READY'
                    ? 'bg-green-900/20 text-green-300 border-green-800'
                    : document.uploadStatus === 'FAILED'
                    ? 'bg-red-900/20 text-red-300 border-red-800'
                    : 'bg-blue-900/20 text-blue-300 border-blue-800'
                }`}
              >
                {document.uploadStatus}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Scan Status</p>
            <p className="text-sm">
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  document.scanStatus === 'CLEAN'
                    ? 'bg-green-900/20 text-green-300'
                    : document.scanStatus === 'INFECTED'
                    ? 'bg-red-900/20 text-red-300'
                    : 'bg-slate-800/50 text-slate-400'
                }`}
              >
                {document.scanStatus}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Uploaded At</p>
            <p className="text-sm text-slate-300">{new Date(document.uploadedAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">SHA256 Hash</p>
            <p className="text-xs text-slate-400 font-mono break-all">{document.sha256}</p>
          </div>
        </div>

        {document.parsedJson && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Parsed Data</p>
            <pre className="bg-slate-950 border border-slate-800 rounded p-4 text-xs text-slate-300 overflow-x-auto">
              {JSON.stringify(document.parsedJson, null, 2)}
            </pre>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {downloading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download Document
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
