import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type SupplierAssignmentPayload = {
  supplierId: string;
  partNumbers: string[];
  sourcingType?: 'PRIMARY' | 'SECONDARY' | 'CONTRACT';
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SupplierAssignmentPayload | null;
    if (
      !payload ||
      typeof payload.supplierId !== 'string' ||
      !Array.isArray(payload.partNumbers) ||
      payload.partNumbers.length === 0
    ) {
      return NextResponse.json({ error: 'supplierId and partNumbers are required' }, { status: 400 });
    }
    const response = await certivoApiFetch<{
      supplierId: string;
      partNumbers: string[];
      created: number;
      updated: number;
      missingParts: string[];
    }>('/suppliers/assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to assign supplier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
