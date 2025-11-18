import Link from "next/link";
import { Suspense } from "react";

import { BomExplorer } from "@/components/dashboard/bom-explorer";
import { SupplierScorecards } from "@/components/dashboard/supplier-scorecards";
import { ImpactSimulator } from "@/components/dashboard/impact-simulator";
import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { IngestionOpsCenter } from "@/components/dashboard/ingestion-ops-center";
import { SlaMonitor } from "@/components/dashboard/sla-monitor";
import { RiskVisualization } from "@/components/dashboard/risk-visualization";
import { RoleGate } from "@/components/rbac/role-gate";
import { RoleSwitcher } from "@/components/rbac/role-switcher";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";
import { DataEmptyState } from "@/components/dashboard/data-empty-state";
import {
  CoraRiskSummaryFallback,
  CoraRiskSummarySection
} from "@/components/dashboard/cora-risk-summary-section";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let snapshot;
  let dashboardError: string | null = null;

  try {
    snapshot = await fetchDashboardSnapshot();
  } catch (err) {
    dashboardError = err instanceof Error ? err.message : "Failed to load dashboard data";
  }

  // Show error state if we could not fetch the snapshot at all
  if (!snapshot || dashboardError) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card">
          <div>
            <p className="text-sm uppercase tracking-widest text-brand-300">Compliance Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">Certivo Compliance Command Center</h1>
            <p className="mt-2 text-slate-300">
              BOM tracking, supplier scorecards, risk heatmaps, and AI compliance monitoring.
            </p>
          </div>
        </header>
        <DataEmptyState
          title="No data available"
          description="Architecture.md §6 requires at least one BOM ingestion before the dashboard can render."
          message={dashboardError || "API request failed before we could load your tenant snapshot."}
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
          <div className="space-y-1 text-xs">
            <p>Use `pnpm db:seed` for sample data or upload a BOM via the Compliance workspace.</p>
            <p>Validate JWT/env vars per README before retrying.</p>
          </div>
        </DataEmptyState>
      </main>
    );
  }

  const hasBomData = snapshot.bom.items.length > 0;

  if (!hasBomData) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card">
          <div>
            <p className="text-sm uppercase tracking-widest text-brand-300">Compliance Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">Certivo Compliance Command Center</h1>
            <p className="mt-2 text-slate-300">
              Connect a BOM to unlock supplier scorecards, risk heatmaps, and CORA monitoring for your tenant.
            </p>
          </div>
        </header>
        <DataEmptyState
          title="Load your first BOM"
          description="Ingest a BOM or run the seed scripts so every widget can hydrate with real data."
          message="No BOM rows found for this tenant."
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
            <li>Run <code className="rounded bg-slate-900 px-1">pnpm db:seed</code> to hydrate the sample tenant.</li>
            <li>Alternatively upload a BOM via Compliance &gt; Upload BOM and re-run this page.</li>
            <li>Once at least one BOM is ingested, all dashboard modules render automatically.</li>
          </ul>
        </DataEmptyState>
      </main>
    );
  }

  const supplierOptions = snapshot.suppliers.map((supplier) => ({
    id: supplier.supplierId,
    name: supplier.name
  }));
  const assemblyOptions = Array.from(
    new Map(
      snapshot.bom.items.map((item) => [
        item.assemblyId,
        { id: item.assemblyId, name: item.assemblyName ?? item.assemblyId }
      ])
    ).values()
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Compliance Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold">Certivo Compliance Command Center</h1>
          <p className="mt-2 text-slate-300">
            Tracking BOM {snapshot.bom.externalId} ({snapshot.bom.productName}) with supplier scorecards, risk
            heatmaps, and AI compliance monitoring.
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
            Supplier
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
            href="/ops-center"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Ops Center
          </Link>
          <RoleSwitcher />
        </div>
      </header>

      <BomExplorer rows={snapshot.bom.items} suppliers={snapshot.suppliers} bomId={snapshot.bom.id} />
      <SupplierScorecards suppliers={snapshot.suppliers} bomId={snapshot.bom.id} />
      <Suspense fallback={<CoraRiskSummaryFallback />}>
        <CoraRiskSummarySection bomId={snapshot.bom.id} productId={snapshot.bom.productId} />
      </Suspense>
      <RiskVisualization risk={snapshot.risk} />
      <ImpactSimulator
        bomId={snapshot.bom.id}
        regulationCode="PFAS"
        initialScenario={snapshot.impact}
        history={snapshot.impactHistory}
        freshness={snapshot.riskDataFreshness}
        options={snapshot.impactOptions}
        supplierOptions={supplierOptions}
        assemblyOptions={assemblyOptions}
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
