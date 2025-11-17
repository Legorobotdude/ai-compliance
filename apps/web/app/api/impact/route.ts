import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type ImpactResponse = DashboardSnapshot["impact"];
type ImpactRoutePayload = {
  regulationCode?: string;
  newLimitPpm?: number;
  limitVector?: Array<{ substance: string; limitPpm: number }>;
  bomId?: string;
  supplierIds?: string[];
  assemblyIds?: string[];
};

export async function POST(request: Request) {
  let payload: ImpactRoutePayload | undefined;
  try {
    payload = (await request.json()) as ImpactRoutePayload;
  } catch {
    return NextResponse.json({ error: "Request body is required" }, { status: 400 });
  }
  const { regulationCode, newLimitPpm, limitVector, bomId, supplierIds, assemblyIds } = payload ?? {};

  const vector =
    Array.isArray(limitVector) && limitVector.length
      ? limitVector.filter(
          (entry): entry is { substance: string; limitPpm: number } =>
            typeof entry?.substance === "string" && typeof entry?.limitPpm === "number"
        )
      : undefined;

  if (!regulationCode || !bomId || (typeof newLimitPpm !== "number" && !(vector && vector.length))) {
    return NextResponse.json(
      { error: "regulationCode, bomId, and either newLimitPpm or limitVector are required" },
      { status: 400 }
    );
  }

  const result = await certivoApiFetch<ImpactResponse>("/impact/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      regulationCode,
      bomId,
      ...(typeof newLimitPpm === "number" ? { newLimitPpm } : {}),
      ...(vector && vector.length ? { limitVector: vector } : {}),
      ...(Array.isArray(supplierIds) && supplierIds.length ? { supplierIds } : {}),
      ...(Array.isArray(assemblyIds) && assemblyIds.length ? { assemblyIds } : {})
    })
  });

  return NextResponse.json(result);
}
