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
  payVendorOutstanding,
  type VendorPaymentDesk,
} from "@/services/vendor-ops";

const input = "h-10 rounded-xl border border-border bg-background px-3 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

function rupee(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cents = (value: string | number) => Math.round(Number(value || 0) * 100);

type ActiveTab = "settle" | "advance" | "history";

/**
 * Pay vendor bills, pay on-account / old bills outstanding, full settlement,
 * pay advances, or apply advances against bills.
 */
export function VendorPaymentDeskPanel({ vendorId, onChanged }: { vendorId: number; onChanged?: () => void }) {
  const [desk, setDesk] = useState<VendorPaymentDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "outstanding" | "advance" | "apply" | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("settle");

  // State for bill allocations
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [pay, setPay] = useState({ finance_account_id: "", payment_date: today(), reference_no: "" });

  // State for on-account / old bills outstanding
  const [onAccount, setOnAccount] = useState({
    amount: "",
    finance_account_id: "",
    payment_date: today(),
    reference_no: "",
    notes: "",
  });

  // State for advances
  const [advance, setAdvance] = useState({
    amount: "",
    finance_account_id: "",
    payment_date: today(),
    reference_no: "",
    notes: "",
  });

  const adopt = useCallback((next: VendorPaymentDesk) => {
    setDesk(next);
    setAmounts({});
    const first = String(next.finance_accounts[0]?.id ?? "");
    setPay((c) => ({ ...c, finance_account_id: c.finance_account_id || first }));
    setOnAccount((c) => ({ ...c, finance_account_id: c.finance_account_id || first }));
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
  const openBillsCents = cents(desk?.open_bills_total ?? 0);
  const unallocatedCents = Math.max(0, payableCents - openBillsCents);
  const advanceCents = cents(desk?.advance_balance ?? 0);
  const onAccountCents = cents(onAccount.amount);

  // Client-side guards for bill payment
  const overBill = bills.find((bill) => cents(amounts[bill.id] ?? 0) > cents(bill.outstanding));
  const payProblem = overBill
    ? `${overBill.bill_no}: more than its ${rupee(overBill.outstanding)} outstanding.`
    : selectedCents === 0
      ? "Enter an amount against at least one bill."
      : selectedCents > payableCents
        ? `Total ${rupee(selectedCents / 100)} is more than the ${rupee(desk?.payable_now)} payable.`
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

  // Client-side guards for on-account payment
  const onAccountProblem =
    onAccountCents <= 0
      ? "Enter an amount to pay against outstanding."
      : onAccountCents > payableCents
        ? `Amount ${rupee(onAccountCents / 100)} exceeds total payable balance ${rupee(desk?.payable_now)}.`
        : !onAccount.finance_account_id
          ? "Pick the account you pay from."
          : null;

  function fillFull(billId: number, outstanding: string) {
    setAmounts((c) => ({ ...c, [billId]: c[billId] ? "" : outstanding }));
  }

  function selectAllBills() {
    const next: Record<number, string> = {};
    bills.forEach((b) => {
      next[b.id] = b.outstanding;
    });
    setAmounts(next);
  }

  function clearAllBills() {
    setAmounts({});
  }

  function handleFullSettlement() {
    setError(null);
    if (payableCents <= 0) {
      setNotice("Vendor has no outstanding balance to settle.");
      return;
    }
    if (bills.length > 0) {
      selectAllBills();
      if (unallocatedCents > 0) {
        setOnAccount((c) => ({
          ...c,
          amount: (unallocatedCents / 100).toFixed(2),
          notes: "Full settlement - unallocated outstanding portion",
        }));
      }
    } else {
      setOnAccount((c) => ({
        ...c,
        amount: (payableCents / 100).toFixed(2),
        notes: "Full settlement of vendor outstanding / old bills",
      }));
    }
    setActiveTab("settle");
    setNotice(`Prepared full settlement of ${rupee(payableCents / 100)}. Verify the payment account and post.`);
  }

  async function run(
    kind: "pay" | "outstanding" | "advance" | "apply",
    action: () => Promise<{ desk: VendorPaymentDesk }>,
    done: string
  ) {
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
      title="Vendor payment desk"
      description="Pay posted bills, pay directly against old bills / outstanding (on account), execute full settlement, or issue/apply advances. All payments post Dr Accounts Payable / Cr chosen account."
      action={
        payableCents > 0 ? (
          <button
            type="button"
            onClick={handleFullSettlement}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            <span>⚡ Full settlement</span>
            <span className="font-mono tabular-nums">({rupee(desk?.payable_now)})</span>
          </button>
        ) : null
      }
    >
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-amber-950">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide font-medium text-amber-800">Payable now</span>
            {payableCents > 0 ? (
              <span className="inline-flex items-center rounded-md bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                Action required
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">{rupee(desk?.payable_now)}</div>
          <div className="mt-1 text-[11px] text-amber-700/80">Net total payable across bills & balance</div>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Open bills</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {rupee(desk?.open_bills_total)}{" "}
            <span className="text-xs font-normal text-muted-foreground">({bills.length})</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Posted purchase bills pending payment</div>
        </div>

        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Old bills / On account</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{rupee(unallocatedCents / 100)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Opening balance / legacy unallocated</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-950">
          <div className="text-xs uppercase tracking-wide font-medium text-emerald-800">Advance available</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-900">{rupee(desk?.advance_balance)}</div>
          <div className="mt-1 text-[11px] text-emerald-700/80">Unconsumed advance credit with vendor</div>
        </div>
      </div>

      {/* Messages */}
      {error ? (
        <div role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {/* Operation Tabs */}
      <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("settle")}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === "settle"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          💳 Pay bills & outstanding {payableCents > 0 ? `(${rupee(desk?.payable_now)})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("advance")}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === "advance"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          🚀 Pay advance for future purchases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`rounded-lg px-3 py-1.5 transition ${
            activeTab === "history"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "border border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          📋 Recent settlements ({desk?.recent_payments.length ?? 0})
        </button>
      </div>

      {/* TAB 1: PAY BILLS & OUTSTANDING */}
      {activeTab === "settle" ? (
        <div className="mt-4 space-y-6">
          {/* SECTION A: OPEN BILLS (if any) */}
          {bills.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-border p-4 bg-muted/15">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Open posted bills</div>
                  <div className="text-xs text-muted-foreground">
                    Select bills and allocate payments against their specific outstanding balances.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllBills}
                    className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    Select all (Full)
                  </button>
                  <button
                    type="button"
                    onClick={clearAllBills}
                    className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {bills.map((bill) => {
                  const over = cents(amounts[bill.id] ?? 0) > cents(bill.outstanding);
                  return (
                    <div
                      key={bill.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-foreground">{bill.bill_no}</div>
                        <div className="text-xs text-muted-foreground">
                          {bill.bill_date ?? "—"} · Total {rupee(bill.grand_total)} · Outstanding:{" "}
                          <span className="font-semibold text-foreground">{rupee(bill.outstanding)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="h-8 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted"
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
                          className={`${input} w-32 ${over ? "border-destructive text-destructive font-semibold" : ""}`}
                          value={amounts[bill.id] ?? ""}
                          onChange={(e) => setAmounts((c) => ({ ...c, [bill.id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bill Payment Execution Bar */}
              <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    Selected for bills: <span className="font-bold tabular-nums text-foreground">{rupee(selectedCents / 100)}</span>
                  </span>
                  {selectedCents > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Remaining payable balance: {rupee(Math.max(0, payableCents - selectedCents) / 100)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Paid from account *</span>
                    <select
                      className={input}
                      value={pay.finance_account_id}
                      onChange={(e) => setPay((c) => ({ ...c, finance_account_id: e.target.value }))}
                    >
                      <option value="">Select account</option>
                      {accountOptions}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Date</span>
                    <input
                      type="date"
                      className={input}
                      value={pay.payment_date}
                      onChange={(e) => setPay((c) => ({ ...c, payment_date: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium">Reference (UTR / Cheque)</span>
                    <input
                      className={input}
                      placeholder="e.g. UTR123456"
                      value={pay.reference_no}
                      onChange={(e) => setPay((c) => ({ ...c, reference_no: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={Boolean(payProblem) || busy !== null}
                    title={payProblem ?? undefined}
                    className="h-10 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
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
                        `Paid ${rupee(selectedCents / 100)} against bills and posted to ledger.`
                      )
                    }
                  >
                    {busy === "pay" ? "Posting…" : `Pay & post bills (${rupee(selectedCents / 100)})`}
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
                          `Applied ${rupee(selectedCents / 100)} from vendor advance balance.`
                        )
                      }
                    >
                      {busy === "apply" ? "Applying…" : "Use advance instead"}
                    </button>
                  ) : null}
                </div>
                {payProblem && selectedCents > 0 ? <p className="mt-2 text-xs text-amber-700 font-medium">{payProblem}</p> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm">
              <div className="font-medium text-foreground">No open posted bills found</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                All modern purchase bills are settled. Any payable amount below represents opening balance, legacy unallocated bills, or general on-account credit.
              </div>
            </div>
          )}

          {/* SECTION B: PAY OLD BILLS / OUTSTANDING (ON ACCOUNT) */}
          <div className="rounded-xl border border-border p-4 bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Pay against old bills or outstanding (On account)
                </div>
                <p className="text-xs text-muted-foreground">
                  Post a payment directly against the vendor&apos;s Accounts Payable balance without needing individual bill line allocations.
                  Each payment posts Dr Accounts Payable / Cr the chosen payment account.
                </p>
              </div>
              {payableCents > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Quick fill:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setOnAccount((c) => ({
                        ...c,
                        amount: (payableCents / 100).toFixed(2),
                        notes: "Full settlement of vendor outstanding balance",
                      }))
                    }
                    className="h-7 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Full balance ({rupee(desk?.payable_now)})
                  </button>
                  {unallocatedCents > 0 && unallocatedCents !== payableCents ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOnAccount((c) => ({
                          ...c,
                          amount: (unallocatedCents / 100).toFixed(2),
                          notes: "Settlement of unallocated opening balance",
                        }))
                      }
                      className="h-7 rounded-lg border border-border bg-background px-2 text-xs font-medium hover:bg-muted"
                    >
                      Unallocated ({rupee(unallocatedCents / 100)})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOnAccount((c) => ({ ...c, amount: "" }))}
                    className="h-7 rounded-lg border border-border bg-background px-2 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2.5">
              <label className="grid gap-1 text-xs">
                <span className="font-medium">Amount to pay *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={desk?.payable_now ?? undefined}
                  placeholder="0.00"
                  className={`${input} w-36 font-semibold`}
                  value={onAccount.amount}
                  onChange={(e) => setOnAccount((c) => ({ ...c, amount: e.target.value }))}
                />
              </label>

              <label className="grid gap-1 text-xs">
                <span className="font-medium">Paid from account *</span>
                <select
                  className={input}
                  value={onAccount.finance_account_id}
                  onChange={(e) => setOnAccount((c) => ({ ...c, finance_account_id: e.target.value }))}
                >
                  <option value="">Select account</option>
                  {accountOptions}
                </select>
              </label>

              <label className="grid gap-1 text-xs">
                <span className="font-medium">Payment date</span>
                <input
                  type="date"
                  className={input}
                  value={onAccount.payment_date}
                  onChange={(e) => setOnAccount((c) => ({ ...c, payment_date: e.target.value }))}
                />
              </label>

              <label className="grid gap-1 text-xs">
                <span className="font-medium">Reference (UTR / Cheque)</span>
                <input
                  className={input}
                  placeholder="e.g. UTR987654"
                  value={onAccount.reference_no}
                  onChange={(e) => setOnAccount((c) => ({ ...c, reference_no: e.target.value }))}
                />
              </label>

              <label className="grid min-w-[200px] flex-1 gap-1 text-xs">
                <span className="font-medium">Purpose / note</span>
                <input
                  className={input}
                  placeholder="Payment towards old bills / outstanding"
                  value={onAccount.notes}
                  onChange={(e) => setOnAccount((c) => ({ ...c, notes: e.target.value }))}
                />
              </label>

              <button
                type="button"
                disabled={Boolean(onAccountProblem) || busy !== null}
                title={onAccountProblem ?? undefined}
                className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
                onClick={() =>
                  void run(
                    "outstanding",
                    () =>
                      payVendorOutstanding(vendorId, {
                        amount: Number(onAccount.amount).toFixed(2),
                        finance_account_id: Number(onAccount.finance_account_id),
                        payment_date: onAccount.payment_date,
                        reference_no: onAccount.reference_no,
                        notes: onAccount.notes || "Payment against old bills / outstanding (vendor desk).",
                      }).then((res) => {
                        setOnAccount((c) => ({ ...c, amount: "", reference_no: "", notes: "" }));
                        return res;
                      }),
                    `Payment of ${rupee(onAccount.amount)} posted to vendor outstanding.`
                  )
                }
              >
                {busy === "outstanding"
                  ? "Posting…"
                  : `Pay outstanding & post (${rupee(onAccountCents > 0 ? onAccountCents / 100 : 0)})`}
              </button>
            </div>

            {onAccountProblem && onAccountCents > 0 ? (
              <p className="mt-2 text-xs font-medium text-amber-700">{onAccountProblem}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* TAB 2: ADVANCE PAYMENT FOR FUTURE PURCHASES */}
      {activeTab === "advance" ? (
        <div className="mt-4 rounded-xl border border-border p-4 bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Advance for future purchases</div>
              <p className="text-xs text-muted-foreground">
                Pay money ahead of any bill. This appears as available vendor advance and can be applied against purchase bills when received.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Quick amounts:</span>
              {[10000, 25000, 50000, 100000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAdvance((c) => ({ ...c, amount: String(amt) }))}
                  className="rounded-lg border border-border bg-background px-2 py-1 font-medium hover:bg-muted"
                >
                  ₹{(amt / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2.5">
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Advance amount *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className={`${input} w-36 font-semibold`}
                value={advance.amount}
                onChange={(e) => setAdvance((c) => ({ ...c, amount: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Paid from account *</span>
              <select
                className={input}
                value={advance.finance_account_id}
                onChange={(e) => setAdvance((c) => ({ ...c, finance_account_id: e.target.value }))}
              >
                <option value="">Select account</option>
                {accountOptions}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Payment date</span>
              <input
                type="date"
                className={input}
                value={advance.payment_date}
                onChange={(e) => setAdvance((c) => ({ ...c, payment_date: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Reference</span>
              <input
                className={input}
                placeholder="UTR / Cheque"
                value={advance.reference_no}
                onChange={(e) => setAdvance((c) => ({ ...c, reference_no: e.target.value }))}
              />
            </label>
            <label className="grid min-w-[200px] flex-1 gap-1 text-xs">
              <span className="font-medium">Purpose / note</span>
              <input
                className={input}
                placeholder="Advance for upcoming furniture material purchase"
                value={advance.notes}
                onChange={(e) => setAdvance((c) => ({ ...c, notes: e.target.value }))}
              />
            </label>
            <button
              type="button"
              disabled={cents(advance.amount) <= 0 || !advance.finance_account_id || busy !== null}
              className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
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
      ) : null}

      {/* TAB 3: RECENT PAYMENTS & HISTORY */}
      {activeTab === "history" || (desk && desk.recent_payments.length > 0 && activeTab === "settle") ? (
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Recent settlements & payments</div>
            <span className="text-xs text-muted-foreground">{desk?.recent_payments.length ?? 0} records</span>
          </div>

          {desk && desk.recent_payments.length > 0 ? (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {desk.recent_payments.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs hover:bg-muted/30 transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{row.settlement_no}</span>
                      <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        {row.is_advance ? "Advance" : row.purchase_bill_no ? `Bill: ${row.purchase_bill_no}` : "On account"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {row.settlement_date} · Account: {row.finance_account_name ?? "—"}
                      {row.journal_entry_no ? ` · JV: ${row.journal_entry_no}` : ""}
                      {row.reference_no ? ` · Ref: ${row.reference_no}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold tabular-nums text-foreground">{rupee(row.amount)}</span>
                    <ERPStatusBadge status={row.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No recent payment settlements on record for this vendor.
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
