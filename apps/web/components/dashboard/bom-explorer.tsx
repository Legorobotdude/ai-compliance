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

import type { DashboardBomRow } from "@/lib/types/dashboard";
import type { DashboardSnapshot } from "@/lib/types/dashboard";
import { statusClass } from "@/lib/status";
import { SectionCard } from "@/components/ui/section-card";

type BomStatus = DashboardSnapshot["bom"]["items"][number]["status"];

type BomExplorerProps = {
  rows: DashboardBomRow[];
};

const statusOptions: Array<{ label: string; value: BomStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Compliant", value: "COMPLIANT" },
  { label: "Missing", value: "MISSING" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Over limit", value: "OVER_LIMIT" }
];

const columns: ColumnDef<DashboardBomRow>[] = [
  {
    header: "Part",
    accessorKey: "partNumber",
    size: 180,
    cell: (info) => (
      <div>
        <p className="font-medium text-white">{info.getValue<string>()}</p>
        <p className="text-xs text-slate-400">
          {info.row.original.assemblyName ?? info.row.original.assemblyId}
        </p>
      </div>
    )
  },
  {
    header: "Supplier",
    accessorFn: (row) => row.supplierName ?? "Unassigned",
    size: 200,
    cell: (info) => <span>{info.getValue<string>()}</span>
  },
  {
    header: "Findings",
    accessorKey: "findings",
    size: 380,
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
    cell: (info) => (
      <div className="flex items-center">
        <span className={statusClass(info.getValue<BomStatus>())}>{info.getValue<string>()}</span>
      </div>
    )
  },
  {
    header: "Valid until",
    accessorKey: "validUntil",
    size: 120,
    cell: (info) =>
      info.getValue<string | undefined>()
        ? new Date(info.getValue<string>()).toLocaleDateString()
        : "—"
  }
];

export function BomExplorer({ rows }: BomExplorerProps) {
  const [statusFilter, setStatusFilter] = useState<BomStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "partNumber", desc: false }]);
  const parentRef = useRef<HTMLDivElement | null>(null);

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
    estimateSize: () => 64,
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
      <div ref={parentRef} className="h-96 overflow-auto rounded-2xl border border-slate-800">
        {filteredData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No BOM entries match the current filters.
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead className="sticky top-0 bg-slate-950/90 text-left text-xs uppercase tracking-wide text-slate-400 backdrop-blur z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 font-medium"
                      style={{ width: header.column.getSize() }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = table.getRowModel().rows[virtualRow.index];
                if (!row) return null;
                return (
                  <tr
                    key={row.id}
                    className="absolute left-0 top-0 w-full border-b border-slate-800/80 text-slate-200"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 align-middle"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SectionCard>
  );
}
