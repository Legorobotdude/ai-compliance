"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Cell
} from "recharts";

import type { RiskSummary } from "@/lib/types/dashboard";
import { SectionCard } from "@/components/ui/section-card";

type RiskVisualizationProps = {
  risk: RiskSummary;
};

// Helper function to determine bar color based on coverage percentage
function getCoverageColor(percent: number): string {
  if (percent >= 80) return "#34d399"; // green
  if (percent >= 50) return "#fbbf24"; // yellow
  return "#f87171"; // red
}

export function RiskVisualization({ risk }: RiskVisualizationProps) {
  // Sort frameworks by coverage (lowest first to highlight risks)
  const frameworkData = (risk.frameworks ?? [])
    .map((framework) => ({
      ...framework,
      percent: Math.round(framework.percent * 100),
      fill: getCoverageColor(framework.percent * 100)
    }))
    .sort((a, b) => a.percent - b.percent);
  const hasFrameworkData = frameworkData.length > 0;

  const topGaps = risk.gaps;

  // Calculate dynamic Y-axis domain for trend chart
  const trendScores = risk.trend.map(t => t.score);
  const minScore = Math.min(...trendScores);
  const maxScore = Math.max(...trendScores);
  const padding = (maxScore - minScore) * 0.1 || 5; // 10% padding or minimum 5 points
  const yAxisDomain = [
    Math.max(0, Math.floor(minScore - padding)),
    Math.min(100, Math.ceil(maxScore + padding))
  ];

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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Framework Coverage - Horizontal Bar Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-white">Framework Coverage</p>
            <p className="text-xs text-slate-400 mt-1">Sorted by coverage (lowest risk first)</p>
          </div>
          {hasFrameworkData ? (
            <ResponsiveContainer width="100%" height={Math.max(200, frameworkData.length * 60)}>
              <BarChart data={frameworkData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" tick={{ fill: "#94a3b8" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#94a3b8"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  width={150}
                />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                  itemStyle={{ color: "#ffffff" }}
                  labelStyle={{ color: "#ffffff" }}
                  formatter={(value: number) => `${value}%`}
                />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                  {frameworkData.map((entry) => (
                    <Cell key={entry.code ?? entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500">
              Framework coverage will populate after regulations from Architecture.md §5-§6 have data.
            </p>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-red-400" />
              <span>&lt;50% High Risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-yellow-400" />
              <span>50-80% Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-green-400" />
              <span>&gt;80% Good</span>
            </div>
          </div>
        </div>

        {/* Risk Trend - Enhanced Line Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-white">Risk Trend</p>
            <p className="text-xs text-slate-400 mt-1">Rolling 6-week performance</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={risk.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <YAxis
                stroke="#94a3b8"
                domain={yAxisDomain}
                tick={{ fill: "#94a3b8" }}
                label={{ value: 'Risk Score (0-100)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px" }}
                itemStyle={{ color: "#ffffff" }}
                labelStyle={{ color: "#ffffff" }}
                formatter={(value: number) => `${value}/100`}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#60a5fa"
                strokeWidth={3}
                dot={{ fill: "#60a5fa", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Supplier Risk Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-4">
          <p className="text-sm font-medium text-white">Highest Risk Suppliers</p>
          <p className="text-xs text-slate-400 mt-1">Based on compliance incidents and parts exposure</p>
        </div>
        {risk.supplierExposure.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">No supplier risk data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="pb-3 text-left font-medium text-slate-300">Supplier</th>
                  <th className="pb-3 text-right font-medium text-slate-300">Parts Exposure</th>
                  <th className="pb-3 text-right font-medium text-slate-300">Incidents</th>
                  <th className="pb-3 text-right font-medium text-slate-300">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {risk.supplierExposure
                  .sort((a, b) => (b.incidents * b.exposure) - (a.incidents * a.exposure))
                  .slice(0, 5)
                  .map((supplier) => {
                    const riskScore = supplier.incidents * supplier.exposure;
                    const riskLevel = riskScore > 100 ? 'High' : riskScore > 50 ? 'Medium' : 'Low';
                    const riskColor = riskLevel === 'High' ? 'text-red-400' : riskLevel === 'Medium' ? 'text-yellow-400' : 'text-green-400';

                    return (
                      <tr key={supplier.supplierId ?? supplier.supplierName} className="border-b border-slate-800/50">
                        <td className="py-3 text-slate-200">{supplier.supplierName}</td>
                        <td className="py-3 text-right text-slate-300">{supplier.exposure}</td>
                        <td className="py-3 text-right text-slate-300">{supplier.incidents}</td>
                        <td className={`py-3 text-right font-medium ${riskColor}`}>{riskLevel}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
