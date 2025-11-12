"use client";

import type { OpsIssue } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

const severityColor: Record<OpsIssue["severity"], string> = {
  critical: "bg-red-500/20 text-red-200",
  warning: "bg-amber-500/20 text-amber-200",
  info: "bg-slate-500/20 text-slate-200"
};

type IngestionOpsCenterProps = {
  issues: OpsIssue[];
};

export function IngestionOpsCenter({ issues }: IngestionOpsCenterProps) {
  return (
    <SectionCard
      title="Ingestion Ops Center"
      description="Live issue stream (Architecture §6) with retry/trigger affordances."
    >
      <div className="space-y-3">
        {issues.map((issue) => (
          <div key={issue.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-white">{issue.code}</p>
                <p className="text-xs text-slate-400">
                  Assembly {issue.assemblyId ?? "—"} · {new Date(issue.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs ${severityColor[issue.severity]}`}>
                {issue.severity.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-200">{issue.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-xl border border-slate-700 px-3 py-1 text-xs text-slate-100 transition hover:border-brand-400">
                {getSuggestedAction(issue)}
              </button>
              <button className="rounded-xl border border-slate-700 px-3 py-1 text-xs text-slate-100/70 hover:border-slate-500">
                Open workflow
              </button>
            </div>
          </div>
        ))}
        {!issues.length ? <p className="text-sm text-slate-500">No ingestion issues open 🎉</p> : null}
      </div>
    </SectionCard>
  );
}

function getSuggestedAction(issue: OpsIssue): string {
  switch (issue.code) {
    case "VALUE_MISSING":
      return "Request supplier data";
    case "UNIT_MISSING":
      return "Normalize units";
    case "SUPPLIER_MISSING":
      return "Map supplier";
    default:
      return "Trigger retry";
  }
}
