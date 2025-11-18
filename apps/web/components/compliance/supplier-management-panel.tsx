'use client';

import { useEffect, useMemo, useState } from 'react';

type SupplierRecord = {
  id: string;
  name: string;
  country: string;
  language: string;
  complianceRate: number;
  responseAvgDays: number;
};

type UnassignedPart = {
  bomId: string;
  partNumber: string;
  assemblyId: string;
  assemblyName?: string | null;
};

type SupplierManagementPanelProps = {
  bomId: string | null;
  refreshKey: number;
  onAssignmentsApplied?: () => void;
};

type SupplierJsonEntry = {
  name: string;
  country: string;
  language: string;
  complianceRate?: number;
  responseAvgDays?: number;
};

const INITIAL_SUPPLIER_FORM = {
  name: '',
  country: '',
  language: 'en',
  complianceRate: 0.92,
  responseAvgDays: 5
};

export function SupplierManagementPanel({ bomId, refreshKey, onAssignmentsApplied }: SupplierManagementPanelProps) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);

  const [createMode, setCreateMode] = useState<'form' | 'json'>('form');
  const [createForm, setCreateForm] = useState(() => ({ ...INITIAL_SUPPLIER_FORM }));
  const [createStatus, setCreateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonStatus, setJsonStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [jsonMessage, setJsonMessage] = useState<string | null>(null);

  const [parts, setParts] = useState<UnassignedPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [selectedParts, setSelectedParts] = useState<Set<string>>(() => new Set());
  const [manualInput, setManualInput] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchSuppliers();
  }, []);

  useEffect(() => {
    if (bomId) {
      void fetchUnassignedParts(bomId);
    } else {
      setParts([]);
      setSelectedParts(new Set());
    }
  }, [bomId, refreshKey]);

  useEffect(() => {
    if (!selectedSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0]!.id);
    }
  }, [suppliers, selectedSupplierId]);

  const selectedCount = selectedParts.size;
  const manualPartEntries = useMemo(() => {
    return manualInput
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }, [manualInput]);
  const combinedSelectionCount = selectedCount + manualPartEntries.length;

  async function fetchSuppliers() {
    setSuppliersLoading(true);
    setSuppliersError(null);
    try {
      const response = await fetch('/api/suppliers');
      if (!response.ok) {
        const body = (await safeJson(response)) as { error?: string } | undefined;
        throw new Error(body?.error ?? `Failed (${response.status})`);
      }
      const payload = (await response.json()) as { suppliers: SupplierRecord[] };
      setSuppliers(payload.suppliers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load suppliers';
      setSuppliersError(message);
    } finally {
      setSuppliersLoading(false);
    }
  }

  async function fetchUnassignedParts(currentBomId: string) {
    setPartsLoading(true);
    setPartsError(null);
    try {
      const response = await fetch(`/api/suppliers/unassigned?bomId=${encodeURIComponent(currentBomId)}&limit=200`);
      if (!response.ok) {
        const body = (await safeJson(response)) as { error?: string } | undefined;
        throw new Error(body?.error ?? `Failed (${response.status})`);
      }
      const payload = (await response.json()) as { parts: UnassignedPart[] };
      setParts(payload.parts);
      setSelectedParts((prev) => {
        const next = new Set<string>();
        for (const part of payload.parts) {
          if (prev.has(part.partNumber)) {
            next.add(part.partNumber);
          }
        }
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load BOM parts';
      setPartsError(message);
    } finally {
      setPartsLoading(false);
    }
  }

  function updateCreateForm<TField extends keyof typeof INITIAL_SUPPLIER_FORM>(field: TField, value: (typeof INITIAL_SUPPLIER_FORM)[TField]) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus('loading');
    setCreateMessage(null);
    try {
      const response = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? ((payload as { error?: string }).error ?? 'Supplier create failed')
            : `Supplier create failed (${response.status})`;
        throw new Error(message);
      }
      setCreateStatus('success');
      setCreateMessage('Supplier created');
      setCreateForm({ ...INITIAL_SUPPLIER_FORM });
      await fetchSuppliers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create supplier';
      setCreateStatus('error');
      setCreateMessage(message);
    }
  }

  async function handleJsonImport() {
    setJsonStatus('loading');
    setJsonMessage(null);
    try {
      if (!jsonInput.trim()) {
        throw new Error('Provide JSON payload');
      }
      const parsed = JSON.parse(jsonInput);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = entries
        .map((entry) => normalizeSupplierJson(entry))
        .filter((entry): entry is SupplierJsonEntry => Boolean(entry));
      if (!normalized.length) {
        throw new Error('No valid supplier records found');
      }
      for (const entry of normalized) {
        const response = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: entry.name,
            country: entry.country,
            language: entry.language,
            complianceRate: clamp(entry.complianceRate ?? 0.92, 0, 1),
            responseAvgDays: Math.max(1, Math.round(entry.responseAvgDays ?? 5))
          })
        });
        if (!response.ok) {
          const payload = (await safeJson(response)) as { error?: string } | undefined;
          throw new Error(payload?.error ?? `Supplier import failed (${response.status})`);
        }
      }
      setJsonStatus('success');
      setJsonMessage(`Imported ${normalized.length} supplier${normalized.length === 1 ? '' : 's'}`);
      setJsonInput('');
      await fetchSuppliers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import suppliers';
      setJsonStatus('error');
      setJsonMessage(message);
    }
  }

  function togglePartSelection(partNumber: string) {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) {
        next.delete(partNumber);
      } else {
        next.add(partNumber);
      }
      return next;
    });
  }

  function selectAllParts() {
    setSelectedParts(new Set(parts.map((part) => part.partNumber)));
  }

  function clearSelections() {
    setSelectedParts(new Set());
    setManualInput('');
  }

  async function handleAssignSupplier() {
    if (!bomId || !selectedSupplierId) {
      return;
    }
    const combined = Array.from(new Set([...selectedParts, ...manualPartEntries]));
    if (!combined.length) {
      setAssignmentStatus('error');
      setAssignmentMessage('Select or enter at least one part number');
      return;
    }
    setAssignmentStatus('loading');
    setAssignmentMessage(null);
    try {
      const response = await fetch('/api/suppliers/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: selectedSupplierId,
          partNumbers: combined,
          sourcingType: 'PRIMARY'
        })
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload
            ? ((payload as { error?: string }).error ?? 'Assignment failed')
            : `Assignment failed (${response.status})`;
        throw new Error(message);
      }
      const result = payload as { created: number; updated: number; missingParts: string[] };
      setAssignmentStatus('success');
      setAssignmentMessage(
        `Mapped ${result.created + result.updated} parts${
          result.missingParts.length ? ` · ${result.missingParts.length} missing in BOM` : ''
        }`
      );
      clearSelections();
      if (bomId) {
        void fetchUnassignedParts(bomId);
      }
      onAssignmentsApplied?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign supplier';
      setAssignmentStatus('error');
      setAssignmentMessage(message);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Architecture.md §6 expects `component_suppliers` ownership before supplier workflows kick off. Use this panel to
        seed suppliers and map BOM parts so merged compliance, supplier scorecards, and workflow orchestration all agree
        on ownership.
      </p>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-800 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Create supplier</h3>
            <p className="text-xs text-slate-400">
              Adds a supplier record with locale + SLA defaults or bulk imports JSON pasted from Sample Data.
            </p>
          </div>
          <div className="flex gap-2 border-b border-slate-800 text-xs font-semibold uppercase tracking-wide">
            <button
              type="button"
              className={`rounded-t-lg px-3 py-1 ${
                createMode === 'form'
                  ? 'border border-slate-700 border-b-slate-900 text-brand-200'
                  : 'text-slate-500 hover:text-slate-200'
              }`}
              onClick={() => setCreateMode('form')}
            >
              Form
            </button>
            <button
              type="button"
              className={`rounded-t-lg px-3 py-1 ${
                createMode === 'json'
                  ? 'border border-slate-700 border-b-slate-900 text-brand-200'
                  : 'text-slate-500 hover:text-slate-200'
              }`}
              onClick={() => setCreateMode('json')}
            >
              JSON import
            </button>
          </div>
          {createMode === 'form' ? (
            <form className="space-y-3" onSubmit={handleCreateSupplier}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Name *</span>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(event) => updateCreateForm('name', event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Country *</span>
                  <input
                    type="text"
                    required
                    value={createForm.country}
                    onChange={(event) => updateCreateForm('country', event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Language (ISO) *</span>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={createForm.language}
                    onChange={(event) => updateCreateForm('language', event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-300">
                  <span>Compliance rate</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={createForm.complianceRate}
                    onChange={(event) => updateCreateForm('complianceRate', Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Avg response days</span>
                <input
                  type="number"
                  min="1"
                  value={createForm.responseAvgDays}
                  onChange={(event) => updateCreateForm('responseAvgDays', Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="submit"
                disabled={createStatus === 'loading'}
                className="w-full rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {createStatus === 'loading' ? 'Saving…' : 'Create supplier'}
              </button>
              {createMessage && (
                <p
                  className={`text-xs ${
                    createStatus === 'error' ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {createMessage}
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Paste JSON objects (array or single) from files such as{' '}
                <code className="rounded bg-slate-900 px-1">Sample Data/suppliers.json</code>. Each record should include
                <code className="mx-1">name</code>, <code className="mx-1">country</code>, and <code className="mx-1">language</code>.
              </p>
              <textarea
                value={jsonInput}
                onChange={(event) => setJsonInput(event.target.value)}
                placeholder='[{"name":"Zentech Components","country":"DE","language":"de","complianceRate":0.93,"responseAvgDays":7}]'
                className="h-40 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                disabled={jsonStatus === 'loading'}
                onClick={() => void handleJsonImport()}
                className="w-full rounded-full border border-brand-400 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
              >
                {jsonStatus === 'loading' ? 'Importing…' : 'Import suppliers'}
              </button>
              {jsonMessage && (
                <p
                  className={`text-xs ${
                    jsonStatus === 'error' ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {jsonMessage}
                </p>
              )}
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current suppliers</h4>
            {suppliersLoading ? (
              <p className="text-xs text-slate-500">Loading suppliers…</p>
            ) : suppliersError ? (
              <p className="text-xs text-rose-300">{suppliersError}</p>
            ) : suppliers.length === 0 ? (
              <p className="text-xs text-slate-500">No suppliers exist yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {suppliers.map((supplier) => (
                  <li key={supplier.id} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2">
                    <div>
                      <p className="font-medium text-white">{supplier.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {supplier.country} · {supplier.language.toUpperCase()} ·{' '}
                        {Math.round(supplier.complianceRate * 100)}% compliant
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">{supplier.responseAvgDays}d SLA</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-800 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Assign suppliers to BOM parts</h3>
            <p className="text-xs text-slate-400">
              Select one or more parts lacking supplier ownership and map them to a supplier so ingestion issues clear.
            </p>
          </div>
          {!bomId ? (
            <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 px-4 py-3 text-xs text-slate-500">
              Upload a BOM to enable part assignments.
            </p>
          ) : (
            <>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Supplier</span>
                <select
                  value={selectedSupplierId}
                  onChange={(event) => setSelectedSupplierId(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  disabled={suppliers.length === 0}
                >
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} · {supplier.country}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
                  <span>
                    Parts needing supplier · {partsLoading ? 'loading…' : `${parts.length} listed`}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" className="text-brand-300 hover:text-brand-200" onClick={selectAllParts}>
                      Select all
                    </button>
                    <button type="button" className="text-slate-400 hover:text-white" onClick={() => setSelectedParts(new Set())}>
                      Clear
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-white"
                      onClick={() => bomId && fetchUnassignedParts(bomId)}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-auto divide-y divide-slate-900">
                  {partsError ? (
                    <p className="px-4 py-3 text-xs text-rose-300">{partsError}</p>
                  ) : parts.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">All parts are already assigned 🎉</p>
                  ) : (
                    parts.map((part) => (
                      <label
                        key={`${part.partNumber}-${part.assemblyId}`}
                        className="flex items-center gap-3 px-4 py-2 text-xs text-slate-200"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-600 bg-slate-900 text-brand-400 focus:ring-brand-400"
                          checked={selectedParts.has(part.partNumber)}
                          onChange={() => togglePartSelection(part.partNumber)}
                        />
                        <div className="flex-1">
                          <p className="font-mono text-sm text-white">{part.partNumber}</p>
                          <p className="text-[11px] text-slate-500">
                            {part.assemblyName ?? part.assemblyId}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Manual part numbers (one per line)</span>
                <textarea
                  value={manualInput}
                  onChange={(event) => setManualInput(event.target.value)}
                  placeholder={'CU-78901\nCTRL-1050'}
                  className="h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white"
                />
              </label>
              <button
                type="button"
                disabled={assignmentStatus === 'loading' || !selectedSupplierId || combinedSelectionCount === 0}
                onClick={() => void handleAssignSupplier()}
                className="w-full rounded-full border border-brand-400 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
              >
                {assignmentStatus === 'loading'
                  ? 'Assigning…'
                  : `Assign ${combinedSelectionCount} part${combinedSelectionCount === 1 ? '' : 's'}`}
              </button>
              {assignmentMessage && (
                <p
                  className={`text-xs ${
                    assignmentStatus === 'error' ? 'text-rose-300' : 'text-emerald-300'
                  }`}
                >
                  {assignmentMessage}
                </p>
              )}
            </>
          )}
        </div>
      </div>
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

function normalizeSupplierJson(data: unknown): SupplierJsonEntry | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const country = typeof record.country === 'string' ? record.country.trim() : '';
  const language = typeof record.language === 'string' ? record.language.trim() : '';
  if (!name || !country || !language) {
    return null;
  }
  const complianceRate = typeof record.complianceRate === 'number' ? record.complianceRate : undefined;
  const responseAvgDays = typeof record.responseAvgDays === 'number' ? record.responseAvgDays : undefined;
  return { name, country, language, complianceRate, responseAvgDays };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
