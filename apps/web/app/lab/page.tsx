import Link from "next/link";

import { CompliancePlayground } from "@/components/lab/compliance-playground";
import { CoraPlayground } from "@/components/lab/cora-playground";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";
import { getUserIdFromToken } from "@/lib/env";

export default async function LabPage() {
  const [snapshot, uploaderId] = await Promise.all([
    fetchDashboardSnapshot(),
    resolveUploaderId()
  ]);
  const defaultSupplierId = snapshot.suppliers[0]?.supplierId;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Architecture §§3–4 test bench</p>
          <h1 className="mt-2 text-3xl font-semibold">Compliance & CORA Testing Lab</h1>
          <p className="mt-2 text-slate-300">
            Fire ingestion payloads and AI prompts straight into the Express gateway so you can validate backend modules
            without leaving the browser.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
        >
          ← Back to dashboard
        </Link>
      </header>

      <CompliancePlayground
        defaultProductId={snapshot.bom.productId}
        defaultUploaderId={uploaderId ?? undefined}
      />
      <CoraPlayground
        defaultBomId={snapshot.bom.id}
        defaultProductId={snapshot.bom.productId}
        defaultSupplierId={defaultSupplierId}
      />
    </main>
  );
}

async function resolveUploaderId(): Promise<string | null> {
  try {
    return getUserIdFromToken() ?? null;
  } catch {
    return null;
  }
}
