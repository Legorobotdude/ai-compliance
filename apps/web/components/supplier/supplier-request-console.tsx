"use client";

import { useMemo, useState } from "react";

import type { SupplierRequestResult, SupplierRequestTone } from "@certivo/supplier";

import { SectionCard } from "@/components/ui/section-card";
import type { SupplierSnapshot } from "@/lib/types/dashboard";

type SupplierRequestConsoleProps = {
  suppliers: SupplierSnapshot[];
  bom: {
    id: string;
    externalId: string;
    productName: string;
  };
};

type FormState = {
  supplierId: string;
  tone: SupplierRequestTone;
  languageOverride?: string;
  dueAt?: string;
};

export function SupplierRequestConsole({ suppliers, bom }: SupplierRequestConsoleProps) {
  const defaultSupplierId = suppliers[0]?.supplierId ?? "";
  const defaultLanguage = suppliers[0]?.language ?? "en";
  const [formState, setFormState] = useState<FormState>({
    supplierId: defaultSupplierId,
    tone: "formal",
    languageOverride: defaultLanguage
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupplierRequestResult | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((entry) => entry.supplierId === formState.supplierId),
    [formState.supplierId, suppliers]
  );

  function updateForm(patch: Partial<FormState>) {
    setFormState((previous) => ({ ...previous, ...patch }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState.supplierId) {
      setError("Supplier is required");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/supplier/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: formState.supplierId,
          bomId: bom.id,
          tone: formState.tone,
          languageOverride: formState.languageOverride?.trim() || undefined,
          dueAt: formState.dueAt?.trim() || undefined
        })
      });
      if (!response.ok) {
        const payload = await safeJson(response);
        const message =
          (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : null) ?? `Supplier request failed (${response.status})`;
        throw new Error(message);
      }
      const data = (await response.json()) as SupplierRequestResult;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown supplier request error";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="Supplier request console"
      description="Push /supplier/request just like scripts/supplier-smoke.mjs does—without leaving the browser."
      className="space-y-6"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Supplier
            <select
              value={formState.supplierId}
              onChange={(event) => {
                const supplierId = event.currentTarget.value;
                const supplier = suppliers.find((entry) => entry.supplierId === supplierId);
                updateForm({
                  supplierId,
                  languageOverride: supplier?.language ?? formState.languageOverride
                });
              }}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white"
            >
              {suppliers.length === 0 ? <option value="">No suppliers seeded</option> : null}
              {suppliers.map((supplier) => (
                <option key={supplier.supplierId} value={supplier.supplierId}>
                  {supplier.name} · {supplier.country}
                </option>
              ))}
            </select>
            {selectedSupplier ? (
              <p className="text-xs text-slate-500">
                Locale {selectedSupplier.language.toUpperCase()} · Avg response {selectedSupplier.responseAvgDays} days ·
                Compliance {Math.round(selectedSupplier.complianceRate * 100)}%
              </p>
            ) : null}
          </label>

          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Tone
            <select
              value={formState.tone}
              onChange={(event) => updateForm({ tone: event.currentTarget.value as SupplierRequestTone })}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white"
            >
              <option value="formal">Formal</option>
              <option value="neutral">Neutral</option>
              <option value="friendly">Friendly</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Language override
            <input
              type="text"
              value={formState.languageOverride ?? ""}
              onChange={(event) => updateForm({ languageOverride: event.currentTarget.value })}
              placeholder="en"
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Due date (optional)
            <input
              type="datetime-local"
              value={formState.dueAt ?? ""}
              onChange={(event) => updateForm({ dueAt: event.currentTarget.value })}
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white"
            />
          </label>
        </div>

        <div className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-widest text-slate-500">Payload preview</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-950/70 p-3 text-xs text-slate-200">
            {JSON.stringify(
              {
                supplierId: formState.supplierId,
                bomId: bom.id,
                tone: formState.tone,
                languageOverride: formState.languageOverride || undefined,
                dueAt: formState.dueAt || undefined
              },
              null,
              2
            )}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Tenant + requestedBy automatically inject via the proxy route (see Architecture §5 workflow notes).
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !formState.supplierId}
          className="w-full rounded-full border border-brand-400 px-4 py-2 text-base font-semibold text-brand-200 transition hover:bg-brand-400/10 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
        >
          {isSubmitting ? "Creating request…" : "Create supplier request"}
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>

      {result ? (
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold text-white">Workflow queued</h3>
            <dl className="mt-3 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-widest text-slate-500">Request ID</dt>
                <dd className="break-all text-white">{result.requestId}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-slate-500">Status</dt>
                <dd className="text-white">{result.status}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-slate-500">Due at</dt>
                <dd className="text-white">{formatDate(result.dueAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-slate-500">Workflow scheduled</dt>
                <dd className="text-white">{result.workflowScheduled ? "yes" : "no (retry via worker)"}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-widest text-slate-500">Blocked parts ({result.blockedParts.length})</p>
              {result.blockedParts.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">No outstanding coverage for this BOM slice.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-slate-300">
                  {result.blockedParts.slice(0, 6).map((part) => (
                    <li key={`${part.partNumber}-${part.reason}`} className="rounded-xl border border-slate-900 bg-slate-900/60 p-2">
                      <p className="font-semibold text-white">{part.partNumber}</p>
                      <p className="text-xs text-slate-400">
                        {part.reason} · assembly {part.assemblyName ?? part.assemblyId}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold text-white">Email draft</h3>
            <p className="text-xs text-slate-500">Language {result.emailDraft.language?.toUpperCase()}</p>
            <p className="mt-2 text-sm font-semibold text-brand-200">{result.emailDraft.subject}</p>
            <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950/70 p-3 text-xs text-slate-100">
              {result.emailDraft.body}
            </pre>
            <p className="mt-2 text-xs text-slate-500">
              Upload link {result.emailDraft.uploadUrl} · Due {formatDate(result.emailDraft.dueDate)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          After submitting, the response mirrors the smoke script: blocked parts, CORA draft, workflow flag.
        </p>
      )}
    </SectionCard>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

