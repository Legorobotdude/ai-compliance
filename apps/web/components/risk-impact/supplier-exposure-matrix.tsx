"use client";

import clsx from "clsx";

import { SectionCard } from "@/components/ui/section-card";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type SupplierExposurePoint = DashboardSnapshot["risk"]["supplierExposure"][number];

export function SupplierExposureMatrix({
  exposure
}: {
  exposure: DashboardSnapshot["risk"]["supplierExposure"];
}) {
  const fallbackRow: SupplierExposurePoint = {
    supplierId: null,
    supplierName: "No supplier incidents",
    incidents: 0,
    exposure: 0
  };
  const rows: SupplierExposurePoint[] = exposure.length ? exposure : [fallbackRow];

  return (
    <SectionCard
      title="Supplier Exposure Matrix"
      description="Incidents × exposure bubble data pulled from RiskImpactService (Architecture §5)."
      className="space-y-4"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Incidents</th>
              <th className="px-4 py-2">Exposure idx</th>
              <th className="px-4 py-2">Compliance rate</th>
              <th className="px-4 py-2">Response (days)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.supplierId ?? row.supplierName} className="border-t border-slate-900/60 text-slate-300">
                <td className="px-4 py-3 font-medium text-white">{row.supplierName}</td>
                <td className="px-4 py-3">
                  <TrendBadge value={row.incidents} />
                </td>
                <td className="px-4 py-3">
                  <TrendBadge value={row.exposure} variant="exposure" />
                </td>
                <td className="px-4 py-3">{formatPercent(row.complianceRate)}</td>
                <td className="px-4 py-3">{row.responseAvgDays?.toFixed(1) ?? "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Sorted by exposure score. Reuse this matrix when tuning supplier alert thresholds or seeding Temporal workflows.
      </p>
    </SectionCard>
  );
}

function TrendBadge({ value, variant }: { value: number; variant?: "exposure" }) {
  const severity = value === 0 ? "low" : value < 3 ? "medium" : "high";
  const className = clsx(
    "inline-flex min-w-[4rem] items-center justify-center rounded-full px-2 py-1 text-xs font-semibold",
    severity === "low" && "bg-emerald-500/10 text-emerald-300",
    severity === "medium" && "bg-amber-500/10 text-amber-300",
    severity === "high" && "bg-rose-500/10 text-rose-300"
  );
  const label = variant === "exposure" ? "Exposure" : "Incidents";
  return (
    <span className={className}>
      {label}: {value}
    </span>
  );
}

function formatPercent(value?: number) {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

