import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type AiRiskSummaryResponse = {
  summary: string;
  execSummary: string;
  topGaps: Array<{
    supplierName: string;
    reason: "MISSING" | "EXPIRED" | "OVER_LIMIT";
    partNumbers: string[];
    etaDays: number;
  }>;
  stats: Record<string, number>;
};

type IncomingPayload = {
  bomId?: string;
  productId?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingPayload | null;
  if (!payload || (!payload.bomId && !payload.productId)) {
    return NextResponse.json(
      { error: "Provide bomId or productId to request a risk summary" },
      { status: 400 }
    );
  }

  const result = await certivoApiFetch<AiRiskSummaryResponse>("/ai/risk-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bomId: payload.bomId,
      productId: payload.productId
    })
  });

  return NextResponse.json(result);
}
