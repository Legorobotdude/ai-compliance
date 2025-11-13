import Link from "next/link";

import { ImpactSimulator } from "@/components/dashboard/impact-simulator";
import { RiskVisualization } from "@/components/dashboard/risk-visualization";
import { ImpactScenarioWorkbench } from "@/components/risk-impact/impact-scenario-workbench";
import { RiskDataFreshnessPanel } from "@/components/risk-impact/risk-data-freshness-panel";
import { ScenarioHistoryPanel } from "@/components/risk-impact/scenario-history-panel";
import { SupplierExposureMatrix } from "@/components/risk-impact/supplier-exposure-matrix";
import { SectionCard } from "@/components/ui/section-card";
import { fetchDashboardSnapshot } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

export default async function RiskImpactShowcasePage() {
  const snapshot = await fetchDashboardSnapshot();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-900/20 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Architecture §§4–6, Risk/Impact focus</p>
          <h1 className="mt-2 text-3xl font-semibold">Risk & Impact Showcase</h1>
          <p className="mt-2 text-slate-300">
            Purpose-built playground for the RiskImpactService: tweak PFAS limits, inspect supplier rollups, and verify
            telemetry freshness without wading through unrelated dashboard widgets.
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
            Compliance/CORA lab
          </Link>
        </div>
      </header>

      <RiskVisualization risk={snapshot.risk} />

      <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
        <SupplierExposureMatrix exposure={snapshot.risk.supplierExposure} />
        <RiskDataFreshnessPanel freshness={snapshot.riskDataFreshness} />
      </div>

      <ImpactSimulator
        bomId={snapshot.bom.id}
        regulationCode="PFAS"
        initialScenario={snapshot.impact}
        history={snapshot.impactHistory}
        freshness={snapshot.riskDataFreshness}
      />

      <ImpactScenarioWorkbench
        bomId={snapshot.bom.id}
        regulationCode="PFAS"
        initialScenario={snapshot.impact}
        baselineLimits={snapshot.impact.baselineLimits}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <ScenarioHistoryPanel history={snapshot.impactHistory} />
        <TestingPlaybookCard />
      </div>
    </main>
  );
}

function TestingPlaybookCard() {
  return (
    <SectionCard
      title="How to exercise the module"
      description="Pair this UI with CLI + API calls to validate Architecture §5 end-to-end."
    >
      <ol className="list-decimal space-y-3 pl-4 text-sm text-slate-300">
        <li>
          Run <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">pnpm risk:test</code> to populate
          `impact_scenarios` and confirm multi-limit payloads stick.
        </li>
        <li>
          Use the Impact Scenario Workbench to send new vectors via `/api/impact` and confirm supplier/assembly rollups
          reflect the change.
        </li>
        <li>
          Toggle weightings in the backend (RiskImpactService `DEFAULT_SCORE_WEIGHTS`) then reload this page to see the
          Risk Visualization respond—captures the w1–w4 blending described in Architecture §5.
        </li>
        <li>
          Watch Risk Data Freshness to ensure ingestion jobs update `scenarioUpdatedAt` whenever you re-run the smoke
          script or upload a new certificate.
        </li>
      </ol>
    </SectionCard>
  );
}

