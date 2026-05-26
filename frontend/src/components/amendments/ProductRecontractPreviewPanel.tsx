"use client";

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { previewProductRecontractAmendment, type ProductRecontractPreview } from "@/services/amendmentPreviews";
import type { AmendmentRecord } from "@/services/amendments";

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function MoneyRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{valueOrDash(value)}</div>
    </div>
  );
}

export default function ProductRecontractPreviewPanel({ amendment }: { amendment: AmendmentRecord }) {
  const [preview, setPreview] = useState<ProductRecontractPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (amendment.amendment_type !== "PRODUCT_CHANGE") return null;

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewProductRecontractAmendment(amendment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailPanel
      title="Product recontract preview"
      description="Backend-calculated preview only. This does not execute product change or financial recalculation."
    >
      <div className="space-y-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Preview only — no contract, EMI, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, or waiver records are changed.
        </p>
        <ActionButton variant="outline" onClick={() => void runPreview()} disabled={busy}>
          {busy ? "Previewing..." : "Preview financial product change"}
        </ActionButton>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {preview ? (
          <div className="space-y-4">
            {preview.blocked_reason ? <p className="text-sm text-destructive">{preview.blocked_reason}</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              <MoneyRow label="Old product" value={`${valueOrDash(preview.old_product_name)} (#${valueOrDash(preview.old_product_id)})`} />
              <MoneyRow label="New product" value={`${valueOrDash(preview.new_product_name)} (#${valueOrDash(preview.new_product_id)})`} />
              <MoneyRow label="Old contract total" value={preview.old_contract_total} />
              <MoneyRow label="New contract total" value={preview.new_contract_total} />
              <MoneyRow label="Price difference" value={preview.price_difference} />
              <MoneyRow label="Already paid" value={preview.amount_already_paid} />
              <MoneyRow label="Old remaining balance" value={preview.old_remaining_balance} />
              <MoneyRow label="Proposed remaining balance" value={preview.proposed_new_remaining_balance} />
              <MoneyRow label="Current EMI" value={preview.current_monthly_amount} />
              <MoneyRow label="Proposed EMI" value={preview.proposed_monthly_amount} />
              <MoneyRow label="Impact type" value={preview.impact_type} />
              <MoneyRow label="Pending EMI count" value={preview.pending_emi_count} />
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Warnings</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </DetailPanel>
  );
}
