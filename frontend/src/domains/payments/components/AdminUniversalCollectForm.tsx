"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import ActionButton from "@/components/ui/ActionButton";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { FormSection } from "@/components/ui/operations";
import { type BranchRecord, type CashCounterRecord } from "@/services/branch-control";
import { type FinanceAccount } from "@/services/accounting";
import { type UnifiedReceivableResult } from "@/services/receivables";
import { processUnifiedCollection, type UnifiedCollectionPayload, type UnifiedCollectionResponse } from "@/services/collections";
import { normalizeApiError } from "@/services/api/errors";
import ErrorState from "@/components/feedback/ErrorState";

const FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2.5 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";

type FormState = {
  amount: string;
  payment_method: "CASH" | "UPI" | "BANK" | "CARD";
  finance_account_id: string;
  branch_id: string;
  cash_counter_id: string;
  reference_no: string;
  notes: string;
  receipt_date: string;
};

const PAYMENT_METHOD_OPTIONS: Array<{ value: FormState["payment_method"]; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI / Bank" },
  { value: "CARD", label: "Card" },
];

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminUniversalCollectForm({
  receivable,
  branches,
  counters,
  financeAccounts,
  onSuccess,
  onCancel,
}: {
  receivable: UnifiedReceivableResult;
  branches: BranchRecord[];
  counters: CashCounterRecord[];
  financeAccounts: FinanceAccount[];
  onSuccess: (response: UnifiedCollectionResponse) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    amount: receivable.due_amount || receivable.total_amount || "",
    payment_method: "CASH",
    finance_account_id: "",
    branch_id: "",
    cash_counter_id: "",
    reference_no: "",
    notes: "",
    receipt_date: getTodayDateInputValue(),
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableCounters = form.branch_id
    ? counters.filter((counter) => String(counter.branch) === form.branch_id)
    : counters;

  const availableFinanceAccounts = useMemo(
    () =>
      financeAccounts.filter((account) => {
        if (form.payment_method === "UPI" || form.payment_method === "BANK") {
          return account.kind === "UPI" || account.kind === "BANK";
        }
        if (form.payment_method === "CARD") {
          return account.kind === "BANK";
        }
        return account.kind === form.payment_method;
      }),
    [financeAccounts, form.payment_method]
  );

  const selectableFinanceAccounts = useMemo(
    () => availableFinanceAccounts.filter((account) => account.collection_ready !== false),
    [availableFinanceAccounts]
  );

  const updateField = useCallback(function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (
      form.finance_account_id &&
      selectableFinanceAccounts.some((account) => String(account.id) === form.finance_account_id)
    ) {
      return;
    }
    updateField("finance_account_id", selectableFinanceAccounts[0] ? String(selectableFinanceAccounts[0].id) : "");
  }, [form.finance_account_id, selectableFinanceAccounts, updateField]);

  function onInputChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    if (name === "payment_method") {
      updateField(name, value as FormState["payment_method"]);
    } else if (name === "branch_id" && value !== form.branch_id) {
      setForm((prev) => ({ ...prev, branch_id: value, cash_counter_id: "" }));
    } else {
      updateField(name as keyof FormState, value);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    if (!receivable.source_id) {
      setErrorMessage("Missing source ID for this receivable.");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setErrorMessage("Enter a valid amount greater than zero.");
      return;
    }
    if (!form.finance_account_id) {
      setErrorMessage("Select a finance account to receive the payment.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: UnifiedCollectionPayload = {
      source_type: receivable.source_type,
      source_id: receivable.source_id,
      amount: form.amount,
      payment_method: form.payment_method,
      finance_account_id: Number(form.finance_account_id),
      reference_no: form.reference_no,
      notes: form.notes,
      receipt_date: form.receipt_date,
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      cash_counter_id: form.cash_counter_id ? Number(form.cash_counter_id) : null,
    };

    try {
      const response = await processUnifiedCollection(payload);
      onSuccess(response);
    } catch (error) {
      setErrorMessage(normalizeApiError(error).message || "Failed to process collection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitPayment} className="space-y-8">
      {errorMessage && (
        <ErrorState title="Collection Failed" description={errorMessage} />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <FormSection title="Operation Details">
          <div className="space-y-4 rounded-xl border border-border bg-[var(--surface-muted)] p-4 text-sm text-foreground">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Type:</span>
              <span className="col-span-2 font-medium">{receivable.source_type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Reference:</span>
              <span className="col-span-2">{receivable.display_reference || receivable.reference_no}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Customer:</span>
              <span className="col-span-2">{receivable.customer_name} ({receivable.phone_masked})</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Due Amount:</span>
              <span className="col-span-2 font-semibold">₹{receivable.due_amount || receivable.total_amount}</span>
            </div>
          </div>
        </FormSection>

        <FormSection title="Payment Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="amount" className="mb-1.5 block text-xs font-semibold text-foreground">
                Collection Amount <span className="text-destructive">*</span>
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="receipt_date" className="mb-1.5 block text-xs font-semibold text-foreground">
                Receipt Date <span className="text-destructive">*</span>
              </label>
              <input
                id="receipt_date"
                name="receipt_date"
                type="date"
                required
                value={form.receipt_date}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
              />
            </div>
            <div>
              <label htmlFor="payment_method" className="mb-1.5 block text-xs font-semibold text-foreground">
                Method <span className="text-destructive">*</span>
              </label>
              <select
                id="payment_method"
                name="payment_method"
                required
                value={form.payment_method}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="finance_account_id" className="mb-1.5 block text-xs font-semibold text-foreground">
                Finance Account <span className="text-destructive">*</span>
              </label>
              <select
                id="finance_account_id"
                name="finance_account_id"
                required
                value={form.finance_account_id}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
              >
                {selectableFinanceAccounts.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name} ({opt.kind})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </FormSection>

        <FormSection title="Location & Notes (Optional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="branch_id" className="mb-1.5 block text-xs font-semibold text-foreground">
                Branch
              </label>
              <select
                id="branch_id"
                name="branch_id"
                value={form.branch_id}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
              >
                <option value="">-- Select Branch --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cash_counter_id" className="mb-1.5 block text-xs font-semibold text-foreground">
                Cash Counter
              </label>
              <select
                id="cash_counter_id"
                name="cash_counter_id"
                value={form.cash_counter_id}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
              >
                <option value="">-- Select Counter --</option>
                {availableCounters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="reference_no" className="mb-1.5 block text-xs font-semibold text-foreground">
                Payment Reference (UPI/Txn ID)
              </label>
              <input
                id="reference_no"
                name="reference_no"
                type="text"
                value={form.reference_no}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
                placeholder="Optional external reference"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="mb-1.5 block text-xs font-semibold text-foreground">
                Cashier Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                value={form.notes}
                onChange={onInputChange}
                className={FIELD_CLASS_NAME}
                placeholder="Optional notes"
              />
            </div>
          </div>
        </FormSection>
      </div>

      <div className="flex items-center gap-3">
        <ConfirmActionButton
          title="Confirm Collection"
          label={isSubmitting ? "Processing..." : "Confirm Collection"}
          description={`Are you sure you want to collect ₹${form.amount} via ${form.payment_method}? This action will post the receipt and may update the accounting bridge.`}
          confirmLabel="Yes, post receipt"
          onConfirm={async () => {
            await submitPayment({ preventDefault: () => {} } as any);
          }}
          disabled={isSubmitting || !form.amount || !form.finance_account_id}
          className="h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <ActionButton
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-11 rounded-xl px-6 text-sm font-semibold hover:bg-muted"
        >
          Cancel
        </ActionButton>
      </div>
    </form>
  );
}
