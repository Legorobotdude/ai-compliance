"use client";

import clsx from "clsx";
import { useMemo, useState, useTransition } from "react";

import { SectionCard } from "@/components/ui/section-card";
import type { DashboardSnapshot } from "@/lib/types/dashboard";

type ImpactScenario = DashboardSnapshot["impact"];
type ImpactVectorEntry = ImpactScenario["vector"][number];
type ImpactRollupEntry = ImpactScenario["supplierRollups"][number];

type ImpactScenarioWorkbenchProps = {
  bomId: string;
  regulationCode: string;
  initialScenario: ImpactScenario;
  baselineLimits: ImpactScenario["baselineLimits"];
};

type VectorRow = {
  substance: string;
  baseline: number;
  limit: number;
};

export function ImpactScenarioWorkbench({
  bomId,
  regulationCode,
  initialScenario,
  baselineLimits
}: ImpactScenarioWorkbenchProps) {
  const [scenario, setScenario] = useState<ImpactScenario>(initialScenario);
  const [vectorRows, setVectorRows] = useState<VectorRow[]>(() =>
    buildVectorRows(baselineLimits, initialScenario.vector)
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rollupSummary = useMemo(
    () => ({
      supplierImpacts: scenario.supplierRollups.reduce((total, entry) => total + entry.impactedParts, 0),
      assemblyImpacts: scenario.assemblyRollups.reduce((total, entry) => total + entry.impactedParts, 0)
    }),
    [scenario.supplierRollups, scenario.assemblyRollups]
  );

  const scenarioTtl = scenario.expiresAtIso
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(scenario.expiresAtIso))
    : "No TTL";

  async function handleSimulate() {
    if (!vectorRows.length) {
      setError("Add at least one substance override before simulating.");
      return;
    }
    const vectorPayload = vectorRows
      .filter((entry) => Number.isFinite(entry.limit))
      .map((entry) => ({ substance: entry.substance, limitPpm: Math.max(0, Math.round(entry.limit)) }));
    if (!vectorPayload.length) {
      setError("Every override needs a numeric ppm value.");
      return;
    }
    startTransition(async () => {
      try {
        setError(null);
        setSuccess(null);
        const response = await fetch("/api/impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regulationCode,
            bomId,
            limitVector: vectorPayload
          })
        });
        if (!response.ok) {
          throw new Error(`Impact API failed with status ${response.status}`);
        }
        const data = (await response.json()) as ImpactScenario;
        setScenario(data);
        setVectorRows((previous) => syncVectorRows(previous, data.vector, baselineLimits));
        setSuccess("Scenario recomputed via /impact/predict");
      } catch (err) {
        console.error(err);
        setError("Unable to simulate with the current vector. Please retry.");
      }
    });
  }

  return (
    <SectionCard
      title="Impact Scenario Workbench"
      description="Architecture §§4–5 limit vector lab: multi-substance overrides, diffing, and supplier/assembly rollups."
      actions={
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span>Regulation: {regulationCode}</span>
          <span>Scenario TTL: {scenarioTtl}</span>
        </div>
      }
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Limit vector editor</h3>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={isPending}
              className="rounded-full border border-brand-400 px-3 py-1 text-xs font-semibold text-brand-200 transition hover:bg-brand-400/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {isPending ? "Simulating…" : "Run scenario"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Adjust ppm targets per substance to push `/impact/predict` with a custom vector (pfas family, PFHxA, etc.).
          </p>
          <div className="mt-4 space-y-3 text-sm">
            {vectorRows.length === 0 ? (
              <p className="text-xs text-slate-500">
                No baseline limits loaded—seed regulation catalogs to experiment with overrides.
              </p>
            ) : (
              vectorRows.map((row) => (
                <VectorRowControl key={row.substance} row={row} onChange={setVectorRows} />
              ))
            )}
          </div>
          {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
          {success ? <p className="mt-3 text-xs text-emerald-400">{success}</p> : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">Scenario summary</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label="Affected parts" value={scenario.summary.affectedParts} />
            <StatTile label="Suppliers touched" value={scenario.summary.affectedSuppliers} />
            <StatTile label="Assemblies affected" value={scenario.summary.affectedAssemblies} />
            <StatTile label="Parts flipping state" value={scenario.deltas.length} />
          </div>
          <div className="rounded-xl border border-slate-900 bg-slate-900/50 p-3 text-xs text-slate-300">
            <p>
              Supplier rollup impact: <span className="text-white">{rollupSummary.supplierImpacts}</span> parts
              across suppliers. Assembly rollup impact:{" "}
              <span className="text-white">{rollupSummary.assemblyImpacts}</span> parts.
            </p>
            <p className="mt-2">
              Active vector:{" "}
              {scenario.vector.length ? (
                <span className="flex flex-wrap gap-2">
                  {scenario.vector.map((entry) => (
                    <span
                      key={`${entry.substance}-${entry.limitPpm}`}
                      className="rounded-full border border-slate-800 bg-slate-900/60 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300"
                    >
                      {entry.substance} · {entry.limitPpm.toLocaleString()} ppm (base{" "}
                      {entry.baselineLimitPpm?.toLocaleString() ?? "?"})
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-slate-500">baseline only</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ImpactRollupTable label="Supplier rollups" rows={scenario.supplierRollups} emptyCta="No supplier deltas yet." />
        <ImpactRollupTable label="Assembly rollups" rows={scenario.assemblyRollups} emptyCta="No assembly deltas yet." />
      </div>
    </SectionCard>
  );
}

function VectorRowControl({
  row,
  onChange
}: {
  row: VectorRow;
  onChange: (updater: (rows: VectorRow[]) => VectorRow[]) => void;
}) {
  const sliderMin = Math.max(1, Math.round(row.baseline * 0.1));
  const sliderMax = Math.max(100, Math.round(Math.max(row.baseline, row.limit) * 2.5));

  function update(nextValue: number) {
    onChange((rows) =>
      rows.map((entry) =>
        entry.substance === row.substance ? { ...entry, limit: Math.max(0, nextValue) } : entry
      )
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-900/70 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400">
        <p className="font-semibold uppercase tracking-wider text-white">{row.substance}</p>
        <p>Baseline {row.baseline.toLocaleString()} ppm</p>
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={5}
        value={row.limit}
        className="w-full accent-brand-400"
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isNaN(next)) {
            return;
          }
          update(next);
        }}
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="w-28 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-white"
          value={Math.round(row.limit)}
          min={0}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isNaN(next)) {
              return;
            }
            update(next);
          }}
        />
        <span className="text-xs text-slate-400">ppm override</span>
      </div>
    </div>
  );
}

function ImpactRollupTable({
  label,
  rows,
  emptyCta
}: {
  label: string;
  rows: ImpactRollupEntry[];
  emptyCta: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <h3 className="text-sm font-semibold text-white">{label}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyCta}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const delta = row.afterOverLimit - row.beforeOverLimit;
            const trendClass = clsx(
              delta > 0 && "text-red-300",
              delta < 0 && "text-emerald-300",
              delta === 0 && "text-slate-400"
            );
            return (
              <div
                key={row.id}
                className="rounded-xl border border-slate-900 bg-slate-900/60 p-3 text-sm text-slate-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white">{row.label ?? row.id}</p>
                  <span className="text-xs text-slate-500">{row.impactedParts} parts impacted</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span>Before: {row.beforeOverLimit}</span>
                  <span>After: {row.afterOverLimit}</span>
                  <span className={trendClass}>
                    {delta > 0 ? `+${delta}` : delta < 0 ? delta : "no change"} over-limit
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

const buildVectorRows = (
  baselineLimits: ImpactScenario["baselineLimits"],
  scenarioVector: ImpactVectorEntry[]
): VectorRow[] => syncVectorRows([], scenarioVector, baselineLimits);

function syncVectorRows(
  previous: VectorRow[],
  latestVector: ImpactVectorEntry[],
  baselineLimits: ImpactScenario["baselineLimits"]
): VectorRow[] {
  const baselineMap = new Map(
    baselineLimits.map((limit) => [
      limit.substance,
      { substance: limit.substance, baseline: limit.limitPpm, limit: limit.limitPpm }
    ])
  );
  for (const entry of previous) {
    baselineMap.set(entry.substance, entry);
  }
  for (const entry of latestVector) {
    baselineMap.set(entry.substance, {
      substance: entry.substance,
      baseline:
        entry.baselineLimitPpm ??
        baselineMap.get(entry.substance)?.baseline ??
        entry.limitPpm,
      limit: entry.limitPpm
    });
  }
  return Array.from(baselineMap.values());
}

