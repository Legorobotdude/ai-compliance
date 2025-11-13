import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;

  try {
    const result = await certivoApiFetch(`/documents/${documentId}`);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch document' },
      { status: 500 }
    );
  }
}
