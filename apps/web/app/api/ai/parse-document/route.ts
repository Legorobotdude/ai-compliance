import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type AiParseDocumentResponse = {
  docRef: string;
  parts: Array<{
    partNumber: string;
    findings: Array<{
      substanceName: string;
      concentrationValue: number;
      concentrationUnit: "%" | "ppm" | "mg/kg" | null;
      concentrationPpm: number | null;
      notes: string | null;
    }>;
  }>;
  ambiguities: string[];
  validationReport: string[];
};

type IncomingPayload = {
  documentId?: string;
  schema?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingPayload | null;
  if (!payload || typeof payload.documentId !== "string") {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const result = await certivoApiFetch<AiParseDocumentResponse>("/ai/parse-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: payload.documentId,
      schema: payload.schema ?? "certificate_v1"
    })
  });

  return NextResponse.json(result);
}
