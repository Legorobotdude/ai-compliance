"use client";

import { SectionCard } from "@/components/ui/section-card";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type ImpactHistory = DashboardSnapshot["impactHistory"];

type ScenarioHistoryPanelProps = {
  history: ImpactHistory;
};

export function ScenarioHistoryPanel({ history }: ScenarioHistoryPanelProps) {
  return (
    <SectionCard
      title="Scenario History"
      description="Last impact vectors captured in `impact_scenarios` (Architecture §5). Useful for replaying PFAS + multi-limit experiments."
      actions={
        <code className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
          pnpm risk:test
        </code>
      }
    >
      <div className="space-y-3">
        {!history.length ? (
          <p className="text-sm text-slate-500">
            No simulations recorded yet. Move the slider or run `pnpm risk:test` to seed new rows.
          </p>
        ) : (
          history.map((record) => (
            <article
              key={record.id}
              className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 text-sm text-slate-300"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{record.regulationCode}</p>
                  <p className="text-xs text-slate-500">{formatTimestamp(record.createdAt)}</p>
                </div>
                <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">
                  {record.payload.summary?.affectedParts ?? record.payload.deltas.length} affected parts
                </span>
              </header>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <HistoryMetric
                  label="Vector entries"
                  value={record.payload.vector?.length ? record.payload.vector.length : 1}
                />
                <HistoryMetric
                  label="Expires"
                  value={record.payload.expiresAtIso ? formatTimestamp(record.payload.expiresAtIso) : "n/a"}
                />
                <HistoryMetric
                  label="Baseline rows"
                  value={record.payload.baseline?.rowCount?.toLocaleString() ?? "?"}
                />
              </dl>
              {record.payload.vector && record.payload.vector.length ? (
                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  {record.payload.vector.map((entry) => (
                    <li
                      key={`${record.id}-${entry.substance}`}
                      className="rounded-full border border-slate-800 bg-slate-900/50 px-2 py-1 uppercase tracking-wide text-[10px]"
                    >
                      {entry.substance}: {entry.limitPpm.toLocaleString()} ppm →
                      base {entry.baselineLimitPpm?.toLocaleString() ?? "?"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function formatTimestamp(iso?: string | null) {
  if (!iso) {
    return "n/a";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

