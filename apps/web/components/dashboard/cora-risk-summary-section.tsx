import { fetchCoraRiskSummary } from "@/lib/api/cora";
import { RiskSummaryCard } from "@/components/dashboard/risk-summary-card";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type CoraRiskSummarySectionProps = {
  bomId: string;
  productId?: string | null;
};

export async function CoraRiskSummarySection({ bomId, productId }: CoraRiskSummarySectionProps) {
  try {
    const summary = await fetchCoraRiskSummary({ bomId, productId: productId ?? undefined });
    if (summary) {
      return <RiskSummaryCard summary={summary} />;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load CORA risk summary";
    return (
      <SectionCard title="AI risk summary" description="CORA's /ai/risk-summary endpoint">
        <p className="text-sm text-slate-400">{message}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="AI risk summary" description="CORA's /ai/risk-summary endpoint">
      <p className="text-sm text-slate-400">Risk summary not available. Try again after refreshing.</p>
    </SectionCard>
  );
}

export function CoraRiskSummaryFallback() {
  return (
    <SectionCard title="AI risk summary" description="CORA's /ai/risk-summary endpoint">
      <LoadingSpinner label="Loading CORA risk summary..." />
      <p className="text-xs text-slate-500">Streaming CORA so the rest of the dashboard can render immediately.</p>
    </SectionCard>
  );
}
