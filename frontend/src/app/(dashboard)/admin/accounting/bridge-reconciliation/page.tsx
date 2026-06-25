"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAccountingBridgeReconciliation,
  isBlockedOrExceptionRow,
  isConcreteSourceCandidate,
  isUnsupportedOrDeferredRow,
  postBridgeCandidate,
  postBridgeCandidateBatch,
  previewBridgeCandidate,
  previewBridgeCandidateBatch,
  type AccountingBridgeReconciliationFilters,
  type AccountingBridgeReconciliationPayload,
  type AccountingBridgeReconciliationRow,
  type BridgeActionLink,
  type PhaseFSourceInventoryItem,
  type ProductionAccountingValidationWorkflow,
} from "@/services/accounting-bridge-reconciliation";

const STATUS_OPTIONS = [
  "",
  "READY_UNPOSTED",
  "POSTED_UNVERIFIED",
  "POSTED",
  "RECONCILED",
  "BLOCKED",
  "BLOCKED_BY_MAPPING",
  "BLOCKED_BY_FINANCE_ACCOUNT",
  "BLOCKED_BY_PERIOD",
  "BLOCKED_BY_NUMBERING",
  "BLOCKED_BY_APPROVAL",
  "UNSUPPORTED",
  "UNSUPPORTED_SOURCE",
  "DEFERRED",
  "EXCEPTION",
];

const SOURCE_MODEL_OPTIONS = [
  { value: "", label: "All source models" },
  { value: "Payment", label: "Payment" },
  { value: "ReceiptDocument", label: "Receipt Document" },
  { value: "CustomerAdvance", label: "Customer Advance Receipt" },
  { value: "CustomerAdvanceAllocation", label: "Customer Advance Application" },
  { value: "CustomerAdvanceRefund", label: "Customer Advance Refund" },
  { value: "BillingInvoice", label: "Billing Invoice" },
  { value: "RentLeaseBillingDemand", label: "Rent/Lease Revenue Demand" },
  { value: "RentLeaseCollection", label: "Rent/Lease Collection" },
  { value: "RentLeaseDepositTransaction", label: "Security Deposit" },
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

const SAFETY_COPY =
  "Validation is read-only. Posting remains explicit, admin-only, idempotent, period-gated, numbering-gated, and reconciliation-controlled.";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function modelLabel(model?: string | null): string {
  return SOURCE_MODEL_OPTIONS.find((item) => item.value === model)?.label ?? model ?? "Source";
}

function statusClass(status: string): string {
  const value = status.toUpperCase();
  if (["RECONCILED", "POSTED", "READY", "NO_CANDIDATES", "NO_CURRENT_ROWS", "NO_CURRENT_BLOCKERS", "NO_CURRENT_POSTED_UNVERIFIED"].includes(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (["READY_UNPOSTED", "POSTED_UNVERIFIED", "VALIDATION_ONLY", "EXCLUDED"].includes(value)) {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }
  if (value.startsWith("BLOCKED") || value === "ACTION_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-950";
  if (["EXCEPTION", "UNSUPPORTED", "UNSUPPORTED_SOURCE", "UNSUPPORTED_BOUNDARY", "DEFERRED", "SOURCE_CONTRACT_ONLY", "SKIPPED_NOT_APPLICABLE", "BOUNDARY_VIOLATION"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-900";
  }
  return "border-slate-200 bg-slate-50 text-foreground";
}

function StatusBadge({ value }: { value: string }) {
  return <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(value))}>{value}</span>;
}

function SummaryCard({ label, value, detail, tone = "border-blue-200 bg-blue-50 text-blue-900" }: { label: string; value: number | string; detail?: string; tone?: string }) {
  return (
    <div className={cx("rounded-xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {detail ? <div className="mt-1 text-xs opacity-80">{detail}</div> : null}
    </div>
  );
}

function ActionLinks({ links, emptyText = "No current action" }: { links?: BridgeActionLink[]; emptyText?: string }) {
  const visibleLinks = (links ?? []).filter((link) => link.label && !link.disabled && link.href).slice(0, 3);
  if (!visibleLinks.length) return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {visibleLinks.map((link, index) => (
        <Link key={`${link.key ?? link.type ?? link.label}-${index}`} href={String(link.href)} className="rounded-full border px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function candidateId(row: AccountingBridgeReconciliationRow): string | null {
  return row.bridge_candidate_id == null ? null : String(row.bridge_candidate_id);
}

function rowStatus(row: AccountingBridgeReconciliationRow): string {
  return String(row.reconciliation_state === "POSTED_UNVERIFIED" || row.posted_unverified ? "POSTED_UNVERIFIED" : row.status || "UNKNOWN").toUpperCase();
}

function rowCanPost(row: AccountingBridgeReconciliationRow): boolean {
  return Boolean(candidateId(row)) && isConcreteSourceCandidate(row) && row.can_post === true;
}

function rowCanPreview(row: AccountingBridgeReconciliationRow): boolean {
  return Boolean(candidateId(row)) && isConcreteSourceCandidate(row) && row.can_preview !== false;
}

function rowKey(row: AccountingBridgeReconciliationRow, index: number): string {
  return [row.row_type, row.event_key, row.source_model, row.source_id, row.source_pk, row.bridge_candidate_id, row.status, index].filter(Boolean).join("-");
}

function sourceTitle(row: AccountingBridgeReconciliationRow): string {
  if (row.source_display) return row.source_display;
  if (row.refund_reference || row.refund_reference_no) return `Customer advance refund ${row.refund_reference ?? row.refund_reference_no}`;
  if (row.allocation_reference) return `Customer advance application ${row.allocation_reference}`;
  if (row.advance_reference) return `Customer advance ${row.advance_reference}`;
  if (row.collection_number) return `Rent/lease collection ${row.collection_number}`;
  if (row.deposit_transaction_number || row.deposit_reference) return `Security deposit ${row.deposit_transaction_number ?? row.deposit_reference}`;
  if (row.source_reference_number) return `${modelLabel(row.source_model)} ${row.source_reference_number}`;
  if (row.source_model && row.source_id) return `${modelLabel(row.source_model)} #${row.source_id}`;
  return row.label ?? row.event_key ?? modelLabel(row.source_model);
}

function actionCopy(row: AccountingBridgeReconciliationRow): string {
  const status = rowStatus(row);
  if (isUnsupportedOrDeferredRow(row)) {
    return status === "DEFERRED" || status === "SKIPPED_NOT_APPLICABLE"
      ? "Source contract only. Posting is owned by a later approved phase."
      : "Unsupported source. No posting workflow exists.";
  }
  if (isBlockedOrExceptionRow(row)) return "Resolve blocker before posting.";
  if (rowCanPost(row)) return "Select this row to preview/post.";
  if (row.row_type && row.row_type !== "bridge_candidate") return "Readiness-only row. No posting action.";
  return row.operator_action || row.recommended_action || "Review source readiness before posting.";
}

function inventoryActivityCount(item: PhaseFSourceInventoryItem): number {
  return Object.values(item.counts ?? {}).reduce((total: number, value) => total + Number(value ?? 0), 0);
}

function activeInventory(items: PhaseFSourceInventoryItem[]): PhaseFSourceInventoryItem[] {
  return items.filter((item) => inventoryActivityCount(item) > 0);
}

function sourceContractCount(items: PhaseFSourceInventoryItem[]): number {
  return items.filter((item) => String(item.status || "").toUpperCase() === "DEFERRED").length;
}

function unsupportedBoundaryCount(items: PhaseFSourceInventoryItem[]): number {
  return items.filter((item) => String(item.status || "").toUpperCase() === "UNSUPPORTED").length;
}

function workflowDisplayStatus(workflow: ProductionAccountingValidationWorkflow): string {
  const status = String(workflow.status || "UNKNOWN").toUpperCase();
  const rowCount = Number(workflow.current_row_count ?? 0);
  const eventKey = String(workflow.event_key || "");
  if (workflow.source_model === "WinnerHistory") return "VALIDATION_ONLY";
  if (workflow.source_model === "StaffAdvance") return "UNSUPPORTED_BOUNDARY";
  if (eventKey === "ADVANCE_ALLOCATION") return status;
  if (rowCount === 0 && eventKey.endsWith("_blockers")) return "NO_CURRENT_BLOCKERS";
  if (rowCount === 0 && eventKey === "posted_unverified_review") return "NO_CURRENT_POSTED_UNVERIFIED";
  if (rowCount === 0 && String(workflow.expected_candidate_status || "").includes("READY_UNPOSTED")) return "NO_CURRENT_ROWS";
  return status;
}

function workflowActionLinks(workflow: ProductionAccountingValidationWorkflow): BridgeActionLink[] {
  const displayStatus = workflowDisplayStatus(workflow);
  if (displayStatus.startsWith("NO_CURRENT") || displayStatus === "UNSUPPORTED_BOUNDARY" || displayStatus === "VALIDATION_ONLY" || displayStatus === "EXCLUDED") return [];
  return workflow.expected_action ? [workflow.expected_action] : [];
}

function workflowNeedsOperatorAttention(workflow: ProductionAccountingValidationWorkflow): boolean {
  const displayStatus = workflowDisplayStatus(workflow);
  const rowCount = Number(workflow.current_row_count ?? 0);
  return rowCount > 0 || displayStatus.startsWith("BLOCKED") || ["POSTED_UNVERIFIED", "BOUNDARY_VIOLATION", "EXCEPTION"].includes(displayStatus);
}

function SourceDetails({ row }: { row: AccountingBridgeReconciliationRow }) {
  const details = [
    ["Model", modelLabel(row.source_model)],
    ["Reference", row.refund_reference ?? row.refund_reference_no ?? row.allocation_reference ?? row.advance_reference ?? row.reference_no ?? row.source_reference ?? row.source_reference_number ?? row.collection_reference],
    ["Customer", row.customer_name],
    ["Amount", row.amount],
    ["Method", row.payment_method ?? row.method],
    ["Finance account", [row.finance_account_name, row.finance_account_active === false ? "inactive" : null].filter(Boolean).join(" · ")],
    ["Date", row.refund_date ?? row.allocation_date ?? row.transaction_date ?? row.payment_date ?? row.source_date],
    ["Journal", row.journal_entry?.entry_no ?? (row.existing_journal_entry_id ? `Journal #${row.existing_journal_entry_id}` : "Not posted")],
    ["Reconciliation", row.reconciliation_state ?? (row.existing_reconciliation_item_id ? `Item #${row.existing_reconciliation_item_id}` : "Pending posting")],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  return (
    <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
      {details.map(([label, value]) => (
        <div key={String(label)}><span className="font-medium text-muted-foreground">{label}:</span> {String(value)}</div>
      ))}
    </div>
  );
}

function RowsTable({ title, description, rows, selected, onToggle, onPreview, onPost, showSelection = false }: {
  title: string;
  description: string;
  rows: AccountingBridgeReconciliationRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (row: AccountingBridgeReconciliationRow) => void;
  onPost: (row: AccountingBridgeReconciliationRow) => void;
  showSelection?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">{rows.length} row(s)</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No rows available from backend payload.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {showSelection ? <th className="px-4 py-3">Select</th> : null}
                <th className="px-4 py-3">Event</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Setup / review</th><th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => {
                const id = candidateId(row);
                return (
                  <tr key={rowKey(row, index)} className="align-top">
                    {showSelection ? <td className="px-4 py-3"><input type="checkbox" disabled={!id || !rowCanPost(row)} checked={Boolean(id && selected.has(id))} onChange={() => id && onToggle(id)} aria-label={`Select ${sourceTitle(row)}`} /></td> : null}
                    <td className="px-4 py-3"><div className="font-semibold text-foreground">{row.label ?? row.event_key ?? "Source event"}</div><div className="text-xs text-muted-foreground">{row.event_key}</div></td>
                    <td className="px-4 py-3"><div className="font-medium text-foreground">{sourceTitle(row)}</div><SourceDetails row={row} /></td>
                    <td className="px-4 py-3"><StatusBadge value={rowStatus(row)} /></td>
                    <td className="px-4 py-3"><ActionLinks links={row.action_links} /></td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <p className="max-w-xs text-xs text-muted-foreground">{actionCopy(row)}</p>
                        <div className="flex flex-wrap gap-2">
                          {id && rowCanPreview(row) ? <button type="button" onClick={() => onPreview(row)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Preview</button> : null}
                          {id && rowCanPost(row) ? <button type="button" onClick={() => onPost(row)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Post</button> : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ControlTowerInventory({ payload }: { payload: AccountingBridgeReconciliationPayload }) {
  const tower = payload.phase_f_control_tower;
  const inventory = tower?.source_inventory ?? [];
  if (!tower) return <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Phase F Control Tower is not available from backend payload.</section>;

  const readinessState = tower.readiness?.state ?? tower.readiness?.primary_state ?? "UNKNOWN";
  const readinessCounts = tower.readiness?.counts ?? {};
  const activeCount = activeInventory(inventory).length;
  const sourceContract = sourceContractCount(inventory);
  const unsupported = unsupportedBoundaryCount(inventory);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Phase F Control Tower</h2>
        <p className="text-sm text-muted-foreground">Daily operator view. Empty source definitions and validation-only references are hidden from the main workflow.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Readiness" value={readinessState} detail="Backend state" tone={statusClass(readinessState)} />
        <SummaryCard label="Active source rows" value={activeCount} detail="Rows needing review" />
        <SummaryCard label="Ready" value={readinessCounts.ready_unposted ?? 0} detail="Unposted candidates" />
        <SummaryCard label="Posted unverified" value={readinessCounts.posted_unverified ?? 0} detail="Needs reconciliation" />
        <SummaryCard label="Boundaries" value={sourceContract + unsupported} detail={`${sourceContract} source-contract · ${unsupported} unsupported`} tone="border-slate-200 bg-slate-50 text-foreground" />
      </div>
      <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
        <div className="font-semibold text-foreground">F24/F25 guardrails</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><span>No new source model</span><span>No new posting source</span><span>No source mutation</span><span>No auto-post/reconcile/close</span></div>
      </div>
      {activeCount ? null : <div className="mt-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No current bridge source rows require operator action.</div>}
    </section>
  );
}

function WorkflowTable({ workflows }: { workflows: ProductionAccountingValidationWorkflow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-3">Workflow</th><th className="px-4 py-3">Source / event</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Next action</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {workflows.map((workflow) => {
            const displayStatus = workflowDisplayStatus(workflow);
            return (
              <tr key={`${workflow.domain}-${workflow.workflow}-${workflow.event_key}`} className="align-top">
                <td className="px-4 py-3 font-medium">{workflow.workflow}<div className="text-xs text-muted-foreground">{workflow.domain}</div></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{modelLabel(workflow.source_model)}<br />{workflow.event_key}</td>
                <td className="px-4 py-3"><StatusBadge value={displayStatus} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">Rows {workflow.current_row_count ?? 0} · Posted unverified {workflow.posted_unverified_count ?? 0} · Reconciled {workflow.reconciled_count ?? 0}</td>
                <td className="px-4 py-3"><ActionLinks links={workflowActionLinks(workflow)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductionValidation({ payload }: { payload: AccountingBridgeReconciliationPayload }) {
  const validation = payload.production_accounting_validation;
  if (!validation) return <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Production Accounting Validation is not available from backend payload.</section>;

  const workflows = validation.workflows ?? Object.values(validation.groups ?? {}).flat();
  const attentionWorkflows = workflows.filter(workflowNeedsOperatorAttention);
  const boundaryCount = workflows.filter((workflow) => ["VALIDATION_ONLY", "EXCLUDED", "UNSUPPORTED_BOUNDARY"].includes(workflowDisplayStatus(workflow))).length;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{validation.title ?? "Production Accounting Validation"}</h2>
        <p className="text-sm text-muted-foreground">Only workflows with current source rows, blockers, or exceptions are shown to operators.</p>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Workflows checked" value={validation.workflow_count ?? workflows.length} />
        <SummaryCard label="Needs attention" value={attentionWorkflows.length} detail="Rows/blockers only" />
        <SummaryCard label="Boundaries" value={boundaryCount} detail="Validation-only / excluded" />
        <SummaryCard label="Creates journals" value={validation.creates_journal_entry ? "Yes" : "No"} />
        <SummaryCard label="Auto posts" value={validation.auto_posts ? "Yes" : "No"} />
        <SummaryCard label="Mutates sources" value={validation.mutates_sources ? "Yes" : "No"} />
      </div>
      {attentionWorkflows.length ? <WorkflowTable workflows={attentionWorkflows} /> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No current validation workflow requires operator action.</div>}
    </section>
  );
}

export default function AccountingBridgeReconciliationPage() {
  const [payload, setPayload] = useState<AccountingBridgeReconciliationPayload | null>(null);
  const [filters, setFilters] = useState<AccountingBridgeReconciliationFilters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [postingNote, setPostingNote] = useState("");

  const load = useCallback(async (nextFilters: AccountingBridgeReconciliationFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccountingBridgeReconciliation(nextFilters);
      setPayload(data);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load accounting bridge reconciliation.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load({}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => payload?.results ?? [], [payload]);
  const concreteRows = useMemo(() => rows.filter(isConcreteSourceCandidate), [rows]);
  const blockedRows = useMemo(() => rows.filter(isBlockedOrExceptionRow), [rows]);
  const boundaryRows = useMemo(() => rows.filter(isUnsupportedOrDeferredRow), [rows]);
  const showOperationalTables = concreteRows.length > 0 || blockedRows.length > 0 || boundaryRows.length > 0;
  const selectedRows = useMemo(() => concreteRows.filter((row) => {
    const id = candidateId(row);
    return Boolean(id && selected.has(id));
  }), [concreteRows, selected]);
  const selectedCanPost = selectedRows.length > 0 && selectedRows.every(rowCanPost);

  function updateFilter(key: keyof AccountingBridgeReconciliationFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePreview(row: AccountingBridgeReconciliationRow) {
    const id = candidateId(row);
    if (!id) return;
    try {
      const preview = await previewBridgeCandidate(id);
      setOperationMessage(`Preview ready for ${sourceTitle(row)}. Debit ${preview.total_debit}; credit ${preview.total_credit}.`);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : "Preview failed.");
    }
  }

  async function handlePost(row: AccountingBridgeReconciliationRow) {
    const id = candidateId(row);
    if (!id || !rowCanPost(row)) return;
    if (!window.confirm("Post this bridge candidate now? This creates accounting entries and remains auditable.")) return;
    try {
      const idempotencyKey = row.idempotency_key || `bridge-${id}-${Date.now()}`;
      await postBridgeCandidate(id, { idempotency_key: idempotencyKey, confirm: true, posting_note: postingNote || undefined });
      setOperationMessage(`Posted ${sourceTitle(row)}.`);
      await load(filters);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : "Posting failed.");
    }
  }

  async function handleBatchPreview() {
    const ids = selectedRows.map(candidateId).filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    try {
      const preview = await previewBridgeCandidateBatch(ids);
      setOperationMessage(`Batch preview ready. Postable ${preview.postable_count}; blocked ${preview.blocked_count}; debit ${preview.total_debit}; credit ${preview.total_credit}.`);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : "Batch preview failed.");
    }
  }

  async function handleBatchPost() {
    const ids = selectedRows.map(candidateId).filter((id): id is string => Boolean(id));
    if (!ids.length || !selectedCanPost) return;
    if (!window.confirm(`Post ${ids.length} selected bridge candidate(s)?`)) return;
    const idempotency_keys = Object.fromEntries(ids.map((id) => [id, `bridge-batch-${id}-${Date.now()}`]));
    try {
      const result = await postBridgeCandidateBatch({ candidate_ids: ids, idempotency_keys, confirm: true, posting_note: postingNote || undefined });
      setOperationMessage(`Batch posted ${result.posted_count}; blocked ${result.blocked_count}.`);
      await load(filters);
    } catch (err) {
      setOperationMessage(err instanceof Error ? err.message : "Batch posting failed.");
    }
  }

  if (loading && !payload) return <main className="p-6"><div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading accounting bridge reconciliation…</div></main>;
  if (error && !payload) return <main className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">{error}</div></main>;

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Admin · Accounting · Bridge Reconciliation</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Accounting Bridge Reconciliation</h1>
            <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{SAFETY_COPY}</p>
          </div>
          <button type="button" onClick={() => load(filters)} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Refresh</button>
        </div>
      </section>

      {payload ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Ready unposted" value={payload.summary.ready_unposted_count ?? 0} />
            <SummaryCard label="Blocked" value={payload.summary.blocked_count ?? 0} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Posted unverified" value={payload.summary.posted_unverified_count ?? 0} />
            <SummaryCard label="Reconciled" value={payload.summary.reconciled_count ?? 0} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Unsupported" value={payload.summary.unsupported_count ?? 0} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Exceptions" value={payload.summary.exception_count ?? 0} tone="border-red-200 bg-red-50 text-red-900" />
          </section>

          <ControlTowerInventory payload={payload} />
          <ProductionValidation payload={payload} />

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Filters</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select value={filters.source_model ?? ""} onChange={(event) => updateFilter("source_model", event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
                {SOURCE_MODEL_OPTIONS.map((item) => <option key={item.value || "all"} value={item.value}>{item.label}</option>)}
              </select>
              <select value={filters.status ?? ""} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
                {STATUS_OPTIONS.map((status) => <option key={status || "all"} value={status}>{status || "All statuses"}</option>)}
              </select>
              <input value={filters.event_key ?? ""} onChange={(event) => updateFilter("event_key", event.target.value)} placeholder="Event key" className="rounded-lg border bg-background px-3 py-2 text-sm" />
              <input value={filters.vendor ?? ""} onChange={(event) => updateFilter("vendor", event.target.value)} placeholder="Reference / vendor" className="rounded-lg border bg-background px-3 py-2 text-sm" />
              <div className="flex gap-2"><button type="button" onClick={() => load(filters)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Apply</button><button type="button" onClick={() => { setFilters({}); void load({}); }} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Clear</button></div>
            </div>
          </section>

          {showOperationalTables ? (
            <>
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground">Selected-row batch panel</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRows.length} selected concrete source item(s). Only concrete READY_UNPOSTED source rows with posting permission can be batch-posted.</p>
                <textarea value={postingNote} onChange={(event) => setPostingNote(event.target.value)} placeholder="Optional posting note" className="mt-4 min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!selectedRows.length} onClick={handleBatchPreview} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">Preview selected</button><button type="button" disabled={!selectedCanPost} onClick={handleBatchPost} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Post selected</button></div>
                {operationMessage ? <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{operationMessage}</div> : null}
              </section>
              <RowsTable title="Concrete source candidates" description="Real bridge candidate rows from the backend payload. Preview/post remains explicit and row controlled." rows={concreteRows} selected={selected} onToggle={toggleSelected} onPreview={handlePreview} onPost={handlePost} showSelection />
              <RowsTable title="Blocked / exception rows" description="Rows that require setup, approval, or reconciliation action before posting can continue." rows={blockedRows} selected={selected} onToggle={toggleSelected} onPreview={handlePreview} onPost={handlePost} />
              <RowsTable title="Unsupported / deferred boundaries" description="Unsupported and source-contract-only rows remain visible but non-postable." rows={boundaryRows} selected={selected} onToggle={toggleSelected} onPreview={handlePreview} onPost={handlePost} />
            </>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Operational bridge queue</h2>
              <p className="mt-1 text-sm text-muted-foreground">No concrete candidates, blocked rows, exceptions, unsupported rows, or deferred source rows are present in the backend payload.</p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
