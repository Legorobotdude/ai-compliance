import Link from "next/link";

import { SupplierScorecards } from "@/components/dashboard/supplier-scorecards";
import { SupplierRequestConsole } from "@/components/supplier/supplier-request-console";
import { SupplierScorecardProbe } from "@/components/supplier/supplier-scorecard-probe";
import { SupplierWorkflowChecklist } from "@/components/supplier/supplier-workflow-checklist";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function SupplierShowcasePage() {
  const snapshot = await fetchDashboardSnapshot();
  const bomMeta = {
    id: snapshot.bom.id,
    externalId: snapshot.bom.externalId,
    productName: snapshot.bom.productName
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-900/20 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Supplier Management</p>
          <h1 className="mt-2 text-3xl font-semibold">Supplier Operations</h1>
          <p className="mt-2 text-slate-300">
            Monitor supplier performance, send compliance requests via <code className="font-mono text-xs">/supplier/request</code> endpoint, and track request status.
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

      <SupplierScorecards suppliers={snapshot.suppliers} bomId={snapshot.bom.id} />

      <div className="grid gap-8 lg:grid-cols-[3fr,2fr]">
        <SupplierScorecardProbe suppliers={snapshot.suppliers} />
        <SupplierWorkflowChecklist bomExternalId={bomMeta.externalId} />
      </div>

      <SupplierRequestConsole suppliers={snapshot.suppliers} bom={bomMeta} />
    </main>
  );
}
