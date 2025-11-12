"use client";

import { useMemo, useState } from "react";

import type { SupplierSnapshot } from "@/lib/types/dashboard";
import { getEmailPreview, type Locale } from "@/lib/i18n/email";
import { SectionCard } from "@/components/ui/section-card";

type SupplierScorecardsProps = {
  suppliers: SupplierSnapshot[];
};

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

function normalizeLocale(value: string): Locale {
  if (value === "de" || value === "zh") {
    return value;
  }
  return "en";
}

export function SupplierScorecards({ suppliers }: SupplierScorecardsProps) {
  const [selected, setSelected] = useState<SupplierSnapshot | null>(suppliers[0] ?? null);
  const emailPreview = useMemo(
    () =>
      selected
        ? getEmailPreview(normalizeLocale(selected.language), {
            supplier: selected.name,
            missingCount: selected.requestsOpen,
            regulation: "REACH / PFAS"
          })
        : null,
    [selected]
  );

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

      {emailPreview ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Localized email preview</p>
              <p className="text-xs text-slate-400">
                {selected.name} · Locale {emailPreview.locale.toUpperCase()}
              </p>
            </div>
            <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">CORA draft</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-semibold text-brand-300">{emailPreview.subject}</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-950/60 p-3 text-slate-200">{emailPreview.body}</pre>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
