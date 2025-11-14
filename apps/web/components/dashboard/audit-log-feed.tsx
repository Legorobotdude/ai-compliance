"use client";

import { useMemo, useState } from "react";

import type { AuditLogEntry } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

const categories = ["ALL", "COMPLIANCE", "SUPPLIER", "WORKFLOW", "LLM", "SYSTEM", "OTHER"] as const;
type CategoryFilter = (typeof categories)[number];

const metaFieldConfig: Array<{
  key: keyof NonNullable<AuditLogEntry["meta"]>;
  label: string;
  format?: (value: string | number) => string;
}> = [
  { key: "outcome", label: "Outcome" },
  { key: "status", label: "Status" },
  { key: "dueAt", label: "Due", format: (value) => new Date(value).toLocaleDateString() },
  { key: "latencyMs", label: "Latency", format: (value) => `${value} ms` },
  { key: "issuesSummary", label: "Issues" },
  { key: "promptHash", label: "Prompt" },
  { key: "blockedParts", label: "Blocked parts" },
  { key: "findings", label: "Findings" },
  { key: "validUntil", label: "Valid until" },
  { key: "docRef", label: "Doc ref" },
  { key: "schema", label: "Schema" },
  { key: "bomId", label: "BOM" },
  { key: "supplierId", label: "Supplier" }
];

const categoryStyles: Record<Exclude<CategoryFilter, "ALL">, string> = {
  COMPLIANCE: "bg-sky-500/20 text-sky-200",
  SUPPLIER: "bg-violet-500/20 text-violet-200",
  WORKFLOW: "bg-amber-500/20 text-amber-200",
  LLM: "bg-emerald-500/20 text-emerald-200",
  SYSTEM: "bg-indigo-500/20 text-indigo-200",
  OTHER: "bg-slate-600/20 text-slate-200"
};

type AuditLogFeedProps = {
  entries: AuditLogEntry[];
};

export function AuditLogFeed({ entries }: AuditLogFeedProps) {
  const [filter, setFilter] = useState<CategoryFilter>("ALL");
  const filteredEntries = useMemo(
    () => entries.filter((entry) => (filter === "ALL" ? true : entry.category === filter)),
    [filter, entries]
  );

  return (
    <SectionCard
      title="Audit Trail"
      description="Architecture §7 feed of compliance uploads, supplier workflows, and CORA traces."
      actions={
        <select
          className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value as CategoryFilter)}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      }
    >
      <div className="space-y-3">
        {filteredEntries.map((entry) => {
          const metaEntries = metaFieldConfig
            .map(({ key, label, format }) => {
              const raw = entry.meta?.[key];
              if (raw === undefined || raw === null || raw === "") {
                return null;
              }
              const formatted = format ? format(raw as string | number) : String(raw);
              return { label, value: formatted };
            })
            .filter(Boolean) as Array<{ label: string; value: string }>;

          return (
            <div key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between text-sm">
                <p className="font-semibold text-white">{entry.summary}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    categoryStyles[entry.category] ?? categoryStyles.OTHER
                  }`}
                >
                  {entry.category}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {entry.action} · target {entry.target}
              </p>
              {metaEntries.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {metaEntries.map((meta) => (
                    <span key={meta.label} className="rounded-full border border-slate-800 px-3 py-0.5 text-xs text-slate-300">
                      {meta.label}: {meta.value}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          );
        })}
        {!filteredEntries.length ? (
          <p className="text-sm text-slate-500">No audit entries match the selected filter.</p>
        ) : null}
      </div>
    </SectionCard>
  );
}
