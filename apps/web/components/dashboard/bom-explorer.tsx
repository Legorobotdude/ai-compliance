"use client";

import { useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type ColumnDef
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { DashboardBomRow, SupplierSnapshot } from "@/lib/types/dashboard";
import type { DashboardSnapshot } from "@/lib/types/dashboard";
import { statusClass } from "@/lib/status";
import { SectionCard } from "@/components/ui/section-card";

type BomStatus = DashboardSnapshot["bom"]["items"][number]["status"];

type BomExplorerProps = {
  rows: DashboardBomRow[];
  suppliers: SupplierSnapshot[];
  bomId: string;
};

type DraftPayload = {
  subject: string;
  body: string;
  language: string;
  dueDate?: string;
};

type RowActionState = {
  draftStatus: "idle" | "loading" | "success" | "error";
  draft?: DraftPayload | null;
  draftError?: string | null;
  sendStatus: "idle" | "loading" | "success" | "error";
  sendMessage?: string | null;
};

const EMPTY_ROW_STATE: RowActionState = {
  draftStatus: "idle",
  draft: null,
  draftError: null,
  sendStatus: "idle",
  sendMessage: null
};

const statusOptions: Array<{ label: string; value: BomStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Compliant", value: "COMPLIANT" },
  { label: "Missing", value: "MISSING" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Over limit", value: "OVER_LIMIT" }
];

export function BomExplorer({ rows, suppliers, bomId }: BomExplorerProps) {
  const [statusFilter, setStatusFilter] = useState<BomStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "status", desc: false }]);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowActionState>>({});
  const [preview, setPreview] = useState<{
    rowKey: string;
    partNumber: string;
    supplierName?: string | null;
    draft: DraftPayload;
  } | null>(null);

  const supplierMap = useMemo(() => {
    const map = new Map<string, SupplierSnapshot>();
    for (const supplier of suppliers) {
      map.set(supplier.supplierId, supplier);
    }
    return map;
  }, [suppliers]);

  const columns = useMemo<ColumnDef<DashboardBomRow>[]>(() => {
    return [
      {
        header: "Part",
        accessorKey: "partNumber",
        size: 180,
        cell: (info) => (
          <div>
            <p className="font-medium text-white">{info.getValue<string>()}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {info.row.original.assemblyName ?? info.row.original.assemblyId}
            </p>
          </div>
        )
      },
      {
        header: "Supplier",
        accessorFn: (row) => row.supplierName ?? "Unassigned",
        size: 180,
        cell: (info) => <span className="text-slate-200">{info.getValue<string>()}</span>
      },
      {
        header: "Findings",
        accessorKey: "findings",
        size: 240,
        cell: (info) => {
          const findings = info.getValue<DashboardBomRow["findings"]>();
          if (!findings.length) {
            return <span className="text-xs text-slate-500">No findings</span>;
          }
          return (
            <div className="flex flex-wrap gap-2 text-xs text-slate-200">
              {findings.slice(0, 2).map((finding) => (
                <span key={`${info.row.id}-${finding.substance}`} className="rounded-full bg-slate-800 px-2 py-1">
                  {finding.substance}: {finding.ppm != null ? finding.ppm.toLocaleString() : "n/a"} ppm
                </span>
              ))}
              {findings.length > 2 ? (
                <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-400">+{findings.length - 2} more</span>
              ) : null}
            </div>
          );
        }
      },
      {
        header: "Status",
        accessorKey: "status",
        size: 140,
        sortingFn: (rowA, rowB) => {
          const statusOrder: Record<BomStatus, number> = {
            EXPIRED: 0,
            OVER_LIMIT: 1,
            MISSING: 2,
            COMPLIANT: 3
          };
          const statusA = rowA.getValue<BomStatus>("status");
          const statusB = rowB.getValue<BomStatus>("status");
          return statusOrder[statusA] - statusOrder[statusB];
        },
        cell: (info) => (
          <span className={statusClass(info.getValue<BomStatus>())}>{info.getValue<string>()}</span>
        )
      },
      {
        header: "Valid until",
        accessorKey: "validUntil",
        size: 120,
        cell: (info) => (
          <span className="text-slate-200">
            {info.getValue<string | undefined>()
              ? new Date(info.getValue<string>()).toLocaleDateString()
              : "—"}
          </span>
        )
      },
      {
        header: "Actions",
        accessorKey: "actions",
        size: 320,
        enableSorting: false,
        cell: (info) => {
          const row = info.row.original;
          const rowKey = buildRowKey(row);
          const supplier = row.supplierId ? supplierMap.get(row.supplierId) : undefined;
          const rowState = rowStates[rowKey] ?? EMPTY_ROW_STATE;
          const canDraft = row.status === "EXPIRED" && Boolean(supplier);
          const helper =
            rowState.draftStatus === "error"
              ? rowState.draftError ?? "Draft failed"
              : canDraft
              ? rowState.draft
                ? `Draft ready · Locale ${rowState.draft.language.toUpperCase()}`
                : `Locale ${normalizeLocale(supplier?.language ?? "en").toUpperCase()}`
              : "Assign supplier to trigger outreach";
          return (
            <div className="space-y-1 text-xs">
              <button
                type="button"
                disabled={!canDraft || rowState.draftStatus === "loading"}
                onClick={() => void handleDraft(row)}
                className="w-full rounded-full border border-brand-400 px-3 py-1 text-[11px] font-semibold text-brand-200 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {rowState.draftStatus === "loading" ? "Drafting…" : "Draft with CORA"}
              </button>
              <p className={`text-[10px] ${rowState.draftStatus === "error" ? "text-rose-300" : "text-slate-500"}`}>
                {helper}
              </p>
              {rowState.draft ? (
                <div className="space-y-1">
                  <p className="truncate text-[10px] text-slate-400">
                    Draft ready · {rowState.draft.dueDate ? `Due ${formatDueDate(rowState.draft.dueDate)}` : "No due"}
                  </p>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setPreview({
                          rowKey,
                          partNumber: row.partNumber,
                          supplierName: row.supplierName ?? null,
                          draft: rowState.draft!
                        })
                      }
                      className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-800/60"
                    >
                      Preview draft
                    </button>
                    <button
                      type="button"
                      disabled={rowState.sendStatus === "loading"}
                      onClick={() => void handleSend(row)}
                      className="rounded-full border border-emerald-400 px-3 py-1 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
                    >
                      {rowState.sendStatus === "loading" ? "Sending…" : "Send workflow"}
                    </button>
                    {rowState.sendStatus === "error" ? (
                      <p className="text-[10px] text-rose-300">{rowState.sendMessage}</p>
                    ) : rowState.sendStatus === "success" ? (
                      <p className="text-[10px] text-emerald-300">{rowState.sendMessage}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );

          async function handleDraft(rowData: DashboardBomRow) {
            if (!rowData.supplierId) {
              setRowStates((prev) => ({
                ...prev,
                [rowKey]: { ...EMPTY_ROW_STATE, draftStatus: "error", draftError: "Supplier missing" }
              }));
              return;
            }
            const supplierRecord = supplierMap.get(rowData.supplierId);
            const locale = normalizeLocale(supplierRecord?.language ?? "en");
            setRowStates((prev) => {
              const current = prev[rowKey] ?? EMPTY_ROW_STATE;
              return {
                ...prev,
                [rowKey]: {
                  ...current,
                  draftStatus: "loading",
                  draftError: null,
                  sendStatus: "idle",
                  sendMessage: null
                }
              };
            });
            try {
              const draftResponse = await fetch("/api/ai/supplier-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  supplierId: rowData.supplierId,
                  bomId,
                  language: locale,
                  tone: "formal"
                })
              });
              const draftPayload = await safeJson(draftResponse);
              if (!draftResponse.ok) {
                const message =
                  draftPayload &&
                  typeof draftPayload === "object" &&
                  "error" in draftPayload &&
                  typeof (draftPayload as { error?: unknown }).error === "string"
                    ? (draftPayload as { error: string }).error
                    : `Draft failed (${draftResponse.status})`;
                throw new Error(message);
              }
              const draft = draftPayload as DraftPayload;
              setRowStates((prev) => {
                const current = prev[rowKey] ?? EMPTY_ROW_STATE;
                return {
                  ...prev,
                  [rowKey]: {
                    ...current,
                    draftStatus: "success",
                    draft,
                    draftError: null,
                    sendStatus: "idle",
                    sendMessage: null
                  }
                };
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Failed to send";
              setRowStates((prev) => {
                const current = prev[rowKey] ?? EMPTY_ROW_STATE;
                return {
                  ...prev,
                  [rowKey]: {
                    ...current,
                    draftStatus: "error",
                    draftError: message
                  }
                };
              });
            }
          }

          async function handleSend(rowData: DashboardBomRow) {
            const current = rowStates[rowKey] ?? EMPTY_ROW_STATE;
            if (!rowData.supplierId || !current.draft) {
              setRowStates((prev) => ({
                ...prev,
                [rowKey]: {
                  ...(prev[rowKey] ?? EMPTY_ROW_STATE),
                  sendStatus: "error",
                  sendMessage: "Draft email before sending."
                }
              }));
              return;
            }
            const locale = normalizeLocale(current.draft.language ?? supplier?.language ?? "en");
            setRowStates((prev) => {
              const snapshot = prev[rowKey] ?? EMPTY_ROW_STATE;
              return {
                ...prev,
                [rowKey]: {
                  ...snapshot,
                  sendStatus: "loading",
                  sendMessage: null
                }
              };
            });
            try {
              const requestResponse = await fetch("/api/supplier/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  supplierId: rowData.supplierId,
                  bomId,
                  tone: "formal",
                  languageOverride: locale,
                  dueAt: current.draft.dueDate
                })
              });
              const requestPayload = await safeJson(requestResponse);
              if (!requestResponse.ok) {
                const message =
                  requestPayload &&
                  typeof requestPayload === "object" &&
                  "error" in requestPayload &&
                  typeof (requestPayload as { error?: unknown }).error === "string"
                    ? (requestPayload as { error: string }).error
                    : `Workflow failed (${requestResponse.status})`;
                throw new Error(message);
              }
              const result = requestPayload as { requestId: string; status: string };
              setRowStates((prev) => {
                const snapshot = prev[rowKey] ?? EMPTY_ROW_STATE;
                return {
                  ...prev,
                  [rowKey]: {
                    ...snapshot,
                    sendStatus: "success",
                    sendMessage: `Request ${result.requestId.slice(0, 8)}… ${result.status}`
                  }
                };
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Failed to schedule workflow";
              setRowStates((prev) => {
                const snapshot = prev[rowKey] ?? EMPTY_ROW_STATE;
                return {
                  ...prev,
                  [rowKey]: {
                    ...snapshot,
                    sendStatus: "error",
                    sendMessage: message
                  }
                };
              });
            }
          }
        }
      }
    ];
  }, [supplierMap, rowStates, bomId]);

  const filteredData = useMemo(() => {
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        row.partNumber.toLowerCase().includes(term) ||
        (row.supplierName ?? "").toLowerCase().includes(term) ||
        (row.assemblyName ?? row.assemblyId).toLowerCase().includes(term) ||
        row.findings.some((finding) => finding.substance.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [rows, statusFilter, search]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rowVirtualizer = useVirtualizer({
    getScrollElement: () => parentRef.current,
    count: table.getRowModel().rows.length,
    estimateSize: () => 144,
    overscan: 12
  });

  return (
    <SectionCard
      title="BOM & Compliance Explorer"
      description="Virtualized grid (Architecture §6) with tenant context on every row."
      actions={
        <div className="flex gap-2">
          <select
            className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.currentTarget.value as BomStatus | "ALL")}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1 text-xs focus:border-brand-400 focus:outline-none"
            placeholder="Search part/supplier/substance"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
      }
    >
      <div ref={parentRef} className="h-96 overflow-auto rounded-2xl border border-slate-800 bg-slate-950">
        {filteredData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No BOM entries match the current filters.
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="sticky top-0 bg-slate-950 border-b border-slate-800 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <div key={headerGroup.id} className="flex text-xs uppercase tracking-wide text-slate-400">
                  {headerGroup.headers.map((header) => (
                    <div
                      key={header.id}
                      className="px-4 py-3 font-medium"
                      style={{ width: `${header.column.getSize()}px`, flexShrink: 0 }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {/* Body */}
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = table.getRowModel().rows[virtualRow.index];
                if (!row) return null;
                return (
                  <div
                    key={row.id}
                    className="absolute left-0 top-0 w-full border-b border-slate-800/80 flex items-center text-sm"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className="px-4 py-3"
                        style={{ width: `${cell.column.getSize()}px`, flexShrink: 0 }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {preview ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">
                {preview.partNumber} · {preview.supplierName ?? "Unassigned"}
              </p>
              <p className="text-xs text-slate-400">Locale {preview.draft.language.toUpperCase()}</p>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800/60"
            >
              Close
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold text-brand-300">{preview.draft.subject}</p>
            <pre className="max-h-60 overflow-auto rounded-xl bg-slate-950/50 p-3 text-xs text-slate-200">
              {preview.draft.body}
            </pre>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

function buildRowKey(row: DashboardBomRow): string {
  return `${row.partNumber}:${row.assemblyId}`;
}

function normalizeLocale(value: string): "en" | "de" | "zh" {
  if (value === "de" || value === "zh") {
    return value;
  }
  return "en";
}

function formatDueDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
