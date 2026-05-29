"use client";

import { useCallback, useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { buildCustomerProductRecontractAddendumPrintRoute } from "@/lib/route-builders";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  consentProductRecontractPreview,
  getCustomerAmendment,
  type AmendmentRecord,
  type ProductRecontractConsentStatus,
  type ProductRecontractPreviewSummary,
} from "@/services/amendments";

const CONSENT_ONLY_WARNING =
  "Customer consent records agreement or rejection of the preview only. It does not change the product, EMI schedule, payment history, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.";

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "-"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "-"}`;
}

function AuditTimeline({ row }: { row: AmendmentRecord }) {
  if (!row.audit_timeline || row.audit_timeline.length === 0) {
    return <div className="text-sm text-muted-foreground">No timeline events recorded.</div>;
  }
  
  const filteredEvents = row.audit_timeline.filter(
    (item) => !["Accounting bridge posted", "Reconciliation evidence linked"].includes(item.event)
  );

  return (
    <div className="space-y-4">
      {filteredEvents.map((item, idx) => (
        <div key={idx} className="flex gap-4">
          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            {item.status === "COMPLETED" ? (
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : item.status === "BLOCKED" ? (
              <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          <div>
            <div className="font-medium text-sm">{item.event}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
              {item.timestamp ? <span>{new Date(item.timestamp).toLocaleString()}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function SummaryItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{valueOrDash(value)}</div>
    </div>
  );
}

function ProductRecontractExecutedSummary({ preview }: { preview?: ProductRecontractPreviewSummary | null }) {
  if (!preview?.executed) return null;
  return (
    <DetailPanel title="Product recontract executed" description="Read-only summary of the approved contract update.">
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          This recontract updated future contract terms after approval. Previous payments and receipts remain unchanged.
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryItem label="Execution status" value={preview.execution_status || "EXECUTED"} />
          <SummaryItem label="Executed at" value={preview.executed_at || "-"} />
          <SummaryItem label="Old product" value={`${valueOrDash(preview.old_product_name)} (#${valueOrDash(preview.old_product_id)})`} />
          <SummaryItem label="New product" value={`${valueOrDash(preview.new_product_name)} (#${valueOrDash(preview.new_product_id)})`} />
          <SummaryItem label="Old contract total" value={preview.old_contract_total} />
          <SummaryItem label="New contract total" value={preview.new_contract_total} />
          <SummaryItem label="Old monthly EMI" value={preview.old_monthly_amount || preview.current_monthly_amount} />
          <SummaryItem label="New monthly EMI" value={preview.new_monthly_amount || preview.proposed_monthly_amount} />
        </div>
      </div>
    </DetailPanel>
  );
}

function hasExecutedProductRecontract(row: AmendmentRecord) {
  return row.amendment_type === "PRODUCT_CHANGE" && row.latest_product_recontract_preview?.executed === true;
}

function ProductRecontractCustomerConsentPanel({
  preview,
  onConsent,
}: {
  preview?: ProductRecontractPreviewSummary | null;
  onConsent: (decision: Exclude<ProductRecontractConsentStatus, "PENDING">, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<ProductRecontractConsentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!preview || preview.executed) return null;
  const status = preview.customer_consent_status || "PENDING";
  const nextAction = preview.progress?.next_required_action;
  const canDecide = nextAction === "Waiting for customer consent" || status === "PENDING";

  async function submit(decision: Exclude<ProductRecontractConsentStatus, "PENDING">) {
    setBusy(decision);
    setError(null);
    try {
      await onConsent(decision, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consent could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DetailPanel title="Product recontract preview consent" description="Saved preview snapshot for customer decision.">
      <div className="space-y-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">{CONSENT_ONLY_WARNING}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryItem label="Old product" value={`${valueOrDash(preview.old_product_name)} (#${valueOrDash(preview.old_product_id)})`} />
          <SummaryItem label="New product" value={`${valueOrDash(preview.new_product_name)} (#${valueOrDash(preview.new_product_id)})`} />
          <SummaryItem label="Old contract total" value={preview.old_contract_total} />
          <SummaryItem label="New contract total" value={preview.new_contract_total} />
          <SummaryItem label="Price difference" value={preview.price_difference} />
          <SummaryItem label="Already paid" value={preview.amount_already_paid} />
          <SummaryItem label="Proposed remaining balance" value={preview.proposed_new_remaining_balance} />
          <SummaryItem label="Current EMI" value={preview.current_monthly_amount} />
          <SummaryItem label="Proposed EMI" value={preview.proposed_monthly_amount} />
          <SummaryItem label="Impact type" value={preview.impact_type} />
          <SummaryItem label="Consent status" value={status} />
        </div>
        {preview.warnings?.length ? (
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Warnings</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview.schedule_preview_lines && preview.schedule_preview_lines.length > 0 ? (
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Future EMI schedule preview lines (read-only)</div>
            <div className="mt-2 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2">Line no</th>
                    <th className="p-2">Original due date</th>
                    <th className="p-2">Original amount</th>
                    <th className="p-2">Proposed due date</th>
                    <th className="p-2">Proposed amount</th>
                    <th className="p-2">Adjustment type</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.schedule_preview_lines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="p-2">{line.line_no}</td>
                      <td className="p-2">{line.original_due_date || "-"}</td>
                      <td className="p-2">{line.original_amount || "-"}</td>
                      <td className="p-2">{line.proposed_due_date || "-"}</td>
                      <td className="p-2">{line.proposed_amount || "-"}</td>
                      <td className="p-2">{line.adjustment_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {preview.latest_financial_impact_preview ? (
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Accounting and reconciliation impact preview (read-only)</div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <SummaryItem label="Impact type" value={preview.latest_financial_impact_preview.impact_type} />
              <SummaryItem label="Price difference" value={preview.latest_financial_impact_preview.price_difference} />
              <SummaryItem label="Additional receivable" value={preview.latest_financial_impact_preview.additional_receivable_amount} />
              <SummaryItem label="Credit or reduction" value={preview.latest_financial_impact_preview.credit_or_reduction_amount} />
            </div>
          </div>
        ) : null}
        {canDecide ? (
          <>
            <label className="block text-sm font-medium">
              Optional note
              <textarea className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-3">
              <ActionButton onClick={() => void submit("ACCEPTED")} disabled={Boolean(busy)}>
                {busy === "ACCEPTED" ? "Recording..." : "Accept proposed recontract terms"}
              </ActionButton>
              <ActionButton variant="outline" onClick={() => void submit("REJECTED")} disabled={Boolean(busy)}>
                {busy === "REJECTED" ? "Recording..." : "Reject proposed recontract terms"}
              </ActionButton>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Customer consent status: {status}</p>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </DetailPanel>
  );
}

export default function CustomerAmendmentDetail({ id }: { id: number }) {
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRow(await getCustomerAmendment(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const recordConsent = useCallback(
    async (decision: Exclude<ProductRecontractConsentStatus, "PENDING">, note: string) => {
      const event = await consentProductRecontractPreview(id, decision, note);
      setRow((current) =>
        current
          ? {
              ...current,
              latest_product_recontract_preview: current.latest_product_recontract_preview
                ? {
                    ...current.latest_product_recontract_preview,
                    customer_consent_status: event.customer_consent_status,
                    customer_consented_at: event.customer_consented_at,
                    customer_consent_note: event.customer_consent_note,
                    progress: event.progress,
                  }
                : current.latest_product_recontract_preview,
            }
          : current,
      );
    },
    [id],
  );

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  return (
    <ERPPageShell
      eyebrow="Customer amendment"
      title={row?.amendment_no || `Amendment #${id}`}
      subtitle="Read-only amendment request status and admin decision evidence."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Contract Amendments", href: "/customer/contract-amendments" },
        { label: row?.amendment_no || `#${id}` },
      ]}
      statusBadge={{ label: "Read only", tone: "info" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load amendment" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && row ? (
          <>
            <DetailPanel title="Amendment Audit Timeline" description="Read-only timeline of workflow milestones.">
              <AuditTimeline row={row} />
            </DetailPanel>
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Request summary" description="Source contract and requester context.">
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <ERPStatusBadge status={row.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contract</dt>
                    <dd>
                      {amendmentContractTypeLabel(row.contract_type)} / {sourceLabel(row)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{amendmentTypeLabel(row.amendment_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Requested</dt>
                    <dd>{dateLabel(row.created_at)}</dd>
                  </div>
                </dl>
              </DetailPanel>
              <DetailPanel title="Admin decision" description="Approval/rejection record only.">
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Approved by</dt>
                    <dd>{row.approved_by_username || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Approved at</dt>
                    <dd>{dateLabel(row.approved_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Admin note</dt>
                    <dd>{row.admin_note || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Rejection reason</dt>
                    <dd>{row.rejection_reason || "-"}</dd>
                  </div>
                </dl>
              </DetailPanel>
            </div>
            {hasExecutedProductRecontract(row) ? (
              <DetailPanel title="Recontract addendum" description="Printable read-only addendum generated from your executed recontract evidence.">
                <ActionButton href={buildCustomerProductRecontractAddendumPrintRoute(row.id)} variant="outline">
                  Recontract Addendum / Print
                </ActionButton>
              </DetailPanel>
            ) : null}
            <ProductRecontractExecutedSummary preview={row.latest_product_recontract_preview} />
            <ProductRecontractCustomerConsentPanel preview={row.latest_product_recontract_preview} onConsent={recordConsent} />
            <DetailPanel title="Reason" description="Submitted reason.">
              <p className="text-sm text-muted-foreground">{row.reason}</p>
            </DetailPanel>
            <div className="grid gap-4 lg:grid-cols-3">
              <DetailPanel title="Old values" description="Source snapshot.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.old_values || row.previous_values)}</pre>
              </DetailPanel>
              <DetailPanel title="Requested values" description="Requested change.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.requested_values || row.new_values)}</pre>
              </DetailPanel>
              <DetailPanel title="Approved values" description="Admin values.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.approved_values)}</pre>
              </DetailPanel>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
