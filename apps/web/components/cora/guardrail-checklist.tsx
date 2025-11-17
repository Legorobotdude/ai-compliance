import { SectionCard } from "@/components/ui/section-card";

type Guardrail = {
  label: string;
  detail: string;
  status: "implemented" | "planned";
};

const guardrails: Guardrail[] = [
  {
    label: "Schema validation",
    detail: "Certificate data validated with automatic retry on parsing errors.",
    status: "implemented"
  },
  {
    label: "Unit normalization",
    detail: "Automatic conversion: % → ppm, mg/kg passthrough. Unknown units flagged for review.",
    status: "implemented"
  },
  {
    label: "Audit logging",
    detail: "All AI calls logged with hashed prompts, latency metrics, and model information.",
    status: "implemented"
  },
  {
    label: "PII protection",
    detail: "Sensitive contact information redacted before sending to AI, with full audit trail.",
    status: "implemented"
  },
  {
    label: "Rate limiting",
    detail: "Per-tenant throttling with retry and backoff to control AI service costs.",
    status: "implemented"
  }
];

const statusClass: Record<Guardrail["status"], string> = {
  implemented: "bg-emerald-500/15 text-emerald-200",
  planned: "bg-amber-500/15 text-amber-200"
};

export function GuardrailChecklist() {
  return (
    <SectionCard title="AI Safety Guardrails" description="Security and governance controls for AI-powered compliance operations.">
      <ul className="space-y-3">
        {guardrails.map((guardrail) => (
          <li key={guardrail.label} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-white">{guardrail.label}</p>
              <span className={`rounded-full px-3 py-1 text-xs ${statusClass[guardrail.status]}`}>
                {guardrail.status === "implemented" ? "In place" : "Planned"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-300">{guardrail.detail}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
