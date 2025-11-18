import Link from "next/link";

import { BomExplorer } from "@/components/dashboard/bom-explorer";
import { SupplierScorecards } from "@/components/dashboard/supplier-scorecards";
import { SlaMonitor } from "@/components/dashboard/sla-monitor";
import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { RunningJobsPanel } from "@/components/ops-center/running-jobs-panel";
import { RoleGate } from "@/components/rbac/role-gate";
import { SupplierRequestConsole } from "@/components/supplier/supplier-request-console";
import { SupplierScorecardProbe } from "@/components/supplier/supplier-scorecard-probe";
import { SupplierOpsSummary } from "@/components/supplier/supplier-ops-summary";
import { SupplierRiskInsights } from "@/components/supplier/supplier-risk-insights";
import { DataEmptyState } from "@/components/dashboard/data-empty-state";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function SupplierShowcasePage() {
  const snapshot = await fetchDashboardSnapshot();
  const hasBomData = snapshot.bom.items.length > 0;

  if (!hasBomData) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-900/20 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-brand-300">Supplier Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Supplier Operations</h1>
            <p className="mt-2 text-slate-300">
              Upload a BOM before orchestrating Temporal workflows or CORA outreach for suppliers.
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
              href="/documents"
              className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
            >
              Documents
            </Link>
          </div>
        </header>

        <DataEmptyState
          title="Suppliers need BOM context"
          description="Architecture.md §6 ties supplier scorecards to BOM coverage, so ingest at least one BOM first."
          message="No BOM components were found."
          actions={
            <>
              <Link
                href="/compliance"
                className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600"
              >
                Upload BOM
              </Link>
              <Link
                href="/documents"
                className="rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-800"
              >
                Manage Documents
              </Link>
            </>
          }
        >
          <ul className="list-disc space-y-2 pl-5 text-xs">
            <li>Run <code className="rounded bg-slate-900 px-1">pnpm db:seed</code> for a fully-populated sample tenant.</li>
            <li>After uploading a BOM, supplier workflows, scorecards, and SLA monitors will hydrate automatically.</li>
          </ul>
        </DataEmptyState>
      </main>
    );
  }
  const bomMeta = {
    id: snapshot.bom.id,
    externalId: snapshot.bom.externalId,
    productName: snapshot.bom.productName
  };
  const supplierWorkflowJobs = snapshot.workflowJobs.filter((job) => job.workflow === "SUPPLIER_REQUEST");
  const supplierAuditEntries = snapshot.auditLogs.filter((entry) =>
    entry.category === "SUPPLIER" || entry.category === "WORKFLOW"
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-900/20 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Supplier Management</p>
          <h1 className="mt-2 text-3xl font-semibold">Supplier Operations</h1>
          <p className="mt-2 text-slate-300">
            Supplier module: monitor scorecards, orchestrate Temporal workflows, and trace
            CORA-assisted outreach alongside BOM {snapshot.bom.externalId} ({snapshot.bom.productName}).
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
            href="/ops-center"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Ops center
          </Link>
          <Link
            href="/documents"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Documents
          </Link>
        </div>
      </header>

      <SupplierOpsSummary suppliers={snapshot.suppliers} workflowJobs={snapshot.workflowJobs} bom={snapshot.bom} risk={snapshot.risk} />

      <div>
        <SupplierScorecards suppliers={snapshot.suppliers} bomId={snapshot.bom.id} />
        <SupplierRiskInsights risk={snapshot.risk} suppliers={snapshot.suppliers} />
      </div>

      <BomExplorer rows={snapshot.bom.items} suppliers={snapshot.suppliers} bomId={snapshot.bom.id} />

      <div>
        <SupplierScorecardProbe suppliers={snapshot.suppliers} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[3fr,2fr]">
        <SupplierRequestConsole suppliers={snapshot.suppliers} bom={bomMeta} />
        <div className="space-y-8">
          <RunningJobsPanel
            jobs={supplierWorkflowJobs}
            title="Supplier workflow pulse"
            description="Live supplier reminders/escalations queued in the Temporal worker pool."
            emptyLabel="No supplier workflows running 🎯"
          />
          <RoleGate allow={["admin"]} fallback={<LockedCard label="SLA leaderboard (admin only)" />}>
            <SlaMonitor entries={snapshot.slaLeaderboard} />
          </RoleGate>
        </div>
      </div>

      <AuditLogFeed
        entries={supplierAuditEntries}
        title="Supplier activity feed"
        description="Supplier + workflow entries pulled from the shared audit fabric."
        initialFilter="SUPPLIER"
      />
    </main>
  );
}

function LockedCard({ label }: { label: string }) {
  return (
    <div className="card border-dashed border-slate-800 text-sm text-slate-400">
      <p>{label} hidden for this role. Switch to Admin to unlock.</p>
    </div>
  );
}
