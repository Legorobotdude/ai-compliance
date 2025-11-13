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

type MergedBomResponse = {
  bomId: string;
  items: MergedItem[];
};

export async function GET(
  request: Request,
  { params }: { params: { bomId: string } }
) {
  const bomId = params.bomId;

  if (!bomId || typeof bomId !== 'string') {
    return NextResponse.json({ error: 'bomId is required' }, { status: 400 });
  }

  try {
    const result = await certivoApiFetch<MergedBomResponse>(`/merged/${bomId}`);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch merged BOM';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
