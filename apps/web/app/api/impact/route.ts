import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type ImpactResponse = DashboardSnapshot["impact"];

export async function POST(request: Request) {
  const payload = await request.json();
  const { regulationCode, newLimitPpm, bomId } = payload ?? {};

  if (!regulationCode || typeof newLimitPpm !== "number" || !bomId) {
    return NextResponse.json({ error: "regulationCode, newLimitPpm, and bomId are required" }, { status: 400 });
  }

  const result = await certivoApiFetch<ImpactResponse>("/impact/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ regulationCode, newLimitPpm, bomId })
  });

  return NextResponse.json(result);
}
