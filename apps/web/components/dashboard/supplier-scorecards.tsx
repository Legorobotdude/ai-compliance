"use client";

import { useEffect, useMemo, useState } from "react";

import type { SupplierRequestResult, SupplierRequestTone } from "@certivo/supplier";

import type { SupplierSnapshot } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type SupplierScorecardsProps = {
  suppliers: SupplierSnapshot[];
  bomId: string;
};

type DraftState =
  | { status: "idle"; draft: null; error: null }
  | { status: "loading"; draft: null; error: null }
  | { status: "error"; draft: null; error: string }
  | { status: "success"; draft: DraftPayload; error: null };

type DraftPayload = {
  subject: string;
  body: string;
  language: string;
  dueDate?: string;
};

type SendState =
  | { status: "idle"; error: null }
  | { status: "sending"; error: null }
  | { status: "error"; error: string }
  | { status: "success"; error: null };

function Sparkline({ points }: { points: number[] }) {
  const path = useMemo(() => {
    if (!points.length) return "";
    const max = Math.max(...points);
    const min = Math.min(...points);
    const normalize = (value: number) => ((value - min) / (max - min || 1)) * 36 + 2;
    return points
      .map((value, idx) => {
        const x = (idx / (points.length - 1 || 1)) * 120;
        const y = 40 - normalize(value);
        return `${idx === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);
  return (
    <svg viewBox="0 0 120 40" className="h-10 w-full">
      <path d={path} fill="none" stroke="url(#sparkGradient)" strokeWidth={2} strokeLinecap="round" />
      <defs>
        <linearGradient id="sparkGradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function normalizeLocale(value: string): "de" | "zh" | "en" {
  if (value === "de" || value === "zh") {
    return value;
  }
  return "en";
}

export function SupplierScorecards({ suppliers, bomId }: SupplierScorecardsProps) {
  const [selected, setSelected] = useState<SupplierSnapshot | null>(suppliers[0] ?? null);
  const [draftState, setDraftState] = useState<DraftState>({ status: "idle", draft: null, error: null });
  const [sendState, setSendState] = useState<SendState>({ status: "idle", error: null });
  const [requestResult, setRequestResult] = useState<SupplierRequestResult | null>(null);
  const [tone, setTone] = useState<SupplierRequestTone>("formal");
  const locale = useMemo(() => (selected ? normalizeLocale(selected.language) : "en"), [selected]);

  useEffect(() => {
    setDraftState({ status: "idle", draft: null, error: null });
    setSendState({ status: "idle", error: null });
    setRequestResult(null);
  }, [selected?.supplierId]);

  async function requestDraft() {
    if (!selected) {
      return;
    }
    setDraftState({ status: "loading", draft: null, error: null });
    try {
      const response = await fetch("/api/ai/supplier-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selected.supplierId,
          bomId,
          language: locale,
          tone: "formal"
        })
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Draft request failed (${response.status})`;
        throw new Error(message);
      }
      const data = payload as DraftPayload;
      setDraftState({
        status: "success",
        draft: {
          subject: data.subject,
          body: data.body,
          language: data.language ?? locale,
          dueDate: data.dueDate
        },
        error: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to request CORA draft";
      setDraftState({ status: "error", draft: null, error: message });
    }
  }

  async function sendWorkflowRequest() {
    if (!selected) {
      return;
    }
    setSendState({ status: "sending", error: null });
    setRequestResult(null);
    try {
      const response = await fetch("/api/supplier/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selected.supplierId,
          bomId,
          tone,
          languageOverride: locale,
          dueAt: draftState.draft?.dueDate
        })
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Failed to schedule workflow (${response.status})`;
        throw new Error(message);
      }
      setRequestResult(payload as SupplierRequestResult);
      setSendState({ status: "success", error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to schedule supplier workflow";
      setSendState({ status: "error", error: message });
    }
  }

  if (suppliers.length === 0 || !selected) {
    return (
      <SectionCard title="Supplier Scorecards" description="SLA trend, outreach context, localized email preview.">
        <p className="text-sm text-slate-400">No supplier data yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Supplier Scorecards"
      description="SLA trend, outreach context, localized email preview per Architecture §6."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {suppliers.map((supplier) => (
          <button
            key={supplier.supplierId}
            type="button"
            onClick={() => setSelected(supplier)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selected?.supplierId === supplier.supplierId
                ? "border-brand-400 bg-brand-500/10"
                : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">{supplier.name}</p>
              <span className="text-xs text-slate-400">{supplier.country}</span>
            </div>
            <p className="text-sm text-slate-400">Language: {normalizeLocale(supplier.language).toUpperCase()}</p>
            <div className="mt-3 flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs uppercase text-slate-500">Compliance rate</p>
                <p className="text-lg font-semibold text-emerald-300">{Math.round(supplier.complianceRate * 100)}%</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Avg response</p>
                <p className="text-lg font-semibold text-white">{supplier.responseAvgDays.toFixed(1)} d</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Open requests</p>
                <p className="text-lg font-semibold text-amber-300">{supplier.requestsOpen}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-slate-900/60 p-2">
              <p className="text-xs uppercase text-slate-500">SLA Trend (days)</p>
              <Sparkline points={supplier.slaTrend} />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">CORA outreach draft</p>
            <p className="text-xs text-slate-400">
              {selected.name} · Locale {locale.toUpperCase()}
              {draftState.draft?.dueDate ? ` · Due ${formatDueDate(draftState.draft.dueDate)}` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              Tone
              <select
                value={tone}
                onChange={(event) => setTone(event.currentTarget.value as SupplierRequestTone)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-1 text-sm text-white"
              >
                <option value="formal">Formal</option>
                <option value="neutral">Neutral</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={requestDraft}
                disabled={draftState.status === "loading"}
                className="inline-flex items-center justify-center rounded-full border border-brand-400 px-4 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {draftState.status === "loading" ? "Drafting…" : "Draft with CORA"}
              </button>
              <button
                type="button"
                onClick={sendWorkflowRequest}
                disabled={sendState.status === "sending" || !draftState.draft}
                className="inline-flex items-center justify-center rounded-full border border-emerald-400 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
              >
                {sendState.status === "sending" ? "Sending…" : "Send via workflow"}
              </button>
            </div>
          </div>
        </div>
        {draftState.error ? <p className="mt-2 text-xs text-rose-300">{draftState.error}</p> : null}
        {sendState.error ? <p className="mt-1 text-xs text-rose-300">{sendState.error}</p> : null}
        {sendState.status === "success" && requestResult ? (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
            <p className="font-semibold text-emerald-200">Workflow queued</p>
            <p className="mt-1 text-emerald-100">
              Request {requestResult.requestId} · status {requestResult.status} · Due{" "}
              {formatDueDate(requestResult.dueAt)}
            </p>
          </div>
        ) : null}
        {draftState.draft ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold text-brand-300">{draftState.draft.subject}</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-950/60 p-3 text-slate-200">
              {draftState.draft.body}
            </pre>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">
            Click “Draft with CORA” to request the latest localized outreach for this supplier.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatDueDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
