import { useEffect, useState } from "react";
import { DetailPanel } from "@/components/ui/operations";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { type AmendmentRecord, type DepositSecurityPreview, getAdminDepositSecurityPreview } from "@/services/amendments";

export default function DepositSecurityPreviewPanel({ amendment }: { amendment: AmendmentRecord }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DepositSecurityPreview | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getAdminDepositSecurityPreview(amendment.id);
        setPreview(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load deposit/security preview.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [amendment.id]);

  if (loading) {
    return (
      <DetailPanel title="Deposit / Security Amendment Preview" description="Loading preview data...">
        <ERPLoadingState />
      </DetailPanel>
    );
  }

  if (error || !preview) {
    return (
      <DetailPanel title="Deposit / Security Amendment Preview" description="Preview failed to load.">
        <ERPErrorState description={error || "Unknown error"} />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel title="Deposit / Security Amendment Preview" description="Preview-only mode. Execution is not enabled yet. Deposit/security amendments require a dedicated liability, refund/deduction, accounting, and reconciliation workflow.">
      <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Contract Details</div>
          <div className="mt-2 text-muted-foreground">Ref: <span className="font-medium text-foreground">{preview.current_contract_reference || "—"}</span></div>
          <div className="mt-1 text-muted-foreground">Customer: <span className="font-medium text-foreground">{preview.customer_name || "—"}</span></div>
        </div>
        
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Deposit Values</div>
          <div className="mt-2 text-muted-foreground">Current Amount: <span className="font-medium text-foreground">{preview.current_deposit_amount || "—"}</span></div>
          {preview.requested_deposit_amount && (
            <div className="mt-1 text-orange-600 dark:text-orange-400 font-medium">Requested: {preview.requested_deposit_amount}</div>
          )}
          <div className="mt-2 text-muted-foreground">Status: <span className="font-medium text-foreground">{preview.current_deposit_status || "—"}</span></div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Activity Snapshot</div>
          <div className="mt-2 text-muted-foreground">Received: <span className="font-medium text-foreground">{preview.deposit_received_amount || "—"}</span></div>
          <div className="mt-1 text-muted-foreground">Refunded: <span className="font-medium text-foreground">{preview.deposit_refunded_amount || "—"}</span></div>
          <div className="mt-1 text-muted-foreground">Deducted: <span className="font-medium text-foreground">{preview.deposit_deducted_amount || "—"}</span></div>
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-900/10 p-3 md:col-span-2 lg:col-span-3">
          <div className="text-xs font-semibold uppercase text-orange-800 dark:text-orange-200">Impact Analysis & Risk</div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Liability Impact</dt><dd className="font-medium text-foreground">{preview.liability_impact_category || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Refund / Deduction Risk</dt><dd className="font-medium text-foreground">{preview.refund_deduction_risk || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Accounting Impact</dt><dd className="font-medium text-foreground">{preview.accounting_impact_category || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Reconciliation Impact</dt><dd className="font-medium text-foreground">{preview.reconciliation_impact_category || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Possession / Handover Risk</dt><dd className="font-medium text-foreground">{preview.possession_handover_risk || "—"}</dd></div>
          </dl>
          
          {preview.blocker_reasons && preview.blocker_reasons.length > 0 && (
            <div className="mt-4 pt-3 border-t border-orange-200 dark:border-orange-900/50">
              <div className="text-xs font-semibold uppercase text-red-600 dark:text-red-400 mb-2">Blockers</div>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {preview.blocker_reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </DetailPanel>
  );
}
