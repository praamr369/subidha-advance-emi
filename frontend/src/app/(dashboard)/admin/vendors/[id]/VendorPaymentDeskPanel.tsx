"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import {
  applyVendorAdvance,
  getVendorPaymentDesk,
  payVendorAdvance,
  payVendorBills,
  type VendorPaymentDesk,
} from "@/services/vendor-ops";

const input = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

function rupee(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cents = (value: string | number) => Math.round(Number(value || 0) * 100);

/**
 * Pay vendor bills, pay an advance for future purchases, or use an advance
 * against bills — with guards on every bill's and the vendor's outstanding.
 */
export function VendorPaymentDeskPanel({ vendorId, onChanged }: { vendorId: number; onChanged?: () => void }) {
  const [desk, setDesk] = useState<VendorPaymentDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "advance" | "apply" | null>(null);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [pay, setPay] = useState({ finance_account_id: "", payment_date: today(), reference_no: "" });
  const [advance, setAdvance] = useState({ amount: "", finance_account_id: "", payment_date: today(), reference_no: "", notes: "" });

  const adopt = useCallback((next: VendorPaymentDesk) => {
    setDesk(next);
    setAmounts({});
    const first = String(next.finance_accounts[0]?.id ?? "");
    setPay((c) => ({ ...c, finance_account_id: c.finance_account_id || first }));
    setAdvance((c) => ({ ...c, finance_account_id: c.finance_account_id || first }));
  }, []);

  const load = useCallback(async () => {
    try {
      adopt(await getVendorPaymentDesk(vendorId));
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load vendor payables."));
    }
  }, [vendorId, adopt]);

  useEffect(() => {
    void load();
  }, [load]);

  const bills = desk?.open_bills ?? [];
  const allocations = useMemo(
    () =>
      bills
        .filter((bill) => cents(amounts[bill.id] ?? 0) > 0)
        .map((bill) => ({ 
          purchase_bill_id: bill.id, 
          amount: Number(amounts[bill.id]).toFixed(2),
          type: bill.type,
        })),
    [bills, amounts]
  );
  const selectedCents = allocations.reduce((sum, row) => sum + cents(row.amount), 0);
  const payableCents = cents(desk?.payable_now ?? 0);
  const advanceCents = cents(desk?.advance_balance ?? 0);

  // Client-side guards (the server re-checks every one).
  const overBill = bills.find((bill) => cents(amounts[bill.id] ?? 0) > cents(bill.outstanding));
  const payProblem = overBill
    ? `${overBill.bill_no}: more than its ${rupee(overBill.outstanding)} outstanding.`
    : selectedCents === 0
      ? "Enter an amount against at least one bill."
      : selectedCents > payableCents
        ? `Total ${rupee(selectedCents / 100)} is more than the ${rupee(desk?.payable_now)} payable — use the advance for the rest.`
        : !pay.finance_account_id
          ? "Pick the account you pay from."
          : null;
  const applyProblem = overBill
    ? payProblem
    : selectedCents === 0
      ? "Enter an amount against at least one bill."
      : selectedCents > advanceCents
        ? `Total ${rupee(selectedCents / 100)} is more than the ${rupee(desk?.advance_balance)} advance available.`
        : null;

  function fillFull(billId: number, outstanding: string) {
    setAmounts((c) => ({ ...c, [billId]: c[billId] ? "" : outstanding }));
  }

  async function run(kind: "pay" | "advance" | "apply", action: () => Promise<{ desk: VendorPaymentDesk }>, done: string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      adopt(result.desk);
      setNotice(done);
      onChanged?.();
    } catch (err) {
      setError(accountingErrorMessage(err, "The payment could not be posted."));
    } finally {
      setBusy(null);
    }
  }

  const accountOptions = (desk?.finance_accounts ?? []).map((fa) => (
    <option key={fa.id} value={fa.id}>
      {fa.name} ({fa.kind})
    </option>
  ));

  return (
    <SectionCard
      title="Pay vendor"
      description="Pay posted bills, pay an advance for future purchases, or use an advance against bills. Each payment posts Dr Accounts Payable / Cr the chosen account."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Payable now</div>
          <div className="text-lg font-semibold tabular-nums">{rupee(desk?.payable_now)}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Open bills</div>
          <div className="text-lg font-semibold tabular-nums">
            {rupee(desk?.open_bills_total)} <span className="text-xs text-muted-foreground">({bills.length})</span>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          <div className="text-xs uppercase tracking-wide">Advance available</div>
          <div className="text-lg font-semibold tabular-nums">{rupee(desk?.advance_balance)}</div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <div className="mt-4 space-y-2">
        <div className="text-sm font-semibold">Open bills</div>
        {bills.length === 0 ? <div className="text-sm text-muted-foreground">No posted bills with an outstanding balance.</div> : null}
        {bills.map((bill) => {
          const over = cents(amounts[bill.id] ?? 0) > cents(bill.outstanding);
          return (
            <div key={bill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{bill.bill_no}</div>
                <div className="text-xs text-muted-foreground">
                  {bill.bill_date ?? "—"} · Bill {rupee(bill.grand_total)} · Outstanding{" "}
                  <span className="font-semibold text-foreground">{rupee(bill.outstanding)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted"
                  onClick={() => fillFull(bill.id, bill.outstanding)}
                >
                  {amounts[bill.id] ? "Clear" : "Full"}
                </button>
                <input
                  aria-label={`Amount for ${bill.bill_no}`}
                  type="number"
                  min="0"
                  step="0.01"
                  max={bill.outstanding}
                  placeholder="0.00"
                  className={`${input} w-32 ${over ? "border-destructive" : ""}`}
                  value={amounts[bill.id] ?? ""}
                  onChange={(e) => setAmounts((c) => ({ ...c, [bill.id]: e.target.value }))}
                />
              </div>
            </div>
          );
        })}
      </div>

      {bills.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="text-sm">
            Selected: <span className="font-semibold tabular-nums">{rupee(selectedCents / 100)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              <span>Paid from</span>
              <select className={input} value={pay.finance_account_id} onChange={(e) => setPay((c) => ({ ...c, finance_account_id: e.target.value }))}>
                <option value="">Select account</option>
                {accountOptions}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span>Date</span>
              <input type="date" className={input} value={pay.payment_date} onChange={(e) => setPay((c) => ({ ...c, payment_date: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs">
              <span>Reference (UTR / cheque)</span>
              <input className={input} value={pay.reference_no} onChange={(e) => setPay((c) => ({ ...c, reference_no: e.target.value }))} />
            </label>
            <button
              type="button"
              disabled={Boolean(payProblem) || busy !== null}
              title={payProblem ?? undefined}
              className="h-10 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
              onClick={() =>
                void run(
                  "pay",
                  () =>
                    payVendorBills(vendorId, {
                      allocations,
                      finance_account_id: Number(pay.finance_account_id),
                      payment_date: pay.payment_date,
                      reference_no: pay.reference_no,
                    }),
                  `Paid ${rupee(selectedCents / 100)} and posted to the ledger.`
                )
              }
            >
              {busy === "pay" ? "Posting…" : `Pay & post ${rupee(selectedCents / 100)}`}
            </button>
            {advanceCents > 0 ? (
              <button
                type="button"
                disabled={Boolean(applyProblem) || busy !== null}
                title={applyProblem ?? undefined}
                className="h-10 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                onClick={() =>
                  void run(
                    "apply",
                    () => applyVendorAdvance(vendorId, { allocations }),
                    `Used ${rupee(selectedCents / 100)} of the advance against the selected bills.`
                  )
                }
              >
                {busy === "apply" ? "Applying…" : "Use advance instead"}
              </button>
            ) : null}
          </div>
          {payProblem && selectedCents > 0 ? <p className="mt-2 text-xs text-amber-700">{payProblem}</p> : null}
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-border p-3">
        <div className="text-sm font-semibold">Advance for future purchases</div>
        <p className="text-xs text-muted-foreground">
          Paid ahead of any bill. It shows as advance available and can be used against bills when they arrive.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            <span>Amount</span>
            <input type="number" min="0" step="0.01" className={`${input} w-32`} value={advance.amount} onChange={(e) => setAdvance((c) => ({ ...c, amount: e.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs">
            <span>Paid from</span>
            <select className={input} value={advance.finance_account_id} onChange={(e) => setAdvance((c) => ({ ...c, finance_account_id: e.target.value }))}>
              <option value="">Select account</option>
              {accountOptions}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>Date</span>
            <input type="date" className={input} value={advance.payment_date} onChange={(e) => setAdvance((c) => ({ ...c, payment_date: e.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs">
            <span>Reference</span>
            <input className={input} value={advance.reference_no} onChange={(e) => setAdvance((c) => ({ ...c, reference_no: e.target.value }))} />
          </label>
          <label className="grid min-w-[180px] flex-1 gap-1 text-xs">
            <span>Purpose / note</span>
            <input className={input} value={advance.notes} onChange={(e) => setAdvance((c) => ({ ...c, notes: e.target.value }))} />
          </label>
          <button
            type="button"
            disabled={cents(advance.amount) <= 0 || !advance.finance_account_id || busy !== null}
            className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            onClick={() =>
              void run(
                "advance",
                () =>
                  payVendorAdvance(vendorId, {
                    amount: Number(advance.amount).toFixed(2),
                    finance_account_id: Number(advance.finance_account_id),
                    payment_date: advance.payment_date,
                    reference_no: advance.reference_no,
                    notes: advance.notes,
                  }).then((result) => {
                    setAdvance((c) => ({ ...c, amount: "", reference_no: "", notes: "" }));
                    return result;
                  }),
                `Advance of ${rupee(advance.amount)} paid and posted.`
              )
            }
          >
            {busy === "advance" ? "Posting…" : "Pay advance & post"}
          </button>
        </div>
      </div>

      {desk && desk.recent_payments.length > 0 ? (
        <div className="mt-5 space-y-2">
          <div className="text-sm font-semibold">Recent payments</div>
          {desk.recent_payments.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
              <div>
                <span className="font-semibold">{row.settlement_no}</span> · {row.settlement_date} ·{" "}
                {row.is_advance ? "Advance" : row.purchase_bill_no ?? "On account"} · {row.finance_account_name ?? "—"}
                {row.journal_entry_no ? ` · JV ${row.journal_entry_no}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{rupee(row.amount)}</span>
                <ERPStatusBadge status={row.status} size="sm" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}
