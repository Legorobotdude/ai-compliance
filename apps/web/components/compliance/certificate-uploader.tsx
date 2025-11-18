'use client';

import { useEffect, useState } from 'react';
import { uploadDocument } from '@/lib/api/documents';
import type { DashboardSnapshot } from '@/lib/types/dashboard';

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

type SupplierScope = 'single' | 'auto';

type SupplierAssignment = {
  supplierId: string;
  supplierName?: string | null;
};

type SupplierResolution =
  | { mode: 'single'; supplierId: string }
  | { mode: 'auto'; lookup: (partNumber: string) => string | undefined };

type CoraParsedFinding = {
  substanceName: string;
  concentrationValue: number | null;
  concentrationUnit: '%' | 'ppm' | 'mg/kg' | null;
  concentrationPpm: number | null;
  notes: string | null;
};

type CoraParsedPart = {
  partNumber: string;
  findings: CoraParsedFinding[];
};

type CertificateFindingPayload = {
  substanceName: string;
  concentrationValue?: number | null;
  concentrationUnit?: '%' | 'ppm' | 'mg/kg' | null;
  concentrationRaw?: string | null;
};

type CertificatePayload = {
  supplierId: string;
  partNumber: string;
  type: CertType;
  declarationDate: string | null;
  validUntil: string | null;
  thresholdPpm: number | null;
  sourceDocumentId: string;
  findings: CertificateFindingPayload[];
};

export function CertificateUploader({ onUploadComplete }: CertificateUploaderProps) {
  const [mode, setMode] = useState<UploadMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [certType, setCertType] = useState<CertType>('ROHS');
  const [supplierScope, setSupplierScope] = useState<SupplierScope>('single');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [partSupplierAssignments, setPartSupplierAssignments] = useState<Map<string, SupplierAssignment>>(
    () => new Map()
  );
  const [partSupplierLoading, setPartSupplierLoading] = useState(false);
  const [partSupplierError, setPartSupplierError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CertificateUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSuppliers();
  }, []);

  useEffect(() => {
    void fetchPartSupplierAssignments();
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

      if (mode === 'file' && file) {
        const uploadedDocument = await uploadDocument(file);
        const extension = file.name.split('.').pop()?.toLowerCase();
        const supplierResolution: SupplierResolution =
          supplierScope === 'auto'
            ? {
                mode: 'auto',
                lookup: (partNumber: string) => partSupplierAssignments.get(partNumber)?.supplierId
              }
            : { mode: 'single', supplierId };
        if (supplierResolution.mode === 'single' && !supplierResolution.supplierId) {
          throw new Error('Select a supplier before uploading certificates');
        }
        if (supplierResolution.mode === 'auto' && partSupplierAssignments.size === 0) {
          throw new Error(
            'Auto supplier detection requires component_suppliers assignments. Map BOM parts to suppliers first.'
          );
        }

        let certificates: CertificatePayload[];
        if (extension === 'xml') {
          const content = await file.text();
          certificates = parseReachXml(content, supplierResolution, certType, uploadedDocument.id);
        } else if (extension === 'csv') {
          const content = await file.text();
          certificates = parseCertificateCsv(content, supplierResolution, certType, uploadedDocument.id);
        } else if (extension === 'pdf') {
          certificates = await parseCertificatePdf(uploadedDocument.id, supplierResolution, certType);
        } else {
          throw new Error('Unsupported file type. Please upload CSV, XML, or PDF files.');
        }

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

  const fetchPartSupplierAssignments = async () => {
    setPartSupplierLoading(true);
    setPartSupplierError(null);
    try {
      const response = await fetch('/api/dashboard/snapshot');
      if (!response.ok) {
        const body = (await safeJson(response)) as { error?: string } | undefined;
        throw new Error(body?.error ?? `Failed to load BOM snapshot (${response.status})`);
      }
      const payload = (await response.json()) as DashboardSnapshot;
      const assignmentMap = new Map<string, SupplierAssignment>();
      payload.bom.items.forEach((item) => {
        if (item.partNumber && item.supplierId) {
          assignmentMap.set(item.partNumber, {
            supplierId: item.supplierId,
            supplierName: item.supplierName ?? null
          });
        }
      });
      setPartSupplierAssignments(assignmentMap);
    } catch (err) {
      setPartSupplierError(err instanceof Error ? err.message : 'Unable to load part owners');
    } finally {
      setPartSupplierLoading(false);
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

        {/* Supplier scope */}
        {mode === 'file' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Supplier scope *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSupplierScope('single')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  supplierScope === 'single'
                    ? 'border-brand-400 bg-brand-500/20 text-white'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Single supplier
              </button>
              <button
                type="button"
                onClick={() => setSupplierScope('auto')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  supplierScope === 'auto'
                    ? 'border-brand-400 bg-brand-500/20 text-white'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Auto (per part)
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Auto detection reads Architecture.md §6 <code className="font-mono">component_suppliers</code> ownership
              from the latest BOM (via the dashboard snapshot). Any file upload can include multiple suppliers in a
              single submission once parts are mapped.
            </p>
            {supplierScope === 'auto' && (
              <p className="text-xs text-slate-400">
                {partSupplierLoading
                  ? 'Loading BOM ownership...'
                  : partSupplierError
                    ? `Auto-detect unavailable: ${partSupplierError}`
                    : partSupplierAssignments.size > 0
                      ? `Loaded suppliers for ${partSupplierAssignments.size} part${
                          partSupplierAssignments.size === 1 ? '' : 's'
                        }. Unassigned parts must be mapped before upload.`
                      : 'No assigned parts detected. Map BOM parts to suppliers in the Supplier Management panel first.'}
              </p>
            )}
          </div>
        )}

        {/* Supplier selector */}
        {mode === 'file' && supplierScope === 'single' && (
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

function parseCertificateCsv(
  content: string,
  supplierResolution: SupplierResolution,
  certType: CertType,
  sourceDocumentId: string
): CertificatePayload[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const headers = lines[0]!.split(',').map((h) => h.trim());
  const normalizedHeaders = headers.reduce<Record<string, number>>((acc, header, index) => {
    acc[normalizeHeader(header)] = index;
    return acc;
  }, {});

  const certificates: CertificatePayload[] = [];
  const missingSupplierParts: string[] = [];
  lines.slice(1).forEach((line, rowIndex) => {
    const values = line.split(',').map((value) => value.trim());
    if (values.every((value) => value === '')) {
      return;
    }

    const partNumber = getValue(values, normalizedHeaders, ['partnumber', 'part_number', 'part']);
    if (!partNumber) {
      throw new Error(`Row ${rowIndex + 2} is missing a partNumber`);
    }

    const declarationDate = getValue(values, normalizedHeaders, ['declarationdate', 'declaration_date']) || null;
    const validUntil =
      getValue(values, normalizedHeaders, [
        'validuntil',
        'valid_until',
        'certexpiry',
        'cert_expiry',
        'expiry',
        'expirydate',
        'expiration',
        'expirationdate'
      ]) || null;
    const thresholdRaw = getValue(values, normalizedHeaders, ['thresholdppm', 'threshold_ppm']);
    const thresholdPpm = thresholdRaw && !Number.isNaN(Number.parseFloat(thresholdRaw))
      ? Number.parseFloat(thresholdRaw)
      : null;

    const substance =
      getValue(values, normalizedHeaders, ['substance', 'substancename']) ??
      getValue(values, normalizedHeaders, ['chemical']);
    const concentrationRawValue = getValue(values, normalizedHeaders, ['concentration', 'value']);
    const concentrationRaw = normalizeOptionalText(concentrationRawValue);
    const concentrationUnit = (getValue(values, normalizedHeaders, ['unit', 'units']) as CertificateFindingPayload['concentrationUnit']) ?? undefined;

    const findings: CertificateFindingPayload[] =
      substance
        ? [
            {
              substanceName: substance,
              concentrationValue:
                concentrationRaw && !Number.isNaN(Number.parseFloat(concentrationRaw))
                  ? Number.parseFloat(concentrationRaw)
                  : null,
              concentrationUnit,
              concentrationRaw
            }
          ]
        : [];

    const resolvedSupplierId = resolveSupplierIdForPart(partNumber, supplierResolution);
    if (!resolvedSupplierId) {
      if (!missingSupplierParts.includes(partNumber)) {
        missingSupplierParts.push(partNumber);
      }
      return;
    }

    certificates.push({
      supplierId: resolvedSupplierId,
      partNumber,
      type: certType,
      declarationDate,
      validUntil,
      thresholdPpm,
      sourceDocumentId,
      findings
    });
  });

  if (missingSupplierParts.length > 0) {
    throw buildMissingSupplierError(missingSupplierParts);
  }

  if (certificates.length === 0) {
    throw new Error('No certificate rows were found in the CSV file');
  }

  return certificates;
}

function parseReachXml(
  content: string,
  supplierResolution: SupplierResolution,
  certType: CertType,
  sourceDocumentId: string
): CertificatePayload[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'application/xml');
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XML file');
  }

  const parts = Array.from(xmlDoc.getElementsByTagName('Part'));
  if (parts.length === 0) {
    throw new Error('XML does not include any <Part> elements');
  }

  const missingSupplierParts: string[] = [];

  const certificates = parts
    .map((part, index) => {
      const partNumber = part.getElementsByTagName('PartNumber')[0]?.textContent?.trim();
      if (!partNumber) {
        throw new Error(`Part entry #${index + 1} is missing a <PartNumber>`);
      }
      const resolvedSupplierId = resolveSupplierIdForPart(partNumber, supplierResolution);
      if (!resolvedSupplierId) {
        if (!missingSupplierParts.includes(partNumber)) {
          missingSupplierParts.push(partNumber);
        }
        return null;
      }

    const declarationDate = part.getElementsByTagName('DeclarationDate')[0]?.textContent?.trim() || null;
    const validUntil = part.getElementsByTagName('ValidUntil')[0]?.textContent?.trim() || null;
    const substances = Array.from(part.getElementsByTagName('Substance'));

    const findings: CertificateFindingPayload[] = [];
    substances.forEach((substance) => {
      const name =
        substance.getAttribute('name')?.trim() ||
        substance.getElementsByTagName('Name')[0]?.textContent?.trim();
      if (!name) {
        return;
      }

      const concentrationRawValue =
        substance.getAttribute('concentration')?.trim() ||
        substance.getAttribute('value')?.trim() ||
        substance.textContent?.trim() ||
        null;
      const concentrationRaw = normalizeOptionalText(concentrationRawValue ?? undefined);
      const concentrationValue =
        concentrationRaw && !Number.isNaN(Number.parseFloat(concentrationRaw))
          ? Number.parseFloat(concentrationRaw)
          : null;

      const unit =
        (substance.getAttribute('unit') ||
          substance.getElementsByTagName('Unit')[0]?.textContent ||
          null) as CertificateFindingPayload['concentrationUnit'];

      findings.push({
        substanceName: name,
        concentrationUnit: unit,
        concentrationValue,
        concentrationRaw
      });
    });

    return {
      supplierId: resolvedSupplierId,
      partNumber,
      type: certType,
      declarationDate,
      validUntil,
      thresholdPpm: null,
      sourceDocumentId,
      findings
    };
    })
    .filter((cert): cert is CertificatePayload => Boolean(cert));

  if (missingSupplierParts.length > 0) {
    throw buildMissingSupplierError(missingSupplierParts);
  }

  return certificates;
}

async function parseCertificatePdf(
  sourceDocumentId: string,
  supplierResolution: SupplierResolution,
  certType: CertType
): Promise<CertificatePayload[]> {
  const parsed = await fetchCoraParsedParts(sourceDocumentId);
  const missingSupplierParts: string[] = [];
  const certificates: CertificatePayload[] = parsed.parts
    .filter((part) => Boolean(part.partNumber?.trim()))
    .map((part) => {
      const resolvedSupplierId = resolveSupplierIdForPart(part.partNumber, supplierResolution);
      if (!resolvedSupplierId) {
        if (!missingSupplierParts.includes(part.partNumber)) {
          missingSupplierParts.push(part.partNumber);
        }
        return null;
      }
      return {
        supplierId: resolvedSupplierId,
        partNumber: part.partNumber,
        type: certType,
        declarationDate: null,
        validUntil: null,
        thresholdPpm: null,
        sourceDocumentId,
        findings: part.findings.map((finding) => ({
          substanceName: finding.substanceName,
          concentrationValue: finding.concentrationValue,
          concentrationUnit: finding.concentrationUnit ?? undefined,
          concentrationRaw: normalizeOptionalText(finding.notes ?? undefined)
        }))
      };
    })
    .filter((cert): cert is CertificatePayload => Boolean(cert));

  if (missingSupplierParts.length > 0) {
    throw buildMissingSupplierError(missingSupplierParts);
  }

  if (certificates.length === 0) {
    throw new Error('CORA parsing did not return any certificate parts for this PDF');
  }

  return certificates;
}

async function fetchCoraParsedParts(documentId: string): Promise<{ parts: CoraParsedPart[] }> {
  const response = await fetch('/api/ai/parse-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, schema: 'certificate_v1' })
  });
  const payload = (await safeJson(response)) as
    | ({ parts: CoraParsedPart[] } & Record<string, unknown>)
    | { error?: string }
    | undefined;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `CORA parsing failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload || !('parts' in payload) || !Array.isArray(payload.parts)) {
    throw new Error('CORA parsing response was malformed');
  }

  return { parts: payload.parts as CoraParsedPart[] };
}

function normalizeHeader(header: string): string {
  return header.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function getValue(
  row: string[],
  headerMap: Record<string, number>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const index = headerMap[key];
    if (index !== undefined) {
      return row[index]?.trim();
    }
  }
  return undefined;
}

function normalizeOptionalText(value?: string | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSupplierIdForPart(partNumber: string, supplierResolution: SupplierResolution): string | undefined {
  if (supplierResolution.mode === 'single') {
    return supplierResolution.supplierId;
  }
  return supplierResolution.lookup(partNumber);
}

function buildMissingSupplierError(missingSupplierParts: string[]): Error {
  const [head, ...rest] = missingSupplierParts;
  const preview = rest.length ? `${head}, ${rest.slice(0, 2).join(', ')}` : head;
  const remaining = rest.length - 2;
  const suffix = remaining > 0 ? ` (+${remaining} more)` : '';
  return new Error(
    `Auto supplier detection could not find component_suppliers ownership for part${
      missingSupplierParts.length > 1 ? 's' : ''
    } ${preview}${suffix}. Map these parts in Supplier Management or include a supplierId column in the upload.`
  );
}
