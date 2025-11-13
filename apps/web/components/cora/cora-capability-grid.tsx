import { SectionCard } from "@/components/ui/section-card";

type Capability = {
  name: string;
  endpoint: string;
  summary: string;
  bullets: string[];
  badge: string;
};

const capabilities: Capability[] = [
  {
    name: "AI Document Parser",
    endpoint: "POST /ai/parse-document",
    summary:
      "Converts PDF/SDS/CofC files into the certificate_v1 schema with unit normalization before compliance ingestion.",
    bullets: [
      "Implements Architecture.md §4 Prompt 1 with schema validation + retry/repair",
      "Streams signed document URLs from File/Document (§1) into the CORA sidecar",
      "Persists findings + ambiguities to compliance ingestion issues so Ops Center can react"
    ],
    badge: "certificate_v1"
  },
  {
    name: "Supplier Outreach Copilot",
    endpoint: "POST /ai/supplier-email",
    summary:
      "Drafts localized RoHS/REACH chasers that cite missing certificates, due dates, and secure upload links per §4 Prompt 2.",
    bullets: [
      "Enriches prompts with supplier response averages + language from Architecture.md §3 data model",
      "Calculates due dates (avg response + 2 days) so workflows stay SLA-aware",
      "Logs model/tone metadata to audit_logs for downstream review"
    ],
    badge: "localized outreach"
  },
  {
    name: "Risk Summary Bot",
    endpoint: "POST /ai/risk-summary",
    summary: "Produces exec-ready summaries (traffic-light, supplier gaps, expirations) grounded in merged BOM data (§4 Prompt 3).",
    bullets: [
      "Pulls Compliance status + Supplier KPIs from the dashboard snapshot",
      "Expands calculations before emitting prose so reviewers can trace reasoning",
      "Feeds results into RiskVisualization + alerting queues for end-to-end parity"
    ],
    badge: "risk synopsis"
  }
];

export function CoraCapabilityGrid() {
  return (
    <SectionCard
      title="CORA Capability Grid"
      description="Surfaced endpoints + prompts from Architecture.md §4 so stakeholders can see what is wired today."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {capabilities.map((capability) => (
          <article key={capability.endpoint} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{capability.endpoint}</span>
              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                {capability.badge}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-white">{capability.name}</h3>
            <p className="mt-2 text-sm text-slate-300">{capability.summary}</p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-400">
              {capability.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
