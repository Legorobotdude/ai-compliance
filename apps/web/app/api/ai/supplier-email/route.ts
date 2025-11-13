import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type AiSupplierEmailResponse = {
  supplierId: string;
  bomId: string;
  subject: string;
  body: string;
  dueDate: string;
  language: string;
};

type IncomingPayload = {
  supplierId?: string;
  bomId?: string;
  language?: string;
  tone?: "formal" | "neutral" | "friendly";
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingPayload | null;
  if (
    !payload ||
    typeof payload.supplierId !== "string" ||
    typeof payload.bomId !== "string"
  ) {
    return NextResponse.json({ error: "supplierId and bomId are required" }, { status: 400 });
  }

  const result = await certivoApiFetch<AiSupplierEmailResponse>("/ai/supplier-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplierId: payload.supplierId,
      bomId: payload.bomId,
      language: payload.language,
      tone: payload.tone
    })
  });

  return NextResponse.json(result);
}
