import { certivoApiFetch } from '@/lib/api/client';
import type { CoraRiskSummary } from '@/lib/types/cora';

type FetchRiskSummaryParams = {
  bomId?: string;
  productId?: string;
};

export async function fetchCoraRiskSummary({ bomId, productId }: FetchRiskSummaryParams): Promise<CoraRiskSummary> {
  if (!bomId && !productId) {
    throw new Error('Either bomId or productId is required to fetch a risk summary');
  }

  return certivoApiFetch<CoraRiskSummary>('/ai/risk-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bomId, productId })
  });
}
