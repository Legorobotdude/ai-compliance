"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { DashboardSnapshot } from "@/lib/types/dashboard";

import { SectionCard } from "@/components/ui/section-card";
import { statusClass } from "@/lib/status";

type ImpactScenario = DashboardSnapshot["impact"];

type ImpactSimulatorProps = {
  bomId: string;
  regulationCode: string;
  initialScenario: ImpactScenario;
};

const SLIDER_MIN = 25;
const SLIDER_MAX = 1000;

export function ImpactSimulator({ bomId, regulationCode, initialScenario }: ImpactSimulatorProps) {
  const [scenario, setScenario] = useState<ImpactScenario>(initialScenario);
  const [limit, setLimit] = useState(initialScenario.newLimitPpm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const initializedRef = useRef(false);

  useEffect(() => {
    setScenario(initialScenario);
    setLimit(initialScenario.newLimitPpm);
  }, [initialScenario]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (limit === scenario.newLimitPpm) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          setError(null);
          const response = await fetch("/api/impact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              regulationCode,
              newLimitPpm: limit,
              bomId
            }),
            signal: controller.signal
          });
          if (!response.ok) {
            throw new Error(`Impact API failed: ${response.status}`);
          }
          const data = (await response.json()) as ImpactScenario;
          setScenario(data);
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            return;
          }
          setError("Unable to simulate new threshold. Please try again.");
        }
      });
    }, 450);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [limit, regulationCode, bomId, scenario.newLimitPpm, startTransition]);

  const sliderMin = Math.min(SLIDER_MIN, scenario.oldLimitPpm / 2);
  const sliderMax = Math.max(SLIDER_MAX, scenario.oldLimitPpm * 2);

  const { overLimitCount, compliantCount } = useMemo(() => {
    const over = scenario.deltas.filter((delta) => delta.after === "OVER_LIMIT").length;
    return { overLimitCount: over, compliantCount: scenario.deltas.length - over };
  }, [scenario.deltas]);

  return (
    <SectionCard
      title="Impact Simulator"
      description="Playground for PFAS limit downgrades feeding /impact/predict."
      actions={<span className="text-xs text-slate-400">New limit: {limit.toLocaleString()} ppm</span>}
    >
      <div className="space-y-4">
        <input
          className="w-full accent-brand-500"
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={10}
          value={limit}
          onChange={(event) => setLimit(Number(event.currentTarget.value))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Affected parts" value={scenario.summary.affectedParts} />
          <StatCard label="Suppliers" value={scenario.summary.affectedSuppliers} />
          <StatCard label="Assemblies" value={scenario.summary.affectedAssemblies} />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
          <p>
            Baseline limit <span className="font-semibold text-white">{scenario.oldLimitPpm} ppm</span>
          </p>
          <p>
            Scenario delta {Math.round(((scenario.oldLimitPpm - limit) / scenario.oldLimitPpm) * 100)}% tighter ·{" "}
            <span className="text-red-300">{overLimitCount} over limit</span> /
            <span className="text-emerald-300"> {Math.max(compliantCount, 0)} compliant</span>
          </p>
          {isPending ? <span className="text-xs text-slate-500">Recomputing…</span> : null}
          {error ? <span className="text-xs text-red-400">{error}</span> : null}
        </div>

        <div className="rounded-2xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">Before</th>
                <th className="px-4 py-3">After</th>
              </tr>
            </thead>
            <tbody>
              {scenario.deltas.map((delta) => (
                <tr key={`${delta.partNumber}-${delta.assemblyId}`} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-medium text-white">{delta.partNumber}</td>
                  <td className="px-4 py-3">
                    <span className={statusClass(delta.before)}>{delta.before}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusClass(delta.after)}>{delta.after}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!scenario.deltas.length ? (
            <p className="px-4 py-3 text-sm text-slate-500">No parts flip state under the current threshold.</p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
