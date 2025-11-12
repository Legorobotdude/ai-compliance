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

  return (
    <SectionCard
      title="Risk Visualization"
      description="Framework saturation, trend, and supplier exposure (Architecture §6)."
      className="space-y-6"
    >
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
