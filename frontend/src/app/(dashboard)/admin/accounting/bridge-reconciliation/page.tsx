"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingBridgeReconciliation,
  postBridgeCandidate,
  postBridgeCandidateBatch,
  previewBridgeCandidate,
  previewBridgeCandidateBatch,
  verifyBridgeReconciliationItem,
  type AccountingBridgeReconciliationFilters,
  type AccountingBridgeReconciliationPayload,
  type AccountingBridgeReconciliationRow,
  type BridgePostingPreview,
} from "@/services/accounting-bridge-reconciliation";

const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";
const STATUS_OPTIONS = ["", "READY_UNPOSTED", "POSTED_UNVERIFIED", "POSTED", "RECONCILED", "BLOCKED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL", "UNSUPPORTED", "UNSUPPORTED_SOURCE", "EXCEPTION"];
const SOURCE_MODEL_OPTIONS = ["", "Payment", "ReceiptDocument", "BillingInvoice", "RentLeaseBillingDemand", "BillingCreditNote", "DirectSaleReturn", "BillingDebitNote", "PurchaseBill", "VendorPayment", "StockLedger", "Commission", "CommissionPayoutBatch", "SalarySheet", "SalaryPayment"];
const CONCRETE_POST_MODELS = new Set(["Payment", "ReceiptDocument", "BillingInvoice", "RentLeaseBillingDemand", "BillingCreditNote", "DirectSaleReturn", "BillingDebitNote", "PurchaseBill", "VendorPayment", "StockLedger", "Commission", "CommissionPayoutBatch", "SalarySheet", "SalaryPayment"]);
const PURCHASE_BILL_POSTING_COPY = "Posting creates accounting journal entries only. It does not edit invoice, contract, payment, receipt, security deposit, purchase bill, vendor payment, inventory, commission, payout, payroll, staff, attendance, or StaffAdvance records.";
const PURCHASE_BILL_PREVIEW_COPY = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit purchase bill or inventory records.";
const COMMISSION_PREVIEW_COPY = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit commission or payout records.";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["OPEN", "RECONCILED", "POSTED", "POSTABLE", "READY"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (["READY_UNPOSTED", "POSTED_UNVERIFIED"].includes(value)) return "border-blue-200 bg-blue-50 text-blue-900";
  if (value === "LOCKED" || value.startsWith("BLOCKED")) return "border-amber-200 bg-amber-50 text-amber-950";
  if (["CLOSED", "EXCEPTION", "UNSUPPORTED", "UNSUPPORTED_SOURCE"].includes(value)) return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
}

function SummaryCard({ label, value, tone, href }: { label: string; value: number | string; tone: string; href?: string }) {
  const body = (
    <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function filtersFromLocation(): AccountingBridgeReconciliationFilters {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    financial_year: params.get("financial_year") || undefined,
    accounting_period: params.get("accounting_period") || undefined,
    status: params.get("status") || undefined,
    event_key: params.get("event_key") || undefined,
    module: params.get("module") || undefined,
    source_model: params.get("source_model") || undefined,
    vendor: params.get("vendor") || undefined,
  };
}

function statusLabel(row: AccountingBridgeReconciliationRow): string {
  return row.reconciliation_state === "POSTED_UNVERIFIED" || row.posted_unverified ? "POSTED_UNVERIFIED" : row.status;
}

function rowKey(row: AccountingBridgeReconciliationRow): string {
  return `${row.row_type}-${row.event_key}-${row.source_model ?? "registry"}-${row.source_id ?? row.source_reference ?? "none"}-${row.status}`;
}

function sourceTitle(row: AccountingBridgeReconciliationRow): string {
  if (row.source_display) return row.source_display;
  if (row.salary_payment_reference) return `Salary payment ${row.salary_payment_reference}`;
  if (row.salary_reference) return `Salary sheet ${row.salary_reference}`;
  if (row.commission_reference) return `Commission ${row.commission_reference}`;
  if (row.payout_reference) return `Payout ${row.payout_reference}`;
  if (row.rent_lease_reference) return `Rent/lease demand ${row.rent_lease_reference}`;
  if (row.stock_ledger_reference) return `Stock ledger ${row.stock_ledger_reference}`;
  if (row.vendor_payment_number) return `Vendor payment ${row.vendor_payment_number}`;
  if (row.purchase_bill_number) return `Purchase bill ${row.purchase_bill_number}`;
  if (row.source_model && row.source_id) return `${row.source_model} #${row.source_id}`;
  return row.source_model || row.module || "Abstract readiness event";
}

function sourceExtra(row: AccountingBridgeReconciliationRow) {
  return (
    <>
      {row.receipt_type ? <div>Receipt: {row.receipt_type} · {row.receipt_status}</div> : null}
      {row.commission_reference ? <div>Commission: {row.commission_reference} · {row.commission_status}</div> : null}
      {row.payout_batch_code ? <div>Payout batch: {row.payout_batch_code} · {row.payout_status}</div> : null}
      {row.salary_reference ? <div>Payroll: {row.salary_reference} · {row.payroll_status ?? row.salary_status}</div> : null}
      {row.salary_payment_reference ? <div>Salary payment: {row.salary_payment_reference} · {row.salary_payment_date ?? row.source_date}</div> : null}
      {row.linked_salary_sheet_reference ? <div>Linked salary sheet: {row.linked_salary_sheet_reference}</div> : null}
      {row.staff_name || row.employee_code ? <div>Staff: {row.staff_name ?? row.employee_name ?? "-"} · {row.employee_code ?? "-"}</div> : null}
      {row.payroll_period ? <div>Payroll period: {row.payroll_period}</div> : null}
      {row.gross_salary || row.payable_amount ? <div>Gross/payable: {row.gross_salary ?? row.gross_amount ?? "0.00"} / {row.payable_amount ?? row.net_amount ?? row.amount ?? "0.00"}</div> : null}
      {row.deductions_amount ? <div>Deductions: {row.deductions_amount}</div> : null}
      {row.related_commission_count ? <div>Related commissions: {row.related_commission_count}</div> : null}
      {row.partner_name ? <div>Partner/staff: {row.partner_name}</div> : null}
      {row.customer_name ? <div>Customer: {row.customer_name}</div> : null}
      {row.subscription_id || row.payment_id || row.emi_id ? <div>Linked source: Sub {row.subscription_id ?? "-"} · Pay {row.payment_reference ?? row.payment_id ?? "-"} · EMI {row.emi_id ?? "-"}</div> : null}
      {row.commission_rate || row.commission_amount ? <div>Rate/commission: {row.commission_rate ?? "-"} / {row.commission_amount ?? row.amount ?? "0.00"}</div> : null}
      {row.invoice_type ? <div>Invoice: {row.invoice_type} · {row.invoice_status}</div> : null}
      {row.rent_lease_reference ? <div>Rent/lease invoice: {row.rent_lease_reference} · {row.plan_type ?? "-"} · {row.invoice_status ?? row.source_status ?? row.status}</div> : null}
      {row.billing_month || row.billing_period ? <div>Billing period: {row.billing_month ?? "-"} · {row.billing_period ?? `${row.billing_period_start ?? "-"} to ${row.billing_period_end ?? "-"}`}</div> : null}
      {row.contract_reference ? <div>Contract: {row.contract_reference}</div> : null}
      {row.demand_type ? <div>Demand type: {row.demand_type} · Due {row.due_date ?? row.source_date ?? "-"}</div> : null}
      {row.outstanding_amount ? <div>Collected/outstanding: {row.collected_amount ?? "0.00"} / {row.outstanding_amount}</div> : null}
      {row.credit_note_number ? <div>Credit note: {row.credit_note_number} · {row.credit_note_status}</div> : null}
      {row.debit_note_number ? <div>Debit note: {row.debit_note_number} · {row.debit_note_status}</div> : null}
      {row.purchase_bill_number ? <div>Purchase bill: {row.purchase_bill_number} · {row.purchase_bill_status}</div> : null}
      {row.vendor_payment_number ? <div>Vendor payment: {row.vendor_payment_number} · {row.vendor_payment_status}</div> : null}
      {row.vendor_payment_reference ? <div>Payment ref: {row.vendor_payment_reference}</div> : null}
      {row.payment_method || row.finance_account_name ? <div>Payment account: {row.payment_method ?? "-"} · {row.finance_account_name ?? "-"}</div> : null}
      {row.vendor_name ? <div>Vendor: {row.vendor_name}</div> : null}
      {row.movement_type ? <div>Movement: {row.movement_type}</div> : null}
      {row.item_name || row.product_name ? <div>Item: {row.item_name ?? row.product_name}</div> : null}
      {row.stock_location_name || row.branch_name ? <div>Location: {row.stock_location_name ?? "-"} · {row.branch_name ?? "-"}</div> : null}
      {row.quantity || row.unit_cost ? <div>Qty/unit cost: {row.quantity_out ?? row.quantity ?? "-"} / {row.unit_cost ?? "-"}</div> : null}
      {row.cogs_amount || row.cogs_state ? <div>COGS: {row.cogs_amount ?? "0.00"} · {row.cogs_state ?? row.status}</div> : null}
      {row.cost_evidence ? <div>Cost evidence: {row.cost_evidence}</div> : null}
      {row.reference_model || row.reference_id ? <div>Source ref: {row.reference_model ?? "-"} · {row.reference_id ?? "-"}</div> : null}
      {row.return_number ? <div>Return: {row.return_number} · {row.return_status}</div> : null}
      {row.taxable_amount || row.tax_amount ? <div>Taxable/tax: {row.taxable_amount ?? "0.00"} / {row.tax_amount ?? "0.00"}</div> : null}
    </>
  );
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BridgePostingPreview | null>(null);
  const [postingNote, setPostingNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (nextFilters: AccountingBridgeReconciliationFilters = {}, opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingBridgeReconciliation(nextFilters));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bridge reconciliation cockpit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = filtersFromLocation();
    setFilters(initial);
    setDraftFilters(initial);
    void load(initial);
  }, [load]);

  const rows = payload?.results ?? [];
  const summary = payload?.summary ?? { source_count: 0, ready_unposted_count: 0, blocked_count: 0, posted_count: 0, settled_count: 0, reconciled_count: 0, exception_count: 0 };
  const selectedFinancialYear = payload?.selected_financial_year ?? payload?.accounting_period_readiness?.active_financial_year ?? payload?.financial_year_readiness?.active_financial_year ?? null;
  const readinessBlockers = payload?.readiness_blockers ?? payload?.accounting_period_readiness?.blockers ?? payload?.financial_year_readiness?.blockers ?? [];
  const availableFinancialYears = payload?.available_financial_years ?? [];
  const availablePeriods = payload?.available_accounting_periods ?? [];
  const candidateRows = rows.filter((row) => row.row_type === "bridge_candidate" && row.bridge_candidate_id);
  const selectedCandidateRows = candidateRows.filter((row) => row.bridge_candidate_id && selectedCandidateIds.includes(row.bridge_candidate_id));
  const exceptionRows = rows.filter((row) => row.status === "EXCEPTION" || row.exception_reasons.length > 0 || row.status.startsWith("BLOCKED") || row.status === "UNSUPPORTED_SOURCE");
  const selectedSourceModels = useMemo(() => Array.from(new Set(selectedCandidateRows.map((row) => row.source_model || "Unknown"))).join(", ") || "None", [selectedCandidateRows]);

  function statusHref(status: string) {
    return `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ ...(selectedFinancialYear?.id ? { financial_year: String(selectedFinancialYear.id) } : {}), status }).toString()}`;
  }

  function setDraft(key: keyof AccountingBridgeReconciliationFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  function applyFilters() {
    setFilters(draftFilters);
    setSelectedCandidateIds([]);
    void load(draftFilters);
  }

  function clearFilters() {
    setDraftFilters({});
    setFilters({});
    setSelectedCandidateIds([]);
    void load({});
  }

  function isConcretePostableCandidate(row: AccountingBridgeReconciliationRow): boolean {
    return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id && row.idempotency_key && row.can_post && row.status === "READY_UNPOSTED" && row.source_model && CONCRETE_POST_MODELS.has(row.source_model));
  }

  function isConcretePreviewCandidate(row: AccountingBridgeReconciliationRow): boolean {
    return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id && row.can_preview && row.source_model && CONCRETE_POST_MODELS.has(row.source_model));
  }

  const selectedAllPostable = selectedCandidateRows.length > 0 && selectedCandidateRows.every(isConcretePostableCandidate);

  function toggleCandidate(candidateId: string, checked: boolean) {
    setSelectedCandidateIds((current) => checked ? Array.from(new Set([...current, candidateId])) : current.filter((id) => id !== candidateId));
  }

  async function handlePreviewCandidate(candidateId: string) {
    setActionBusy(`preview:${candidateId}`);
    setError(null);
    try {
      setPreview(await previewBridgeCandidate(candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview bridge candidate.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handlePostCandidate(candidateId: string, idempotencyKey?: string | null) {
    if (!idempotencyKey) return;
    if (!window.confirm(`Post this bridge candidate now? ${PURCHASE_BILL_POSTING_COPY}`)) return;
    setActionBusy(`post:${candidateId}`);
    setError(null);
    try {
      const result = await postBridgeCandidate(candidateId, { idempotency_key: idempotencyKey, confirm: true, posting_note: postingNote });
      setNotice(result.posted ? "Bridge journal posted. Row remains POSTED_UNVERIFIED until explicit reconciliation verification." : "Candidate was already posted with the same idempotency key.");
      setPreview(null);
      setSelectedCandidateIds((current) => current.filter((id) => id !== candidateId));
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post bridge candidate.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBatchPreview() {
    if (selectedCandidateIds.length === 0) return;
    setActionBusy("batch-preview");
    setError(null);
    try {
      const result = await previewBridgeCandidateBatch(selectedCandidateIds);
      setNotice(`Batch preview: ${result.postable_count} postable, ${result.blocked_count} blocked, total debit ${result.total_debit}, total credit ${result.total_credit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview selected candidates.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBatchPost() {
    if (!selectedAllPostable) return;
    if (!window.confirm(`Post ${selectedCandidateRows.length} selected bridge candidate(s)? ${PURCHASE_BILL_POSTING_COPY}`)) return;
    setActionBusy("batch-post");
    setError(null);
    try {
      const idempotencyKeys = Object.fromEntries(selectedCandidateRows.map((row) => [row.bridge_candidate_id as string, row.idempotency_key as string]));
      const result = await postBridgeCandidateBatch({ candidate_ids: selectedCandidateIds, idempotency_keys: idempotencyKeys, confirm: true, posting_note: postingNote });
      setNotice(`Batch post complete: ${result.posted_count} posted, ${result.skipped_already_posted_count} already posted, ${result.blocked_count} blocked.`);
      setSelectedCandidateIds([]);
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post selected candidates.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleVerify(row: AccountingBridgeReconciliationRow) {
    if (!row.existing_reconciliation_item_id) return;
    setActionBusy(`verify:${row.existing_reconciliation_item_id}`);
    setError(null);
    try {
      await verifyBridgeReconciliationItem(row.existing_reconciliation_item_id, { note: "Verified from bridge reconciliation cockpit." });
      setNotice("Bridge reconciliation item verified. Row should now be RECONCILED.");
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify reconciliation item.");
    } finally {
      setActionBusy(null);
    }
  }

  function rowAction(row: AccountingBridgeReconciliationRow) {
    const candidateId = row.bridge_candidate_id || row.id || "";
    if (row.row_type !== "bridge_candidate") {
      if (row.status === "POSTABLE" || row.status === "READY_UNPOSTED") {
        return (
          <div className="flex flex-col gap-2 text-xs">
            <Link href={`${ROUTES.admin.accountingBridgeReconciliation}?event_key=${encodeURIComponent(row.event_key)}&source_model=${encodeURIComponent(row.source_model || "")}`} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900">View source items</Link>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Abstract readiness rows cannot be posted.</span>
          </div>
        );
      }
      if (row.status === "UNSUPPORTED_SOURCE" || row.event_key === "staff_advance") return <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">Unsupported source. No Post action.</span>;
      if (row.status === "BLOCKED_BY_PERIOD") return <Link href={ROUTES.admin.accountingPeriods} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Open accounting periods</Link>;
      if (row.status === "BLOCKED_BY_NUMBERING") return <Link href={DOCUMENT_NUMBERING_HREF} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Open document numbering</Link>;
      if (row.status === "BLOCKED_BY_MAPPING") return <Link href={MAPPING_AUDIT_HREF} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Open mapping audit</Link>;
      return <span className="text-xs text-muted-foreground">No source action.</span>;
    }
    if (!isConcretePreviewCandidate(row)) return <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Preview unavailable: {row.blocker_reason || row.status}</span>;
    return (
      <div className="flex flex-col gap-2 text-xs">
        <button type="button" disabled={!candidateId || actionBusy === `preview:${candidateId}`} onClick={() => void handlePreviewCandidate(candidateId)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left font-semibold text-blue-900">{isConcretePostableCandidate(row) ? "Preview to post" : "Preview"}</button>
        {!isConcretePostableCandidate(row) ? <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Post disabled: {row.blocker_reason || statusLabel(row)}</span> : null}
        {row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">View journal</Link> : null}
        {(row.posted_unverified || row.reconciliation_state === "POSTED_UNVERIFIED") && row.existing_reconciliation_item_id ? <button type="button" disabled={actionBusy === `verify:${row.existing_reconciliation_item_id}`} onClick={() => void handleVerify(row)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left font-semibold text-emerald-900">Verify</button> : null}
      </div>
    );
  }

  if (loading) return <PortalPage title="Accounting Bridge Reconciliation" subtitle="Controlled bridge posting and reconciliation review."><LoadingBlock label="Loading bridge reconciliation cockpit..." /></PortalPage>;

  return (
    <PortalPage title="Accounting Bridge Reconciliation" subtitle="Controlled Payment, ReceiptDocument, BillingInvoice, RentLeaseBillingDemand, BillingCreditNote, DirectSaleReturn, BillingDebitNote, PurchaseBill, VendorPayment, StockLedger, Commission, CommissionPayoutBatch, and SalarySheet bridge candidates. Posting is explicit; reconciliation is never automatic." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]} actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Accounting Periods", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: RECONCILIATION_RUNS_HREF, label: "Reconciliation Runs", variant: "secondary" }]} statusBadge={{ label: "Read-only until explicit post", tone: "info" }}>
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting operations path</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Preview source item → post explicitly → verify reconciliation</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Concrete candidates include Payment, ReceiptDocument, BillingInvoice, RentLeaseBillingDemand, BillingCreditNote, DirectSaleReturn, BillingDebitNote, PurchaseBill, VendorPayment, StockLedger, Commission, CommissionPayoutBatch, and SalarySheet. Abstract readiness rows show “View source items” and cannot post. Posting creates accounting entries only; it does not edit invoice, contract, payment, receipt, security deposit, stock ledger, inventory quantity, valuation, sale/delivery, purchase bill, vendor payment, commission, payout, payroll, staff, attendance, or StaffAdvance records.</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Payment ready" value={Number(summary.payment_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=Payment&status=READY_UNPOSTED`} />
            <SummaryCard label="Receipt ready" value={Number(summary.receipt_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=ReceiptDocument&status=READY_UNPOSTED`} />
            <SummaryCard label="Invoice ready" value={Number(summary.billing_invoice_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=BillingInvoice&status=READY_UNPOSTED`} />
            <SummaryCard label="Rent/lease ready" value={Number(summary.rent_lease_revenue_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=RentLeaseBillingDemand&status=READY_UNPOSTED`} />
            <SummaryCard label="Credit/return ready" value={Number(summary.credit_return_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=BillingCreditNote&status=READY_UNPOSTED`} />
            <SummaryCard label="Debit note ready" value={Number(summary.debit_note_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=BillingDebitNote&status=READY_UNPOSTED`} />
            <SummaryCard label="Purchase bill ready" value={Number(summary.purchase_bill_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=PurchaseBill&status=READY_UNPOSTED`} />
            <SummaryCard label="Vendor payment ready" value={Number(summary.vendor_payment_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=VendorPayment&status=READY_UNPOSTED`} />
            <SummaryCard label="Stock ledger ready" value={Number(summary.stock_ledger_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=StockLedger&status=READY_UNPOSTED`} />
            <SummaryCard label="Commission ready" value={Number(summary.commission_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=Commission&status=READY_UNPOSTED`} />
            <SummaryCard label="Payout ready" value={Number(summary.commission_payout_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=CommissionPayoutBatch&status=READY_UNPOSTED`} />
            <SummaryCard label="Payroll ready" value={Number(summary.payroll_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=SalarySheet&status=READY_UNPOSTED`} />
            {summary.stock_ledger_cogs_ready_unposted_count !== undefined ? <SummaryCard label="COGS ready" value={Number(summary.stock_ledger_cogs_ready_unposted_count ?? 0)} tone="border-blue-200 bg-blue-50 text-blue-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=StockLedger&status=READY_UNPOSTED`} /> : null}
            {summary.stock_ledger_deferred_cogs_count !== undefined ? <SummaryCard label="COGS deferred" value={Number(summary.stock_ledger_deferred_cogs_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={`${ROUTES.admin.accountingBridgeReconciliation}?source_model=StockLedger&event_key=deferred_cogs`} /> : null}
            <SummaryCard label="Purchase posted" value={Number(summary.purchase_bill_posted_unverified_count ?? summary.purchase_bill_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=PurchaseBill`} />
            <SummaryCard label="Vendor posted" value={Number(summary.vendor_payment_posted_unverified_count ?? summary.vendor_payment_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=VendorPayment`} />
            <SummaryCard label="Rent/lease posted" value={Number(summary.rent_lease_revenue_posted_unverified_count ?? summary.rent_lease_revenue_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=RentLeaseBillingDemand`} />
            <SummaryCard label="Stock posted" value={Number(summary.stock_ledger_posted_unverified_count ?? summary.stock_ledger_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=StockLedger`} />
            <SummaryCard label="Commission posted" value={Number(summary.commission_posted_unverified_count ?? summary.commission_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=Commission`} />
            <SummaryCard label="Payout posted" value={Number(summary.commission_payout_posted_unverified_count ?? summary.commission_payout_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=CommissionPayoutBatch`} />
            <SummaryCard label="Payroll posted" value={Number(summary.payroll_posted_unverified_count ?? summary.payroll_posted_count ?? 0)} tone="border-emerald-200 bg-white text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=POSTED_UNVERIFIED&source_model=SalarySheet`} />
            <SummaryCard label="Purchase reconciled" value={Number(summary.purchase_bill_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=PurchaseBill`} />
            <SummaryCard label="Vendor reconciled" value={Number(summary.vendor_payment_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=VendorPayment`} />
            <SummaryCard label="Rent/lease reconciled" value={Number(summary.rent_lease_revenue_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=RentLeaseBillingDemand`} />
            <SummaryCard label="Stock reconciled" value={Number(summary.stock_ledger_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=StockLedger`} />
            <SummaryCard label="Commission reconciled" value={Number(summary.commission_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=Commission`} />
            <SummaryCard label="Payout reconciled" value={Number(summary.commission_payout_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=CommissionPayoutBatch`} />
            <SummaryCard label="Payroll reconciled" value={Number(summary.payroll_reconciled_count ?? 0)} tone="border-emerald-200 bg-emerald-50 text-emerald-900" href={`${ROUTES.admin.accountingBridgeReconciliation}?status=RECONCILED&source_model=SalarySheet`} />
            <SummaryCard label="Blocked" value={Number(summary.blocked_bridge_item_count ?? summary.blocked_count ?? 0)} tone="border-amber-200 bg-amber-50 text-amber-950" href={statusHref("BLOCKED")} />
            <SummaryCard label="Unsupported" value={Number(summary.unsupported_source_count ?? summary.unsupported_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" href={statusHref("UNSUPPORTED")} />
            <SummaryCard label="Exceptions" value={Number(summary.reconciliation_exception_count ?? summary.exception_count ?? 0)} tone="border-red-200 bg-red-50 text-red-900" />
          </div>
          <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{readinessBlockers.length ? readinessBlockers.join(" ") : "No selected-context blocker reported."}</div>
        </section>

        <WorkspaceSection title="Filters" description="Use source model and status filters to separate ready, posted-unverified, reconciled, unsupported, and blocked rows.">
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.financial_year ?? ""} onChange={(event) => setDraft("financial_year", event.target.value)}><option value="">Active financial year</option>{availableFinancialYears.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} {row.is_active ? "(active)" : ""}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.accounting_period ?? ""} onChange={(event) => setDraft("accounting_period", event.target.value)}><option value="">Current/open period</option>{availablePeriods.map((row) => <option key={row.id ?? row.code} value={String(row.id ?? row.code ?? "")}>{row.code} · {row.status}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.source_model ?? ""} onChange={(event) => setDraft("source_model", event.target.value)}>{SOURCE_MODEL_OPTIONS.map((option) => <option key={option || "all-models"} value={option}>{option || "All source models"}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Vendor / source reference" value={draftFilters.vendor ?? ""} onChange={(event) => setDraft("vendor", event.target.value)} />
            <div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div>
          </div>
        </WorkspaceSection>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold">{selectedCandidateIds.length} selected source item(s)</div>
              <div className="text-xs">Source models: {selectedSourceModels}. {PURCHASE_BILL_POSTING_COPY}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-64 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs" placeholder="Optional posting note" value={postingNote} onChange={(event) => setPostingNote(event.target.value)} />
              <ActionButton variant="secondary" onClick={() => void handleBatchPreview()} disabled={selectedCandidateIds.length === 0 || actionBusy === "batch-preview"}>{actionBusy === "batch-preview" ? "Previewing..." : "Preview selected"}</ActionButton>
              <ActionButton variant="primary" onClick={() => void handleBatchPost()} disabled={!selectedAllPostable || actionBusy === "batch-post"}>{actionBusy === "batch-post" ? "Posting..." : "Post selected"}</ActionButton>
            </div>
          </div>
          {!selectedAllPostable && selectedCandidateIds.length > 0 ? <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">Batch post is disabled because one or more selected rows are abstract, blocked, unsupported, already posted, or not concrete supported candidates.</div> : null}
        </section>

        <BridgeRows title="Blocked / exception rows" rows={exceptionRows} empty="No blocked or exception rows for the current filters." rowAction={rowAction} selectable={false} selectedIds={selectedCandidateIds} toggleCandidate={toggleCandidate} />
        <BridgeRows title="Source event drilldown" rows={rows} empty="No rows for the current filters." rowAction={rowAction} selectable selectedIds={selectedCandidateIds} toggleCandidate={toggleCandidate} isSelectable={isConcretePostableCandidate} />

        {preview ? <PreviewModal preview={preview} onClose={() => setPreview(null)} onPost={() => void handlePostCandidate(preview.candidate_id, preview.idempotency_key)} busy={actionBusy === `post:${preview.candidate_id}`} /> : null}
      </div>
    </PortalPage>
  );
}

function BridgeRows({ title, rows, empty, rowAction, selectable, selectedIds, toggleCandidate, isSelectable }: { title: string; rows: AccountingBridgeReconciliationRow[]; empty: string; rowAction: (row: AccountingBridgeReconciliationRow) => React.ReactNode; selectable: boolean; selectedIds: string[]; toggleCandidate: (candidateId: string, checked: boolean) => void; isSelectable?: (row: AccountingBridgeReconciliationRow) => boolean }) {
  return (
    <WorkspaceSection title={title} description="Concrete source candidates use preview/post/verify. Abstract readiness rows route to source-item review only.">
      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{selectable ? <th className="px-4 py-3 font-semibold">Select</th> : null}<th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Journal</th><th className="px-4 py-3 font-semibold">Reconciliation</th><th className="px-4 py-3 font-semibold">Admin action</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={selectable ? 7 : 6}>{empty}</td></tr> : rows.map((row) => {
              const candidateId = row.bridge_candidate_id || row.id || "";
              const canSelect = Boolean(isSelectable?.(row));
              return (
                <tr key={rowKey(row)} className="align-top">
                  {selectable ? <td className="px-4 py-4"><input type="checkbox" className="h-4 w-4" disabled={!canSelect} checked={Boolean(candidateId && selectedIds.includes(candidateId))} onChange={(event) => toggleCandidate(candidateId, event.target.checked)} aria-label={`Select ${row.source_reference || row.event_key}`} /></td> : null}
                  <td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(statusLabel(row)))}>{statusLabel(row)}</span></td>
                  <td className="px-4 py-4 text-xs text-muted-foreground"><div className="font-semibold text-foreground">{sourceTitle(row)}</div><div>Model: {row.source_model || row.module}</div>{row.source_reference ? <div>Ref: {row.source_reference}</div> : null}{row.source_date ? <div>Date: {row.source_date}</div> : null}{sourceExtra(row)}</td>
                  <td className="px-4 py-4 text-xs font-semibold">{row.amount ?? "-"}</td>
                  <td className="px-4 py-4 text-xs">{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">{row.journal_entry.entry_no || `Journal #${row.journal_entry.id}`}</Link> : <span className="text-muted-foreground">Not posted</span>}</td>
                  <td className="px-4 py-4 text-xs">{row.reconciliation_linked ? `${row.reconciliation_items.length} item(s)` : "Not linked"}</td>
                  <td className="px-4 py-4">{rowAction(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WorkspaceSection>
  );
}

function PreviewModal({ preview, onClose, onPost, busy }: { preview: BridgePostingPreview; onClose: () => void; onPost: () => void; busy: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting preview</div>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{preview.source.display}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{preview.source.model === "Commission" ? COMMISSION_PREVIEW_COPY : preview.source.model === "PurchaseBill" ? PURCHASE_BILL_PREVIEW_COPY : preview.safety_text}</p>
            <p className="mt-1 text-xs text-muted-foreground">Source model: {preview.source.model}. Posting does not mutate invoice, contract, payment, receipt, security deposit, payroll, staff, attendance, StaffAdvance, commission, payout, inventory, purchase, or source financial fields.</p>
            {preview.source.model === "Commission" ? <p className="mt-1 text-xs text-muted-foreground">Partner/staff: {preview.source.partner_name ?? "-"} · Commission status: {preview.source.commission_status ?? "-"}</p> : null}
            {preview.source.model === "CommissionPayoutBatch" ? <p className="mt-1 text-xs text-muted-foreground">Partner/staff: {preview.source.partner_name ?? "-"} · Payout status: {preview.source.payout_status ?? "-"} · Account: {preview.source.payment_method ?? "-"} / {preview.source.finance_account_name ?? "-"}</p> : null}
            {preview.source.model === "RentLeaseBillingDemand" ? <p className="mt-1 text-xs text-muted-foreground">Rent/lease: {preview.source.rent_lease_reference ?? preview.source.reference_number ?? "-"} · {preview.source.plan_type ?? "-"} · Period {preview.source.billing_month ?? preview.source.billing_period ?? "-"} · Contract {preview.source.contract_reference ?? preview.source.subscription_id ?? "-"}</p> : null}
            {preview.source.model === "SalarySheet" ? <p className="mt-1 text-xs text-muted-foreground">Payroll: {preview.source.salary_reference ?? preview.source.reference_number ?? "-"} · Staff: {preview.source.staff_name ?? "-"} · Period: {preview.source.payroll_period ?? preview.source.payroll_period_code ?? "-"} · Status: {preview.source.payroll_status ?? "-"}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Close</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Journal date</div><div className="font-semibold">{preview.journal_date ?? "Blocked"}</div></div><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Number preview</div><div className="font-semibold">{preview.journal_number_preview ?? "Blocked"}</div></div><div className="rounded-xl border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">Balanced</div><div className="font-semibold">{preview.is_balanced ? "Yes" : "No"}</div></div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><LineList title="Debit lines" lines={preview.debit_lines} side="debit" /><LineList title="Credit lines" lines={preview.credit_lines} side="credit" /></div>
        {preview.tax_lines?.length ? <LineList title="Tax lines" lines={preview.tax_lines} side="debit" /> : null}
        {preview.blockers.length ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{preview.blockers.join(" ")}</div> : null}
        {preview.warnings.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{preview.warnings.join(" ")}</div> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" onClick={onPost} disabled={!preview.can_post || busy}>{busy ? "Posting..." : "Post after confirmation"}</ActionButton></div>
      </div>
    </div>
  );
}

function LineList({ title, lines, side }: { title: string; lines: Array<{ chart_account?: { code?: string; name?: string } | null; description?: string; debit_amount: string; credit_amount: string }>; side: "debit" | "credit" }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {lines.map((line, index) => <div key={`${title}-${index}`} className="rounded-lg border border-border px-3 py-2 text-sm"><div className="font-semibold">{line.chart_account?.code} · {line.chart_account?.name}</div><div className="text-xs text-muted-foreground">{line.description}</div><div className="mt-1 text-xs font-semibold">{side === "debit" ? line.debit_amount : line.credit_amount}</div></div>)}
    </div>
  );
}
