'use client';

import { useEffect, useState } from 'react';
import { uploadDocument } from '@/lib/api/documents';

interface CertificateUploaderProps {
  onUploadComplete?: () => void;
}

interface CertificateUploadResponse {
  items: Array<{
    certificateId: string;
    findings: number;
    validUntil?: string | null;
    dataQualityFlags: number;
  }>;
  issues: Array<{
    code: string;
    message: string;
    partNumber: string;
    substanceName?: string;
  }>;
}

type UploadMode = 'file' | 'json';
type CertType = 'ROHS' | 'REACH' | 'CUSTOM';

type SupplierOption = {
  id: string;
  name: string;
};

export function CertificateUploader({ onUploadComplete }: CertificateUploaderProps) {
  const [mode, setMode] = useState<UploadMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [certType, setCertType] = useState<CertType>('ROHS');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificateUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSuppliers();
  }, []);

  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0]!.id);
    }
  }, [suppliers, supplierId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      let payload: Record<string, unknown>;

      if (mode === 'file' && !supplierId) {
        throw new Error('Select a supplier before uploading certificates');
      }
      if (mode === 'file' && file) {
        const [uploadedDocument, content] = await Promise.all([uploadDocument(file), file.text()]);
        // For file mode, we'll parse the content and structure it

        // Simple CSV parsing for demo (assumes header row)
        const lines = content.trim().split('\n');
        if (lines.length === 0) {
          throw new Error('Empty file');
        }
        const headers = lines[0]!.split(',').map((h) => h.trim());

        const certificates = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim());
          const row: Record<string, string | undefined> = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx];
          });

          return {
            supplierId,
            partNumber: row.partNumber || row.part_number || '',
            type: certType,
            declarationDate: row.declarationDate || row.declaration_date || null,
            validUntil: row.validUntil || row.valid_until || null,
            thresholdPpm: row.thresholdPpm ? parseFloat(row.thresholdPpm) : null,
            sourceDocumentId: uploadedDocument.id,
            findings: row.substance ? [{
              substanceName: row.substance || row.substance_name,
              concentrationValue: row.concentration ? parseFloat(row.concentration) : null,
              concentrationUnit: row.unit ?? undefined,
            }] : [],
          };
        });

        payload = { certificates };
      } else if (mode === 'json' && jsonInput) {
        payload = JSON.parse(jsonInput);
      } else {
        throw new Error('Please provide a file or JSON input');
      }

      const res = await fetch('/api/compliance/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed (${res.status})`);
      }

      const response = await res.json() as CertificateUploadResponse;
      setResult(response);
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?limit=100');
      if (!response.ok) {
        const body = (await safeJson(response)) as { error?: string } | undefined;
        throw new Error(body?.error ?? `Failed to load suppliers (${response.status})`);
      }
      const payload = (await response.json()) as { suppliers: Array<{ id: string; name: string }> };
      setSuppliers(payload.suppliers);
      setSupplierError(payload.suppliers.length ? null : 'No suppliers found. Create one on the compliance page.');
    } catch (error) {
      setSupplierError(error instanceof Error ? error.message : 'Unable to load suppliers');
    }
  };

  const sampleJson = {
    certificates: [
      {
        supplierId: 'SUP-101',
        partNumber: 'CU-78901',
        type: 'ROHS',
        declarationDate: '2024-01-15',
        validUntil: '2025-01-15',
        thresholdPpm: 1000,
        findings: [
          {
            substanceName: 'Lead',
            concentrationValue: 0.09,
            concentrationUnit: '%',
          },
        ],
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setMode('file')}
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'file'
              ? 'border-b-2 border-brand-400 text-brand-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => setMode('json')}
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'json'
              ? 'border-b-2 border-brand-400 text-brand-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          JSON Input
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Certificate Type */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Certificate Type *
          </label>
          <select
            value={certType}
            onChange={(e) => setCertType(e.target.value as CertType)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-md focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          >
            <option value="ROHS">RoHS</option>
            <option value="REACH">REACH</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>

        {/* Supplier selector */}
        {mode === 'file' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Supplier *
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-md focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              disabled={!suppliers.length}
              required
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            {supplierError && (
              <p className="mt-1 text-xs text-rose-300">
                {supplierError}
              </p>
            )}
          </div>
        )}

        {/* File Upload Mode */}
        {mode === 'file' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Certificate File (CSV/XML/PDF) *
            </label>
            <input
              type="file"
              accept=".csv,.xml,.pdf"
              onChange={handleFileChange}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-md focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              required
            />
            {file && (
              <p className="mt-1 text-sm text-slate-400">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              CSV format: partNumber, substance, concentration, unit, validUntil
            </p>
          </div>
        )}

        {/* JSON Input Mode */}
        {mode === 'json' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Certificates JSON *
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={JSON.stringify(sampleJson, null, 2)}
              className="w-full h-48 px-3 py-2 border border-slate-700 rounded-md font-mono text-sm focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Paste JSON with certificates array
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-brand-400 text-white font-medium rounded-md hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {loading ? 'Uploading...' : 'Upload Certificates'}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-md">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div className="p-4 bg-green-900/20 border border-green-800 rounded-md space-y-2">
          <p className="font-medium text-green-300">Upload Successful!</p>
          <div className="text-sm text-green-200 space-y-1">
            <p>Certificates: {result.items.length}</p>
            <p>
              Total Findings: {result.items.reduce((sum, item) => sum + item.findings, 0)}
            </p>
          </div>

          {result.items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-800">
              <p className="font-medium text-green-300 mb-2">Processed:</p>
              <ul className="space-y-1 text-sm text-green-200">
                {result.items.slice(0, 5).map((item, idx) => (
                  <li key={idx}>
                    {item.certificateId.substring(0, 8)}... - {item.findings} findings
                    {item.validUntil && ` (expires ${item.validUntil})`}
                  </li>
                ))}
                {result.items.length > 5 && (
                  <li className="text-slate-400">
                    ...and {result.items.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {result.issues.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-800">
              <p className="font-medium text-orange-300 mb-2">
                Issues ({result.issues.length}):
              </p>
              <ul className="space-y-1 text-sm text-orange-200">
                {result.issues.map((issue, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-mono text-xs bg-orange-800 px-1 rounded">
                      {issue.code}
                    </span>
                    <span>
                      {issue.partNumber}: {issue.message}
                      {issue.substanceName && ` (${issue.substanceName})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
