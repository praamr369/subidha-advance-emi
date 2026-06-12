"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

const STATUS_OPTIONS = ["", "READY_UNPOSTED", "POSTED_UNVERIFIED", "POSTED", "RECONCILED", "BLOCKED", "BLOCKED_BY_MAPPING", "BLOCKED_BY_FINANCE_ACCOUNT", "BLOCKED_BY_PERIOD", "BLOCKED_BY_NUMBERING", "BLOCKED_BY_APPROVAL", "UNSUPPORTED", "UNSUPPORTED_SOURCE", "EXCEPTION"];
const SOURCE_MODEL_OPTIONS = [
  { value: "", label: "All source models" },
  { value: "Payment", label: "Payment" },
  { value: "ReceiptDocument", label: "Receipt Document" },
  { value: "BillingInvoice", label: "Billing Invoice" },
  { value: "RentLeaseBillingDemand", label: "Rent/Lease Revenue Demand" },
  { value: "RentLeaseCollection", label: "Rent/Lease Collection" },
  { value: "BillingCreditNote", label: "Billing Credit Note" },
  { value: "DirectSaleReturn", label: "Direct Sale Return" },
  { value: "BillingDebitNote", label: "Billing Debit Note" },
  { value: "PurchaseBill", label: "Purchase Bill" },
  { value: "VendorPayment", label: "Vendor Payment" },
  { value: "StockLedger", label: "Stock Ledger" },
  { value: "Commission", label: "Commission" },
  { value: "CommissionPayoutBatch", label: "Commission Payout Batch" },
  { value: "SalarySheet", label: "Salary Sheet" },
  { value: "SalaryPayment", label: "Salary Payment" },
];
const CONCRETE_POST_MODELS = new Set(SOURCE_MODEL_OPTIONS.map((item) => item.value).filter(Boolean));
const MAPPING_AUDIT_HREF = "/admin/accounting/setup/mapping-audit";
const RECONCILIATION_RUNS_HREF = "/admin/reconciliation/runs";
const DOCUMENT_NUMBERING_HREF = ROUTES.admin.settingsBusinessSetupDocumentNumbering;
const SAFETY_COPY = "Posting creates accounting entries only after explicit admin confirmation. It does not edit source business records, collection, demand, contract, customer, deposit, finance account, inventory, payroll, commission, payout, or StaffAdvance records.";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["RECONCILED", "POSTED", "POSTABLE", "READY"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (["READY_UNPOSTED", "POSTED_UNVERIFIED"].includes(value)) return "border-blue-200 bg-blue-50 text-blue-900";
  if (value.startsWith("BLOCKED")) return "border-amber-200 bg-amber-50 text-amber-950";
  if (["EXCEPTION", "UNSUPPORTED", "UNSUPPORTED_SOURCE"].includes(value)) return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-900";
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
  return `${row.row_type}-${row.event_key}-${row.source_model ?? "registry"}-${row.source_id ?? row.source_reference ?? row.source_pk ?? "none"}-${row.status}`;
}

function modelLabel(model?: string | null): string {
  return SOURCE_MODEL_OPTIONS.find((item) => item.value === model)?.label ?? model ?? "Abstract readiness";
}

function sourceTitle(row: AccountingBridgeReconciliationRow): string {
  if (row.source_display) return row.source_display;
  if (row.collection_number) return `Rent/lease collection ${row.collection_number}`;
  if (row.rent_lease_collection_reference) return `Rent/lease collection ${row.rent_lease_collection_reference}`;
  if (row.rent_lease_reference) return `Rent/lease demand ${row.rent_lease_reference}`;
  if (row.source_reference_number) return `${modelLabel(row.source_model)} ${row.source_reference_number}`;
  if (row.source_model && row.source_id) return `${modelLabel(row.source_model)} #${row.source_id}`;
  return modelLabel(row.source_model) || row.module || "Source";
}

function InfoLine({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return <div><span className="font-medium text-slate-600">{label}:</span> {value}</div>;
}

function SourceDetails({ row }: { row: AccountingBridgeReconciliationRow }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <InfoLine label="Model" value={modelLabel(row.source_model)} />
      <InfoLine label="Reference" value={row.source_reference ?? row.source_reference_number ?? row.collection_reference} />
      <InfoLine label="External ref" value={row.external_reference_no} />
      <InfoLine label="Customer" value={row.customer_name} />
      <InfoLine label="Plan" value={row.plan_type} />
      <InfoLine label="Demand" value={row.demand_reference ?? row.rent_lease_reference ?? row.rent_lease_demand_id} />
      <InfoLine label="Subscription / contract" value={[row.subscription_id, row.contract_reference].filter(Boolean).join(" · ")} />
      <InfoLine label="Method" value={row.payment_method} />
      <InfoLine label="Finance account" value={[row.finance_account_name, row.finance_account_active === false ? "inactive" : null].filter(Boolean).join(" · ")} />
      <InfoLine label="Date" value={row.payment_date ?? row.source_date} />
      <InfoLine label="Source status" value={row.collection_status ?? row.demand_status ?? row.source_status} />
      <InfoLine label="Journal state" value={row.journal_entry?.entry_no ?? (row.existing_journal_entry_id ? `Journal #${row.existing_journal_entry_id}` : "Not posted")} />
      <InfoLine label="Reconciliation" value={row.reconciliation_state ?? (row.existing_reconciliation_item_id ? `Item #${row.existing_reconciliation_item_id}` : "Pending posting")} />
    </div>
  );
}

function SummaryCard({ label, value, href, tone = "border-blue-200 bg-blue-50 text-blue-900" }: { label: string; value: number; href?: string; tone?: string }) {
  const body = <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

function rowCanPreview(row: AccountingBridgeReconciliationRow): boolean {
  return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id && row.can_preview && row.source_model && CONCRETE_POST_MODELS.has(row.source_model));
}

function rowCanPost(row: AccountingBridgeReconciliationRow): boolean {
  return rowCanPreview(row) && Boolean(row.idempotency_key && row.can_post && row.status === "READY_UNPOSTED");
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [draftFilters, setDraftFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BridgePostingPreview | null>(null);
  const [postingNote, setPostingNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (nextFilters: AccountingBridgeReconciliationFilters = {}, opts: { silent?: boolean } = {}) => {
    opts.silent ? setRefreshing(true) : setLoading(true);
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
  const summary = payload?.summary;
  const selectedRows = useMemo(() => rows.filter((row) => row.bridge_candidate_id && selectedIds.includes(row.bridge_candidate_id)), [rows, selectedIds]);
  const selectedAllPostable = selectedRows.length > 0 && selectedRows.every(rowCanPost);
  const exceptionRows = rows.filter((row) => row.status === "EXCEPTION" || row.status.startsWith("BLOCKED") || row.status === "UNSUPPORTED_SOURCE" || row.exception_reasons?.length);

  function bridgeHref(sourceModel: string, status?: string) {
    return `${ROUTES.admin.accountingBridgeReconciliation}?${new URLSearchParams({ source_model: sourceModel, ...(status ? { status } : {}) }).toString()}`;
  }

  function setDraft(key: keyof AccountingBridgeReconciliationFilters, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  function applyFilters() {
    setFilters(draftFilters);
    setSelectedIds([]);
    void load(draftFilters);
  }

  function clearFilters() {
    setDraftFilters({});
    setFilters({});
    setSelectedIds([]);
    void load({});
  }

  async function handlePreview(candidateId: string) {
    setBusy(`preview:${candidateId}`);
    setError(null);
    try {
      setPreview(await previewBridgeCandidate(candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview candidate.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePost(candidateId: string, idempotencyKey?: string | null) {
    if (!idempotencyKey) return;
    if (!window.confirm(`Post this bridge candidate now? ${SAFETY_COPY}`)) return;
    setBusy(`post:${candidateId}`);
    setError(null);
    try {
      const result = await postBridgeCandidate(candidateId, { idempotency_key: idempotencyKey, confirm: true, posting_note: postingNote });
      setNotice(result.posted ? "Bridge journal posted. Row remains POSTED_UNVERIFIED until verification." : "Candidate already posted with the same idempotency key.");
      setPreview(null);
      setSelectedIds((current) => current.filter((id) => id !== candidateId));
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post candidate.");
    } finally {
      setBusy(null);
    }
  }

  async function handleBatchPreview() {
    if (selectedIds.length === 0) return;
    setBusy("batch-preview");
    setError(null);
    try {
      const result = await previewBridgeCandidateBatch(selectedIds);
      setNotice(`Batch preview: ${result.postable_count} postable, ${result.blocked_count} blocked, debit ${result.total_debit}, credit ${result.total_credit}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview selected candidates.");
    } finally {
      setBusy(null);
    }
  }

  async function handleBatchPost() {
    if (!selectedAllPostable) return;
    if (!window.confirm(`Post ${selectedRows.length} selected bridge candidate(s)? ${SAFETY_COPY}`)) return;
    setBusy("batch-post");
    setError(null);
    try {
      const idempotencyKeys = Object.fromEntries(selectedRows.map((row) => [row.bridge_candidate_id as string, row.idempotency_key as string]));
      const result = await postBridgeCandidateBatch({ candidate_ids: selectedIds, idempotency_keys: idempotencyKeys, confirm: true, posting_note: postingNote });
      setNotice(`Batch post complete: ${result.posted_count} posted, ${result.skipped_already_posted_count} already posted, ${result.blocked_count} blocked.`);
      setSelectedIds([]);
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post selected candidates.");
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify(row: AccountingBridgeReconciliationRow) {
    if (!row.existing_reconciliation_item_id) return;
    setBusy(`verify:${row.existing_reconciliation_item_id}`);
    setError(null);
    try {
      await verifyBridgeReconciliationItem(row.existing_reconciliation_item_id, { note: "Verified from bridge reconciliation cockpit." });
      setNotice("Bridge reconciliation item verified.");
      await load(filters, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify reconciliation item.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(candidateId: string, checked: boolean) {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, candidateId])) : current.filter((id) => id !== candidateId));
  }

  if (loading) return <PortalPage title="Accounting Bridge Reconciliation" subtitle="Controlled bridge posting and reconciliation review."><LoadingBlock label="Loading bridge reconciliation cockpit..." /></PortalPage>;

  return (
    <PortalPage title="Accounting Bridge Reconciliation" subtitle="Controlled bridge posting for concrete source rows. Abstract rows remain non-postable." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Bridge Reconciliation" }]} actions={[{ href: MAPPING_AUDIT_HREF, label: "Mapping Audit", variant: "secondary" }, { href: ROUTES.admin.accountingPeriods, label: "Accounting Periods", variant: "secondary" }, { href: ROUTES.admin.accountingBridges, label: "Bridge Readiness", variant: "secondary" }, { href: RECONCILIATION_RUNS_HREF, label: "Reconciliation Runs", variant: "secondary" }]} statusBadge={{ label: "Explicit posting only", tone: "info" }}>
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge reconciliation" description={error} onRetry={() => void load(filters)} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounting operations path</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Preview source item → post explicitly → verify reconciliation</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Concrete candidates include all approved Phase F source models including Rent/Lease Collection. {SAFETY_COPY}</p>
            </div>
            <ActionButton variant="secondary" onClick={() => void load(filters, { silent: true })} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</ActionButton>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Payment ready" value={Number(summary?.payment_ready_unposted_count ?? 0)} href={bridgeHref("Payment", "READY_UNPOSTED")} />
            <SummaryCard label="Receipt ready" value={Number(summary?.receipt_ready_unposted_count ?? 0)} href={bridgeHref("ReceiptDocument", "READY_UNPOSTED")} />
            <SummaryCard label="Invoice ready" value={Number(summary?.billing_invoice_ready_unposted_count ?? 0)} href={bridgeHref("BillingInvoice", "READY_UNPOSTED")} />
            <SummaryCard label="Rent/lease revenue ready" value={Number(summary?.rent_lease_revenue_ready_unposted_count ?? 0)} href={bridgeHref("RentLeaseBillingDemand", "READY_UNPOSTED")} />
            <SummaryCard label="Rent/lease collection ready" value={Number(summary?.rent_lease_collection_ready_unposted_count ?? summary?.rent_lease_payment_ready_unposted_count ?? 0)} href={bridgeHref("RentLeaseCollection", "READY_UNPOSTED")} />
            <SummaryCard label="Rent/lease collection posted" value={Number(summary?.rent_lease_collection_posted_unverified_count ?? summary?.rent_lease_payment_posted_unverified_count ?? 0)} href={bridgeHref("RentLeaseCollection", "POSTED_UNVERIFIED")} tone="border-emerald-200 bg-white text-emerald-900" />
            <SummaryCard label="Purchase ready" value={Number(summary?.purchase_bill_ready_unposted_count ?? 0)} href={bridgeHref("PurchaseBill", "READY_UNPOSTED")} />
            <SummaryCard label="Vendor payment ready" value={Number(summary?.vendor_payment_ready_unposted_count ?? 0)} href={bridgeHref("VendorPayment", "READY_UNPOSTED")} />
            <SummaryCard label="Stock ready" value={Number(summary?.stock_ledger_ready_unposted_count ?? 0)} href={bridgeHref("StockLedger", "READY_UNPOSTED")} />
            <SummaryCard label="Commission ready" value={Number(summary?.commission_ready_unposted_count ?? 0)} href={bridgeHref("Commission", "READY_UNPOSTED")} />
            <SummaryCard label="Payroll ready" value={Number(summary?.payroll_ready_unposted_count ?? 0)} href={bridgeHref("SalarySheet", "READY_UNPOSTED")} />
            <SummaryCard label="Blocked" value={Number(summary?.blocked_bridge_item_count ?? summary?.blocked_count ?? 0)} href={`${ROUTES.admin.accountingBridgeReconciliation}?status=BLOCKED`} tone="border-amber-200 bg-amber-50 text-amber-950" />
          </div>
        </section>

        <WorkspaceSection title="Filters" description="Filter by source model, status, event key, period, or reference. URL filters such as source_model=RentLeaseCollection are supported.">
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Financial year" value={draftFilters.financial_year ?? ""} onChange={(event) => setDraft("financial_year", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Accounting period" value={draftFilters.accounting_period ?? ""} onChange={(event) => setDraft("accounting_period", event.target.value)} />
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.source_model ?? ""} onChange={(event) => setDraft("source_model", event.target.value)}>{SOURCE_MODEL_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select>
            <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={draftFilters.status ?? ""} onChange={(event) => setDraft("status", event.target.value)}>{STATUS_OPTIONS.map((option) => <option key={option || "all"} value={option}>{option || "All statuses"}</option>)}</select>
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Event key" value={draftFilters.event_key ?? ""} onChange={(event) => setDraft("event_key", event.target.value)} />
            <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Reference / vendor" value={draftFilters.vendor ?? ""} onChange={(event) => setDraft("vendor", event.target.value)} />
            <div className="flex gap-2 xl:col-span-3"><ActionButton variant="primary" onClick={applyFilters}>Apply</ActionButton><ActionButton variant="secondary" onClick={clearFilters}>Clear</ActionButton></div>
          </div>
        </WorkspaceSection>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="font-semibold">{selectedIds.length} selected source item(s)</div><div className="text-xs">Only concrete READY_UNPOSTED source rows can be batch-posted.</div></div>
            <div className="flex flex-wrap items-center gap-2"><input className="min-w-64 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs" placeholder="Optional posting note" value={postingNote} onChange={(event) => setPostingNote(event.target.value)} /><ActionButton variant="secondary" onClick={() => void handleBatchPreview()} disabled={selectedIds.length === 0 || busy === "batch-preview"}>{busy === "batch-preview" ? "Previewing..." : "Preview selected"}</ActionButton><ActionButton variant="primary" onClick={() => void handleBatchPost()} disabled={!selectedAllPostable || busy === "batch-post"}>{busy === "batch-post" ? "Posting..." : "Post selected"}</ActionButton></div>
          </div>
          {!selectedAllPostable && selectedIds.length > 0 ? <div className="mt-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-950">Batch post is disabled because one or more selected rows are blocked, unsupported, posted, reconciled, abstract, or not a concrete supported source.</div> : null}
        </section>

        <Rows title="Blocked / exception rows" rows={exceptionRows} selectedIds={selectedIds} toggle={toggle} onPreview={handlePreview} onVerify={handleVerify} selectable={false} busy={busy} />
        <Rows title="Source event drilldown" rows={rows} selectedIds={selectedIds} toggle={toggle} onPreview={handlePreview} onVerify={handleVerify} selectable busy={busy} />

        {preview ? <PreviewModal preview={preview} busy={busy === `post:${preview.candidate_id}`} onClose={() => setPreview(null)} onPost={() => void handlePost(preview.candidate_id, preview.idempotency_key)} /> : null}
      </div>
    </PortalPage>
  );
}

function Rows({ title, rows, selectedIds, toggle, onPreview, onVerify, selectable, busy }: { title: string; rows: AccountingBridgeReconciliationRow[]; selectedIds: string[]; toggle: (candidateId: string, checked: boolean) => void; onPreview: (candidateId: string) => Promise<void>; onVerify: (row: AccountingBridgeReconciliationRow) => Promise<void>; selectable: boolean; busy: string | null }) {
  return (
    <WorkspaceSection title={title} description="Concrete source candidates use preview/post/verify. Abstract readiness rows remain non-postable.">
      <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{selectable ? <th className="px-4 py-3 font-semibold">Select</th> : null}<th className="px-4 py-3 font-semibold">Event</th><th className="px-4 py-3 font-semibold">Source</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Action</th></tr></thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? <tr><td className="px-4 py-6 text-sm text-muted-foreground" colSpan={selectable ? 5 : 4}>No rows for the current filters.</td></tr> : rows.map((row) => {
              const candidateId = row.bridge_candidate_id || row.id || "";
              const canPost = rowCanPost(row);
              const canPreview = rowCanPreview(row);
              const actionLinks = (row.action_links ?? []).filter((link) => link.href && !link.disabled);
              return (
                <tr key={rowKey(row)} className="align-top">
                  {selectable ? <td className="px-4 py-4"><input type="checkbox" className="h-4 w-4" disabled={!canPost} checked={Boolean(candidateId && selectedIds.includes(candidateId))} onChange={(event) => toggle(candidateId, event.target.checked)} aria-label={`Select ${sourceTitle(row)}`} /></td> : null}
                  <td className="px-4 py-4"><div className="font-semibold text-foreground">{row.label}</div><div className="font-mono text-xs text-muted-foreground">{row.event_key}</div><span className={cx("mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(statusLabel(row)))}>{statusLabel(row)}</span></td>
                  <td className="px-4 py-4"><div className="font-semibold text-foreground">{sourceTitle(row)}</div><SourceDetails row={row} /></td>
                  <td className="px-4 py-4 text-xs font-semibold">{row.amount ?? "-"}</td>
                  <td className="px-4 py-4 text-xs"><div className="flex flex-col gap-2">{canPreview ? <button type="button" disabled={!candidateId || busy === `preview:${candidateId}`} onClick={() => void onPreview(candidateId)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left font-semibold text-blue-900">{canPost ? "Preview to post" : "Preview"}</button> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">No post action: {row.blocker_reason || statusLabel(row)}</span>}{(row.posted_unverified || row.reconciliation_state === "POSTED_UNVERIFIED") && row.existing_reconciliation_item_id ? <button type="button" disabled={busy === `verify:${row.existing_reconciliation_item_id}`} onClick={() => void onVerify(row)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-left font-semibold text-emerald-900">Verify</button> : null}{row.journal_entry?.id ? <Link href={`${ROUTES.admin.accountingJournals}/${row.journal_entry.id}`} className="font-semibold text-primary underline underline-offset-4">View journal</Link> : null}{actionLinks.length ? <div className="flex flex-wrap gap-1.5">{actionLinks.map((link) => <Link key={`${candidateId}-${link.key}`} href={link.href} className="rounded-md border border-border bg-white px-2 py-1 font-semibold text-foreground hover:bg-muted/40" title={link.reason || undefined}>{link.label}</Link>)}</div> : null}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WorkspaceSection>
  );
}

function PreviewModal({ preview, busy, onClose, onPost }: { preview: BridgePostingPreview; busy: boolean; onClose: () => void; onPost: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bridge preview</div><h3 className="text-lg font-semibold text-foreground">{preview.source.display}</h3><p className="mt-1 text-sm text-muted-foreground">{preview.safety_text}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Close</button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-border p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Source</div><pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(preview.source, null, 2)}</pre></div><div className="rounded-xl border border-border p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Journal</div><div className="mt-2 text-sm">Date: {preview.journal_date ?? "-"}</div><div className="text-sm">Number preview: {preview.journal_number_preview ?? "-"}</div><div className="text-sm">Balanced: {preview.is_balanced ? "Yes" : "No"}</div><div className="text-sm">Debit/Credit: {preview.total_debit} / {preview.total_credit}</div></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2"><LineList title="Debit lines" lines={preview.debit_lines} /><LineList title="Credit lines" lines={preview.credit_lines} /></div>
        {preview.blockers.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{preview.blockers.join(" ")}</div> : null}
        <div className="mt-5 flex justify-end gap-2"><ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" onClick={onPost} disabled={!preview.can_post || busy}>{busy ? "Posting..." : "Post bridge journal"}</ActionButton></div>
      </div>
    </div>
  );
}

function LineList({ title, lines }: { title: string; lines: Array<{ chart_account?: { code?: string; name?: string } | null; description?: string; debit_amount: string; credit_amount: string }> }) {
  return <div className="rounded-xl border border-border p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div><div className="mt-2 space-y-2">{lines.map((line, index) => <div key={`${title}-${index}`} className="rounded-lg border border-border/70 p-2 text-xs"><div className="font-semibold text-foreground">{line.chart_account?.code} · {line.chart_account?.name}</div><div className="text-muted-foreground">{line.description}</div><div>Dr {line.debit_amount} / Cr {line.credit_amount}</div></div>)}</div></div>;
}
