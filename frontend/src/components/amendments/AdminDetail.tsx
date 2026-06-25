"use client";

import { useCallback, useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ProductRecontractPreviewPanel from "@/components/amendments/ProductRecontractPreviewPanel";
import LuckyBatchPreviewPanel from "@/components/amendments/LuckyBatchPreviewPanel";
import RentLeasePreviewPanel from "@/components/amendments/RentLeasePreviewPanel";
import DepositSecurityPreviewPanel from "@/components/amendments/DepositSecurityPreviewPanel";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import { buildAdminProductRecontractAddendumPrintRoute } from "@/lib/route-builders";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  approveAdminAmendment,
  getAdminAmendment,
  implementAdminContractAmendment,
  rejectAdminAmendment,
  reviewAdminAmendment,
  type AmendmentRecord,
} from "@/services/amendments";

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Approved values must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

function firstValue(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;
  return keys.map((key) => source[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function displayValue(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

const SAFE_PHASE3_TYPES = new Set(["ADDRESS_CHANGE", "CONTACT_CORRECTION"]);

const PHASE3_IMPLEMENTATION_WARNING =
  "Only whitelisted non-financial corrections can be implemented in Phase 3. Financial, EMI, lucky ID, batch, rent/lease billing, deposit, accounting, inventory, reconciliation, commission, payout, delivery, stock, and audit-sensitive changes remain blocked.";

const PRODUCT_CHANGE_IMPLEMENTATION_WARNING =
  "This only corrects the stored product reference when the contract value remains unchanged. Product upgrade/downgrade with extra cost, lower cost, EMI change, reconciliation, accounting, or contract repricing is not implemented in this phase.";

function canShowImplementationAction(row: AmendmentRecord) {
  if (typeof row.is_implementable === "boolean") return row.is_implementable;
  return row.status === "APPROVED" && (SAFE_PHASE3_TYPES.has(row.amendment_type) || row.amendment_type === "PRODUCT_CHANGE");
}

function implementationWarning(row: AmendmentRecord) {
  return row.amendment_type === "PRODUCT_CHANGE" ? PRODUCT_CHANGE_IMPLEMENTATION_WARNING : PHASE3_IMPLEMENTATION_WARNING;
}

function implementationLabel(row: AmendmentRecord, busy: string | null) {
  if (busy === "implement") return "Implementing...";
  if (row.amendment_type === "PRODUCT_CHANGE") return "Implement approved same-price product reference correction";
  return "Implement approved non-financial correction";
}

function hasExecutedProductRecontract(row: AmendmentRecord) {
  return row.workflow_capability?.category === "PRODUCT_RECONTRACT" && row.latest_product_recontract_preview?.executed === true;
}

function ProductChangePreview({ row }: { row: AmendmentRecord }) {
  if (row.amendment_type !== "PRODUCT_CHANGE") return null;
  const oldValues = row.old_values || row.previous_values || {};
  const nextValues = row.approved_values && Object.keys(row.approved_values).length > 0 ? row.approved_values : row.requested_values || row.new_values || {};
  return (
    <DetailPanel title="Product reference correction preview" description="Same-price product reference correction only. Financial product change is deferred.">
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current product reference</div>
          <div className="mt-2 font-medium">{displayValue(firstValue(oldValues, ["product_name", "old_product_name", "name"]))}</div>
          <div className="mt-1 text-muted-foreground">ID: {displayValue(firstValue(oldValues, ["product_id", "old_product_id"]))}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Approved corrected product reference</div>
          <div className="mt-2 font-medium">{displayValue(firstValue(nextValues, ["approved_product_name", "target_product_name", "new_product_name", "product_name"]))}</div>
          <div className="mt-1 text-muted-foreground">ID: {displayValue(firstValue(nextValues, ["approved_product_id", "target_product_id", "new_product_id", "product_id"]))}</div>
          <div className="mt-1 text-muted-foreground">Code: {displayValue(firstValue(nextValues, ["approved_product_code", "target_product_code", "new_product_code", "product_code"]))}</div>
        </div>
      </div>
    </DetailPanel>
  );
}

function ProductRecontractConsentStatusPanel({ row }: { row: AmendmentRecord }) {
  const preview = row.latest_product_recontract_preview;
  if (!preview) return null;
  return (
    <DetailPanel title="Customer recontract consent" description="Read-only customer decision for the latest saved preview snapshot.">
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Consent status</dt>
          <dd>{preview.customer_consent_status || "PENDING"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Admin approval status</dt>
          <dd>{preview.admin_approval_status || "PENDING"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Preview snapshot</dt>
          <dd>
            #{preview.id} · {preview.status} · {preview.impact_type}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Consented at</dt>
          <dd>{preview.customer_consented_at || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Customer note</dt>
          <dd>{preview.customer_consent_note || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Admin approval timestamp</dt>
          <dd>{preview.admin_approved_at || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Admin approval note</dt>
          <dd>{preview.admin_approval_note || "—"}</dd>
        </div>
      </dl>
    </DetailPanel>
  );
}

function AuditTimeline({ row }: { row: AmendmentRecord }) {
  if (!row.audit_timeline || row.audit_timeline.length === 0) {
    return <div className="text-sm text-muted-foreground">No timeline events recorded.</div>;
  }
  return (
    <div className="space-y-4">
      {row.audit_timeline.map((item, idx) => (
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
              {item.actor || item.role ? (
                <span>
                  · By: {item.actor ? item.actor : "Unknown"} {item.role ? `(${item.role})` : ""}
                </span>
              ) : null}
            </div>
            {item.note ? <div className="text-xs mt-1 text-muted-foreground italic">{item.note}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAmendmentDetail({ id }: { id: number }) {
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [approvedJson, setApprovedJson] = useState("{}\n");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAdminAmendment(id);
      setRow(next);
      setAdminNote(next.admin_note || "");
      setApprovedJson(safeJson(next.approved_values && Object.keys(next.approved_values).length > 0 ? next.approved_values : next.requested_values || next.new_values));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id, load]);

  async function run(action: "review" | "approve" | "reject" | "implement") {
    setBusy(action);
    setError(null);
    try {
      if (action === "review") setRow(await reviewAdminAmendment(id, adminNote));
      if (action === "approve") setRow(await approveAdminAmendment(id, { approved_values: parseJsonObject(approvedJson), admin_note: adminNote }));
      if (action === "reject") {
        if (!rejectionReason.trim()) throw new Error("Rejection reason is required.");
        setRow(await rejectAdminAmendment(id, { rejection_reason: rejectionReason.trim(), admin_note: adminNote }));
      }
      if (action === "implement") setRow(await implementAdminContractAmendment(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Admin amendment review"
      title={row?.amendment_no || `Amendment #${id}`}
      subtitle="Review decisions remain separate from guarded implementation. Phase 4 corrects only same-price product references."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Amendments", href: "/admin/contract-amendments" }, { label: row?.amendment_no || `#${id}` }]}
      statusBadge={{ label: "Guarded implementation", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment..." /> : null}
        {!loading && error ? <ERPErrorState title="Amendment action failed" description={error} onRetry={() => void load()} /> : null}
        {!loading && row ? (
          <>
            <DetailPanel title="Amendment Audit Timeline" description="Read-only timeline of workflow, approval, evidence, and execution milestones.">
              <AuditTimeline row={row} />
            </DetailPanel>
            <DetailPanel title="Amendment decision sheet" description="Printable read-only summary of request, review, approval/rejection, and workflow capability evidence.">
              <ActionButton href={`/admin/contract-amendments/${row.id}/decision-sheet/print`} variant="outline">
                Decision Sheet / Print
              </ActionButton>
            </DetailPanel>
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Request summary" description="Requester and contract context.">
                <dl className="grid gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Status</dt><dd><ERPStatusBadge status={row.status} /></dd></div>
                  <div><dt className="text-muted-foreground">Customer</dt><dd>{row.customer_name || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Contract</dt><dd>{amendmentContractTypeLabel(row.contract_type)} · {sourceLabel(row)}</dd></div>
                  <div><dt className="text-muted-foreground">Type</dt><dd>{amendmentTypeLabel(row.amendment_type)}</dd></div>
                  <div><dt className="text-muted-foreground">Requester</dt><dd>{row.requested_by_username || row.requested_role} · {row.requested_role}</dd></div>
                </dl>
              </DetailPanel>
              <DetailPanel title="Request reason" description="Submitted reason."><p className="text-sm text-muted-foreground">{row.reason}</p></DetailPanel>
            </div>
            {row.workflow_capability?.category === "SAME_PRICE_PRODUCT_REFERENCE" ? <ProductChangePreview row={row} /> : null}
            {row.workflow_capability?.category === "PRODUCT_RECONTRACT" ? (
              <>
                {hasExecutedProductRecontract(row) ? (
                  <DetailPanel title="Recontract addendum" description="Printable read-only customer addendum generated from executed recontract evidence.">
                    <ActionButton href={buildAdminProductRecontractAddendumPrintRoute(row.id)} variant="outline">
                      Recontract Addendum / Print
                    </ActionButton>
                  </DetailPanel>
                ) : null}
                <ProductRecontractPreviewPanel amendment={row} />
                <ProductRecontractConsentStatusPanel row={row} />
              </>
            ) : null}
            {row.workflow_capability?.category === "LUCKY_ID_BATCH_PREVIEW" ? (
              <LuckyBatchPreviewPanel amendment={row} />
            ) : null}
            {row.workflow_capability?.category === "RENT_LEASE_PREVIEW" ? (
              <RentLeasePreviewPanel amendment={row} />
            ) : null}
            {row.workflow_capability?.category === "DEPOSIT_SECURITY_PREVIEW" ? (
              <DepositSecurityPreviewPanel amendment={row} />
            ) : null}
            <div className="grid gap-4 lg:grid-cols-3">
              <DetailPanel title="Old values" description="Source snapshot."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.old_values || row.previous_values)}</pre></DetailPanel>
              <DetailPanel title="Requested values" description="Requested change."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.requested_values || row.new_values)}</pre></DetailPanel>
              <DetailPanel title="Approved values" description="Decision values."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.approved_values)}</pre></DetailPanel>
              <DetailPanel title="Implemented values" description="Captured before/after implementation evidence."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.implemented_values)}</pre></DetailPanel>
            </div>
            <DetailPanel title="Admin decision controls" description="Review, approve, or reject only.">
              <label className="block text-sm font-medium">Admin note<textarea className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /></label>
              {row.workflow_capability?.category !== "PRODUCT_RECONTRACT" ? (
                <label className="mt-4 block text-sm font-medium">Approved decision values JSON<textarea className="mt-2 min-h-32 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm" value={approvedJson} onChange={(event) => setApprovedJson(event.target.value)} /></label>
              ) : null}
              <label className="mt-4 block text-sm font-medium">Rejection reason<input className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required for rejection" /></label>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton onClick={() => void run("review")} disabled={Boolean(busy) || row.status !== "REQUESTED"}>{busy === "review" ? "Reviewing..." : "Mark under review"}</ActionButton>
                <ActionButton onClick={() => void run("approve")} disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}>{busy === "approve" ? "Approving..." : "Approve decision"}</ActionButton>
                <ActionButton variant="outline" onClick={() => void run("reject")} disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}>{busy === "reject" ? "Rejecting..." : "Reject decision"}</ActionButton>
              </div>
            </DetailPanel>
            {row.workflow_capability?.can_execute_directly ? (
              <DetailPanel title="Guarded implementation" description="Admin-only implementation after approval.">
                <div className="space-y-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">{implementationWarning(row)}</p>
                  {row.implementation_block_reason ? <p className="text-sm text-muted-foreground">{row.implementation_block_reason}</p> : null}
                  {canShowImplementationAction(row) ? <ActionButton variant="outline" onClick={() => void run("implement")} disabled={Boolean(busy)}>{implementationLabel(row, busy)}</ActionButton> : null}
                </div>
              </DetailPanel>
            ) : row.workflow_capability && !row.workflow_capability.can_execute_directly ? (
              <DetailPanel title="Blocked / future workflow" description="This amendment type requires a future workflow phase.">
                <div className="space-y-3">
                  {row.workflow_capability.blocked_reason ? <p className="text-sm text-muted-foreground">{row.workflow_capability.blocked_reason}</p> : null}
                  {row.implementation_block_reason ? <p className="text-sm text-muted-foreground">{row.implementation_block_reason}</p> : null}
                </div>
              </DetailPanel>
            ) : null}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
