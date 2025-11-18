import { RiskSummaryView } from '@/components/cora/risk-summary-view';
import { SectionCard } from '@/components/ui/section-card';
import type { CoraRiskSummary } from '@/lib/types/cora';

export function RiskSummaryCard({ summary }: { summary: CoraRiskSummary }) {
  return (
    <SectionCard
      title="AI risk summary"
      description="CORA's /ai/risk-summary endpoint translates compliance stats into exec-ready insights (Architecture §4)."
    >
      <RiskSummaryView summary={summary} />
    </SectionCard>
  );
}
