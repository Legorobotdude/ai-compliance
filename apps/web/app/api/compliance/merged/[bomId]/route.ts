import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type Finding = {
  substance: string;
  ppm: number;
  thresholdPpm?: number | null;
};

type MergedItem = {
  bomId: string;
  assemblyId: string;
  partNumber: string;
  supplierId?: string | null;
  status: 'COMPLIANT' | 'MISSING' | 'EXPIRED' | 'OVER_LIMIT';
  validUntil?: string | null;
  findings?: Finding[];
};

type ComplianceStatus = MergedItem['status'];

type MergedBomResponse = {
  bomId: string;
  items: MergedItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  summary: {
    total: number;
    counts: Record<ComplianceStatus, number>;
  };
};

export async function GET(
  request: Request,
  { params }: { params: { bomId: string } }
) {
  const bomId = params.bomId;

  if (!bomId || typeof bomId !== 'string') {
    return NextResponse.json({ error: 'bomId is required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const searchParams = new URLSearchParams();
  for (const key of ['limit', 'offset', 'status', 'query'] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      searchParams.set(key, value);
    }
  }
  const path = searchParams.toString() ? `/merged/${bomId}?${searchParams.toString()}` : `/merged/${bomId}`;

  try {
    const result = await certivoApiFetch<MergedBomResponse>(path);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch merged BOM';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
