import { SectionCard } from "@/components/ui/section-card";

type SupplierWorkflowChecklistProps = {
  bomExternalId: string;
};

export function SupplierWorkflowChecklist({ bomExternalId }: SupplierWorkflowChecklistProps) {
  return (
    <SectionCard
      title="Testing Guide"
      description="Validate supplier workflows and data consistency."
    >
      <ol className="list-decimal space-y-3 pl-4 text-sm text-slate-300">
        <li>
          Run <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">node scripts/supplier-smoke.mjs</code>{" "}
          to verify <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">/dashboard/snapshot</code> returns
          suppliers and BOM {bomExternalId} with correct user associations.
        </li>
        <li>
          Use the Scorecard Probe to test <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">/supplier/scorecard/:supplierId</code> endpoint
          and verify SLA metrics, contact information, and blocked component lists.
        </li>
        <li>
          Create a supplier request via the console and verify the response includes request ID, blocked parts list, and
          AI-generated email draft matching expected format.
        </li>
        <li>
          Confirm database persistence by checking that <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">supplier_requests</code> table
          contains correct status, due date, sent timestamp, and audit log entries.
        </li>
      </ol>
    </SectionCard>
  );
}

