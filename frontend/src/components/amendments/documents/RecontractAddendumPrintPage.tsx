"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import {
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  joinDocumentLines,
  safeDocumentText,
} from "@/lib/documents/formatters";
import {
  buildAdminProductRecontractAddendumPrintRoute,
  buildCustomerProductRecontractAddendumPrintRoute,
} from "@/lib/route-builders";
import {
  getAdminAmendment,
  getCustomerAmendment,
  type AmendmentRecord,
  type ProductRecontractPreviewSummary,
} from "@/services/amendments";
import type { ContractRecontractScheduleLine } from "@/services/amendmentPreviews";
import { type DocumentCopyLabel } from "@/lib/documents/document-theme";

type Role = "admin" | "customer";

function valueOrDash(value?: string | number | null): string {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function sourceReference(amendment: AmendmentRecord): string {
  return amendment.subscription_number || amendment.rent_lease_contract_number || `Amendment #${amendment.id}`;
}

function productLabel(name?: string | null, code?: string | null): string {
  const safeName = safeDocumentText(name);
  const safeCode = safeDocumentText(code, "");
  return safeCode ? `${safeName} / ${safeCode}` : safeName;
}

function snapshotNumber(source: Record<string, unknown> | undefined, keys: string[]): string | number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return null;
}

function executionSnapshot(preview: ProductRecontractPreviewSummary | null | undefined) {
  const snapshot = preview?.execution_snapshot;
  return {
    before: snapshot?.before_subscription || {},
    after: snapshot?.after_subscription || {},
    updatedPending: snapshot?.updated_pending_emi_lines || [],
  };
}

function amountFromJournalPreview(preview: ProductRecontractPreviewSummary): string | number | null {
  const journalPreview = preview.latest_financial_impact_preview?.journal_preview;
  if (!journalPreview || typeof journalPreview !== "object") return preview.price_difference ?? null;
  const lines = (journalPreview as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return preview.price_difference ?? null;
  const firstAmount = lines
    .map((line) => (line && typeof line === "object" ? (line as { amount?: unknown }).amount : null))
    .find((value) => typeof value === "string" || typeof value === "number");
  return firstAmount ?? preview.price_difference ?? null;
}

function debitCreditSummary(preview: ProductRecontractPreviewSummary): string {
  const journalPreview = preview.latest_financial_impact_preview?.journal_preview;
  if (!journalPreview || typeof journalPreview !== "object") return "—";
  const lines = (journalPreview as { lines?: unknown }).lines;
  if (!Array.isArray(lines) || lines.length === 0) return "—";
  return lines
    .map((line, index) => {
      if (!line || typeof line !== "object") return null;
      const item = line as { entry_side?: unknown; side?: unknown; label?: unknown; account?: unknown; amount?: unknown };
      const side = valueOrDash(typeof item.entry_side === "string" ? item.entry_side : typeof item.side === "string" ? item.side : null);
      const label = valueOrDash(typeof item.label === "string" ? item.label : typeof item.account === "string" ? item.account : `Line ${index + 1}`);
      const amount = typeof item.amount === "string" || typeof item.amount === "number" ? formatDocumentMoney(item.amount) : "—";
      return `${side}: ${label} ${amount}`;
    })
    .filter(Boolean)
    .join("; ");
}

function varianceAmount(preview: ProductRecontractPreviewSummary): string | number | null {
  const reconciliationPreview = preview.latest_financial_impact_preview?.reconciliation_preview;
  if (!reconciliationPreview || typeof reconciliationPreview !== "object") return null;
  const value = (reconciliationPreview as { variance_amount?: unknown; variance?: unknown }).variance_amount
    ?? (reconciliationPreview as { variance?: unknown }).variance;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function scheduleLines(preview: ProductRecontractPreviewSummary | null | undefined): ContractRecontractScheduleLine[] {
  return preview?.schedule_preview_lines || [];
}

function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="document-card my-4 rounded-2xl border border-[#e6d6bd] bg-white p-4">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">{title}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function KeyValueGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">{item.label}</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2418]">{item.value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function ScheduleImpactTable({ lines }: { lines: ContractRecontractScheduleLine[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-[#6f5c46]">No pending EMI schedule preview lines are exposed for this executed recontract.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#f0dfbd] text-left text-[11px] uppercase tracking-[0.1em] text-[#5e3818]">
            <th className="px-3 py-3">Line</th>
            <th className="px-3 py-3">Old Due Date</th>
            <th className="px-3 py-3 text-right">Old Amount</th>
            <th className="px-3 py-3">New Due Date</th>
            <th className="px-3 py-3 text-right">New Amount</th>
            <th className="px-3 py-3">Impact</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-[#eadcc6] align-top">
              <td className="px-3 py-3 font-semibold">{line.line_no}</td>
              <td className="px-3 py-3">{formatDocumentDate(line.original_due_date)}</td>
              <td className="px-3 py-3 text-right">{formatDocumentMoney(line.original_amount)}</td>
              <td className="px-3 py-3">{formatDocumentDate(line.proposed_due_date)}</td>
              <td className="px-3 py-3 text-right font-bold">{formatDocumentMoney(line.proposed_amount)}</td>
              <td className="px-3 py-3">{safeDocumentText(line.adjustment_type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Terms() {
  return (
    <DocumentTermsBlock
      terms={[
        "This Product Recontract Addendum is generated from executed recontract evidence only.",
        "This print document does not create payment, receipt, refund, settlement, journal, reconciliation, stock, delivery, waiver, commission, payout, rent/lease demand, or deposit records.",
        "Historical payments, receipts, paid EMI rows, lucky ID, batch, waiver/draw, settlement/day-close, stock/delivery, commission/payout, rent/lease demand, and deposit records remain unchanged.",
        "Reversal or rollback, if ever required, remains a separate future controlled workflow and is not available from this document.",
      ]}
    />
  );
}

export default function RecontractAddendumPrintPage({ id, role }: { id: number; role: Role }) {
  const [amendment, setAmendment] = useState<AmendmentRecord | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generatedAt = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    let mounted = true;
    const loader = role === "admin" ? getAdminAmendment : getCustomerAmendment;
    loader(id)
      .then((payload) => {
        if (!mounted) return;
        setAmendment(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load product recontract addendum.");
        setAmendment(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, role]);

  if (loading) return <ERPLoadingState label="Loading product recontract addendum..." />;
  if (error || !amendment) {
    return <ERPErrorState title="Unable to load product recontract addendum" description={error || "The amendment could not be loaded."} />;
  }

  const preview = amendment.latest_product_recontract_preview;
  if (amendment.amendment_type !== "PRODUCT_CHANGE" || !preview?.executed) {
    return (
      <ERPErrorState
        title="Product recontract addendum unavailable"
        description="The addendum is available only for executed product recontract amendments."
      />
    );
  }

  const snapshots = executionSnapshot(preview);
  const oldTotal = snapshotNumber(snapshots.before, ["total_amount"]) ?? preview.old_contract_total;
  const newTotal = snapshotNumber(snapshots.after, ["total_amount"]) ?? preview.new_contract_total;
  const oldEmi = snapshotNumber(snapshots.before, ["monthly_amount"]) ?? preview.old_monthly_amount ?? preview.current_monthly_amount;
  const newEmi = snapshotNumber(snapshots.after, ["monthly_amount"]) ?? preview.new_monthly_amount ?? preview.proposed_monthly_amount;
  const oldTenure = snapshotNumber(snapshots.before, ["tenure_months"]) ?? preview.current_tenure_months;
  const newTenure = snapshotNumber(snapshots.after, ["tenure_months"]) ?? preview.preview_tenure_months;
  const newRemaining = preview.proposed_new_remaining_balance ?? preview.new_remaining_balance;
  const backHref = role === "admin"
    ? `/admin/contract-amendments/${amendment.id}`
    : `/customer/contract-amendments/${amendment.id}`;
  const printRoute = role === "admin"
    ? buildAdminProductRecontractAddendumPrintRoute(amendment.id)
    : buildCustomerProductRecontractAddendumPrintRoute(amendment.id);
  const lines = scheduleLines(preview);

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={backHref} />
      <DocumentPage>
        <DocumentHeader
          copyLabel={copyLabel}
          documentNo={amendment.amendment_no || `AMD-${amendment.id}`}
          documentDate={formatDocumentDate(preview.executed_at || amendment.implemented_at || amendment.updated_at)}
        />

        <DocumentTitleStrip
          title="PRODUCT RECONTRACT ADDENDUM"
          subtitle="Customer-facing read-only addendum generated from executed recontract evidence."
          status={preview.execution_status || "EXECUTED"}
        />

        <DocumentMetadataGrid
          items={[
            { label: "Amendment No.", value: safeDocumentText(amendment.amendment_no) },
            { label: "Subscription Ref", value: sourceReference(amendment) },
            { label: "Execution Status", value: preview.execution_status || "EXECUTED" },
            { label: "Executed At", value: formatDocumentDateTime(preview.executed_at) },
            { label: "Executed By", value: valueOrDash(preview.executed_by) },
            { label: "Customer Consent", value: formatDocumentDateTime(preview.customer_consented_at) },
            { label: "Admin Approval", value: formatDocumentDateTime(preview.admin_approved_at) },
            { label: "Effective Date", value: formatDocumentDate(preview.effective_date_preview || amendment.effective_date) },
          ]}
        />

        <DocumentPartyPanel
          parties={[
            {
              title: "Customer",
              name: amendment.customer_name,
              phone: amendment.customer_phone,
              address: joinDocumentLines([`Customer ID: ${valueOrDash(amendment.customer)}`]),
            },
            {
              title: "Business",
            },
          ]}
        />

        <CardSection title="Core Contract References">
          <KeyValueGrid
            items={[
              { label: "Batch / Lucky ID", value: "Read-only; unchanged by recontract execution" },
              { label: "Source Amendment", value: amendment.amendment_no || `#${amendment.id}` },
              { label: "Requested By", value: amendment.requested_by_username || amendment.requested_role },
              { label: "Approved By", value: amendment.approved_by_username || valueOrDash(amendment.approved_by) },
            ]}
          />
        </CardSection>

        <CardSection title="Old vs New Contract Terms">
          <KeyValueGrid
            items={[
              { label: "Old Product", value: productLabel(preview.old_product_name, preview.old_product_code) },
              { label: "New Product", value: productLabel(preview.new_product_name, preview.new_product_code) },
              { label: "Old Contract Total", value: formatDocumentMoney(oldTotal) },
              { label: "New Contract Total", value: formatDocumentMoney(newTotal) },
              { label: "Price Difference", value: formatDocumentMoney(preview.price_difference) },
              { label: "Old Monthly EMI", value: formatDocumentMoney(oldEmi) },
              { label: "New Monthly EMI", value: formatDocumentMoney(newEmi) },
              { label: "Old Tenure", value: `${valueOrDash(oldTenure)} months` },
              { label: "New Tenure", value: `${valueOrDash(newTenure)} months` },
              { label: "Amount Already Paid", value: formatDocumentMoney(preview.amount_already_paid) },
              { label: "Old Remaining Balance", value: formatDocumentMoney(preview.old_remaining_balance) },
              { label: "New Remaining Balance", value: formatDocumentMoney(newRemaining) },
            ]}
          />
        </CardSection>

        <CardSection title="EMI Schedule Impact">
          <ScheduleImpactTable lines={lines} />
          <p className="mt-3 rounded-xl border border-[#eadcc6] bg-[#fff6e4] p-3 text-sm font-semibold text-[#6f4e27]">
            Paid, settled, waived, and cancelled EMI rows are explicitly unchanged. Only pending EMI amount/due-date rows from approved schedule preview lines are represented here.
          </p>
        </CardSection>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <CardSection title="Accounting Evidence">
              <KeyValueGrid
                items={[
                  { label: "Accounting Bridge Posting ID", value: valueOrDash(preview.accounting_bridge_posting_id) },
                  { label: "Journal Entry ID / Number", value: valueOrDash(preview.journal_entry_id) },
                  { label: "Posted Amount", value: formatDocumentMoney(amountFromJournalPreview(preview)) },
                  { label: "Debit / Credit Summary", value: debitCreditSummary(preview) },
                ]}
              />
              <p className="mt-3 text-sm font-semibold text-[#6f4e27]">Accounting evidence was created before execution.</p>
            </CardSection>

            <CardSection title="Reconciliation Evidence">
              <KeyValueGrid
                items={[
                  { label: "Reconciliation Run ID", value: valueOrDash(preview.reconciliation_run_id) },
                  { label: "Reconciliation Item ID", value: valueOrDash(preview.reconciliation_item_id) },
                  { label: "Evidence IDs", value: (preview.reconciliation_evidence_ids || []).join(", ") || "—" },
                  { label: "Variance Amount", value: varianceAmount(preview) == null ? "—" : formatDocumentMoney(varianceAmount(preview)) },
                ]}
              />
              <p className="mt-3 text-sm font-semibold text-[#6f4e27]">Reconciliation evidence was linked before execution.</p>
            </CardSection>
          </div>

          <DocumentAmountSummary
            rows={[
              { label: "Previous Contract Total", value: formatDocumentMoney(oldTotal) },
              { label: "Payments Already Received", value: formatDocumentMoney(preview.amount_already_paid), strong: true },
              { label: "Preserved Paid Amount", value: formatDocumentMoney(preview.amount_already_paid) },
              { label: "New Contract Total", value: formatDocumentMoney(newTotal), strong: true },
              { label: "New Remaining Balance", value: formatDocumentMoney(newRemaining), danger: Number(newRemaining ?? 0) > 0 },
              { label: "Future EMI Payable", value: formatDocumentMoney(newEmi), strong: true },
            ]}
          />
        </div>

        <CardSection title="Customer Ledger Statement">
          <p className="text-sm leading-6 text-[#6f5c46]">
            This statement preserves the already received payment amount against the new executed contract total and future EMI payable values shown above.
          </p>
          <p className="mt-2 rounded-xl border border-[#eadcc6] bg-[#fff6e4] p-3 text-sm font-semibold text-[#6f4e27]">
            This statement does not create payment, receipt, refund, or settlement.
          </p>
        </CardSection>

        <CardSection title="Protection Statement">
          <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Historical payments unchanged.</li>
            <li>Historical receipts unchanged.</li>
            <li>Paid EMI rows unchanged.</li>
            <li>Lucky ID and batch unchanged.</li>
            <li>Waiver/draw unchanged.</li>
            <li>Settlement/day-close unchanged.</li>
            <li>Stock/delivery unchanged.</li>
            <li>Commission/payout unchanged.</li>
            <li>Rent/lease demand/deposit unchanged.</li>
          </ul>
        </CardSection>

        <Terms />

        <DocumentSignatureBlock labels={["Customer Signature", "Authorized Signature", "Date"]} />

        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={backHref} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to amendment record
          </Link>
          <span>Source route: {printRoute}. Read-only document generated from amendment detail payload.</span>
        </div>

        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
