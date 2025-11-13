"use client";

import { useEffect, useState } from "react";

import type { ScorecardResponse, SupplierBlockedPart } from "@certivo/supplier";

import { SectionCard } from "@/components/ui/section-card";
import type { SupplierSnapshot } from "@/lib/types/dashboard";

type SupplierScorecardProbeProps = {
  suppliers: SupplierSnapshot[];
};

type FetchState = {
  data: ScorecardResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchedAt?: string | null;
};

export function SupplierScorecardProbe({ suppliers }: SupplierScorecardProbeProps) {
  const defaultSupplierId = suppliers[0]?.supplierId ?? "";
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(defaultSupplierId);
  const [fetchState, setFetchState] = useState<FetchState>({
    data: null,
    isLoading: Boolean(defaultSupplierId),
    error: null
  });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!selectedSupplierId) {
      setFetchState((prev) => ({ ...prev, data: null, error: null, isLoading: false }));
      return;
    }
    const abortController = new AbortController();
    setFetchState((prev) => ({ ...prev, isLoading: true, error: null }));

    async function loadScorecard() {
      try {
        const response = await fetch(`/api/supplier/scorecard/${selectedSupplierId}`, {
          signal: abortController.signal
        });
        if (!response.ok) {
          const payload = await safeJson(response);
          const message =
            (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : null) ?? `Scorecard API failed (${response.status})`;
          throw new Error(message);
        }
        const data = (await response.json()) as ScorecardResponse;
        setFetchState({
          data,
          isLoading: false,
          error: null,
          fetchedAt: new Date().toISOString()
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown scorecard error";
        setFetchState({
          data: null,
          isLoading: false,
          error: message,
          fetchedAt: null
        });
      }
    }

    void loadScorecard();

    return () => {
      abortController.abort();
    };
  }, [selectedSupplierId, refreshIndex]);

  function refreshScorecard() {
    setRefreshIndex((value) => value + 1);
  }

  const stats = fetchState.data?.stats;
  const supplierProfile = fetchState.data?.supplier;

  return (
    <SectionCard
      title="Supplier scorecard probe"
      description="Calls /supplier/scorecard to mirror the Architecture §5 smoke harness without leaving the dashboard."
      actions={
        <button
          type="button"
          onClick={refreshScorecard}
          disabled={!selectedSupplierId || fetchState.isLoading}
          className="rounded-full border border-brand-400 px-3 py-1 text-xs font-semibold text-brand-200 transition hover:bg-brand-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
        >
          {fetchState.isLoading ? "Fetching…" : "Refresh scorecard"}
        </button>
      }
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-2 text-sm text-slate-300">
          Supplier under test
          <select
            value={selectedSupplierId}
            onChange={(event) => setSelectedSupplierId(event.currentTarget.value)}
            className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white"
          >
            {suppliers.length === 0 ? <option value="">No suppliers seeded</option> : null}
            {suppliers.map((supplier) => (
              <option key={supplier.supplierId} value={supplier.supplierId}>
                {supplier.name} · {supplier.country} · {Math.round(supplier.complianceRate * 100)}%
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-slate-500">
          {fetchState.fetchedAt ? (
            <p>Last fetched {formatRelative(fetchState.fetchedAt)}</p>
          ) : (
            <p>Select a supplier to fetch their scorecard.</p>
          )}
          {fetchState.error ? <p className="text-red-400">{fetchState.error}</p> : null}
        </div>
      </div>

      {fetchState.isLoading ? (
        <p className="text-sm text-slate-400">Loading live scorecard…</p>
      ) : fetchState.data && stats && supplierProfile ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Compliance rate" value={`${Math.round(stats.complianceRate * 100)}%`} />
            <StatTile label="Target response" value={`${stats.targetResponseDays} d`} />
            <StatTile
              label="Actual response"
              value={stats.actualResponseDays ? `${stats.actualResponseDays?.toFixed(1)} d` : "TBD"}
            />
            <StatTile label="Open requests" value={stats.openRequests} />
            <StatTile label="Due soon" value={stats.dueSoon} />
            <StatTile label="SLA breaches" value={stats.slaBreaches} />
          </div>

          <div className="rounded-2xl border border-slate-900 bg-slate-950/50 p-4 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-widest text-slate-500">Supplier profile</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-white">{supplierProfile?.name}</span>
              <span>{supplierProfile?.country}</span>
              <span>Language {supplierProfile?.language?.toUpperCase()}</span>
              <span>Contacts {supplierProfile?.contacts?.length ?? 0}</span>
              {stats?.lastRequestAt ? <span>Last request {formatRelative(stats.lastRequestAt)}</span> : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <BlockedPartsPanel parts={fetchState.data.blockedParts} />
            <div className="space-y-6">
              <ContactsPanel contacts={supplierProfile?.contacts ?? []} />
              <RecentRequestsPanel requests={fetchState.data.recentRequests} />
            </div>
          </div>
        </div>
      ) : fetchState.data ? (
        <p className="text-sm text-red-400">Scorecard payload is missing stats—check the API logs.</p>
      ) : (
        <p className="text-sm text-slate-500">Select a supplier to pull the live scorecard snapshot.</p>
      )}
    </SectionCard>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function BlockedPartsPanel({ parts }: { parts: SupplierBlockedPart[] }) {
  if (!parts.length) {
    return (
      <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
        <h3 className="text-sm font-semibold text-white">Blocked parts ({parts.length})</h3>
        <p className="mt-2 text-sm text-slate-500">No outstanding BOM components for this supplier 🎉</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
      <h3 className="text-sm font-semibold text-white">Blocked parts ({parts.length})</h3>
      <p className="mt-1 text-xs text-slate-500">
        Mirrors the smoke test’s `/supplier/scorecard` payload—reason codes map to Architecture §5 workflow states.
      </p>
      <div className="mt-3 space-y-3">
        {parts.slice(0, 12).map((part) => (
          <div
            key={`${part.partNumber}-${part.bomId}-${part.reason}`}
            className="rounded-xl border border-slate-900 bg-slate-900/60 p-3"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-white">{part.partNumber}</span>
              <span className="text-xs text-slate-400">{part.assemblyName ?? part.assemblyId}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className={reasonClass(part.reason)}>{humanizeReason(part.reason)}</span>
              <span>Assembly {part.assemblyName ?? part.assemblyId}</span>
              <span>BOM {part.bomExternalId}</span>
            </div>
          </div>
        ))}
        {parts.length > 12 ? (
          <p className="text-xs text-slate-500">Showing 12 of {parts.length} parts. Use the CLI harness for the full set.</p>
        ) : null}
      </div>
    </div>
  );
}

function ContactsPanel({ contacts }: { contacts: ScorecardResponse["supplier"]["contacts"] }) {
  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
      <h3 className="text-sm font-semibold text-white">Contacts ({contacts.length})</h3>
      {contacts.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Seed supplier_contacts to see the escalation tree.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {contacts.map((contact) => (
            <li key={contact.id} className="rounded-xl border border-slate-900 bg-slate-900/50 p-2">
              <p className="font-semibold text-white">{contact.name ?? "Contact"}</p>
              <p className="text-xs text-slate-400">{contact.email}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentRequestsPanel({
  requests
}: {
  requests: ScorecardResponse["recentRequests"];
}) {
  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4">
      <h3 className="text-sm font-semibold text-white">Recent requests ({requests.length})</h3>
      {requests.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No previous workflows—create one below to exercise `/supplier/request`.</p>
      ) : (
        <ol className="mt-3 space-y-2 text-sm text-slate-300">
          {requests.map((request) => (
            <li key={request.id} className="rounded-xl border border-slate-900 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{request.status}</span>
                <span className="text-xs text-slate-500">{formatRelative(request.sentAt ?? request.dueAt)}</span>
              </div>
              <p className="text-xs text-slate-400">{request.bomExternalId}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function humanizeReason(reason: SupplierBlockedPart["reason"]): string {
  switch (reason) {
    case "MISSING":
      return "Missing cert";
    case "EXPIRED":
      return "Certificate expired";
    case "OVER_LIMIT":
      return "Over limit";
    case "VALUE_MISSING":
      return "Value missing";
    default:
      return reason;
  }
}

function reasonClass(reason: SupplierBlockedPart["reason"]): string {
  switch (reason) {
    case "OVER_LIMIT":
      return "text-red-300";
    case "EXPIRED":
      return "text-amber-300";
    default:
      return "text-slate-300";
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatRelative(iso?: string | null): string {
  if (!iso) {
    return "n/a";
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
  try {
    return formatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

