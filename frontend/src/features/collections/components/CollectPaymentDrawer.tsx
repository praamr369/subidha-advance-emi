"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import {
  collectPayment,
  type PaymentCollectionResult,
  type PaymentMethod,
} from "@/services/payments";

type CollectPaymentDrawerProps = {
  open: boolean;
  onClose: () => void;
  emiId: number | null;
  suggestedAmount: string | number | null | undefined;
  subscriptionLabel?: string;
  customerName?: string;
  onCollected?: () => void | Promise<void>;
};

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = [
  "CASH",
  "UPI",
  "BANK",
  "CARD",
];

function normalizeAmount(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return parsed.toFixed(2);
}

function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CollectPaymentDrawer(props: CollectPaymentDrawerProps) {
  const { open, emiId, suggestedAmount } = props;

  if (!open || !emiId) return null;

  return (
    <CollectPaymentDrawerContent
      key={`${emiId}:${String(suggestedAmount ?? "")}`}
      {...props}
    />
  );
}

function CollectPaymentDrawerContent({
  onClose,
  emiId,
  suggestedAmount,
  subscriptionLabel,
  customerName,
  onCollected,
}: CollectPaymentDrawerProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => normalizeAmount(suggestedAmount));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(() => todayDateInputValue());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function invalidatePaymentQueries(
    result: PaymentCollectionResult
  ): Promise<void> {
    const subscriptionId = result.subscription?.id;
    const paymentId = result.payment?.id;
    const resolvedEmiId = result.emi?.id;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["payments"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-today-queue"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-priority-alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["collections-due-today"] }),
      queryClient.invalidateQueries({ queryKey: ["collections-overdue"] }),
      queryClient.invalidateQueries({ queryKey: ["collections-recent"] }),
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["emis"] }),
      queryClient.invalidateQueries({ queryKey: ["pending-emis"] }),
      queryClient.invalidateQueries({ queryKey: ["overdue-emis"] }),
    ]);

    if (subscriptionId) {
      await queryClient.invalidateQueries({
        queryKey: ["subscription", subscriptionId],
      });
    }

    if (paymentId) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["payment", paymentId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["payment-timeline", paymentId],
        }),
      ]);
    }

    if (resolvedEmiId) {
      await queryClient.invalidateQueries({
        queryKey: ["emi", resolvedEmiId],
      });
    }
  }

  const canSubmit = useMemo(() => {
    if (!emiId) return false;
    const parsed = Number(amount);
    return Number.isFinite(parsed) && parsed > 0 && paymentDate.trim().length > 0;
  }, [emiId, amount, paymentDate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!emiId) {
      setLocalError("EMI reference is missing.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setLocalError("Enter a valid payment amount.");
      return;
    }

    if (!paymentDate.trim()) {
      setLocalError("Payment date is required.");
      return;
    }

    if (
      (paymentMethod === "UPI" ||
        paymentMethod === "BANK" ||
        paymentMethod === "CARD") &&
      !referenceNo.trim()
    ) {
      setLocalError(
        "Reference number is required for UPI, bank, or card collections."
      );
      return;
    }

    setSubmitting(true);
    setLocalError("");

    try {
      const result = await collectPayment({
        emi: emiId,
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference_no: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      await invalidatePaymentQueries(result);

      if (onCollected) {
        await onCollected();
      }

      onClose();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Payment collection failed.";
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell
      open={Boolean(emiId)}
      title="Collect Payment"
      description="Record a payment against the selected EMI with explicit financial controls."
      onClose={onClose}
    >
      <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  EMI ID
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {emiId ? `#${emiId}` : "—"}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested Amount
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {amount || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {customerName || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contract
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {subscriptionLabel || "—"}
                </div>
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Amount
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethod)
                }
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:opacity-60"
              >
                {PAYMENT_METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {method === "CASH"
                      ? "Cash"
                      : method === "UPI"
                        ? "UPI"
                        : method === "BANK"
                          ? "Bank"
                          : "Card"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Reference No
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                disabled={submitting}
                placeholder="Optional transaction reference"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:opacity-60"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                rows={4}
                placeholder="Optional collection note"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:opacity-60"
              />
            </div>

            {localError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {localError}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Collect Payment"}
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
      </div>
    </DrawerShell>
  );
}
