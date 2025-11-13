"use client";

import { useState } from "react";

import { SectionCard } from "@/components/ui/section-card";
import { SAMPLE_ASSEMBLIES_JSON, SAMPLE_CERTIFICATES_JSON } from "@/lib/testing/sample-payloads";
import { LabActionPanel, LabActionFeedback, postJson } from "@/components/lab/lab-utils";

type CompliancePlaygroundProps = {
  defaultProductId: string;
  defaultUploaderId?: string;
};

export function CompliancePlayground({ defaultProductId, defaultUploaderId }: CompliancePlaygroundProps) {
  return (
    <SectionCard
      title="Compliance Ingestion Lab"
      description="Push sample BOMs and certificates through the Architecture.md §3 ingestion flows."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <LabActionPanel
          title="Upload BOM assemblies"
          description="Send a BOM payload to /bom/upload. Use the JSON editor to tweak assemblies before ingestion."
        >
          <BomUploadForm defaultProductId={defaultProductId} defaultUploaderId={defaultUploaderId} />
        </LabActionPanel>
        <LabActionPanel
          title="Upload supplier certificates"
          description="Post certificate findings to /certs/upload to validate normalization + data quality flags."
        >
          <CertificateUploadForm />
        </LabActionPanel>
      </div>
    </SectionCard>
  );
}

type BomFormProps = {
  defaultProductId: string;
  defaultUploaderId?: string;
};

function BomUploadForm({ defaultProductId, defaultUploaderId }: BomFormProps) {
  const [productId, setProductId] = useState(defaultProductId);
  const [uploadedBy, setUploadedBy] = useState(defaultUploaderId ?? "");
  const [assembliesJson, setAssembliesJson] = useState(SAMPLE_ASSEMBLIES_JSON);
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      if (!productId || !uploadedBy) {
        throw new Error("productId and uploadedBy are required");
      }
      const assemblies = JSON.parse(assembliesJson);
      const body = {
        productId,
        uploadedBy,
        assemblies,
        sourceDocumentId: sourceDocumentId.trim().length ? sourceDocumentId.trim() : undefined
      };
      const response = await postJson("/api/compliance/bom", body);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit BOM payload");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setAssembliesJson(SAMPLE_ASSEMBLIES_JSON);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block text-slate-300">Product ID</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={productId}
          onChange={(event) => setProductId(event.currentTarget.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-slate-300">Uploaded by (user id)</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={uploadedBy}
          onChange={(event) => setUploadedBy(event.currentTarget.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-slate-300">Source document id (optional)</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={sourceDocumentId}
          onChange={(event) => setSourceDocumentId(event.currentTarget.value)}
          placeholder="f2941dc9-3126-4768-aede-91a5e406d11c"
        />
      </div>
      <div>
        <label className="mb-1 block text-slate-300">Assemblies JSON</label>
        <textarea
          className="h-52 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200 focus:border-brand-400 focus:outline-none"
          value={assembliesJson}
          onChange={(event) => setAssembliesJson(event.currentTarget.value)}
        />
        <button
          type="button"
          onClick={handleReset}
          className="mt-1 text-xs text-brand-400 hover:text-brand-300"
        >
          Reset to sample assemblies
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Ingest BOM"}
        </button>
        <span className="text-xs text-slate-400">
          Calls Gateway → ComplianceService (Architecture §3.1)
        </span>
      </div>
      <LabActionFeedback result={result} error={error} />
    </form>
  );
}

function CertificateUploadForm() {
  const [certificatesJson, setCertificatesJson] = useState(SAMPLE_CERTIFICATES_JSON);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const certificates = JSON.parse(certificatesJson);
      if (!Array.isArray(certificates) || certificates.length === 0) {
        throw new Error("Provide at least one certificate entry");
      }
      const response = await postJson("/api/compliance/certificates", { certificates });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload certificates");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setCertificatesJson(SAMPLE_CERTIFICATES_JSON);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block text-slate-300">Certificates JSON</label>
        <textarea
          className="h-64 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-200 focus:border-brand-400 focus:outline-none"
          value={certificatesJson}
          onChange={(event) => setCertificatesJson(event.currentTarget.value)}
        />
        <button
          type="button"
          onClick={handleReset}
          className="mt-1 text-xs text-brand-400 hover:text-brand-300"
        >
          Reset to sample certificates
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Upload certificates"}
        </button>
        <span className="text-xs text-slate-400">
          Exercises certificate ingestion + normalization
        </span>
      </div>
      <LabActionFeedback result={result} error={error} />
    </form>
  );
}
