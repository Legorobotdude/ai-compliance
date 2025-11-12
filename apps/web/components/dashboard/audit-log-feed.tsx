"use client";

import { useMemo, useState } from "react";

import { auditLogEntries } from "@/lib/data/mock-dashboard";
import { SectionCard } from "@/components/ui/section-card";

const outcomes = ["ALL", "SUCCESS", "RETRY", "FAILED"] as const;

export function AuditLogFeed() {
  const [filter, setFilter] = useState<(typeof outcomes)[number]>("ALL");
  const entries = useMemo(
    () => auditLogEntries.filter((entry) => (filter === "ALL" ? true : entry.outcome === filter)),
    [filter]
  );

  return (
    <SectionCard
      title="Audit & LLM Logs"
      description="Prompt hash, model, latency, and outcome as outlined in Architecture §6/§7."
      actions={
        <select
          className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value as (typeof outcomes)[number])}
        >
          {outcomes.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcome}
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-white">{entry.model}</p>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  entry.outcome === "SUCCESS"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : entry.outcome === "FAILED"
                      ? "bg-red-500/20 text-red-200"
                      : "bg-amber-500/20 text-amber-200"
                }`}
              >
                {entry.outcome}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Prompt {entry.promptHash} · {entry.latencyMs} ms · Tenant {entry.tenant}
            </p>
            <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
