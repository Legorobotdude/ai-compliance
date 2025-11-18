"use client";

import { useState } from "react";

import { RiskSummaryView } from "@/components/cora/risk-summary-view";
import { LabActionPanel, LabActionFeedback, postJson } from "@/components/cora/cora-utils";
import { SectionCard } from "@/components/ui/section-card";
import { SAMPLE_DOCUMENT_IDS, SAMPLE_SUPPLIER_IDS } from "@/lib/testing/sample-payloads";
import type { CoraRiskSummary } from "@/lib/types/cora";

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
  const [riskSummaryResult, setRiskSummaryResult] = useState<CoraRiskSummary | null>(null);
  const [riskSummaryError, setRiskSummaryError] = useState<string | null>(null);
  const [riskSummaryLoading, setRiskSummaryLoading] = useState(false);

  const handleRiskSummaryStart = () => {
    setRiskSummaryLoading(true);
    setRiskSummaryError(null);
  };

  const handleRiskSummarySuccess = (payload: CoraRiskSummary) => {
    setRiskSummaryLoading(false);
    setRiskSummaryResult(payload);
  };

  const handleRiskSummaryError = (message: string) => {
    setRiskSummaryLoading(false);
    setRiskSummaryResult(null);
    setRiskSummaryError(message);
  };

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
          <RiskSummaryForm
            defaultBomId={defaultBomId}
            defaultProductId={defaultProductId}
            loading={riskSummaryLoading}
            onStart={handleRiskSummaryStart}
            onSuccess={handleRiskSummarySuccess}
            onError={handleRiskSummaryError}
          />
        </LabActionPanel>
      </div>

      <RiskSummaryResultPanel loading={riskSummaryLoading} error={riskSummaryError} summary={riskSummaryResult} />
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

type RiskSummaryFormProps = {
  defaultBomId: string;
  defaultProductId: string;
  loading: boolean;
  onStart: () => void;
  onSuccess: (payload: CoraRiskSummary) => void;
  onError: (message: string) => void;
};

function RiskSummaryForm({
  defaultBomId,
  defaultProductId,
  loading,
  onStart,
  onSuccess,
  onError
}: RiskSummaryFormProps) {
  const [bomId, setBomId] = useState(defaultBomId);
  const [productId, setProductId] = useState(defaultProductId);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onStart();
    try {
      if (!bomId && !productId) {
        throw new Error("Provide a bomId or productId");
      }
      const response = (await postJson("/api/ai/risk-summary", {
        bomId: bomId || undefined,
        productId: productId || undefined
      })) as CoraRiskSummary;
      onSuccess(response);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to build risk summary");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
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
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Summarizing…" : "Summarize risk"}
      </button>
      <p className="text-xs text-slate-500">Calls CORA's /ai/risk-summary endpoint using Architecture §4 prompt rules.</p>
    </form>
  );
}

function RiskSummaryResultPanel({
  loading,
  summary,
  error
}: {
  loading: boolean;
  summary: CoraRiskSummary | null;
  error: string | null;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-800/80 bg-slate-950/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Latest CORA risk summary</p>
          <p className="text-xs text-slate-400">Rendered as a dedicated report card using Architecture §4 prompts.</p>
        </div>
        <div className="text-xs text-slate-400">
          {loading ? "Crunching snapshots…" : summary ? "Up to date" : "Awaiting request"}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>
      )}
      {!error && summary && (
        <div className="mt-4">
          <RiskSummaryView summary={summary} />
        </div>
      )}
      {!error && !summary && !loading && (
        <p className="mt-3 text-xs text-slate-400">
          Submit a BOM or product above to generate an executive-ready report powered by CORA's /ai/risk-summary endpoint.
        </p>
      )}
    </div>
  );
}
