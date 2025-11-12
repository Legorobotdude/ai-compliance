"use client";

import type { SlaLeaderboardEntry } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type SlaMonitorProps = {
  entries: SlaLeaderboardEntry[];
};

export function SlaMonitor({ entries }: SlaMonitorProps) {
  return (
    <SectionCard
      title="Supplier SLA Monitor"
      description="Leaderboard of slow responders (Architecture §6) highlighting escalations."
    >
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Avg days</th>
              <th className="px-4 py-3">SLA target</th>
              <th className="px-4 py-3">Open workflows</th>
              <th className="px-4 py-3">Escalations</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((record) => {
              const avgDaysValue = Number(record.avgDays);
              const avgDaysDisplay = Number.isFinite(avgDaysValue) ? avgDaysValue.toFixed(1) : "—";
              return (
                <tr key={record.supplierId} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-medium text-white">{record.supplierName}</td>
                  <td className="px-4 py-3">{avgDaysDisplay}</td>
                  <td className="px-4 py-3">{record.slaTargetDays} days</td>
                  <td className="px-4 py-3">{record.openWorkflows}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        record.escalations > 0 ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"
                      }`}
                    >
                      {record.escalations}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!entries.length ? (
          <p className="px-4 py-3 text-sm text-slate-500">No open workflows to track.</p>
        ) : null}
      </div>
    </SectionCard>
  );
}
