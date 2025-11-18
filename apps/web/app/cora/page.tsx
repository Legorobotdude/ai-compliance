import Link from "next/link";

import { AuditLogFeed } from "@/components/dashboard/audit-log-feed";
import { CoraPlayground } from "@/components/cora/cora-playground";
import { CoraCapabilityGrid } from "@/components/cora/cora-capability-grid";
import { CoraPromptRecipes } from "@/components/cora/cora-prompt-recipes";
import { GuardrailChecklist } from "@/components/cora/guardrail-checklist";
import { CoraTelemetryPanel } from "@/components/cora/cora-telemetry-panel";
import { CoraChatPanel } from "@/components/cora/cora-chat-panel";
import { DataEmptyState } from "@/components/dashboard/data-empty-state";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function CoraShowcasePage() {
  const snapshot = await fetchDashboardSnapshot();
  const hasBomData = snapshot.bom.items.length > 0;
  const auditEntries = snapshot.auditLogs ?? [];
  const llmEntries = auditEntries.filter((entry) => entry.category === "LLM");
  const totalCalls = llmEntries.length;
  const successCount = llmEntries.filter((entry) => (entry.meta?.outcome ?? "SUCCESS") === "SUCCESS").length;
  const retryCount = llmEntries.filter((entry) => entry.meta?.outcome === "RETRY").length;
  const failureCount = llmEntries.filter((entry) => entry.meta?.outcome === "FAILED").length;
  const avgLatencyMs = totalCalls
    ? llmEntries.reduce(
        (sum, entry) => sum + (typeof entry.meta?.latencyMs === "number" ? entry.meta.latencyMs : 0),
        0
      ) / totalCalls
    : 0;
  const lastCallAt = llmEntries
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt;

  const defaultSupplierId = snapshot.suppliers[0]?.supplierId;

  if (!hasBomData) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-brand-300">AI Compliance Assistant</p>
            <h1 className="mt-2 text-3xl font-semibold">CORA AI Operations</h1>
            <p className="mt-2 text-slate-300">
              CORA endpoints need a BOM/product context before risk summaries or supplier drafts can execute.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
            >
              ← Back to dashboard
            </Link>
          </div>
        </header>
        <DataEmptyState
          title="Seed data to demo CORA"
          description="Upload a BOM or run the DB seed so the playground has IDs to call the API with."
          message="We couldn't find any BOM or supplier ids to prefill the CORA playground."
          actions={
            <Link
              href="/compliance"
              className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600"
            >
              Upload BOM
            </Link>
          }
        >
          <p className="text-xs">
            CORA references BOM, product, document, and supplier ids when calling `/ai/*` endpoints. Until data exists, use the
            `SAMPLE_*` ids inside <code className="rounded bg-slate-900 px-1">@/lib/testing/sample-payloads</code> or seed the DB.
          </p>
        </DataEmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">AI Compliance Assistant</p>
          <h1 className="mt-2 text-3xl font-semibold">CORA AI Operations</h1>
          <p className="mt-2 text-slate-300">
            AI-powered document parsing, supplier email generation, and risk summarization with built-in safety guardrails and telemetry monitoring.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            ← Back to dashboard
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

      <CoraChatPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <CoraPromptRecipes />
        <GuardrailChecklist />
      </div>

      <AuditLogFeed entries={auditEntries} />
    </main>
  );
}
