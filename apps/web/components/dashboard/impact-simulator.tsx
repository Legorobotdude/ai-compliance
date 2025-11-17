"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { DashboardSnapshot } from "@/lib/types/dashboard";

import { SectionCard } from "@/components/ui/section-card";
import { statusClass } from "@/lib/status";

type ImpactScenario = DashboardSnapshot["impact"];
type ImpactHistory = DashboardSnapshot["impactHistory"];
type RiskDataFreshness = DashboardSnapshot["riskDataFreshness"];
type ImpactOptions = DashboardSnapshot["impactOptions"];
type SupplierOption = { id: string; name: string };
type AssemblyOption = { id: string; name?: string | null };
type VectorRow = { substance: string; baseline: number; value: number };

type ImpactSimulatorProps = {
  bomId: string;
  regulationCode: string;
  initialScenario: ImpactScenario;
  history: ImpactHistory;
  freshness: RiskDataFreshness;
  options: ImpactOptions;
  supplierOptions: SupplierOption[];
  assemblyOptions: AssemblyOption[];
};

const SLIDER_MIN = 5;
const SLIDER_MAX = 1000;

export function ImpactSimulator({
  bomId,
  regulationCode,
  initialScenario,
  history,
  freshness,
  options,
  supplierOptions,
  assemblyOptions
}: ImpactSimulatorProps) {
  const defaultRegulation = options?.defaultRegulation ?? regulationCode;
  const [scenario, setScenario] = useState<ImpactScenario>(initialScenario);
  const [selectedRegulation, setSelectedRegulation] = useState(defaultRegulation);
  const [vectorRows, setVectorRows] = useState<VectorRow[]>(() =>
    buildVectorRows(resolveInitialLimits(options, initialScenario, defaultRegulation))
  );
  const [limit, setLimit] = useState(initialScenario.newLimitPpm);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [selectedAssemblies, setSelectedAssemblies] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const initializedRef = useRef(false);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    setScenario(initialScenario);
    if (!userInteractedRef.current) {
      setSelectedRegulation(defaultRegulation);
      setVectorRows(buildVectorRows(resolveInitialLimits(options, initialScenario, defaultRegulation)));
      setLimit(initialScenario.newLimitPpm);
    }
  }, [initialScenario, options, defaultRegulation]);

  useEffect(() => {
    if (!vectorRows.length) {
      return;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
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
              regulationCode: selectedRegulation,
              bomId,
              limitVector: vectorRows.map((row) => ({
                substance: row.substance,
                limitPpm: row.value
              })),
              ...(selectedSuppliers.length ? { supplierIds: selectedSuppliers } : {}),
              ...(selectedAssemblies.length ? { assemblyIds: selectedAssemblies } : {})
            }),
            signal: controller.signal
          });
          if (!response.ok) {
            throw new Error(`Impact API failed: ${response.status}`);
          }
          const data = (await response.json()) as ImpactScenario;
          setScenario(data);
          setLimit(data.newLimitPpm);
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
  }, [
    vectorRows,
    selectedRegulation,
    selectedSuppliers,
    selectedAssemblies,
    bomId,
    startTransition
  ]);

  const baseLimit = scenario.oldLimitPpm || vectorRows[0]?.baseline || SLIDER_MAX;
  const sliderMin = Math.max(1, Math.min(SLIDER_MIN, baseLimit / 2));
  const sliderMax = Math.max(SLIDER_MAX, baseLimit * 2);
  const tightenedPct = baseLimit ? Math.round(((baseLimit - limit) / baseLimit) * 100) : 0;

  const recentHistory = useMemo(() => history.slice(0, 5), [history]);
  const { overLimitCount, compliantCount } = useMemo(() => {
    const over = scenario.deltas.filter((delta) => delta.after === "OVER_LIMIT").length;
    return { overLimitCount: over, compliantCount: scenario.deltas.length - over };
  }, [scenario.deltas]);
  const summaryStats = useMemo(() => {
    const parts = scenario.summary?.affectedParts ?? scenario.deltas.length;
    const suppliers =
      scenario.summary?.affectedSuppliers ??
      new Set(
        scenario.deltas.map((delta) => delta.supplierId ?? `unassigned:${delta.partNumber}`)
      ).size;
    const assemblies =
      scenario.summary?.affectedAssemblies ?? new Set(scenario.deltas.map((delta) => delta.assemblyId)).size;
    return { parts, suppliers, assemblies };
  }, [scenario.deltas, scenario.summary]);
  const supplierChoices = useMemo(
    () => supplierOptions.filter((option) => Boolean(option.id)),
    [supplierOptions]
  );
  const assemblyChoices = useMemo(
    () => assemblyOptions.filter((option) => Boolean(option.id)),
    [assemblyOptions]
  );
  const hasFilters = selectedSuppliers.length > 0 || selectedAssemblies.length > 0;

  const handleGlobalLimitChange = (value: number) => {
    userInteractedRef.current = true;
    setLimit(value);
    setVectorRows((rows) => {
      const referenceBaseline = rows[0]?.baseline ?? 1;
      const ratio = referenceBaseline > 0 ? value / referenceBaseline : 1;
      return rows.map((row, index) => {
        const nextValue =
          index === 0 ? Math.max(1, Math.round(value)) : Math.max(1, Math.round(row.baseline * ratio));
        return { ...row, value: nextValue };
      });
    });
  };

  const handleRegulationChange = (code: string) => {
    userInteractedRef.current = true;
    setSelectedRegulation(code);
    const nextLimits = resolveInitialLimits(options, scenario, code);
    const rows = buildVectorRows(nextLimits);
    setVectorRows(rows);
    if (rows[0]) {
      setLimit(rows[0].value);
    }
  };

  const handleSubstanceChange = (substance: string, value: number) => {
    userInteractedRef.current = true;
    setVectorRows((rows) =>
      rows.map((row, index) => {
        if (row.substance !== substance) {
          return row;
        }
        const nextValue = Math.max(1, Math.round(value));
        if (index === 0) {
          setLimit(nextValue);
        }
        return { ...row, value: nextValue };
      })
    );
  };

  const toggleSupplier = (id: string) => {
    userInteractedRef.current = true;
    setSelectedSuppliers((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleAssembly = (id: string) => {
    userInteractedRef.current = true;
    setSelectedAssemblies((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const clearFilters = () => {
    userInteractedRef.current = true;
    setSelectedSuppliers([]);
    setSelectedAssemblies([]);
  };

  return (
    <SectionCard
      title="Impact Simulator"
      description={`Playground for ${selectedRegulation} limit downgrades feeding /impact/predict.`}
      actions={
        <div className="flex flex-col gap-1 text-xs text-slate-400 sm:flex-row sm:items-center sm:gap-3">
          <span>Regulation: {selectedRegulation}</span>
          <span>Global limit: {limit.toLocaleString()} ppm</span>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Global limit (scales all substances)</p>
          <input
            className="w-full accent-brand-500"
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={5}
            value={limit}
            onChange={(event) => handleGlobalLimitChange(Number(event.currentTarget.value))}
          />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>
              Baseline <span className="font-semibold text-white">{Math.round(baseLimit).toLocaleString()} ppm</span>
            </span>
            <span>
              Scenario delta {tightenedPct}% tighter ·{" "}
              <span className="text-red-300">{overLimitCount} over limit</span> /
              <span className="text-emerald-300"> {Math.max(compliantCount, 0)} compliant</span>
            </span>
            {isPending ? <span className="text-xs text-slate-500">Recomputing…</span> : null}
            {error ? <span className="text-xs text-red-400">{error}</span> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Affected parts" value={summaryStats.parts} />
          <StatCard label="Suppliers" value={summaryStats.suppliers} />
          <StatCard label="Assemblies" value={summaryStats.assemblies} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.7fr,1fr]">
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Regulation</p>
              <select
                value={selectedRegulation}
                onChange={(event) => handleRegulationChange(event.currentTarget.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              >
                {options.regulations.map((reg) => (
                  <option key={reg.code} value={reg.code}>
                    {reg.name} ({reg.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {vectorRows.length ? (
                vectorRows.map((row) => (
                  <SubstanceControl
                    key={row.substance}
                    row={row}
                    onChange={(value) => handleSubstanceChange(row.substance, value)}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No baseline limits available for this regulation. Adjustments are disabled.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Filters</p>
            <FilterGroup
              label="Suppliers"
              options={supplierChoices}
              selected={selectedSuppliers}
              onToggle={toggleSupplier}
            />
            <FilterGroup
              label="Assemblies"
              options={assemblyChoices}
              selected={selectedAssemblies}
              onToggle={toggleAssembly}
            />
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-brand-300 hover:text-brand-200 focus:outline-none"
              >
                Clear filters
              </button>
            ) : null}
          </div>
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
            <p className="px-4 py-3 text-sm text-slate-500">No parts flip state under the current configuration.</p>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ScenarioHistory history={recentHistory} />
          <FreshnessPanel freshness={freshness} />
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

function SubstanceControl({ row, onChange }: { row: VectorRow; onChange: (value: number) => void }) {
  const sliderMax = Math.max(row.baseline * 2, row.value, 10);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-3 text-sm text-white">
        <p className="font-semibold">{row.substance}</p>
        <input
          type="number"
          min={1}
          value={row.value}
          onChange={(event) => onChange(Number(event.currentTarget.value) || 1)}
          className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm text-white focus:border-brand-400 focus:outline-none"
        />
      </div>
      <input
        type="range"
        min={1}
        max={sliderMax}
        step={1}
        value={row.value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-2 w-full accent-brand-500"
      />
      <p className="mt-1 text-xs text-slate-500">Baseline {row.baseline.toLocaleString()} ppm</p>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle
}: {
  label: string;
  options: Array<{ id: string; name?: string | null }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {options.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => {
            if (!option.id) {
              return null;
            }
            const isActive = selected.includes(option.id);
            return (
              <button
                type="button"
                key={option.id}
                onClick={() => onToggle(option.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-brand-400 bg-brand-500/20 text-brand-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}
              >
                {option.name ?? option.id}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No {label.toLowerCase()} available.</p>
      )}
    </div>
  );
}

function ScenarioHistory({ history }: { history: ImpactHistory }) {
  if (!history.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
        No saved scenarios yet. Move the slider to persist deltas for quick comparisons.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Recent scenarios</p>
      <ul className="mt-3 space-y-3">
        {history.map((record) => {
          const timestamp =
            formatTimestamp(record.payload.recordedAtIso || record.createdAt) ?? "Unknown time";
          const summary = record.payload.summary;
          const parts = summary?.affectedParts ?? record.payload.deltas.length;
          const suppliers = summary?.affectedSuppliers ?? "-";
          return (
            <li key={record.id} className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-3">
              <p className="text-sm font-semibold text-white">
                {record.payload.regulationCode} · {timestamp}
              </p>
              <p className="text-xs text-slate-400">
                Parts: <span className="text-white">{parts}</span> · Suppliers:{" "}
                <span className="text-white">{suppliers}</span> · Assemblies:{" "}
                <span className="text-white">{summary?.affectedAssemblies ?? "-"}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FreshnessPanel({ freshness }: { freshness: RiskDataFreshness }) {
  const entries: Array<{ label: string; value?: string | null }> = [
    { label: "BOM components", value: freshness.bomComponentsUpdatedAt },
    { label: "Certificates", value: freshness.certificatesUpdatedAt },
    { label: "Suppliers", value: freshness.supplierUpdatedAt },
    { label: "Impact scenarios", value: freshness.scenarioUpdatedAt },
    { label: "Data cursor", value: freshness.latestCursor }
  ];
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Risk data freshness</p>
      <dl className="mt-3 space-y-2 text-sm">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center justify-between text-slate-400">
            <dt>{entry.label}</dt>
            <dd className="font-mono text-xs text-white">{formatTimestamp(entry.value) ?? "n/a"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatTimestamp(iso?: string | null) {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function buildVectorRows(limits?: Array<{ substance: string; limitPpm: number }>): VectorRow[] {
  if (!Array.isArray(limits)) {
    return [];
  }
  return limits.map((limit) => ({
    substance: limit.substance,
    baseline: limit.limitPpm,
    value: limit.limitPpm
  }));
}

function resolveInitialLimits(
  options: ImpactOptions,
  scenario: ImpactScenario,
  regulationCode: string
): Array<{ substance: string; limitPpm: number }> {
  if (scenario.regulation === regulationCode && scenario.baselineLimits.length) {
    return scenario.baselineLimits;
  }
  return findRegulationLimits(options, regulationCode);
}

function findRegulationLimits(options: ImpactOptions, regulationCode: string) {
  return options.regulations.find((reg) => reg.code === regulationCode)?.limits ?? [];
}
