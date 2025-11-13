import { SectionCard } from "@/components/ui/section-card";

export type CoraTelemetryMetrics = {
  totalCalls: number;
  successCount: number;
  retryCount: number;
  failureCount: number;
  avgLatencyMs: number;
  lastCallAt?: string;
};

type MetricsConfigKey = "totalCalls" | "successRate" | "avgLatencyMs" | "retryCount" | "failureCount" | "lastCallAt";

type MetricValue = number | string | null;

const metricsConfig: Array<{ key: MetricsConfigKey; label: string; format: (value: MetricValue) => string }> = [
  { key: "totalCalls", label: "LLM calls", format: (value) => Number(value ?? 0).toLocaleString() },
  {
    key: "successRate",
    label: "Success rate",
    format: (value) => `${Number(value ?? 0).toFixed(1)}%`
  },
  {
    key: "avgLatencyMs",
    label: "Avg latency",
    format: (value) => `${Math.round(Number(value ?? 0))} ms`
  },
  {
    key: "retryCount",
    label: "Retries",
    format: (value) => Number(value ?? 0).toLocaleString()
  },
  {
    key: "failureCount",
    label: "Failures",
    format: (value) => Number(value ?? 0).toLocaleString()
  },
  {
    key: "lastCallAt",
    label: "Last call",
    format: (value) => (typeof value === "string" && value ? new Date(value).toLocaleString() : "—")
  }
];

type MetricSlice = Record<MetricsConfigKey, MetricValue>;

function shapeMetrics(metrics: CoraTelemetryMetrics): MetricSlice {
  const successRate = metrics.totalCalls ? (metrics.successCount / metrics.totalCalls) * 100 : 0;
  return {
    totalCalls: metrics.totalCalls,
    successRate,
    avgLatencyMs: metrics.avgLatencyMs,
    retryCount: metrics.retryCount,
    failureCount: metrics.failureCount,
    lastCallAt: metrics.lastCallAt ?? null
  };
}

export function CoraTelemetryPanel({ metrics }: { metrics: CoraTelemetryMetrics }) {
  const shaped = shapeMetrics(metrics);

  return (
    <SectionCard
      title="CORA Telemetry"
      description="Derived from Architecture.md §§4 & 7 guardrails — prompt hashing, retries, and latency budgets surfaced from llm_calls/audit_logs."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {metricsConfig.map(({ key, label, format }) => (
          <div key={key} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{format(shaped[key])}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
