import { NextResponse } from "next/server";

import type { ScorecardResponse } from "@certivo/supplier";

import { certivoApiFetch } from "@/lib/api/client";

type RouteContext = {
  params: {
    supplierId?: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const supplierId = context.params?.supplierId?.trim();
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  }
  try {
    const result = await certivoApiFetch<ScorecardResponse>(`/supplier/scorecard/${encodeURIComponent(supplierId)}`);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier scorecard";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

