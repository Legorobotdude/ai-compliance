import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type BomUploadResponse = {
  bomId: string;
  assemblies: number;
  components: number;
  issues: Array<{ code: string; message: string; partNumber?: string }>;
};

type ProductCreateResponse = {
  productId: string;
  code: string;
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
  if (
    !payload ||
    typeof payload.productId !== "string" ||
    typeof payload.uploadedBy !== "string" ||
    !payload.productId.trim()
  ) {
    return NextResponse.json({ error: "productId and uploadedBy are required" }, { status: 400 });
  }
  if (!Array.isArray(payload.assemblies) && !payload.document) {
    return NextResponse.json(
      { error: "Provide assemblies or a document payload for ingestion" },
      { status: 400 }
    );
  }

  const productId = await ensureProductId(payload.productId, payload.uploadedBy);

  const requestBody = {
    productId,
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

async function ensureProductId(identifier: string, createdBy: string): Promise<string> {
  const trimmed = identifier.trim();
  if (isUuid(trimmed)) {
    return trimmed;
  }
  const product = await certivoApiFetch<ProductCreateResponse>("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productName: trimmed,
      createdBy
    })
  });
  return product.productId;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
