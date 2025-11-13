import { NextResponse } from "next/server";

import { certivoApiFetch } from "@/lib/api/client";

type CertificateUploadResponse = {
  items: Array<{ certificateId: string; findings: number; validUntil?: string | null; dataQualityFlags: number }>;
  issues: Array<{ code: string; message: string; partNumber: string; substanceName: string }>;
};

type IncomingCertificatesPayload = {
  certificates?: unknown;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IncomingCertificatesPayload | null;
  if (!payload || !Array.isArray(payload.certificates) || payload.certificates.length === 0) {
    return NextResponse.json({ error: "certificates array is required" }, { status: 400 });
  }

  const result = await certivoApiFetch<CertificateUploadResponse>("/certs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificates: payload.certificates })
  });

  return NextResponse.json(result);
}
