import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type SupplierRecord = {
  id: string;
  tenantId: string;
  name: string;
  country: string;
  language: string;
  complianceRate: number;
  responseAvgDays: number;
  createdAt: string;
  updatedAt: string | null;
};

function buildQueryString(params: URLSearchParams): string {
  const entries = Array.from(params.entries()).filter(([, value]) => Boolean(value));
  if (!entries.length) {
    return '';
  }
  return `?${new URLSearchParams(entries).toString()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryParams = new URLSearchParams();
  const limit = url.searchParams.get('limit');
  const search = url.searchParams.get('search');
  if (limit) {
    queryParams.set('limit', limit);
  }
  if (search) {
    queryParams.set('search', search);
  }
  try {
    const path = `/suppliers${buildQueryString(queryParams)}`;
    const suppliers = await certivoApiFetch<{ suppliers: SupplierRecord[] }>(path);
    return NextResponse.json(suppliers);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch suppliers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<SupplierRecord>;
    if (!payload?.name || !payload.country || !payload.language) {
      return NextResponse.json({ error: 'name, country, and language are required' }, { status: 400 });
    }
    const body = {
      name: payload.name,
      country: payload.country,
      language: payload.language,
      complianceRate: payload.complianceRate ?? 0.9,
      responseAvgDays: payload.responseAvgDays ?? 5
    };
    const supplier = await certivoApiFetch<SupplierRecord>('/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create supplier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
