export type CoraRiskSummaryGap = {
  supplierName: string;
  reason: "MISSING" | "EXPIRED" | "OVER_LIMIT";
  partNumbers: string[];
  etaDays: number;
};

export interface CoraRiskSummary {
  summary: string;
  execSummary: string;
  topGaps: CoraRiskSummaryGap[];
  stats: Record<string, number>;
}
