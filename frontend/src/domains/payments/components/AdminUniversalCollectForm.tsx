"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import ActionButton from "@/components/ui/ActionButton";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { FormSection } from "@/components/ui/operations";
import { type BranchRecord, type CashCounterRecord } from "@/services/branch-control";
import { type FinanceAccount } from "@/services/accounting";
import { type UnifiedReceivableResult } from "@/services/receivables";
import {
  processUnifiedCollection,
  type CollectionSplit,
  type UnifiedCollectionPayload,
  type UnifiedCollectionResponse,
} from "@/services/collections";
import { normalizeApiError } from "@/services/api/errors";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethodValue, isCashMethod } from "@/lib/payment-methods";
import ErrorState from "@/components/feedback/ErrorState";

const FIELD_CLASS_NAME =
  "w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2.5 text-sm text-foreground outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35";

type FormState = {
  amount: string;
  payment_method: PaymentMethodValue;
  finance_account_id: string;
  branch_id: string;
  cash_counter_id: string;
  reference_no: string;
  notes: string;
  receipt_date: string;
};

type SplitRow = {
  amount: string;
  payment_method: FormState["payment_method"];
  finance_account_id: string;
  reference_no: string;
};

function accountsForMethod(financeAccounts: FinanceAccount[], method: FormState["payment_method"]) {
  return financeAccounts.filter((account) => {
    if (account.collection_ready === false) return false;
    // Cash -> cash desk; every non-cash instrument -> the single Bank/UPI account.
    if (isCashMethod(method)) return account.kind === "CASH";
    return account.kind === "BANK" || account.kind === "UPI";
  });
}

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

  const [splitMode, setSplitMode] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);

  const splitTotal = splitRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const splitRemainder = Number(form.amount || 0) - splitTotal;

  function enableSplitMode() {
    const cashAccounts = accountsForMethod(financeAccounts, "CASH");
    const upiAccounts = accountsForMethod(financeAccounts, "UPI");
    setSplitRows([
      {
        amount: form.amount || "",
        payment_method: "CASH",
        finance_account_id: cashAccounts[0] ? String(cashAccounts[0].id) : "",
        reference_no: "",
      },
      {
        amount: "",
        payment_method: "UPI",
        finance_account_id: upiAccounts[0] ? String(upiAccounts[0].id) : "",
        reference_no: "",
      },
    ]);
    setSplitMode(true);
  }

  function disableSplitMode() {
    setSplitMode(false);
    setSplitRows([]);
  }

  function updateSplitRow(index: number, patch: Partial<SplitRow>) {
    setSplitRows((rows) =>
      rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if (patch.payment_method && patch.payment_method !== row.payment_method) {
          const accounts = accountsForMethod(financeAccounts, patch.payment_method);
          next.finance_account_id = accounts[0] ? String(accounts[0].id) : "";
        }
        return next;
      })
    );
  }

  function addSplitRow() {
    const upiAccounts = accountsForMethod(financeAccounts, "UPI");
    setSplitRows((rows) => [
      ...rows,
      {
        amount: splitRemainder > 0 ? splitRemainder.toFixed(2) : "",
        payment_method: "UPI",
        finance_account_id: upiAccounts[0] ? String(upiAccounts[0].id) : "",
        reference_no: "",
      },
    ]);
  }

  function removeSplitRow(index: number) {
    setSplitRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  const availableCounters = form.branch_id
    ? counters.filter((counter) => String(counter.branch) === form.branch_id)
    : counters;

  const availableFinanceAccounts = useMemo(
    () => accountsForMethod(financeAccounts, form.payment_method),
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

    let splits: CollectionSplit[] | undefined;
    if (splitMode) {
      const activeRows = splitRows.filter((row) => Number(row.amount) > 0);
      if (activeRows.length < 2) {
        setErrorMessage("Split payment needs at least two tender lines with amounts (e.g. part Cash, part UPI).");
        return;
      }
      if (activeRows.some((row) => !row.finance_account_id)) {
        setErrorMessage("Select a finance account for every split tender line.");
        return;
      }
      const total = activeRows.reduce((sum, row) => sum + Number(row.amount), 0);
      if (Math.abs(total - Number(form.amount)) > 0.009) {
        setErrorMessage(
          `Split amounts (₹${total.toFixed(2)}) must add up exactly to the collection amount (₹${Number(form.amount).toFixed(2)}).`
        );
        return;
      }
      splits = activeRows.map((row) => ({
        amount: Number(row.amount).toFixed(2),
        payment_method: row.payment_method,
        finance_account_id: Number(row.finance_account_id),
        reference_no: row.reference_no || undefined,
      }));
    } else if (!form.finance_account_id) {
      setErrorMessage("Select a finance account to receive the payment.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: UnifiedCollectionPayload = {
      source_type: receivable.source_type,
      source_id: receivable.source_id,
      amount: Number(form.amount).toFixed(2),
      payment_method: splits ? splits[0].payment_method : form.payment_method,
      finance_account_id: splits ? splits[0].finance_account_id : Number(form.finance_account_id),
      splits,
      reference_no: form.reference_no,
      notes: form.notes,
      receipt_date: form.receipt_date,
      branch_id: form.branch_id ? Number(form.branch_id) : null,
      cash_counter_id: form.cash_counter_id ? Number(form.cash_counter_id) : null,
      idempotency_key:
        typeof crypto !== "undefined" && "randomUUID" in crypto ? `UCW-${crypto.randomUUID()}` : undefined,
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
            {!splitMode && (
              <>
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
              </>
            )}
            <div className="sm:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={splitMode}
                  onChange={(event) => (event.target.checked ? enableSplitMode() : disableSplitMode())}
                  className="h-4 w-4 rounded border-border"
                />
                Split payment across methods (e.g. part Cash + part UPI)
              </label>
            </div>
          </div>

          {splitMode && (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-[var(--surface-muted)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Tender Lines</span>
                <span
                  className={`text-xs font-semibold ${Math.abs(splitRemainder) < 0.005 ? "text-emerald-700" : "text-destructive"}`}
                >
                  {Math.abs(splitRemainder) < 0.005
                    ? "Splits match the collection amount ✓"
                    : splitRemainder > 0
                      ? `₹${splitRemainder.toFixed(2)} still unassigned`
                      : `₹${Math.abs(splitRemainder).toFixed(2)} over the collection amount`}
                </span>
              </div>
              {splitRows.map((row, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[110px_120px_1fr_1fr_auto]">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.amount}
                    onChange={(event) => updateSplitRow(index, { amount: event.target.value })}
                    className={FIELD_CLASS_NAME}
                    placeholder="Amount"
                    aria-label={`Split ${index + 1} amount`}
                  />
                  <select
                    value={row.payment_method}
                    onChange={(event) =>
                      updateSplitRow(index, { payment_method: event.target.value as FormState["payment_method"] })
                    }
                    className={FIELD_CLASS_NAME}
                    aria-label={`Split ${index + 1} method`}
                  >
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={row.finance_account_id}
                    onChange={(event) => updateSplitRow(index, { finance_account_id: event.target.value })}
                    className={FIELD_CLASS_NAME}
                    aria-label={`Split ${index + 1} finance account`}
                  >
                    <option value="">-- Account --</option>
                    {accountsForMethod(financeAccounts, row.payment_method).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.kind})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.reference_no}
                    onChange={(event) => updateSplitRow(index, { reference_no: event.target.value })}
                    className={FIELD_CLASS_NAME}
                    placeholder="Txn ref (optional)"
                    aria-label={`Split ${index + 1} reference`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSplitRow(index)}
                    disabled={splitRows.length <= 2}
                    className="rounded-lg border border-border px-2 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Remove split ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplitRow}
                className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                + Add tender line
              </button>
            </div>
          )}
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
          description={
            splitMode
              ? `Are you sure you want to collect ₹${form.amount} split as ${splitRows
                  .filter((row) => Number(row.amount) > 0)
                  .map((row) => `₹${Number(row.amount).toFixed(2)} ${row.payment_method}`)
                  .join(" + ")}? One receipt is posted per tender.`
              : `Are you sure you want to collect ₹${form.amount} via ${form.payment_method}? This action will post the receipt and may update the accounting bridge.`
          }
          confirmLabel="Yes, post receipt"
          onConfirm={async () => {
            await submitPayment({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>);
          }}
          disabled={
            isSubmitting ||
            !form.amount ||
            (splitMode
              ? Math.abs(splitRemainder) >= 0.005 || splitRows.some((row) => Number(row.amount) > 0 && !row.finance_account_id)
              : !form.finance_account_id)
          }
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
