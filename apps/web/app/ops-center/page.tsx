import Link from "next/link";

import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { IngestionOpsCenter } from "@/components/dashboard/ingestion-ops-center";
import { SlaMonitor } from "@/components/dashboard/sla-monitor";
import { RunningJobsPanel } from "@/components/ops-center/running-jobs-panel";
import { RoleGate } from "@/components/rbac/role-gate";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function OpsCenterPage() {
  const snapshot = await fetchDashboardSnapshot();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900/70 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Operations Center</p>
          <h1 className="mt-2 text-3xl font-semibold">Operational Control Room</h1>
          <p className="mt-2 max-w-2xl text-slate-300">
            Monitor system operations including audit trails, data ingestion issues, supplier response times, and active workflow jobs
            across all compliance modules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            ← Back to dashboard
          </Link>
          <Link
            href="/supplier"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Supplier lab
          </Link>
        </div>
      </header>

      <RoleGate allow={["analyst", "admin"]} fallback={<LockedOpsCenter />}>
        <div className="flex flex-col gap-8">
          <RunningJobsPanel jobs={snapshot.workflowJobs} />
          <AuditLogFeed entries={snapshot.auditLogs} />
          <div className="grid gap-8 lg:grid-cols-2">
            <IngestionOpsCenter issues={snapshot.ingestionIssues} />
            <SlaMonitor entries={snapshot.slaLeaderboard} />
          </div>
        </div>
      </RoleGate>
    </main>
  );
}

function LockedOpsCenter() {
  return (
    <div className="card border-dashed border-slate-800 text-sm text-slate-400">
      <p>
        Ops Center is limited to Analyst/Admin roles. Switch roles via the top-right selector to access
        operational monitoring and alerts.
      </p>
    </div>
  );
}
