"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import {
  getContractSettlementPreview,
  settleContract,
  type ContractSettleAction,
  type ContractSettlementPreview,
} from "@/services/contracts";
import { getAdminRentLeaseAccountMapping } from "@/services/phase4-finance";
import { ApiError } from "@/lib/api";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function rupee(value: string | number | undefined | null): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
    return Object.values(err.fieldErrors).flat().join(" ");
  }
  return err instanceof Error ? err.message : "Settlement failed.";
}

function isPayoutAccount(account: Record<string, unknown>): boolean {
  if (account.is_active === false || account.diagnostic_only === true || account.system_posting_profile === true) return false;
  if (account.selectable_for_collection !== undefined) return Boolean(account.selectable_for_collection);
  if (account.is_selectable_collection_account !== undefined) return Boolean(account.is_selectable_collection_account);
  return true;
}

export function SettleRentLeaseContractModal({
  subscriptionId,
  open,
  onOpenChange,
  onSettled,
}: {
  subscriptionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled: () => void;
}) {
  const [preview, setPreview] = useState<ContractSettlementPreview | null>(null);
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    action: "" as ContractSettleAction | "",
    reason: "",
    waive_unpaid_rent: false,
    deduction_amount: "",
    deduction_reason: "",
    finance_account_id: "",
    payment_method: "CASH",
    payment_date: new Date().toISOString().slice(0, 10),
    reference_no: "",
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setMessage(null);
    setLoading(true);
    Promise.all([
      getContractSettlementPreview(subscriptionId),
      getAdminRentLeaseAccountMapping().catch(() => null),
    ])
      .then(([nextPreview, mapping]) => {
        if (cancelled) return;
        setPreview(nextPreview);
        const payout = (mapping?.finance_accounts ?? []).filter(isPayoutAccount);
        setAccounts(payout);
        const settlementId = String(mapping?.mapping?.settlement_finance_account_id ?? "");
        setForm((current) => ({
          ...current,
          action: nextPreview.recommended_action ?? "",
          finance_account_id:
            current.finance_account_id || settlementId || String(payout[0]?.id ?? ""),
        }));
      })
      .catch((err) => !cancelled && setError(errorText(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, subscriptionId]);

  const refundable = Number(preview?.deposit_refundable ?? 0);
  const deduction = Math.max(Number(form.deduction_amount || 0), 0);
  const refundNow = Math.max(refundable - deduction, 0);
  const unpaid = Number(preview?.unpaid_rent_amount ?? 0);
  const allowed = preview?.allowed_actions ?? [];
  const blockers = preview?.blockers ?? [];

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!form.action) list.push("Choose close or cancel.");
    if (form.action === "CANCEL" && !form.reason.trim()) list.push("Give a cancellation reason.");
    if (deduction > refundable) list.push("Deduction is more than the refundable deposit.");
    if (deduction > 0 && !form.deduction_reason.trim()) list.push("Say why the deposit is deducted.");
    if (refundNow > 0 && !form.finance_account_id) list.push("Pick the account the refund is paid from.");
    if (unpaid > 0 && !form.waive_unpaid_rent) list.push("Collect the unpaid rent first, or tick waive.");
    return list;
  }, [form, deduction, refundable, refundNow, unpaid]);

  async function handleSubmit() {
    if (problems.length > 0) {
      setError(problems.join(" "));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const result = await settleContract(subscriptionId, {
        action: form.action as ContractSettleAction,
        reason: form.reason.trim(),
        waive_unpaid_rent: form.waive_unpaid_rent,
        deduction_amount: deduction > 0 ? deduction.toFixed(2) : undefined,
        deduction_reason: form.deduction_reason.trim(),
        finance_account_id: form.finance_account_id ? Number(form.finance_account_id) : undefined,
        payment_method: form.payment_method,
        payment_date: form.payment_date,
        reference_no: form.reference_no.trim(),
      });
      setMessage(
        `Contract ${result.status}. Deposit refunded ${rupee(result.deposit_refunded)}` +
          (result.refund_reference ? ` (${result.refund_reference})` : "") +
          `. Nothing left to collect.`
      );
      onSettled();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const done = Boolean(message);

  return (
    <Modal title="Settle contract — refund deposit & close" open={open} onClose={() => onOpenChange(false)}>
      <div className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading settlement…</p> : null}

        {preview && !preview.applicable ? (
          <p className="text-sm text-muted-foreground">{preview.reason}</p>
        ) : null}

        {blockers.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {blockers.map((b) => (
              <p key={b}>{b}</p>
            ))}
          </div>
        ) : null}

        {preview?.applicable && allowed.length > 0 && !done ? (
          <>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">What happens to the contract</legend>
              {allowed.map((action) => (
                <label key={action} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="settle_action"
                    className="mt-1"
                    checked={form.action === action}
                    onChange={() => setForm((c) => ({ ...c, action }))}
                  />
                  <span>
                    <span className="font-semibold">{action === "CLOSE" ? "Close contract" : "Cancel contract"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {action === "CLOSE"
                        ? "Goods are back. Finish the contract normally."
                        : "End the contract early. Goods never went out, or are already back."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="grid gap-1 text-sm">
              <span className="font-medium">Reason {form.action === "CANCEL" ? "(required)" : "(optional)"}</span>
              <textarea
                className={`${inputClass} h-16`}
                value={form.reason}
                onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))}
              />
            </label>

            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">Rent</div>
              <p className="text-xs text-muted-foreground">
                {preview.months_to_cancel ?? 0} unused month(s) ({rupee(preview.months_to_cancel_amount)}) will be cancelled.
              </p>
              {unpaid > 0 ? (
                <label className="mt-2 flex items-start gap-2 text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.waive_unpaid_rent}
                    onChange={(e) => setForm((c) => ({ ...c, waive_unpaid_rent: e.target.checked }))}
                  />
                  <span>
                    {rupee(unpaid)} rent is unpaid for months already used ({preview.unpaid_rent_months?.length ?? 0}).
                    Tick to waive it — otherwise collect it first.
                  </span>
                </label>
              ) : (
                <p className="text-xs text-emerald-700">No unpaid rent.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">Security deposit</div>
              <p className="text-xs text-muted-foreground">Refundable now: {rupee(refundable)}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs">
                  <span>Damage deduction (optional)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={form.deduction_amount}
                    onChange={(e) => setForm((c) => ({ ...c, deduction_amount: e.target.value }))}
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span>Deduction reason</span>
                  <input
                    className={inputClass}
                    value={form.deduction_reason}
                    onChange={(e) => setForm((c) => ({ ...c, deduction_reason: e.target.value }))}
                  />
                </label>
              </div>
              <p className="mt-2 font-semibold">Refund to pay the customer: {rupee(refundNow)}</p>
              {refundNow > 0 ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs">
                    <span>Paid from account</span>
                    <select
                      className={inputClass}
                      value={form.finance_account_id}
                      onChange={(e) => setForm((c) => ({ ...c, finance_account_id: e.target.value }))}
                    >
                      <option value="">Select account</option>
                      {accounts.map((account) => (
                        <option key={String(account.id)} value={String(account.id)}>
                          {String(account.name ?? account.code ?? account.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Method</span>
                    <select
                      className={inputClass}
                      value={form.payment_method}
                      onChange={(e) => setForm((c) => ({ ...c, payment_method: e.target.value }))}
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Refund date</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={form.payment_date}
                      onChange={(e) => setForm((c) => ({ ...c, payment_date: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Reference (UTR / cheque no.)</span>
                    <input
                      className={inputClass}
                      value={form.reference_no}
                      onChange={(e) => setForm((c) => ({ ...c, reference_no: e.target.value }))}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
          >
            {done ? "Close" : "Back"}
          </button>
          {!done && allowed.length > 0 ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || loading}
              className="inline-flex h-9 items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
            >
              {saving
                ? "Settling…"
                : `${refundNow > 0 ? `Refund ${rupee(refundNow)} & ` : ""}${form.action === "CANCEL" ? "Cancel" : "Close"} contract`}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
