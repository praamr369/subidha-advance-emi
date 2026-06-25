import { useEffect, useState } from "react";
import { DetailPanel } from "@/components/ui/operations";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import type { AmendmentRecord } from "@/services/amendments";
import { apiFetch } from "@/lib/api";

type RentLeasePreviewResponse = {
  current_contract_reference: string | null;
  customer_name: string | null;
  current_product: string | null;
  requested_product_id: number | null;
  current_monthly_amount: string | null;
  requested_monthly_amount: string | null;
  current_tenure_months: number | null;
  requested_tenure_months: number | null;
  current_deposit_amount: string | null;
  requested_deposit_amount: string | null;
  deposit_liability_risk: string | null;
  demand_schedule_impact_summary: string | null;
  paid_demand_count: string | null;
  pending_demand_count: string | null;
  accounting_impact_category: string | null;
  reconciliation_impact_category: string | null;
  delivery_possession_risk: string | null;
  execution_supported: boolean;
  blocker_reasons: string[];
};

export default function RentLeasePreviewPanel({ amendment }: { amendment: AmendmentRecord }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RentLeasePreviewResponse | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await apiFetch<RentLeasePreviewResponse>(`/admin/contract-amendments/${amendment.id}/rent-lease-preview/`);
        setPreview(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rent/lease preview.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [amendment.id]);

  if (loading) {
    return (
      <DetailPanel title="Rent / Lease Amendment Preview" description="Loading preview data...">
        <ERPLoadingState />
      </DetailPanel>
    );
  }

  if (error || !preview) {
    return (
      <DetailPanel title="Rent / Lease Amendment Preview" description="Preview failed to load.">
        <ERPErrorState description={error || "Unknown error"} />
      </DetailPanel>
    );
  }

  return (
    <DetailPanel title="Rent / Lease Amendment Preview" description="Preview-only mode. Execution is deferred until rent/lease accounting and reconciliation workflow exists.">
      <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Contract Details</div>
          <div className="mt-2 text-muted-foreground">Ref: <span className="font-medium text-foreground">{preview.current_contract_reference || "—"}</span></div>
          <div className="mt-1 text-muted-foreground">Customer: <span className="font-medium text-foreground">{preview.customer_name || "—"}</span></div>
        </div>
        
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Asset & Tenure</div>
          <div className="mt-2 text-muted-foreground">Asset: <span className="font-medium text-foreground">{preview.current_product || "—"}</span></div>
          {preview.requested_product_id && (
            <div className="mt-1 text-orange-600 dark:text-orange-400 font-medium">Req Asset ID: {preview.requested_product_id}</div>
          )}
          <div className="mt-2 text-muted-foreground">Tenure: <span className="font-medium text-foreground">{preview.current_tenure_months || "—"}</span> mos</div>
          {preview.requested_tenure_months && (
            <div className="mt-1 text-orange-600 dark:text-orange-400 font-medium">Req Tenure: {preview.requested_tenure_months} mos</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Financials</div>
          <div className="mt-2 text-muted-foreground">Monthly: <span className="font-medium text-foreground">{preview.current_monthly_amount || "—"}</span></div>
          {preview.requested_monthly_amount && (
            <div className="mt-1 text-orange-600 dark:text-orange-400 font-medium">Req Monthly: {preview.requested_monthly_amount}</div>
          )}
          <div className="mt-2 text-muted-foreground">Deposit: <span className="font-medium text-foreground">{preview.current_deposit_amount || "—"}</span></div>
          {preview.requested_deposit_amount && (
            <div className="mt-1 text-orange-600 dark:text-orange-400 font-medium">Req Deposit: {preview.requested_deposit_amount}</div>
          )}
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-900/10 p-3 md:col-span-2 lg:col-span-3">
          <div className="text-xs font-semibold uppercase text-orange-800 dark:text-orange-200">Impact Analysis & Risk</div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Demand Schedule</dt><dd className="font-medium text-foreground">{preview.demand_schedule_impact_summary || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Accounting Impact</dt><dd className="font-medium text-foreground">{preview.accounting_impact_category || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Reconciliation Impact</dt><dd className="font-medium text-foreground">{preview.reconciliation_impact_category || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Deposit Liability Risk</dt><dd className="font-medium text-foreground">{preview.deposit_liability_risk || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Paid / Pending Demands</dt><dd className="font-medium text-foreground">{preview.paid_demand_count || "—"} / {preview.pending_demand_count || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Delivery / Possession</dt><dd className="font-medium text-foreground">{preview.delivery_possession_risk || "—"}</dd></div>
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
