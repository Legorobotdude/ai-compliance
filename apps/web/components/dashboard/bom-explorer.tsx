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

import { bomRows, type BomRow, type BomStatus } from "@/lib/data/mock-dashboard";
import { statusClass } from "@/lib/status";
import { SectionCard } from "@/components/ui/section-card";

const statusOptions: Array<{ label: string; value: BomStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Compliant", value: "COMPLIANT" },
  { label: "Missing", value: "MISSING" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Over limit", value: "OVER_LIMIT" }
];

const columns: ColumnDef<BomRow>[] = [
  {
    header: "Part",
    accessorKey: "partNumber",
    cell: (info) => (
      <div>
        <p className="font-medium text-white">{info.getValue<string>()}</p>
        <p className="text-xs text-slate-400">{info.row.original.assembly}</p>
      </div>
    )
  },
  {
    header: "Supplier",
    accessorKey: "supplier"
  },
  {
    header: "Substance",
    accessorKey: "substance"
  },
  {
    header: "Concentration (ppm)",
    accessorKey: "ppm",
    cell: (info) => <span>{info.getValue<number>().toLocaleString()}</span>
  },
  {
    header: "Status",
    accessorKey: "status",
    cell: (info) => <span className={statusClass(info.getValue<BomStatus>())}>{info.getValue<string>()}</span>
  },
  {
    header: "Valid until",
    accessorKey: "validUntil",
    cell: (info) => new Date(info.getValue<string>()).toLocaleDateString()
  }
];

export function BomExplorer() {
  const [statusFilter, setStatusFilter] = useState<BomStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "partNumber", desc: false }]);
  const parentRef = useRef<HTMLDivElement | null>(null);

  const filteredData = useMemo(() => {
    return bomRows.filter((row) => {
      const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        row.partNumber.toLowerCase().includes(term) ||
        row.supplier.toLowerCase().includes(term) ||
        row.substance.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [statusFilter, search]);

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
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-950/90 text-left text-xs uppercase tracking-wide text-slate-400 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
        </table>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = table.getRowModel().rows[virtualRow.index];
            if (!row) return null;
            return (
              <table
                key={row.id}
                className="absolute left-0 top-0 w-full border-b border-slate-800/80 text-sm text-slate-200"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <tbody>
                  <tr>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
