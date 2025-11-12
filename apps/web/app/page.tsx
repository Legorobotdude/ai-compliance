import { BomExplorer } from "@/components/dashboard/bom-explorer";
import { SupplierScorecards } from "@/components/dashboard/supplier-scorecards";
import { RiskVisualization } from "@/components/dashboard/risk-visualization";
import { ImpactSimulator } from "@/components/dashboard/impact-simulator";
import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { IngestionOpsCenter } from "@/components/dashboard/ingestion-ops-center";
import { SlaMonitor } from "@/components/dashboard/sla-monitor";
import { RoleGate } from "@/components/rbac/role-gate";
import { RoleSwitcher } from "@/components/rbac/role-switcher";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Architecture §6-aligned dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold">Certivo Compliance Command Center</h1>
          <p className="mt-2 text-slate-300">
            Unified BOM explorer, supplier scorecards, risk heatmaps, and CORA observability in one Next.js frontend.
          </p>
        </div>
        <RoleSwitcher />
      </header>

      <BomExplorer />
      <SupplierScorecards />
      <RiskVisualization />
      <ImpactSimulator />
      <AuditLogFeed />
      <RoleGate allow={["analyst", "admin"]} fallback={<LockedCard label="Ops Center" />}>
        <IngestionOpsCenter />
      </RoleGate>
      <RoleGate allow={["admin"]} fallback={<LockedCard label="SLA Monitor (admin only)" />}>
        <SlaMonitor />
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
