import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type ImpactResponse = DashboardSnapshot["impact"];

export async function POST(request: Request) {
  const payload = await request.json();
  const { regulationCode, newLimitPpm, limitVector, bomId } = payload ?? {};

  const vector = Array.isArray(limitVector) && limitVector.length
    ? limitVector
    : typeof newLimitPpm === "number"
      ? [{ substance: regulationCode, limitPpm: newLimitPpm }]
      : [];

  if (!regulationCode || !bomId || !vector.length) {
    return NextResponse.json({ error: "regulationCode, at least one limit, and bomId are required" }, { status: 400 });
  }

  const result = await certivoApiFetch<ImpactResponse>("/impact/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regulationCode, limitVector: vector, bomId })
  });

  return NextResponse.json(result);
}
