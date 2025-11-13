"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell
} from "recharts";

import type { RiskSummary } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

const donutColors = ["#34d399", "#60a5fa", "#fbbf24", "#f87171"];

type RiskVisualizationProps = {
  risk: RiskSummary;
};

export function RiskVisualization({ risk }: RiskVisualizationProps) {
  const frameworkData = risk.frameworks.map((framework) => ({
    ...framework,
    percent: Math.round(framework.percent * 100)
  }));
  const topGaps = risk.gaps;

  return (
    <SectionCard
      title="Risk Visualization"
      description="Risk score, framework saturation, trend, supplier exposure, and supplier gaps (Architecture §6)."
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-400">Composite risk score</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-white">{risk.riskScore.score}</span>
            <span className="text-sm text-slate-400">/ 100</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${risk.riskScore.score}%` }}
            />
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {risk.riskScore.components.map((component) => (
              <li key={component.id} className="flex items-center justify-between">
                <span className="text-slate-400">{component.label}</span>
                <span className="font-medium text-white">
                  {Math.round(component.penalty).toLocaleString()}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 lg:col-span-2">
          <p className="text-sm text-slate-400">Top supplier gaps</p>
          <div className="mt-4 space-y-4">
            {topGaps.length === 0 && (
              <p className="text-sm text-slate-500">No outstanding supplier gaps detected.</p>
            )}
            {topGaps.map((gap) => (
              <div
                key={gap.supplierId ?? gap.supplierName}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{gap.supplierName}</p>
                  <p className="text-xs text-slate-400">
                    {gap.missing} missing · {gap.expired} expired · {gap.overLimit} over limit
                  </p>
                </div>
                <div className="flex flex-col text-right text-xs text-slate-400">
                  <span>
                    Next expiry:{' '}
                    {gap.nextExpiryDays == null
                      ? 'n/a'
                      : `${Math.max(Math.round(gap.nextExpiryDays), 0)}d`}
                  </span>
                  <span>
                    Response avg:{' '}
                    {gap.responseAvgDays == null ? 'n/a' : `${gap.responseAvgDays.toFixed(1)}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-400">Framework coverage</p>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={frameworkData}
                innerRadius={60}
                outerRadius={90}
                dataKey="percent"
                nameKey="name"
                paddingAngle={4}
              >
                {frameworkData.map((entry, index) => (
                  <Cell key={entry.name} fill={donutColors[index % donutColors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                formatter={(value: number) => `${value}%`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="h-64 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-400">Risk trend (rolling 6 weeks)</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={risk.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" domain={[40, 95]} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                formatter={(value: number) => `${value}/100`}
              />
              <Line type="monotone" dataKey="score" stroke="#60a5fa" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-64 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-400">Supplier exposure map</p>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" dataKey="incidents" name="incidents" stroke="#94a3b8" />
              <YAxis type="number" dataKey="exposure" name="exposure" stroke="#94a3b8" />
              <ZAxis type="number" dataKey="exposure" range={[60, 200]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }} />
              <Scatter
                data={
                  risk.supplierExposure.length
                    ? risk.supplierExposure
                    : [{ supplierName: "No incidents", incidents: 0, exposure: 0, supplierId: "none" }]
                }
                fill="#fbbf24"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  );
}
