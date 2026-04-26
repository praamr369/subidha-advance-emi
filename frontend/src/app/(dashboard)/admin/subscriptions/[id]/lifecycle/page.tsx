"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getSubscription, type SubscriptionRecord } from "@/services/subscriptions";
import {
  approveContract,
  activateContract,
  cancelContract,
  closeContract,
  listContractAmendments,
  createContractAmendment,
  approveAmendment,
  rejectAmendment,
  applyAmendment,
  getContractPossession,
  createContractPossession,
  recordContractHandover,
  initiateContractReturn,
  getReturnInspection,
  createReturnInspection,
  recordReturnInspection,
  approveReturnInspection,
  type ContractAmendment,
  type ContractAmendmentType,
  type ProductPossession,
  type ReturnInspection,
  type InspectionCondition,
  type InspectionOutcome,
} from "@/services/contracts";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Action failed.";
}

function statusTone(status: string): string {
  const s = (status || "").toUpperCase();
  if (["ACTIVE", "COMPLETED", "CLOSED"].includes(s))
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (["APPROVED", "HANDED_OVER", "DELIVERED"].includes(s))
    return "bg-blue-100 text-blue-800 border-blue-200";
  if (["CANCELLED", "DEFAULTED"].includes(s))
    return "bg-red-100 text-red-800 border-red-200";
  if (["DRAFT", "REQUESTED", "PENDING_APPROVAL"].includes(s))
    return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusTone(status)}`}
    >
      {status}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1.5">
      <div className="w-40 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function ConfirmInput({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring"
      />
    </div>
  );
}

export default function ContractLifecyclePage() {
  const params = useParams<{ id: string }>();
  const subscriptionId = Number(params?.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [amendments, setAmendments] = useState<ContractAmendment[]>([]);
  const [possession, setPossession] = useState<ProductPossession | null>(null);
  const [inspection, setInspection] = useState<ReturnInspection | null>(null);

  // action states
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // cancel form
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  // amendment create form
  const [showAmendForm, setShowAmendForm] = useState(false);
  const [amendType, setAmendType] = useState<ContractAmendmentType>("OTHER");
  const [amendReason, setAmendReason] = useState("");
  const [amendNotes, setAmendNotes] = useState("");
  const [amendPrev, setAmendPrev] = useState("");
  const [amendNew, setAmendNew] = useState("");

  // rejection form
  const [rejectAmendId, setRejectAmendId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // possession form
  const [showPossessionForm, setShowPossessionForm] = useState(false);
  const [possessionSerial, setPossessionSerial] = useState("");
  const [possessionReturnDate, setPossessionReturnDate] = useState("");
  const [possessionNotes, setPossessionNotes] = useState("");

  // handover form
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverNotes, setHandoverNotes] = useState("");
  const [handoverDate, setHandoverDate] = useState("");

  // return form
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");
  const [returnDate, setReturnDate] = useState("");

  // inspection record form
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspCondition, setInspCondition] = useState<InspectionCondition>("NOT_ASSESSED");
  const [inspOutcome, setInspOutcome] = useState<InspectionOutcome>("SELLABLE");
  const [inspDamageNotes, setInspDamageNotes] = useState("");
  const [inspDamageDeduction, setInspDamageDeduction] = useState("0.00");
  const [inspDepositRefund, setInspDepositRefund] = useState("0.00");
  const [inspStockNotes, setInspStockNotes] = useState("");

  const isRentOrLease =
    subscription?.plan_type === "RENT" || subscription?.plan_type === "LEASE";

  const loadAll = useCallback(async () => {
    if (!subscriptionId) return;
    setLoading(true);
    try {
      const [sub, amends, poss, insp] = await Promise.all([
        getSubscription(String(subscriptionId)),
        listContractAmendments(subscriptionId),
        (async () => {
          try {
            return await getContractPossession(subscriptionId);
          } catch {
            return null;
          }
        })(),
        (async () => {
          try {
            return await getReturnInspection(subscriptionId);
          } catch {
            return null;
          }
        })(),
      ]);
      setSubscription(sub);
      setAmendments(amends);
      setPossession(poss);
      setInspection(insp);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function runAction(fn: () => Promise<void>, successMsg: string) {
    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await fn();
      setActionSuccess(successMsg);
      await loadAll();
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  // lifecycle actions
  function handleApprove() {
    void runAction(async () => {
      await approveContract(subscriptionId);
    }, "Contract approved and number assigned.");
  }

  function handleActivate() {
    void runAction(async () => {
      await activateContract(subscriptionId);
    }, "Contract activated and financial terms locked.");
  }

  function handleCancel() {
    if (!cancelReason.trim()) {
      setActionError("Cancellation reason is required.");
      return;
    }
    void runAction(async () => {
      await cancelContract(subscriptionId, cancelReason.trim());
      setCancelReason("");
      setShowCancelForm(false);
    }, "Contract cancelled. Historical payment records preserved.");
  }

  function handleClose() {
    void runAction(async () => {
      await closeContract(subscriptionId);
    }, "Contract closed.");
  }

  // amendment actions
  function handleCreateAmendment() {
    if (!amendReason.trim()) {
      setActionError("Amendment reason is required.");
      return;
    }
    void runAction(async () => {
      let prev: Record<string, unknown> = {};
      let nxt: Record<string, unknown> = {};
      try {
        prev = amendPrev.trim() ? (JSON.parse(amendPrev.trim()) as Record<string, unknown>) : {};
        nxt = amendNew.trim() ? (JSON.parse(amendNew.trim()) as Record<string, unknown>) : {};
      } catch {
        throw new Error("Previous/new values must be valid JSON objects.");
      }
      await createContractAmendment(subscriptionId, {
        amendment_type: amendType,
        previous_values: prev,
        new_values: nxt,
        reason: amendReason.trim(),
        notes: amendNotes.trim() || undefined,
      });
      setShowAmendForm(false);
      setAmendReason("");
      setAmendNotes("");
      setAmendPrev("");
      setAmendNew("");
    }, "Amendment request created.");
  }

  function handleApproveAmendment(id: number) {
    void runAction(async () => {
      await approveAmendment(id);
    }, "Amendment approved.");
  }

  function handleRejectAmendment() {
    if (rejectAmendId == null) return;
    if (!rejectReason.trim()) {
      setActionError("Rejection reason is required.");
      return;
    }
    const id = rejectAmendId;
    void runAction(async () => {
      await rejectAmendment(id, rejectReason.trim());
      setRejectAmendId(null);
      setRejectReason("");
    }, "Amendment rejected.");
  }

  function handleApplyAmendment(id: number) {
    void runAction(async () => {
      await applyAmendment(id);
    }, "Amendment applied.");
  }

  // possession actions
  function handleCreatePossession() {
    void runAction(async () => {
      const poss = await createContractPossession(subscriptionId, {
        expected_return_date: possessionReturnDate.trim() || undefined,
        serial_number: possessionSerial.trim() || undefined,
        handover_condition_notes: possessionNotes.trim() || undefined,
      });
      setPossession(poss);
      setShowPossessionForm(false);
      setPossessionSerial("");
      setPossessionReturnDate("");
      setPossessionNotes("");
    }, "Possession record created.");
  }

  function handleHandover() {
    void runAction(async () => {
      const poss = await recordContractHandover(subscriptionId, {
        handover_date: handoverDate.trim() || undefined,
        handover_condition_notes: handoverNotes.trim() || undefined,
      });
      setPossession(poss);
      setShowHandoverForm(false);
      setHandoverNotes("");
      setHandoverDate("");
    }, "Product handover recorded. Contract moved to HANDED_OVER.");
  }

  function handleInitiateReturn() {
    void runAction(async () => {
      const poss = await initiateContractReturn(subscriptionId, {
        actual_return_date: returnDate.trim() || undefined,
        return_condition_notes: returnNotes.trim() || undefined,
      });
      setPossession(poss);
      setShowReturnForm(false);
      setReturnNotes("");
      setReturnDate("");
    }, "Return initiated. Product is now UNDER_INSPECTION.");
  }

  // inspection actions
  function handleCreateInspection() {
    void runAction(async () => {
      const insp = await createReturnInspection(subscriptionId);
      setInspection(insp);
    }, "Return inspection record created.");
  }

  function handleRecordInspection() {
    void runAction(async () => {
      const insp = await recordReturnInspection(subscriptionId, {
        condition: inspCondition,
        outcome: inspOutcome,
        damage_notes: inspDamageNotes.trim() || undefined,
        damage_deduction_amount: inspDamageDeduction.trim() || undefined,
        deposit_refund_amount: inspDepositRefund.trim() || undefined,
        stock_routing_notes: inspStockNotes.trim() || undefined,
      });
      setInspection(insp);
      setShowInspectionForm(false);
    }, "Inspection recorded.");
  }

  function handleApproveInspection() {
    void runAction(async () => {
      const insp = await approveReturnInspection(subscriptionId);
      setInspection(insp);
    }, "Inspection approved. Stock routed. Deposit refund approved.");
  }

  if (loading) return <LoadingBlock label="Loading contract lifecycle..." />;
  if (error)
    return (
      <ErrorState
        title="Unable to load contract"
        description={error}
        onRetry={() => void loadAll()}
      />
    );

  const sub = subscription;
  const contractNo = (sub as Record<string, unknown>)?.subscription_number as string | undefined;
  const termsLocked = Boolean((sub as Record<string, unknown>)?.terms_locked_at);
  const status = sub?.status ?? "—";

  const canApprove = ["DRAFT", "REQUESTED", "PENDING_APPROVAL"].includes(status);
  const canActivate = status === "APPROVED";
  const canCancel = !["CANCELLED", "CLOSED", "COMPLETED"].includes(status);
  const canClose = ["COMPLETED", "RETURNED"].includes(status);

  return (
    <PortalPage
      title={`Contract Lifecycle — #${subscriptionId}`}
      subtitle="Manage contract approval, activation, amendments, possession, and return inspection."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscriptions", href: "/admin/subscriptions" },
        { label: `#${subscriptionId}`, href: `/admin/subscriptions/${subscriptionId}` },
        { label: "Lifecycle" },
      ]}
      actions={[
        { href: `/admin/subscriptions/${subscriptionId}`, label: "Subscription Detail", variant: "secondary" },
        { href: "/admin/subscriptions", label: "All Subscriptions", variant: "ghost" },
      ]}
      stats={[
        { label: "Plan Type", value: sub?.plan_type ?? "—" },
        { label: "Status", value: status },
        { label: "Contract No.", value: contractNo ?? "—", tone: contractNo ? "success" : "default" },
        { label: "Terms Locked", value: termsLocked ? "Yes" : "No", tone: termsLocked ? "success" : "warning" },
      ]}
      statusBadge={{ label: "Contract Lifecycle", tone: "info" }}
    >
      <div className="space-y-6">
        {/* Feedback banners */}
        {actionSuccess && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </div>
        )}

        {/* Contract summary */}
        <WorkspaceSection
          title="Contract Overview"
          description="Core contract identity and current lifecycle state."
        >
          <div className="grid gap-0 divide-y divide-border rounded-xl border border-border bg-background">
            <FieldRow label="ID" value={`#${subscriptionId}`} />
            <FieldRow label="Contract No." value={contractNo ?? <span className="text-muted-foreground">Not assigned yet</span>} />
            <FieldRow label="Plan Type" value={sub?.plan_type} />
            <FieldRow label="Status" value={<StatusBadge status={status} />} />
            <FieldRow label="Terms Locked" value={termsLocked ? "Yes — financial terms are immutable" : "No — terms can still be edited"} />
            <FieldRow label="Total Amount" value={money(sub?.total_amount)} />
            <FieldRow label="Monthly Amount" value={money(sub?.monthly_amount)} />
            <FieldRow label="Tenure" value={sub?.tenure_months ? `${sub.tenure_months} months` : "—"} />
          </div>
        </WorkspaceSection>

        {/* Lifecycle actions */}
        <WorkspaceSection
          title="Lifecycle Actions"
          description="Controlled transitions. Approve → Activate → (operational states) → Close. Cancellation preserves historical payments."
        >
          <div className="flex flex-wrap gap-3">
            {canApprove && (
              <ActionButton
                variant="primary"
                loading={actionBusy}
                onClick={handleApprove}
              >
                Approve Contract
              </ActionButton>
            )}

            {canActivate && (
              <ActionButton
                variant="primary"
                loading={actionBusy}
                onClick={handleActivate}
              >
                Activate &amp; Lock Terms
              </ActionButton>
            )}

            {canClose && (
              <ActionButton
                variant="outline"
                loading={actionBusy}
                onClick={handleClose}
              >
                Close Contract
              </ActionButton>
            )}

            {canCancel && !showCancelForm && (
              <ActionButton
                variant="outline"
                onClick={() => setShowCancelForm(true)}
              >
                Cancel Contract
              </ActionButton>
            )}
          </div>

          {showCancelForm && (
            <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-medium text-red-900">
                Confirm cancellation — paid amounts are never deleted
              </div>
              <ConfirmInput
                label="Cancellation reason"
                value={cancelReason}
                onChange={setCancelReason}
                placeholder="Explain why this contract is being cancelled..."
                required
              />
              <div className="flex gap-2">
                <ActionButton variant="primary" loading={actionBusy} onClick={handleCancel}>
                  Confirm Cancel
                </ActionButton>
                <ActionButton variant="outline" onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>
                  Discard
                </ActionButton>
              </div>
            </div>
          )}
        </WorkspaceSection>

        {/* Amendments */}
        <WorkspaceSection
          title="Contract Amendments"
          description="Track and manage tenure extensions, product upgrades, address changes, and other controlled corrections. Original terms are never silently overwritten."
        >
          <div className="mb-4">
            <ActionButton
              variant="outline"
              onClick={() => setShowAmendForm(!showAmendForm)}
            >
              {showAmendForm ? "Cancel" : "Request Amendment"}
            </ActionButton>
          </div>

          {showAmendForm && (
            <div className="mb-4 space-y-3 rounded-xl border border-border bg-background p-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Amendment Type</label>
                <select
                  value={amendType}
                  onChange={(e) => setAmendType(e.target.value as ContractAmendmentType)}
                  className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                >
                  {(
                    [
                      "TENURE_EXTENSION",
                      "PRODUCT_UPGRADE",
                      "ADDRESS_CHANGE",
                      "SCHEDULE_CORRECTION",
                      "DEPOSIT_ADJUSTMENT",
                      "LEGAL_DOCUMENT_CORRECTION",
                      "OTHER",
                    ] as ContractAmendmentType[]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <ConfirmInput
                label="Reason"
                value={amendReason}
                onChange={setAmendReason}
                placeholder="Why is this amendment needed?"
                required
              />
              <ConfirmInput
                label="Previous values (JSON)"
                value={amendPrev}
                onChange={setAmendPrev}
                placeholder='e.g. {"tenure_months": 12}'
              />
              <ConfirmInput
                label="New values (JSON)"
                value={amendNew}
                onChange={setAmendNew}
                placeholder='e.g. {"tenure_months": 18}'
              />
              <ConfirmInput
                label="Notes (optional)"
                value={amendNotes}
                onChange={setAmendNotes}
                placeholder="Additional context..."
              />
              <div className="flex gap-2">
                <ActionButton variant="primary" loading={actionBusy} onClick={handleCreateAmendment}>
                  Submit Amendment
                </ActionButton>
                <ActionButton variant="outline" onClick={() => setShowAmendForm(false)}>
                  Discard
                </ActionButton>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {amendments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                No amendments have been requested for this contract.
              </div>
            ) : (
              amendments.map((amend) => (
                <div
                  key={amend.id}
                  className="rounded-xl border border-border bg-background px-4 py-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {amend.amendment_type.replaceAll("_", " ")}
                        </span>
                        <StatusBadge status={amend.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {amend.reason}
                      </div>
                      {amend.rejection_reason && (
                        <div className="text-xs text-red-700">
                          Rejection: {amend.rejection_reason}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Requested {formatDate(amend.created_at)}
                        {amend.approved_at && ` · Approved ${formatDate(amend.approved_at)}`}
                        {amend.applied_at && ` · Applied ${formatDate(amend.applied_at)}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {amend.status === "REQUESTED" && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApproveAmendment(amend.id)}
                            disabled={actionBusy}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectAmendId(amend.id);
                              setRejectReason("");
                            }}
                            disabled={actionBusy}
                            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {amend.status === "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => handleApplyAmendment(amend.id)}
                          disabled={actionBusy}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                        >
                          Apply
                        </button>
                      )}
                    </div>
                  </div>

                  {rejectAmendId === amend.id && (
                    <div className="mt-3 space-y-2">
                      <ConfirmInput
                        label="Rejection reason"
                        value={rejectReason}
                        onChange={setRejectReason}
                        placeholder="Why is this amendment being rejected?"
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleRejectAmendment}
                          disabled={actionBusy}
                          className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectAmendId(null)}
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </WorkspaceSection>

        {/* Possession — only for RENT/LEASE */}
        {isRentOrLease && (
          <WorkspaceSection
            title="Product Possession Tracking"
            description="Track physical product location, handover, and return for rent/lease contracts."
          >
            {possession ? (
              <div className="space-y-4">
                <div className="grid gap-0 divide-y divide-border rounded-xl border border-border bg-background">
                  <FieldRow label="Status" value={<StatusBadge status={possession.status} />} />
                  <FieldRow label="Serial No." value={possession.serial_number || "—"} />
                  <FieldRow label="Handover Date" value={formatDate(possession.handover_date)} />
                  <FieldRow label="Expected Return" value={formatDate(possession.expected_return_date)} />
                  <FieldRow label="Actual Return" value={formatDate(possession.actual_return_date)} />
                  <FieldRow label="Handover Notes" value={possession.handover_condition_notes || "—"} />
                  <FieldRow label="Return Notes" value={possession.return_condition_notes || "—"} />
                </div>

                <div className="flex flex-wrap gap-3">
                  {possession.status === "PENDING_HANDOVER" && (
                    <ActionButton
                      variant="primary"
                      loading={actionBusy}
                      onClick={() => setShowHandoverForm(!showHandoverForm)}
                    >
                      Record Handover
                    </ActionButton>
                  )}
                  {["WITH_CUSTOMER", "RETURN_DUE"].includes(possession.status) && (
                    <ActionButton
                      variant="outline"
                      loading={actionBusy}
                      onClick={() => setShowReturnForm(!showReturnForm)}
                    >
                      Initiate Return
                    </ActionButton>
                  )}
                </div>

                {showHandoverForm && (
                  <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Handover Date</label>
                      <input
                        type="date"
                        value={handoverDate}
                        onChange={(e) => setHandoverDate(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <ConfirmInput
                      label="Condition notes"
                      value={handoverNotes}
                      onChange={setHandoverNotes}
                      placeholder="Condition at handover..."
                    />
                    <div className="flex gap-2">
                      <ActionButton variant="primary" loading={actionBusy} onClick={handleHandover}>
                        Confirm Handover
                      </ActionButton>
                      <ActionButton variant="outline" onClick={() => setShowHandoverForm(false)}>
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                )}

                {showReturnForm && (
                  <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Return Date</label>
                      <input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <ConfirmInput
                      label="Return condition notes"
                      value={returnNotes}
                      onChange={setReturnNotes}
                      placeholder="Condition at return..."
                    />
                    <div className="flex gap-2">
                      <ActionButton variant="primary" loading={actionBusy} onClick={handleInitiateReturn}>
                        Confirm Return
                      </ActionButton>
                      <ActionButton variant="outline" onClick={() => setShowReturnForm(false)}>
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                  No possession record found. Create one after product is ready for delivery.
                </div>
                <ActionButton
                  variant="outline"
                  onClick={() => setShowPossessionForm(!showPossessionForm)}
                >
                  Create Possession Record
                </ActionButton>
                {showPossessionForm && (
                  <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Serial Number (optional)</label>
                      <input
                        type="text"
                        value={possessionSerial}
                        onChange={(e) => setPossessionSerial(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        placeholder="Product serial / asset tag"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Expected Return Date</label>
                      <input
                        type="date"
                        value={possessionReturnDate}
                        onChange={(e) => setPossessionReturnDate(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <ConfirmInput
                      label="Initial condition notes"
                      value={possessionNotes}
                      onChange={setPossessionNotes}
                      placeholder="Describe product condition at time of record creation..."
                    />
                    <div className="flex gap-2">
                      <ActionButton variant="primary" loading={actionBusy} onClick={handleCreatePossession}>
                        Create Record
                      </ActionButton>
                      <ActionButton variant="outline" onClick={() => setShowPossessionForm(false)}>
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </WorkspaceSection>
        )}

        {/* Return Inspection — only for RENT/LEASE */}
        {isRentOrLease && (
          <WorkspaceSection
            title="Return Inspection"
            description="Inspect returned product, record condition, calculate damage deduction, approve deposit refund, and route stock. Product only becomes sellable after SELLABLE inspection pass."
          >
            {!inspection ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
                  No return inspection created yet. Create one when the product has been returned.
                </div>
                <ActionButton variant="outline" loading={actionBusy} onClick={handleCreateInspection}>
                  Create Return Inspection
                </ActionButton>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-0 divide-y divide-border rounded-xl border border-border bg-background">
                  <FieldRow label="Status" value={<StatusBadge status={inspection.status} />} />
                  <FieldRow label="Outcome" value={inspection.outcome ?? <span className="text-muted-foreground">Not yet assessed</span>} />
                  <FieldRow label="Condition" value={inspection.condition_recorded} />
                  <FieldRow label="Inspection Date" value={formatDate(inspection.inspection_date)} />
                  <FieldRow label="Damage Notes" value={inspection.damage_notes || "—"} />
                  <FieldRow label="Damage Deduction" value={money(inspection.damage_deduction_amount)} />
                  <FieldRow label="Deposit Refund" value={money(inspection.deposit_refund_amount)} />
                  <FieldRow label="Refund Approved" value={inspection.deposit_refund_approved ? "Yes" : "No"} />
                  <FieldRow label="Stock Routing" value={inspection.stock_routing_notes || "—"} />
                </div>

                {["PENDING", "IN_PROGRESS"].includes(inspection.status) && (
                  <div className="space-y-3">
                    <ActionButton
                      variant="outline"
                      onClick={() => setShowInspectionForm(!showInspectionForm)}
                    >
                      {showInspectionForm ? "Cancel" : "Record Inspection"}
                    </ActionButton>
                    {showInspectionForm && (
                      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Condition</label>
                            <select
                              value={inspCondition}
                              onChange={(e) => setInspCondition(e.target.value as InspectionCondition)}
                              className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                            >
                              {(["NOT_ASSESSED", "GOOD", "FAIR", "DAMAGED"] as InspectionCondition[]).map(
                                (c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Outcome</label>
                            <select
                              value={inspOutcome}
                              onChange={(e) => setInspOutcome(e.target.value as InspectionOutcome)}
                              className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                            >
                              {(["SELLABLE", "MAINTENANCE_REQUIRED", "DAMAGED", "SCRAPPED"] as InspectionOutcome[]).map(
                                (o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Damage Deduction (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={inspDamageDeduction}
                              onChange={(e) => setInspDamageDeduction(e.target.value)}
                              className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Deposit Refund (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={inspDepositRefund}
                              onChange={(e) => setInspDepositRefund(e.target.value)}
                              className="mt-1 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                            />
                          </div>
                        </div>
                        <ConfirmInput
                          label="Damage notes"
                          value={inspDamageNotes}
                          onChange={setInspDamageNotes}
                          placeholder="Describe damage or defects found..."
                        />
                        <ConfirmInput
                          label="Stock routing notes"
                          value={inspStockNotes}
                          onChange={setInspStockNotes}
                          placeholder="How should this product be routed after inspection?"
                        />
                        <div className="flex gap-2">
                          <ActionButton variant="primary" loading={actionBusy} onClick={handleRecordInspection}>
                            Save Inspection
                          </ActionButton>
                          <ActionButton variant="outline" onClick={() => setShowInspectionForm(false)}>
                            Cancel
                          </ActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inspection.status === "COMPLETED" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Approving will route stock based on outcome and approve deposit refund. Product will only
                      become sellable if outcome is SELLABLE.
                    </p>
                    <ActionButton variant="primary" loading={actionBusy} onClick={handleApproveInspection}>
                      Approve Inspection &amp; Route Stock
                    </ActionButton>
                  </div>
                )}
              </div>
            )}
          </WorkspaceSection>
        )}

        {/* Navigation */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href={`/admin/subscriptions/${subscriptionId}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Back to Subscription
          </Link>
          <Link
            href="/admin/subscriptions"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            All Subscriptions
          </Link>
        </div>
      </div>
    </PortalPage>
  );
}
