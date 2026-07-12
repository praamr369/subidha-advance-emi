"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ERPPageShell from "@/components/erp/ERPPageShell";
import {
  getUnifiedPayables,
  getPayableFinanceAccounts,
  executePayable,
  type PayableItem,
  type FinanceAccount,
  type UnifiedPayableData,
} from "@/services/payables";
import { ROUTES } from "@/lib/routes";

// ── helpers ──────────────────────────────────────────────────────────────────

function rupee(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_COLOR: Record<string, string> = {
  salary: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  vendor_settlement: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  commission: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expense_claim: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  credit_refund: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const KIND_COLOR: Record<string, string> = {
  CASH: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  BANK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  UPI: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const JOURNAL_EXPLANATION: Record<string, string> = {
  salary: "Accrual: DR Salary Expense / CR Salary Payable → Payment: DR Salary Payable / CR Finance Account",
  vendor_settlement: "DR Accounts Payable / CR Finance Account",
  commission: "DR Partner Commission Payable / CR Finance Account",
  expense_claim: "Accrual: DR Expense / CR Accounts Payable → Payment: DR Accounts Payable / CR Finance Account",
  credit_refund: "DR Customer Receivable / CR Finance Account",
};

// ── Pay modal ────────────────────────────────────────────────────────────────

interface PayModalProps {
  item: PayableItem;
  accounts: FinanceAccount[];
  onClose: () => void;
  onPaid: (msg: string) => void;
}

function PayModal({ item, accounts, onClose, onPaid }: PayModalProps) {
  const [financeAccountId, setFinanceAccountId] = useState<string>(
    accounts.length ? String(accounts[0].id) : ""
  );
  const [amount, setAmount] = useState(item.outstanding);
  const [paymentDate, setPaymentDate] = useState(today());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsAccount = !["commission"].includes(item.payable_type);
  const selectedAccount = accounts.find((a) => String(a.id) === financeAccountId);
  const journalExplanation = JOURNAL_EXPLANATION[item.payable_type] ?? "";

  async function handlePay() {
    setErr(null);
    setBusy(true);
    try {
      const result = await executePayable({
        payable_type: item.payable_type,
        payable_id: item.payable_id,
        finance_account_id: needsAccount ? Number(financeAccountId) : null,
        amount,
        payment_date: paymentDate,
        reference_no: referenceNo,
        notes,
      });
      onPaid(result.message);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Execute Payment</h2>
              {item.needs_posting && (
                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium">
                  Auto-posts accrual journal first
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.reference} · {item.party_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Type</div>
              <div className="font-medium text-gray-900 dark:text-white mt-1">{item.payable_type_label}</div>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
              <div className="font-medium text-gray-900 dark:text-white mt-1">{rupee(item.amount)}</div>
            </div>
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
              <div className="text-xs text-red-500 dark:text-red-400">Outstanding</div>
              <div className="font-semibold text-red-600 dark:text-red-400 mt-1">{rupee(item.outstanding)}</div>
            </div>
          </div>

          {/* Payment mode */}
          {needsAccount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment mode — Cash / UPI / Bank
              </label>
              {accounts.length === 0 ? (
                <div className="text-sm text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-700 px-3 py-2">
                  No active finance accounts. Configure under{" "}
                  <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="underline">Finance Accounts</Link>.
                </div>
              ) : (
                <>
                  <select
                    value={financeAccountId}
                    onChange={(e) => setFinanceAccountId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.kind}] {a.name}{a.branch_name ? ` · ${a.branch_name}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedAccount && (
                    <div className="mt-1.5 flex gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_COLOR[selectedAccount.kind] ?? ""}`}>{selectedAccount.kind}</span>
                      <span className="text-gray-500 dark:text-gray-400">{selectedAccount.name}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={item.outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-400">Max: {rupee(item.outstanding)} · Partial payments allowed</p>
          </div>

          {/* Date + Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference no.</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="UTR / cheque / receipt"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white resize-none"
              placeholder="Additional remarks…"
            />
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {err}
            </div>
          )}

          {/* Journal explanation */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <div className="font-semibold">Journal entries that will be posted</div>
            <div className="font-mono">{journalExplanation}</div>
            {item.needs_posting && (
              <div className="mt-1 text-amber-700 dark:text-amber-300 font-medium">
                ⚠ Accrual journal will be auto-posted before payment because this item is still in APPROVED state.
              </div>
            )}
            <div className="mt-1 text-blue-600 dark:text-blue-400">
              Posted entries appear in{" "}
              <Link href={ROUTES.admin.accountingBridgeReconciliation} className="underline font-medium">
                Bridge Reconciliation →
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={busy || (needsAccount && !financeAccountId) || !amount || parseFloat(amount) <= 0}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Processing…" : `Pay ${rupee(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const TYPES = [
  { value: "", label: "All types" },
  { value: "salary", label: "Salary" },
  { value: "vendor_settlement", label: "Vendor Settlement" },
  { value: "commission", label: "Commission" },
  { value: "expense_claim", label: "Expense Claim" },
  { value: "credit_refund", label: "Customer Refund" },
];

export default function UnifiedPayablePage() {
  const [data, setData] = useState<UnifiedPayableData | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [paying, setPaying] = useState<PayableItem | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, accts] = await Promise.all([
        getUnifiedPayables({ payable_type: typeFilter || undefined, search: search || undefined }),
        getPayableFinanceAccounts(),
      ]);
      setData(d);
      setAccounts(accts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load payables.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => { void load(); }, [load]);

  function handlePaid(msg: string) {
    setPaying(null);
    showToast(msg);
    void load();
  }

  const needsPostingCount = data?.needs_posting_count ?? 0;

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Unified Payables"
      subtitle="All outgoing obligations — salary, vendors, commissions, expenses, refunds — in one queue. Journal entries auto-post on payment."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Payables" }]}
      stats={data ? [
        { label: "Total Outstanding", value: rupee(data.total_outstanding), tone: "danger" },
        { label: "Items Pending", value: data.total_items },
        { label: "Needs Journal", value: data.needs_posting_count, tone: data.needs_posting_count > 0 ? "warning" : "default" },
      ] : []}
      actions={[
        { href: ROUTES.admin.accountingBridgeReconciliation, label: "Bridge Reconciliation" },
      ]}
    >
      <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:shadow"
        >
          ↻ Refresh
        </button>
      </div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium leading-snug ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Pay modal */}
      {paying && (
        <PayModal
          item={paying}
          accounts={accounts}
          onClose={() => setPaying(null)}
          onPaid={handlePaid}
        />
      )}

      {/* Needs-posting alert */}
      {needsPostingCount > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-5 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-3">
          <span className="text-lg">⚠</span>
          <span>
            <strong>{needsPostingCount} item{needsPostingCount > 1 ? "s" : ""}</strong> need an accrual journal before payment.
            Clicking <strong>Pay</strong> auto-posts the accrual first, then records the payment — no separate step needed.
          </span>
        </div>
      )}

      {/* KPI tiles */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div
            className={`col-span-2 sm:col-span-1 rounded-2xl border p-4 shadow-sm cursor-pointer transition-colors ${typeFilter === "" ? "bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-gray-400"}`}
            onClick={() => setTypeFilter("")}
          >
            <div className={`text-xs font-medium uppercase tracking-wide ${typeFilter === "" ? "text-gray-300 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}>Total outstanding</div>
            <div className={`text-2xl font-bold mt-1 ${typeFilter === "" ? "text-white dark:text-gray-900" : "text-red-600 dark:text-red-400"}`}>{rupee(data.total_outstanding)}</div>
            <div className={`text-xs mt-0.5 ${typeFilter === "" ? "text-gray-400 dark:text-gray-500" : "text-gray-400"}`}>{data.total_items} items</div>
          </div>
          {data.type_summary.map((ts) => (
            <div
              key={ts.payable_type}
              className={`rounded-2xl border p-4 shadow-sm cursor-pointer transition-colors ${typeFilter === ts.payable_type ? "bg-blue-600 border-blue-600 text-white" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-blue-400"}`}
              onClick={() => setTypeFilter(typeFilter === ts.payable_type ? "" : ts.payable_type)}
            >
              <div className={`text-xs font-medium ${typeFilter === ts.payable_type ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>{ts.label}</div>
              <div className={`text-xl font-bold mt-1 ${typeFilter === ts.payable_type ? "text-white" : "text-gray-900 dark:text-white"}`}>{rupee(ts.total)}</div>
              <div className={`text-xs mt-0.5 ${typeFilter === ts.payable_type ? "text-blue-200" : "text-gray-400"}`}>{ts.count} pending</div>
            </div>
          ))}
        </div>
      )}

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2 items-center">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTypeFilter(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${typeFilter === t.value ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400"}`}
          >
            {t.label}
          </button>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
          className="flex gap-2 ml-auto"
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search party / reference…"
            className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white w-52"
          />
          <button type="submit" className="px-3 py-1.5 rounded-xl bg-gray-800 dark:bg-gray-700 text-white text-sm">Search</button>
          {search && (
            <button type="button" onClick={() => { setSearch(""); setSearchInput(""); }} className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-500">Clear</button>
          )}
        </form>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading payables…</div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-5 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => void load()} className="ml-3 underline">Retry</button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">✓</div>
          <div className="text-lg font-semibold text-gray-500 dark:text-gray-400">No pending payables</div>
          <div className="text-sm mt-1">All obligations are settled for the selected filter.</div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Journal</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[item.payable_type] ?? "bg-gray-100 text-gray-700"}`}>
                        {item.payable_type_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div>{item.reference}</div>
                      {item.notes && (
                        <div className="text-xs text-gray-400 mt-0.5 max-w-[180px] truncate">{item.notes}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{item.party_name}</div>
                      <div className="text-xs text-gray-400">{item.party_type}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{rupee(item.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-red-600 dark:text-red-400">{rupee(item.outstanding)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.status}</span>
                        {item.needs_posting && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Accrual needed</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.journal_posted ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Posted</span>
                      ) : (
                        <span className="text-xs text-gray-400">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{item.date ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPaying(item)}
                        className={`inline-flex items-center gap-1 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${item.needs_posting ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"}`}
                      >
                        {item.needs_posting ? "Post & Pay" : "Pay"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex flex-wrap justify-between items-center gap-3 text-sm">
            <div className="flex gap-4 text-xs text-gray-400">
              <span>{data.total_items} item{data.total_items !== 1 ? "s" : ""}</span>
              {needsPostingCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">{needsPostingCount} need accrual posting</span>
              )}
            </div>
            <span className="font-semibold text-red-600 dark:text-red-400">
              Total outstanding: {rupee(data.total_outstanding)}
            </span>
          </div>
        </div>
      )}

      {/* Finance accounts reference panel */}
      {accounts.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Available payment accounts</h3>
            <Link
              href={ROUTES.admin.settingsBusinessSetupFinanceAccounts}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Manage accounts →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_COLOR[a.kind] ?? ""}`}>{a.kind}</span>
                <span className="text-gray-700 dark:text-gray-300 font-medium">{a.name}</span>
                {a.branch_name && <span className="text-gray-400">{a.branch_name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Related modules</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { label: "Bridge Reconciliation", href: ROUTES.admin.accountingBridgeReconciliation },
            { label: "Journal Entries", href: ROUTES.admin.accounting },
            { label: "Finance Accounts", href: ROUTES.admin.settingsBusinessSetupFinanceAccounts },
            { label: "HR Payroll", href: ROUTES.admin.hrPayroll },
            { label: "Vendors", href: "/admin/vendors" },
            { label: "Collections", href: ROUTES.admin.collections },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:border-blue-400 transition-colors"
            >
              {link.label} →
            </Link>
          ))}
        </div>
      </div>
      </div>
    </ERPPageShell>
  );
}
