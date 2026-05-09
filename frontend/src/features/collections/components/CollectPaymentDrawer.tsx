"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import { invalidateAfterSubscriptionPaymentMutation } from "@/lib/operational-query-invalidation";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
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

const FIELD_CLASS_NAME =
  "h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60";

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
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableFinanceAccounts = useMemo(
    () =>
      financeAccounts.filter((account) =>
        paymentMethod === "CARD"
          ? account.kind === "BANK"
          : account.kind === paymentMethod
      ),
    [financeAccounts, paymentMethod]
  );

  useEffect(() => {
    let active = true;

    async function loadFinanceAccountOptions() {
      try {
        const payload = await listFinanceAccounts({
          is_active: 1,
          page_size: 100,
          for_payment_collection: "true",
        });
        if (!active) return;
        setFinanceAccounts(payload.results.filter((account) => account.is_active));
      } catch {
        if (!active) return;
        setFinanceAccounts([]);
      }
    }

    void loadFinanceAccountOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      financeAccountId &&
      availableFinanceAccounts.some((account) => String(account.id) === financeAccountId)
    ) {
      return;
    }
    setFinanceAccountId(availableFinanceAccounts[0] ? String(availableFinanceAccounts[0].id) : "");
  }, [availableFinanceAccounts, financeAccountId]);

  async function invalidatePaymentQueries(
    result: PaymentCollectionResult
  ): Promise<void> {
    const subscriptionId = result.subscription?.id;
    const paymentId = result.payment?.id;
    const resolvedEmiId = result.emi?.id;

    await invalidateAfterSubscriptionPaymentMutation(queryClient);

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
      setLocalError("Advance EMI reference is missing.");
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

    if (!financeAccountId) {
      setLocalError("Select a finance account before collecting payment.");
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
        finance_account_id: Number(financeAccountId),
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
      description="Record a payment against the selected advance EMI with explicit financial controls."
      onClose={onClose}
      size="default"
    >
      <div className="space-y-6">
          <section className="surface-panel-elevated rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Advance EMI ID
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
                className={FIELD_CLASS_NAME}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Finance Account
              </label>
              <select
                value={financeAccountId}
                onChange={(e) => setFinanceAccountId(e.target.value)}
                disabled={submitting}
                className={FIELD_CLASS_NAME}
              >
                <option value="">Select finance account</option>
                {availableFinanceAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.kind}
                  </option>
                ))}
              </select>
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
                className={FIELD_CLASS_NAME}
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
                className={FIELD_CLASS_NAME}
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
                className={FIELD_CLASS_NAME}
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Required for UPI, bank, and card collections. Cash can remain blank if no receipt reference exists.
              </p>
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
                className="w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {localError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {localError}
              </div>
            ) : null}

            <div className="popup-action-bar items-center">
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
