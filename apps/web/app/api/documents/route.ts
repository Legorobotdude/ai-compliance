import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type DocumentListResponse = {
  documents: Array<{
    id: string;
    tenantId: string;
    filename: string;
    mime: string;
    bytes: number;
    storageUrl: string;
    sha256: string;
    uploadedAt: string;
    uploadStatus: string;
    scanStatus: string;
    createdAt: string;
  }>;
  total: number;
};

export async function GET() {
  try {
    const result = await certivoApiFetch<DocumentListResponse>('/documents');
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list documents' },
      { status: 500 }
    );
  }
}
