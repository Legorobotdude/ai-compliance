"use client";

import { useMemo, useState } from "react";

import { impactScenario } from "@/lib/data/mock-dashboard";
import { SectionCard } from "@/components/ui/section-card";
import { statusClass } from "@/lib/status";

export function ImpactSimulator() {
  const [limit, setLimit] = useState(impactScenario.baselineLimit);
  const severityRatio = limit / impactScenario.baselineLimit;

  const projection = useMemo(() => {
    const affected = impactScenario.deltas.map((delta) => {
      const toggled = severityRatio < 0.5 ? delta.after : delta.before;
      return { ...delta, projected: toggled };
    });

    const overLimitCount = affected.filter((item) => item.projected === "OVER_LIMIT").length;
    const compliant = affected.length - overLimitCount;

    return {
      affected,
      overLimitCount,
      compliant
    };
  }, [severityRatio]);

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
          min={impactScenario.sliderMin}
          max={impactScenario.sliderMax}
          step={impactScenario.step}
          value={limit}
          onChange={(event) => setLimit(Number(event.currentTarget.value))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-500">Affected parts</p>
            <p className="text-2xl font-semibold text-white">{impactScenario.affectedSummary.parts}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-500">Suppliers</p>
            <p className="text-2xl font-semibold text-white">{impactScenario.affectedSummary.suppliers}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs uppercase text-slate-500">Assemblies</p>
            <p className="text-2xl font-semibold text-white">{impactScenario.affectedSummary.assemblies}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-slate-400">
          <p>
            Baseline limit <span className="font-semibold text-white">{impactScenario.baselineLimit} ppm</span>
          </p>
          <p>
            Scenario delta {Math.round((1 - severityRatio) * 100)}% tighter ·{" "}
            <span className="text-red-300">{projection.overLimitCount} over limit</span> /
            <span className="text-emerald-300"> {projection.compliant} compliant</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">Before</th>
                <th className="px-4 py-3">Projected</th>
              </tr>
            </thead>
            <tbody>
              {projection.affected.map((delta) => (
                <tr key={delta.partNumber} className="border-t border-slate-800 text-slate-200">
                  <td className="px-4 py-3 font-medium text-white">{delta.partNumber}</td>
                  <td className="px-4 py-3">
                    <span className={statusClass(delta.before)}>{delta.before}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusClass(delta.projected)}>{delta.projected}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
