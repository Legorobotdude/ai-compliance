import { SectionCard } from "@/components/ui/section-card";

type Guardrail = {
  label: string;
  detail: string;
  status: "implemented" | "planned";
};

const guardrails: Guardrail[] = [
  {
    label: "Deterministic schema validation",
    detail: "certificate_v1 validated via ajv/pydantic + retries (Architecture.md §4).",
    status: "implemented"
  },
  {
    label: "Unit normalization & range checks",
    detail: "% → ppm, mg/kg passthrough, unknown units flagged for Ops Center (§5).",
    status: "implemented"
  },
  {
    label: "Prompt hashing & audit logs",
    detail: "Hash stored instead of raw prompt, latency + model persisted (Architecture.md §7).",
    status: "implemented"
  },
  {
    label: "PII scrubbing",
    detail: "Supplier emails/contacts redacted before prompt send, logged to audit trail (§4 Guardrails).",
    status: "implemented"
  },
  {
    label: "Spend throttling",
    detail: "Per-tenant rate limits + retry/backoff keep burst usage within Architecture.md constraints.",
    status: "implemented"
  }
];

const statusClass: Record<Guardrail["status"], string> = {
  implemented: "bg-emerald-500/15 text-emerald-200",
  planned: "bg-amber-500/15 text-amber-200"
};

export function GuardrailChecklist() {
  return (
    <SectionCard title="Guardrail Checklist" description="Mirror of Architecture.md §4 guardrails + §7 observability hooks.">
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
