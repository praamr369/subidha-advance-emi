"use client";

import { useMemo, useState } from "react";

import ModalShell from "@/components/ui/ModalShell";

type AffectedFlags = {
  receipts?: boolean;
  invoices?: boolean;
  delivery?: boolean;
  stock_requirements?: boolean;
  commissions?: boolean;
  payouts?: boolean;
  emi_schedule?: boolean;
};

type Props = {
  open: boolean;
  sourceType: string;
  sourceReference: string;
  currentStatus: string;
  financialImpactSummary?: string;
  requiresReceiptReversal?: boolean;
  requiresDeliveryReturn?: boolean;
  blockedReason?: string | null;
  affected?: AffectedFlags;
  confirmLabel?: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; internal_note: string; confirm: true }) => Promise<void> | void;
};

const TEXTAREA_CLASS =
  "min-h-[96px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring";

export default function AdminCancellationDialog({
  open,
  sourceType,
  sourceReference,
  currentStatus,
  financialImpactSummary,
  requiresReceiptReversal = false,
  requiresDeliveryReturn = false,
  blockedReason,
  affected,
  confirmLabel = "Confirm cancellation",
  submitting = false,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const affectedLabels = useMemo(() => {
    const labels: string[] = [];
    if (affected?.receipts) labels.push("Receipts");
    if (affected?.invoices) labels.push("Invoices");
    if (affected?.delivery) labels.push("Delivery");
    if (affected?.stock_requirements) labels.push("Stock requirements");
    if (affected?.commissions) labels.push("Commissions");
    if (affected?.payouts) labels.push("Payouts");
    if (affected?.emi_schedule) labels.push("EMI schedule");
    return labels;
  }, [affected]);

  const disabled = submitting || Boolean(blockedReason) || !reason.trim() || !ack;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Admin Audited Cancellation"
      panelClassName="max-w-2xl"
      closeOnOverlayClick={!submitting}
      closeOnEscape={!submitting}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-semibold text-destructive">
            {sourceType}: {sourceReference || "Unknown reference"}
          </p>
          <p className="text-destructive/90">Current status: {currentStatus || "UNKNOWN"}</p>
          {financialImpactSummary ? <p className="mt-2 text-destructive/90">{financialImpactSummary}</p> : null}
        </div>

        {blockedReason ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Cancellation blocked</p>
            <p>{blockedReason}</p>
          </div>
        ) : null}

        {(requiresReceiptReversal || requiresDeliveryReturn || affectedLabels.length > 0) && !blockedReason ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Affected records</p>
            {affectedLabels.length ? <p>{affectedLabels.join(", ")}</p> : null}
            {requiresReceiptReversal ? <p>Receipt reversal is required before financial closure.</p> : null}
            {requiresDeliveryReturn ? <p>Delivery return workflow may be required before cancellation.</p> : null}
          </div>
        ) : null}

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-foreground">Cancellation reason (required)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={TEXTAREA_CLASS}
            disabled={submitting}
            placeholder="Enter a clear business reason for this audited cancellation."
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-foreground">Internal note (optional)</span>
          <textarea
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            className={TEXTAREA_CLASS}
            disabled={submitting}
            placeholder="Optional internal context for compliance or reconciliation follow-up."
          />
        </label>

        <label className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
            disabled={submitting}
            className="mt-0.5"
          />
          <span>I understand this will preserve history and create an audited cancellation record.</span>
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            Close
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              setError(null);
              try {
                await onConfirm({
                  reason: reason.trim(),
                  internal_note: internalNote.trim(),
                  confirm: true,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Cancellation failed.");
              }
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
