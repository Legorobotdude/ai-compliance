"use client";

import { SectionCard } from "@/components/ui/section-card";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type RiskDataFreshness = DashboardSnapshot["riskDataFreshness"];

export function RiskDataFreshnessPanel({ freshness }: { freshness: RiskDataFreshness }) {
  const entries: Array<{ label: string; value?: string | null }> = [
    { label: "BOM components", value: freshness.bomComponentsUpdatedAt },
    { label: "Certificates", value: freshness.certificatesUpdatedAt },
    { label: "Suppliers", value: freshness.supplierUpdatedAt },
    { label: "Impact scenarios", value: freshness.scenarioUpdatedAt },
    { label: "Data cursor", value: freshness.latestCursor }
  ];

  return (
    <SectionCard
      title="Risk Data Freshness"
      description="Timestamp audit per Architecture §5 so you know when each upstream feed last changed."
    >
      <dl className="space-y-2 text-sm">
        {entries.map((entry) => (
          <div
            key={entry.label}
            className="flex items-center justify-between rounded-xl border border-slate-900/70 bg-slate-900/50 px-3 py-2 text-slate-300"
          >
            <dt className="text-xs uppercase tracking-wide text-slate-500">{entry.label}</dt>
            <dd className="font-mono text-xs text-white">{formatTimestamp(entry.value) ?? "n/a"}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

function formatTimestamp(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

