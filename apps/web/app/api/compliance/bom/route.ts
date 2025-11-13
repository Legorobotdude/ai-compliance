import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type BomUploadResponse = {
  bomId: string;
  assemblies: number;
  components: number;
  issues: Array<{ code: string; message: string; partNumber?: string }>;
};

type IncomingBomPayload = {
  productId?: string;
  uploadedBy?: string;
  assemblies?: unknown;
  document?: unknown;
  sourceDocumentId?: string | null;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingBomPayload | null;
  if (!payload || typeof payload.productId !== "string" || typeof payload.uploadedBy !== "string") {
    return NextResponse.json({ error: "productId and uploadedBy are required" }, { status: 400 });
  }
  if (!Array.isArray(payload.assemblies) && !payload.document) {
    return NextResponse.json(
      { error: "Provide assemblies or a document payload for ingestion" },
      { status: 400 }
    );
  }

  const requestBody = {
    productId: payload.productId,
    uploadedBy: payload.uploadedBy,
    sourceDocumentId: normalizeString(payload.sourceDocumentId),
    assemblies: payload.assemblies,
    document: payload.document
  };

  const result = await certivoApiFetch<BomUploadResponse>("/bom/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  return NextResponse.json(result);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
