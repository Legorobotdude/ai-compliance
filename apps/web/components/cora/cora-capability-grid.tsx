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
      "Converts PDF/SDS/Certificate files into structured data with unit normalization for compliance tracking.",
    bullets: [
      "Validates certificate schema with automatic retry and repair on errors",
      "Processes signed document URLs from the document storage system",
      "Records parsing issues for operations team review"
    ],
    badge: "certificate_v1"
  },
  {
    name: "Supplier Outreach Copilot",
    endpoint: "POST /ai/supplier-email",
    summary:
      "Generates localized compliance request emails with missing certificate details, due dates, and secure upload links.",
    bullets: [
      "Personalizes emails using supplier response history and preferred language",
      "Calculates realistic due dates based on supplier average response time plus buffer",
      "Logs all generated content to audit trail for compliance review"
    ],
    badge: "localized outreach"
  },
  {
    name: "Risk Summary Bot",
    endpoint: "POST /ai/risk-summary",
    summary: "Creates executive summaries highlighting compliance status, supplier gaps, and certificate expirations.",
    bullets: [
      "Analyzes compliance metrics and supplier performance from dashboard data",
      "Shows calculation steps for transparency and traceability",
      "Integrates with risk visualization and alerting systems"
    ],
    badge: "risk synopsis"
  }
];

export function CoraCapabilityGrid() {
  return (
    <SectionCard
      title="CORA AI Capabilities"
      description="AI-powered compliance operations with document parsing, supplier outreach, and risk analysis."
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
