import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type UnassignedPart = {
  bomId: string;
  partNumber: string;
  assemblyId: string;
  assemblyName?: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bomId = url.searchParams.get('bomId');
  if (!bomId) {
    return NextResponse.json({ error: 'bomId is required' }, { status: 400 });
  }
  const query = new URLSearchParams({ bomId });
  const limit = url.searchParams.get('limit');
  if (limit) {
    query.set('limit', limit);
  }
  try {
    const response = await certivoApiFetch<{ parts: UnassignedPart[] }>(
      `/suppliers/unassigned-parts?${query.toString()}`
    );
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch unassigned parts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
