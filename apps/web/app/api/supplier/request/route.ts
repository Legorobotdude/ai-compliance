import { NextResponse } from "next/server";

import type { SupplierRequestInput, SupplierRequestResult, SupplierRequestTone } from "@certivo/supplier";

import { certivoApiFetch } from "@/lib/api/client";
import { getTenantIdFromToken, getUserIdFromToken } from "@/lib/env";

type RequestBody = {
  supplierId?: string;
  bomId?: string;
  tone?: SupplierRequestTone;
  languageOverride?: string;
  dueAt?: string;
};

const VALID_TONES: SupplierRequestTone[] = ["formal", "neutral", "friendly"];

export async function POST(request: Request) {
  let payload: RequestBody;
  try {
    payload = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const supplierId = payload.supplierId?.trim();
  const bomId = payload.bomId?.trim();
  if (!supplierId || !bomId) {
    return NextResponse.json({ error: "supplierId and bomId are required" }, { status: 400 });
  }

  const tenantId = getTenantIdFromToken();
  const requestedBy = getUserIdFromToken();
  if (!requestedBy) {
    return NextResponse.json({ error: "CERTIVO_API_TOKEN is missing a sub (user id) claim" }, { status: 500 });
  }

  const body: SupplierRequestInput = {
    tenantId,
    supplierId,
    bomId,
    requestedBy,
    ...(payload.dueAt ? { dueAt: payload.dueAt } : {}),
    ...(payload.languageOverride?.trim()
      ? { languageOverride: payload.languageOverride.trim() }
      : {}),
    ...(payload.tone && VALID_TONES.includes(payload.tone) ? { tone: payload.tone } : {})
  };

  try {
    const result = await certivoApiFetch<SupplierRequestResult>("/supplier/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create supplier request";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

