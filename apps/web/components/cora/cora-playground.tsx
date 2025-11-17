"use client";

import { useState } from "react";

import { SectionCard } from "@/components/ui/section-card";
import { LabActionPanel, LabActionFeedback, postJson } from "@/components/cora/cora-utils";
import { SAMPLE_DOCUMENT_IDS, SAMPLE_SUPPLIER_IDS } from "@/lib/testing/sample-payloads";

type CoraPlaygroundProps = {
  defaultBomId: string;
  defaultProductId: string;
  defaultSupplierId?: string;
};

export function CoraPlayground({
  defaultBomId,
  defaultProductId,
  defaultSupplierId
}: CoraPlaygroundProps) {
  const supplierFallback = defaultSupplierId ?? SAMPLE_SUPPLIER_IDS.zentech;
  return (
    <SectionCard
      title="CORA Playground"
      description="Test AI endpoints for document parsing, supplier emails, and risk summaries directly from the browser."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <LabActionPanel
          title="Parse document"
          description="Test document parsing with <code className='font-mono text-xs'>/ai/parse-document</code> endpoint."
        >
          <ParseDocumentForm defaultDocumentId={SAMPLE_DOCUMENT_IDS.rohs} />
        </LabActionPanel>
        <LabActionPanel
          title="Draft supplier email"
          description="Generate localized supplier outreach email for missing certificates."
        >
          <SupplierEmailForm defaultBomId={defaultBomId} defaultSupplierId={supplierFallback} />
        </LabActionPanel>
        <LabActionPanel
          title="Generate risk summary"
          description="Create AI-generated executive risk summary for a BOM or product."
        >
          <RiskSummaryForm defaultBomId={defaultBomId} defaultProductId={defaultProductId} />
        </LabActionPanel>
      </div>
    </SectionCard>
  );
}

function ParseDocumentForm({ defaultDocumentId }: { defaultDocumentId: string }) {
  const [documentId, setDocumentId] = useState(defaultDocumentId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      if (!documentId) {
        throw new Error("documentId is required");
      }
      const response = await postJson("/api/ai/parse-document", { documentId, schema: "certificate_v1" });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse document");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block text-slate-300">Document id</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={documentId}
          onChange={(event) => setDocumentId(event.currentTarget.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Parsing…" : "Parse certificate"}
      </button>
      <LabActionFeedback result={result} error={error} />
    </form>
  );
}

function SupplierEmailForm({ defaultBomId, defaultSupplierId }: { defaultBomId: string; defaultSupplierId: string }) {
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [bomId, setBomId] = useState(defaultBomId);
  const [language, setLanguage] = useState("en");
  const [tone, setTone] = useState<"formal" | "neutral" | "friendly">("formal");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      if (!supplierId || !bomId) {
        throw new Error("supplierId and bomId are required");
      }
      const response = await postJson("/api/ai/supplier-email", {
        supplierId,
        bomId,
        language: language || undefined,
        tone
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to draft email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block text-slate-300">Supplier id</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={supplierId}
          onChange={(event) => setSupplierId(event.currentTarget.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-slate-300">BOM id</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={bomId}
          onChange={(event) => setBomId(event.currentTarget.value)}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-slate-300">Language</label>
          <input
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
            value={language}
            onChange={(event) => setLanguage(event.currentTarget.value)}
            placeholder="en"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-slate-300">Tone</label>
          <select
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
            value={tone}
            onChange={(event) => setTone(event.currentTarget.value as typeof tone)}
          >
            <option value="formal">Formal</option>
            <option value="neutral">Neutral</option>
            <option value="friendly">Friendly</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Drafting…" : "Generate email"}
      </button>
      <LabActionFeedback result={result} error={error} />
    </form>
  );
}

function RiskSummaryForm({ defaultBomId, defaultProductId }: { defaultBomId: string; defaultProductId: string }) {
  const [bomId, setBomId] = useState(defaultBomId);
  const [productId, setProductId] = useState(defaultProductId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      if (!bomId && !productId) {
        throw new Error("Provide a bomId or productId");
      }
      const response = await postJson("/api/ai/risk-summary", {
        bomId: bomId || undefined,
        productId: productId || undefined
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build risk summary");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div>
        <label className="mb-1 block text-slate-300">BOM id</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={bomId}
          onChange={(event) => setBomId(event.currentTarget.value)}
          placeholder="Leave empty to fall back to product scope"
        />
      </div>
      <div>
        <label className="mb-1 block text-slate-300">Product id</label>
        <input
          className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 focus:border-brand-400 focus:outline-none"
          value={productId}
          onChange={(event) => setProductId(event.currentTarget.value)}
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Summarizing…" : "Summarize risk"}
      </button>
      <LabActionFeedback result={result} error={error} />
    </form>
  );
}
