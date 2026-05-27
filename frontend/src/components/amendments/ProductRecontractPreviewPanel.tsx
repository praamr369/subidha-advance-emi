"use client";

import { useEffect, useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import {
  executeProductRecontract,
  generateProductRecontractFinancialImpactPreview,
  getProductRecontractFinancialImpactPreview,
  generateProductRecontractSchedulePreview,
  getProductRecontractSchedulePreview,
  listProductRecontractEvents,
  previewProductRecontractAmendment,
  recordProductRecontractAdminDecision,
  saveProductRecontractPreviewSnapshot,
  type ContractRecontractEvent,
  type ContractRecontractFinancialImpactPreview,
  type ProductRecontractPreview,
} from "@/services/amendmentPreviews";
import type { AmendmentRecord } from "@/services/amendments";

const EXECUTION_CONFIRMATION = "EXECUTE RECONTRACT";
const EXECUTION_WARNING =
  "This will update the subscription product, contract amount, monthly EMI, tenure, and pending EMI schedule. Historical payments, receipts, paid EMIs, accounting postings, reconciliation evidence, settlement/day-close, lucky ID, batch, waiver/draw, stock, delivery, commission, payout, rent/lease demand, and deposit records will remain unchanged.";

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

function ChecklistRow({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <span>{label}</span>
      <span className={complete ? "font-semibold text-emerald-700 dark:text-emerald-300" : "font-semibold text-amber-700 dark:text-amber-300"}>
        {complete ? "Ready" : "Missing"}
      </span>
    </div>
  );
}

function hasExecutionEvidence(event: ContractRecontractEvent | undefined, financialPreview: ContractRecontractFinancialImpactPreview | null) {
  if (!event) return false;
  return (
    event.customer_consent_status === "ACCEPTED" &&
    event.admin_approval_status === "APPROVED" &&
    (event.schedule_preview_lines || []).length > 0 &&
    Boolean(financialPreview) &&
    Boolean(event.accounting_bridge_posting_id) &&
    Boolean(event.journal_entry_id) &&
    Boolean(event.reconciliation_item_id) &&
    Boolean(event.reconciliation_run_id) &&
    (event.reconciliation_evidence_ids || []).length > 0 &&
    (event.schedule_line_ids || []).length > 0 &&
    !event.executed
  );
}

function ExecutionSummary({ event }: { event: ContractRecontractEvent }) {
  const before = event.execution_snapshot?.before_subscription || {};
  const after = event.execution_snapshot?.after_subscription || {};
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="font-semibold text-emerald-900 dark:text-emerald-100">Execution status: {event.execution_status || "EXECUTED"}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <MoneyRow label="Executed at" value={event.executed_at} />
        <MoneyRow label="Executed by" value={event.executed_by} />
        <MoneyRow label="Old product" value={event.old_product_name || (before.product_id ? `#${before.product_id}` : "—")} />
        <MoneyRow label="New product" value={event.new_product_name || (after.product_id ? `#${after.product_id}` : "—")} />
        <MoneyRow label="Old total" value={typeof before.total_amount === "string" ? before.total_amount : event.old_contract_total} />
        <MoneyRow label="New total" value={typeof after.total_amount === "string" ? after.total_amount : event.new_contract_total} />
        <MoneyRow label="Old monthly EMI" value={typeof before.monthly_amount === "string" ? before.monthly_amount : event.current_monthly_amount} />
        <MoneyRow label="New monthly EMI" value={typeof after.monthly_amount === "string" ? after.monthly_amount : event.proposed_monthly_amount} />
        <MoneyRow label="Schedule line ids" value={(event.schedule_line_ids || []).join(", ")} />
        <MoneyRow label="Accounting bridge id" value={event.accounting_bridge_posting_id} />
        <MoneyRow label="Journal entry id" value={event.journal_entry_id} />
        <MoneyRow label="Reconciliation item id" value={event.reconciliation_item_id} />
        <MoneyRow label="Reconciliation run id" value={event.reconciliation_run_id} />
      </div>
      <p className="text-muted-foreground">No rollback or reversal action is available in this phase.</p>
    </div>
  );
}

function ExecutionPanel({
  event,
  financialPreview,
  onExecuted,
}: {
  event: ContractRecontractEvent | undefined;
  financialPreview: ContractRecontractFinancialImpactPreview | null;
  onExecuted: (event: ContractRecontractEvent) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return null;

  const checklist = [
    { label: "Customer consent accepted", complete: event.customer_consent_status === "ACCEPTED" },
    { label: "Admin approval approved", complete: event.admin_approval_status === "APPROVED" },
    { label: "Schedule preview generated", complete: (event.schedule_preview_lines || []).length > 0 && (event.schedule_line_ids || []).length > 0 },
    { label: "Accounting posting exists", complete: Boolean(event.accounting_bridge_posting_id) && Boolean(event.journal_entry_id) },
    { label: "Reconciliation bridge exists", complete: Boolean(event.reconciliation_item_id) && Boolean(event.reconciliation_run_id) && (event.reconciliation_evidence_ids || []).length > 0 },
    { label: "No previous execution", complete: !event.executed },
  ];
  const ready = hasExecutionEvidence(event, financialPreview);

  if (event.executed) {
    return (
      <DetailPanel title="Product recontract execution" description="Read-only execution evidence returned by backend.">
        <ExecutionSummary event={event} />
      </DetailPanel>
    );
  }

  if (!ready) return null;

  async function runExecution() {
    setExecuting(true);
    setError(null);
    try {
      const executedEvent = await executeProductRecontract(event.amendment_id);
      onExecuted(executedEvent);
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product recontract execution failed.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <DetailPanel title="Product recontract execution" description="Admin-only final execution after all backend evidence exists.">
      <div className="space-y-4">
        <p className="rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
          {EXECUTION_WARNING}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {checklist.map((item) => (
            <ChecklistRow key={item.label} label={item.label} complete={item.complete} />
          ))}
        </div>
        <label className="block text-sm font-medium">
          Type {EXECUTION_CONFIRMATION} to enable execution
          <input
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={EXECUTION_CONFIRMATION}
          />
        </label>
        <ActionButton
          variant="outline"
          onClick={() => void runExecution()}
          disabled={executing || confirmation !== EXECUTION_CONFIRMATION}
        >
          {executing ? "Executing..." : "Execute approved recontract"}
        </ActionButton>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </DetailPanel>
  );
}

export default function ProductRecontractPreviewPanel({ amendment }: { amendment: AmendmentRecord }) {
  const [preview, setPreview] = useState<ProductRecontractPreview | null>(null);
  const [events, setEvents] = useState<ContractRecontractEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [adminDecisionNote, setAdminDecisionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleLines, setScheduleLines] = useState<ContractRecontractEvent["schedule_preview_lines"]>([]);
  const [financialBusy, setFinancialBusy] = useState(false);
  const [financialPreviews, setFinancialPreviews] = useState<ContractRecontractFinancialImpactPreview[]>([]);

  useEffect(() => {
    if (amendment.amendment_type !== "PRODUCT_CHANGE") return;
    let mounted = true;
    listProductRecontractEvents(amendment.id)
      .then((rows) => {
        if (mounted) {
          setEvents(rows);
          setScheduleLines(rows[0]?.schedule_preview_lines || []);
        }
      })
      .catch(() => {
        if (mounted) setEvents([]);
      });
    getProductRecontractFinancialImpactPreview(amendment.id)
      .then((rows) => {
        if (mounted) setFinancialPreviews(rows);
      })
      .catch(() => {
        if (mounted) setFinancialPreviews([]);
      });
    return () => {
      mounted = false;
    };
  }, [amendment.amendment_type, amendment.id]);

  if (amendment.amendment_type !== "PRODUCT_CHANGE") return null;

  const latestEvent = events[0];
  const canRecordAdminDecision =
    latestEvent?.status === "PREVIEWED" &&
    latestEvent.customer_consent_status === "ACCEPTED" &&
    (latestEvent.admin_approval_status || "PENDING") === "PENDING";
  const canGenerateSchedulePreview =
    latestEvent?.status === "PREVIEWED" &&
    latestEvent.customer_consent_status === "ACCEPTED" &&
    latestEvent.admin_approval_status === "APPROVED" &&
    !latestEvent.executed;
  const hasSchedulePreviewLines = Boolean((latestEvent?.schedule_preview_lines || scheduleLines || []).length > 0);
  const canGenerateFinancialImpactPreview =
    latestEvent?.status === "PREVIEWED" &&
    latestEvent.customer_consent_status === "ACCEPTED" &&
    latestEvent.admin_approval_status === "APPROVED" &&
    hasSchedulePreviewLines &&
    !latestEvent.executed;
  const latestFinancialImpactPreview = financialPreviews[0] || latestEvent?.latest_financial_impact_preview || null;

  async function runPreview() {
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      setPreview(await previewProductRecontractAmendment(amendment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSnapshot() {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const event = await saveProductRecontractPreviewSnapshot(amendment.id);
      const rows = await listProductRecontractEvents(amendment.id);
      setEvents(rows.length > 0 ? rows : [event]);
      setSaveMessage(`Saved preview snapshot #${event.id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview snapshot save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function recordAdminDecision(decision: "APPROVED" | "REJECTED") {
    setDecisionBusy(decision);
    setError(null);
    setSaveMessage(null);
    try {
      const event = await recordProductRecontractAdminDecision(amendment.id, decision, adminDecisionNote);
      const rows = await listProductRecontractEvents(amendment.id);
      setEvents(rows.length > 0 ? rows : [event]);
      setSaveMessage(`Admin recontract preview decision recorded: ${decision}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin decision failed.");
    } finally {
      setDecisionBusy(null);
    }
  }

  async function generateSchedulePreview() {
    setScheduleBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const event = await generateProductRecontractSchedulePreview(amendment.id);
      const rows = await listProductRecontractEvents(amendment.id);
      if (rows.length > 0) {
        setEvents(rows);
        setScheduleLines(rows[0]?.schedule_preview_lines || event.schedule_preview_lines || []);
      } else {
        setScheduleLines(event.schedule_preview_lines || []);
      }
      if ((event.schedule_preview_lines || []).length === 0) {
        setScheduleLines(await getProductRecontractSchedulePreview(amendment.id));
      }
      setSaveMessage("Future EMI schedule preview generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule preview generation failed.");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function generateFinancialImpactPreview() {
    setFinancialBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const previewRow = await generateProductRecontractFinancialImpactPreview(amendment.id);
      const rows = await getProductRecontractFinancialImpactPreview(amendment.id);
      setFinancialPreviews(rows.length > 0 ? rows : [previewRow]);
      setSaveMessage("Accounting and reconciliation impact preview generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Financial impact preview generation failed.");
    } finally {
      setFinancialBusy(false);
    }
  }

  function handleExecuted(event: ContractRecontractEvent) {
    setEvents((current) => [event, ...current.filter((row) => row.id !== event.id)]);
    setSaveMessage("Product recontract executed.");
  }

  return (
    <DetailPanel
      title="Product recontract preview"
      description="Backend-calculated preview and controlled admin execution workflow."
    >
      <div className="space-y-4">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Saving a preview snapshot does not change the contract, EMI schedule, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.
        </p>
        <p className="text-sm text-amber-800 dark:text-amber-200">This creates preview lines only. Actual EMI records are not changed.</p>
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="outline" onClick={() => void runPreview()} disabled={busy || saving || Boolean(latestEvent?.executed)}>
            {busy ? "Previewing..." : "Preview financial product change"}
          </ActionButton>
          <ActionButton variant="outline" onClick={() => void saveSnapshot()} disabled={busy || saving || Boolean(latestEvent?.executed)}>
            {saving ? "Saving..." : "Save preview snapshot"}
          </ActionButton>
          {canGenerateSchedulePreview ? (
            <ActionButton variant="outline" onClick={() => void generateSchedulePreview()} disabled={scheduleBusy || busy || saving}>
              {scheduleBusy ? "Generating..." : "Generate future EMI schedule preview"}
            </ActionButton>
          ) : null}
          {canGenerateFinancialImpactPreview ? (
            <ActionButton variant="outline" onClick={() => void generateFinancialImpactPreview()} disabled={financialBusy || scheduleBusy || busy || saving}>
              {financialBusy ? "Generating..." : "Generate accounting & reconciliation preview"}
            </ActionButton>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saveMessage ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{saveMessage}</p> : null}
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
        {canGenerateFinancialImpactPreview ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            This creates accounting and reconciliation preview evidence only. No journal, finance account, settlement, reconciliation, EMI, payment, receipt, product, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records are changed.
          </div>
        ) : null}
        {latestEvent ? (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-3">
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground">Latest saved preview snapshot</div>
              <div className="mt-1 text-sm font-medium">
                #{latestEvent.id} · {latestEvent.status} · {latestEvent.impact_type}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MoneyRow label="Old product" value={`${valueOrDash(latestEvent.old_product_name)} (#${valueOrDash(latestEvent.old_product)})`} />
              <MoneyRow label="New product" value={`${valueOrDash(latestEvent.new_product_name)} (#${valueOrDash(latestEvent.new_product)})`} />
              <MoneyRow label="Old contract total" value={latestEvent.old_contract_total} />
              <MoneyRow label="New contract total" value={latestEvent.new_contract_total} />
              <MoneyRow label="Price difference" value={latestEvent.price_difference} />
              <MoneyRow label="Already paid" value={latestEvent.amount_already_paid} />
              <MoneyRow label="Old remaining balance" value={latestEvent.old_remaining_balance} />
              <MoneyRow label="New remaining balance" value={latestEvent.new_remaining_balance} />
              <MoneyRow label="Current EMI" value={latestEvent.current_monthly_amount} />
              <MoneyRow label="Proposed EMI" value={latestEvent.proposed_monthly_amount} />
              <MoneyRow label="Pending EMI count" value={latestEvent.pending_emi_count} />
              <MoneyRow label="Source record mutation" value={latestEvent.source_record_mutation ? "Yes" : "No"} />
              <MoneyRow label="Customer consent status" value={latestEvent.customer_consent_status || "PENDING"} />
              <MoneyRow label="Admin approval status" value={latestEvent.admin_approval_status || "PENDING"} />
              <MoneyRow label="Admin approval actor" value={latestEvent.admin_approved_by_display || latestEvent.admin_approved_by} />
              <MoneyRow label="Admin approval timestamp" value={latestEvent.admin_approved_at} />
            </div>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Admin approval records a decision only. It does not execute product change, recalculate EMI, post accounting, update reconciliation, change stock/delivery, or mutate any contract records.
            </div>
            {canRecordAdminDecision ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Admin note
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
                    value={adminDecisionNote}
                    onChange={(event) => setAdminDecisionNote(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <ActionButton variant="outline" onClick={() => void recordAdminDecision("APPROVED")} disabled={Boolean(decisionBusy) || busy || saving}>
                    {decisionBusy === "APPROVED" ? "Recording approval..." : "Approve recontract preview for future execution"}
                  </ActionButton>
                  <ActionButton variant="outline" onClick={() => void recordAdminDecision("REJECTED")} disabled={Boolean(decisionBusy) || busy || saving}>
                    {decisionBusy === "REJECTED" ? "Recording rejection..." : "Reject recontract preview"}
                  </ActionButton>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Admin approval status: {latestEvent.admin_approval_status || "PENDING"}
                {latestEvent.admin_approval_note ? ` · ${latestEvent.admin_approval_note}` : ""}
              </div>
            )}
          </div>
        ) : null}
        {scheduleLines && scheduleLines.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Future EMI schedule preview lines</div>
            <div className="overflow-auto">
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
                  {scheduleLines.map((line) => (
                    <tr key={line.id} className="border-t border-border">
                      <td className="p-2">{line.line_no}</td>
                      <td className="p-2">{line.original_due_date || "—"}</td>
                      <td className="p-2">{line.original_amount || "—"}</td>
                      <td className="p-2">{line.proposed_due_date || "—"}</td>
                      <td className="p-2">{line.proposed_amount || "—"}</td>
                      <td className="p-2">{line.adjustment_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {latestFinancialImpactPreview ? (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Accounting and reconciliation impact preview</div>
            <div className="grid gap-3 md:grid-cols-2">
              <MoneyRow label="Impact type" value={latestFinancialImpactPreview.impact_type} />
              <MoneyRow label="Price difference" value={latestFinancialImpactPreview.price_difference} />
              <MoneyRow label="Additional receivable amount" value={latestFinancialImpactPreview.additional_receivable_amount} />
              <MoneyRow label="Credit or reduction amount" value={latestFinancialImpactPreview.credit_or_reduction_amount} />
              <MoneyRow label="Projected customer balance" value={latestFinancialImpactPreview.projected_customer_balance} />
              <MoneyRow label="Projected future EMI total" value={latestFinancialImpactPreview.projected_future_emi_total} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Journal preview lines</div>
                <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(latestFinancialImpactPreview.journal_preview || {}, null, 2)}</pre>
              </div>
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Reconciliation preview rows</div>
                <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(latestFinancialImpactPreview.reconciliation_preview || {}, null, 2)}</pre>
              </div>
            </div>
            {latestFinancialImpactPreview.warnings?.length ? (
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Warnings</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {latestFinancialImpactPreview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <ExecutionPanel event={latestEvent} financialPreview={latestFinancialImpactPreview} onExecuted={handleExecuted} />
      </div>
    </DetailPanel>
  );
}
