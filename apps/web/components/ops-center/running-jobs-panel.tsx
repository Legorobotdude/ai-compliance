"use client";

import type { WorkflowJob } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type RunningJobsPanelProps = {
  jobs: WorkflowJob[];
};

const workflowLabels: Record<WorkflowJob["workflow"], string> = {
  SUPPLIER_REQUEST: "Supplier workflow",
  INGESTION: "Ingestion retry"
};

const statusStyles: Record<WorkflowJob["status"], string> = {
  QUEUED: "bg-amber-500/20 text-amber-200",
  RUNNING: "bg-sky-500/20 text-sky-200",
  WAITING: "bg-indigo-500/20 text-indigo-200",
  ESCALATED: "bg-red-500/20 text-red-200",
  RETRYING: "bg-emerald-500/20 text-emerald-200"
};

export function RunningJobsPanel({ jobs }: RunningJobsPanelProps) {
  return (
    <SectionCard
      title="Active Workflows"
      description="Real-time monitoring of supplier request workflows and data ingestion retry jobs."
    >
      <div className="space-y-3">
        {jobs.map((job) => {
          const chips = renderMetaChips(job);
          return (
            <article
              key={`${job.workflow}:${job.id}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{job.target}</p>
                  <p className="text-xs text-slate-400">
                    {workflowLabels[job.workflow]} · step {job.step}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[job.status]}`}>
                  {job.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-200">Started {formatDate(job.startedAt)}</p>
              <p className="text-xs text-slate-500">Last event {formatDate(job.updatedAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span
                    key={`${chip.label}-${chip.value}`}
                    className="rounded-full border border-slate-800 px-3 py-0.5 text-xs text-slate-300"
                  >
                    {chip.label}: {chip.value}
                  </span>
                ))}
                {!chips.length ? (
                  <span className="rounded-full border border-slate-800 px-3 py-0.5 text-xs text-slate-500">
                    Awaiting signals
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
        {!jobs.length ? <p className="text-sm text-slate-500">No active workflows detected 🎯</p> : null}
      </div>
    </SectionCard>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function renderMetaChips(job: WorkflowJob): Array<{ label: string; value: string }> {
  const chips: Array<{ label: string; value: string }> = [];
  if (job.meta?.dueAt) {
    chips.push({ label: "Due", value: new Date(job.meta.dueAt).toLocaleDateString() });
  }
  if (job.meta?.requestStatus) {
    chips.push({ label: "Request", value: job.meta.requestStatus });
  }
  if (job.meta?.issueStatus) {
    chips.push({ label: "Issue", value: job.meta.issueStatus });
  }
  if (job.meta?.issuePartNumber) {
    chips.push({ label: "Part", value: job.meta.issuePartNumber });
  }
  return chips;
}
