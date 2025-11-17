import type { DashboardSnapshot, RiskSummary, SupplierSnapshot, WorkflowJob } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type SupplierOpsSummaryProps = {
  suppliers: SupplierSnapshot[];
  workflowJobs: WorkflowJob[];
  bom: DashboardSnapshot["bom"];
  risk: RiskSummary;
};

export function SupplierOpsSummary({ suppliers, workflowJobs, bom, risk }: SupplierOpsSummaryProps) {
  const supplierCount = suppliers.length;
  const openRequests = suppliers.reduce((total, supplier) => total + supplier.requestsOpen, 0);
  const averageCompliance = supplierCount
    ? Math.round((suppliers.reduce((acc, supplier) => acc + supplier.complianceRate, 0) / supplierCount) * 100)
    : 0;
  const averageResponseDays = supplierCount
    ? suppliers.reduce((acc, supplier) => acc + supplier.responseAvgDays, 0) / supplierCount
    : 0;
  const fastestResponseDays = supplierCount
    ? Math.min(...suppliers.map((supplier) => supplier.responseAvgDays))
    : null;
  const topPerformer = suppliers
    .slice()
    .sort((a, b) => b.complianceRate - a.complianceRate)[0];
  const supplierWorkflows = workflowJobs.filter((job) => job.workflow === "SUPPLIER_REQUEST");
  const statusCounts = bom.statusCounts;
  const expiredParts = statusCounts["EXPIRED"] ?? 0;
  const missingParts = statusCounts["MISSING"] ?? 0;
  const overLimitParts = statusCounts["OVER_LIMIT"] ?? 0;
  const atRiskParts = expiredParts + missingParts + overLimitParts;
  const nextExpiryDays = risk.gaps.reduce((soonest, gap) => {
    if (gap.nextExpiryDays == null) {
      return soonest;
    }
    return Math.min(soonest, gap.nextExpiryDays);
  }, Number.POSITIVE_INFINITY);
  const latestTrendEntry = risk.trend[risk.trend.length - 1];
  const latestTrend = latestTrendEntry ? latestTrendEntry.score : risk.riskScore.score;
  const previousTrendEntry = risk.trend[risk.trend.length - 2];
  const previousTrend = previousTrendEntry ? previousTrendEntry.score : latestTrend;
  const trendDelta = latestTrend - previousTrend;

  const stats = [
    {
      label: "Active suppliers",
      value: supplierCount.toLocaleString(),
      helper: topPerformer
        ? `${topPerformer.name} leads at ${Math.round(topPerformer.complianceRate * 100)}%`
        : "Seed suppliers to unlock scorecards"
    },
    {
      label: "Average compliance",
      value: `${averageCompliance}%`,
      helper: `${Math.round(((statusCounts["COMPLIANT"] ?? 0) / Math.max(bom.items.length, 1)) * 100)}% BOM coverage`
    },
    {
      label: "Average response",
      value: `${averageResponseDays.toFixed(1)} d`,
      helper: fastestResponseDays ? `Fastest ${fastestResponseDays.toFixed(1)} d` : "N/A"
    },
    {
      label: "Open supplier requests",
      value: openRequests.toLocaleString(),
      helper: `${supplierWorkflows.length} workflows running`
    },
    {
      label: "At-risk parts",
      value: atRiskParts.toLocaleString(),
      helper: `${expiredParts} expired · ${missingParts} missing · next expiry ${
        Number.isFinite(nextExpiryDays) ? `${Math.max(Math.round(nextExpiryDays), 0)} d` : "n/a"
      }`
    },
    {
      label: "Risk posture",
      value: `${latestTrend}/100`,
      helper: `${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(1)} vs prior check`
    }
  ];

  return (
    <SectionCard title="Supplier operations at a glance" description="Supplier + Risk analytics summarized">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-widest text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-400">{stat.helper}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
