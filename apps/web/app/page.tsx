import Link from "next/link";

import { BomExplorer } from "@/components/dashboard/bom-explorer";
import { SupplierScorecards } from "@/components/dashboard/supplier-scorecards";
import { RiskVisualization } from "@/components/dashboard/risk-visualization";
import { ImpactSimulator } from "@/components/dashboard/impact-simulator";
import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { IngestionOpsCenter } from "@/components/dashboard/ingestion-ops-center";
import { SlaMonitor } from "@/components/dashboard/sla-monitor";
import { RoleGate } from "@/components/rbac/role-gate";
import { RoleSwitcher } from "@/components/rbac/role-switcher";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await fetchDashboardSnapshot();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Architecture §6-aligned dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold">Certivo Compliance Command Center</h1>
          <p className="mt-2 text-slate-300">
            Tracking BOM {snapshot.bom.externalId} ({snapshot.bom.productName}) with supplier scorecards, risk
            heatmaps, and CORA observability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/documents"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Documents
          </Link>
          <Link
            href="/supplier"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Supplier lab
          </Link>
          <Link
            href="/compliance"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Compliance
          </Link>
          <Link
            href="/risk-impact"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Risk/Impact
          </Link>
          <Link
            href="/cora"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            CORA
          </Link>
          <Link
            href="/lab"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Testing Lab
          </Link>
          <RoleSwitcher />
        </div>
      </header>

      <BomExplorer rows={snapshot.bom.items} />
      <SupplierScorecards suppliers={snapshot.suppliers} />
      <RiskVisualization risk={snapshot.risk} />
      <ImpactSimulator
        bomId={snapshot.bom.id}
        regulationCode="PFAS"
        initialScenario={snapshot.impact}
        history={snapshot.impactHistory}
        freshness={snapshot.riskDataFreshness}
      />
      <AuditLogFeed entries={snapshot.auditLogs} />
      <RoleGate allow={["analyst", "admin"]} fallback={<LockedCard label="Ops Center" />}>
        <IngestionOpsCenter issues={snapshot.ingestionIssues} />
      </RoleGate>
      <RoleGate allow={["admin"]} fallback={<LockedCard label="SLA Monitor (admin only)" />}>
        <SlaMonitor entries={snapshot.slaLeaderboard} />
      </RoleGate>
    </main>
  );
}

function LockedCard({ label }: { label: string }) {
  return (
    <div className="card border-dashed border-slate-800 text-sm text-slate-400">
      <p>{label} hidden for this role. Switch to Analyst/Admin to unlock.</p>
    </div>
  );
}
