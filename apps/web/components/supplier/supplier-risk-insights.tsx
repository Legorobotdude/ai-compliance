import type { RiskSummary, SupplierSnapshot } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type SupplierRiskInsightsProps = {
  risk: RiskSummary;
  suppliers: SupplierSnapshot[];
};

export function SupplierRiskInsights({ risk, suppliers }: SupplierRiskInsightsProps) {
  const exposureLeaders = risk.supplierExposure
    .map((entry) => ({
      ...entry,
      riskIndex: entry.incidents * entry.exposure
    }))
    .sort((a, b) => b.riskIndex - a.riskIndex)
    .slice(0, 5);
  const gapWatchlist = risk.gaps
    .slice()
    .sort((a, b) => (b.missing + b.expired + b.overLimit) - (a.missing + a.expired + a.overLimit))
    .slice(0, 4);
  const topPerformers = suppliers
    .slice()
    .sort((a, b) => b.complianceRate - a.complianceRate)
    .slice(0, 3);
  const latestTrend = risk.trend[risk.trend.length - 1];
  const previousTrend = risk.trend[risk.trend.length - 2];
  const trendDelta = latestTrend && previousTrend ? latestTrend.score - previousTrend.score : 0;

  return (
    <SectionCard
      title="Supplier risk insights"
      description="Supplier module overlay for Risk/Impact analytics (Architecture §6)."
      className="space-y-6"
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Highest exposure suppliers</p>
            <p className="text-xs text-slate-400">Combines incidents × impacted parts to prioritize outreach.</p>
          </div>
          {latestTrend ? (
            <div className="text-right text-xs text-slate-400">
              <p>Composite risk {latestTrend.score}/100</p>
              <p className={trendDelta >= 0 ? "text-amber-300" : "text-emerald-300"}>
                {trendDelta >= 0 ? "+" : ""}
                {trendDelta.toFixed(1)} vs last refresh
              </p>
            </div>
          ) : null}
        </header>
        {exposureLeaders.length ? (
          <div className="mt-4 space-y-3">
            {exposureLeaders.map((entry) => {
              const riskLevel = entry.riskIndex > 100 ? "High" : entry.riskIndex > 50 ? "Medium" : "Low";
              const className =
                riskLevel === "High" ? "text-red-300" : riskLevel === "Medium" ? "text-amber-300" : "text-emerald-300";
              return (
                <div
                  key={entry.supplierId ?? entry.supplierName}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-white">{entry.supplierName}</p>
                    <p className="text-xs text-slate-400">
                      Parts exposure {entry.exposure} · incidents {entry.incidents}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${className}`}>{riskLevel}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No supplier exposure data available.</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm font-semibold text-white">Gap watchlist</p>
          <p className="text-xs text-slate-400">Suppliers with missing, expired, or over-limit attestations.</p>
          <div className="mt-4 space-y-3">
            {gapWatchlist.length ? (
              gapWatchlist.map((gap) => (
                <div key={gap.supplierId ?? gap.supplierName} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs">
                  <p className="text-sm font-semibold text-white">{gap.supplierName}</p>
                  <p className="text-slate-400">
                    Missing {gap.missing} · expired {gap.expired} · over limit {gap.overLimit}
                  </p>
                  <p className="text-slate-500">
                    Next expiry {gap.nextExpiryDays == null ? "tbd" : `${Math.max(Math.round(gap.nextExpiryDays), 0)} d`} · Avg resp {" "}
                    {gap.responseAvgDays == null ? "n/a" : `${gap.responseAvgDays.toFixed(1)} d`}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No gaps detected 🎉</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm font-semibold text-white">Top performers</p>
          <p className="text-xs text-slate-400">Use their playbooks when drafting outreach with CORA.</p>
          <div className="mt-4 space-y-3">
            {topPerformers.length ? (
              topPerformers.map((supplier) => (
                <div key={supplier.supplierId} className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-sm">
                  <div>
                    <p className="font-semibold text-white">{supplier.name}</p>
                    <p className="text-xs text-slate-400">{supplier.country} · {supplier.language.toUpperCase()}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p className="text-base font-semibold text-emerald-300">{Math.round(supplier.complianceRate * 100)}%</p>
                    <p>{supplier.responseAvgDays.toFixed(1)} d avg</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Seed supplier data to view leaders.</p>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
