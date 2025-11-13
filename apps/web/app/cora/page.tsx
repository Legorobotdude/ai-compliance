import Link from "next/link";

import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { CoraPlayground } from "@/components/lab/cora-playground";
import { CoraCapabilityGrid } from "@/components/cora/cora-capability-grid";
import { CoraPromptRecipes } from "@/components/cora/cora-prompt-recipes";
import { GuardrailChecklist } from "@/components/cora/guardrail-checklist";
import { CoraTelemetryPanel } from "@/components/cora/cora-telemetry-panel";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function CoraShowcasePage() {
  const snapshot = await fetchDashboardSnapshot();
  const auditEntries = snapshot.auditLogs ?? [];
  const totalCalls = auditEntries.length;
  const successCount = auditEntries.filter((entry) => entry.outcome === "SUCCESS").length;
  const retryCount = auditEntries.filter((entry) => entry.outcome === "RETRY").length;
  const failureCount = auditEntries.filter((entry) => entry.outcome === "FAILED").length;
  const avgLatencyMs = totalCalls
    ? auditEntries.reduce((sum, entry) => sum + entry.latencyMs, 0) / totalCalls
    : 0;
  const lastCallAt = auditEntries
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt;

  const defaultSupplierId = snapshot.suppliers[0]?.supplierId;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Architecture §§4–7 showcase</p>
          <h1 className="mt-2 text-3xl font-semibold">CORA AI Operations Dashboard</h1>
          <p className="mt-2 text-slate-300">
            Exercise the document parser, supplier email copilot, and risk summary bot while reviewing guardrails,
            telemetry, and audit traces captured in Architecture.md.
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
            href="/lab"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Testing lab
          </Link>
        </div>
      </header>

      <CoraTelemetryPanel
        metrics={{
          totalCalls,
          successCount,
          retryCount,
          failureCount,
          avgLatencyMs,
          lastCallAt
        }}
      />

      <CoraCapabilityGrid />

      <CoraPlayground
        defaultBomId={snapshot.bom.id}
        defaultProductId={snapshot.bom.productId}
        defaultSupplierId={defaultSupplierId}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CoraPromptRecipes />
        <GuardrailChecklist />
      </div>

      <AuditLogFeed entries={auditEntries} />
    </main>
  );
}
