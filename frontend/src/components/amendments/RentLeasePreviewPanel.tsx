"use client";

import { useEffect, useState } from "react";
import { DetailPanel } from "@/components/ui/operations";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import type { AmendmentRecord, RentLeaseItemPreviewItem, RentLeasePreviewResponse } from "@/services/amendments";
import { apiFetch } from "@/lib/api";

type Props = {
  amendment: AmendmentRecord;
  isCustomerView?: boolean;
};

function formatCurrency(val?: string | number | null) {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (Number.isNaN(num)) return String(val);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tagBadgeClass(actionTag?: string) {
  switch (actionTag) {
    case "RETURNED":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
    case "PARTIAL_RETURN":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "CLOSED":
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
    case "UPGRADED_NEW":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "UPGRADED_OLD":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 line-through opacity-70";
    case "ADDED":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export default function RentLeasePreviewPanel({ amendment, isCustomerView = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RentLeasePreviewResponse | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const endpoint = isCustomerView
          ? `/customer/contract-amendments/${amendment.id}/rent-lease-preview/`
          : `/admin/contract-amendments/${amendment.id}/rent-lease-preview/`;
        const data = await apiFetch<RentLeasePreviewResponse>(endpoint);
        setPreview(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rent/lease preview.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [amendment.id, isCustomerView]);

  if (loading) {
    return (
      <DetailPanel title="Rent / Lease Amendment Preview" description="Loading contract item preview data...">
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

  const hasItemComparison = Boolean(
    (preview.current_items && preview.current_items.length > 0) ||
    (preview.proposed_items && preview.proposed_items.length > 0)
  );

  return (
    <DetailPanel
      title="Rent / Lease Amendment Preview"
      description={
        preview.execution_supported
          ? "Multi-product flexible contract amendment: returns, closures, and upgrades update contract items, monthly dues, and deposit."
          : "Preview evaluation. Review blockers before proceeding."
      }
    >
      <div className="space-y-4">
        {/* Top KPI Cards */}
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Monthly Rent / Lease</div>
            <div className="mt-2 text-lg font-bold text-foreground">
              {formatCurrency(preview.proposed_monthly_amount ?? preview.current_monthly_amount)}
            </div>
            {preview.monthly_amount_difference && preview.monthly_amount_difference !== "0.00" && (
              <div
                className={`text-xs font-medium mt-1 ${
                  Number(preview.monthly_amount_difference) < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {Number(preview.monthly_amount_difference) > 0 ? "+" : ""}
                {formatCurrency(preview.monthly_amount_difference)} / month
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              Current: {formatCurrency(preview.current_monthly_amount)}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Total Contract Value</div>
            <div className="mt-2 text-lg font-bold text-foreground">
              {formatCurrency(preview.proposed_total_amount ?? preview.current_total_amount)}
            </div>
            {preview.total_amount_difference && preview.total_amount_difference !== "0.00" && (
              <div
                className={`text-xs font-medium mt-1 ${
                  Number(preview.total_amount_difference) < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {Number(preview.total_amount_difference) > 0 ? "+" : ""}
                {formatCurrency(preview.total_amount_difference)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              Current: {formatCurrency(preview.current_total_amount)}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Security Deposit</div>
            <div className="mt-2 text-lg font-bold text-foreground">
              {formatCurrency(preview.proposed_deposit_amount ?? preview.current_deposit_amount)}
            </div>
            {preview.deposit_difference && preview.deposit_difference !== "0.00" && (
              <div
                className={`text-xs font-medium mt-1 ${
                  Number(preview.deposit_difference) < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {Number(preview.deposit_difference) > 0 ? "+" : ""}
                {formatCurrency(preview.deposit_difference)}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              Current: {formatCurrency(preview.current_deposit_amount)}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Tenure & Contract Ref</div>
            <div className="mt-2 font-medium text-foreground">{preview.current_contract_reference || "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Tenure: {preview.current_tenure_months || "—"} months
            </div>
            <div className="text-xs text-muted-foreground">Customer: {preview.customer_name || "—"}</div>
          </div>
        </div>

        {/* Multi-product comparison table */}
        {hasItemComparison && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Proposed Contract Furniture Items</div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">Status / Action</th>
                    <th className="p-3">Product Item</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Total Base</th>
                    <th className="p-3 text-right">Yield</th>
                    <th className="p-3 text-right">Monthly Rent</th>
                    <th className="p-3 text-right">Deposit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.proposed_items && preview.proposed_items.length > 0 ? (
                    preview.proposed_items.map((item: RentLeaseItemPreviewItem, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="p-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tagBadgeClass(
                              item.action_tag
                            )}`}
                          >
                            {item.action_tag || "ACTIVE"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{item.product_name}</div>
                          {item.product_code && (
                            <div className="text-xs text-muted-foreground">{item.product_code}</div>
                          )}
                        </td>
                        <td className="p-3 text-center font-medium">{item.quantity}</td>
                        <td className="p-3 text-right text-muted-foreground">{formatCurrency(item.unit_base_price)}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(item.total_base_price)}</td>
                        <td className="p-3 text-right text-muted-foreground">{item.monthly_yield_percent}%</td>
                        <td className="p-3 text-right font-semibold text-foreground">{formatCurrency(item.monthly_amount)}</td>
                        <td className="p-3 text-right text-muted-foreground">{formatCurrency(item.security_deposit_amount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-sm text-muted-foreground">
                        No proposed items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Impact Analysis & Risk */}
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Impact & Operational Analysis</div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Demand Schedule</dt>
              <dd className="font-medium text-foreground">{preview.demand_schedule_impact_summary || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Accounting / Ledger</dt>
              <dd className="font-medium text-foreground">{preview.accounting_impact_category || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reconciliation</dt>
              <dd className="font-medium text-foreground">{preview.reconciliation_impact_category || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Deposit Liability</dt>
              <dd className="font-medium text-foreground">{preview.deposit_liability_risk || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Uncollected Monthly Demands</dt>
              <dd className="font-medium text-foreground">{preview.pending_demand_count || "0"} pending demand(s)</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Delivery / Asset Return</dt>
              <dd className="font-medium text-foreground">{preview.delivery_possession_risk || "—"}</dd>
            </div>
          </dl>

          {preview.blocker_reasons && preview.blocker_reasons.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-semibold uppercase text-rose-600 dark:text-rose-400 mb-2">Blockers</div>
              <ul className="list-inside list-disc space-y-1 text-sm text-rose-700 dark:text-rose-300">
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
