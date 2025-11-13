import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';
import type { DashboardSnapshot } from '@/lib/types/dashboard';

export async function GET() {
  try {
    const snapshot = await certivoApiFetch<DashboardSnapshot>('/dashboard/snapshot');
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard snapshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
