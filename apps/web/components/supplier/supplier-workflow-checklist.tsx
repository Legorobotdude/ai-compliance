import { SectionCard } from "@/components/ui/section-card";

type SupplierWorkflowChecklistProps = {
  bomExternalId: string;
};

export function SupplierWorkflowChecklist({ bomExternalId }: SupplierWorkflowChecklistProps) {
  return (
    <SectionCard
      title="Smoke test playbook"
      description="Pair this UI with scripts/supplier-smoke.mjs to validate Architecture §5 workflows end-to-end."
    >
      <ol className="list-decimal space-y-3 pl-4 text-sm text-slate-300">
        <li>
          Run <code className="rounded bg-slate-900 px-2 py-1 font-mono text-xs">node scripts/supplier-smoke.mjs</code>{" "}
          to confirm `/dashboard/snapshot` has seeded suppliers + BOM {bomExternalId}. The script also resolves{" "}
          <code>requestedBy</code> from Postgres.
        </li>
        <li>
          Use the Scorecard Probe above to hit `/supplier/scorecard/:supplierId` repeatedly while tweaking data—verifies
          the SLA metrics, contact lists, and blocked parts the script asserts for (Architecture §5 table refs).
        </li>
        <li>
          Draft a request via the console, then check the script output: it creates the row, pulls blocked parts, and
          prints the CORA draft exactly like the UI response. Compare IDs/timestamps to ensure parity.
        </li>
        <li>
          Hop into psql (or rerun the script’s verification step) to confirm `supplier_requests.status`, `due_at`,
          `sent_at`, and `audit_logs` rows were updated. This finalizes the smoke test by proving persistence +
          observability.
        </li>
      </ol>
    </SectionCard>
  );
}

