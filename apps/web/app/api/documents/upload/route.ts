import { NextResponse } from 'next/server';
import { certivoApiFetch } from '@/lib/api/client';

type DocumentUploadPayload = {
  filename: string;
  mime: string;
  bytes: number;
  sha256: string;
  dataBase64?: string;
  storageUrl?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as DocumentUploadPayload;

  if (!payload.filename || !payload.mime || !payload.sha256) {
    return NextResponse.json(
      { error: 'filename, mime, and sha256 are required' },
      { status: 400 }
    );
  }

  if (!payload.dataBase64 && !payload.storageUrl) {
    return NextResponse.json(
      { error: 'Either dataBase64 or storageUrl is required' },
      { status: 400 }
    );
  }

  try {
    const result = await certivoApiFetch('/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
