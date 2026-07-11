"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getUnifiedPayables,
  getPayableFinanceAccounts,
  executePayable,
  type PayableItem,
  type PayableType,
  type FinanceAccount,
  type UnifiedPayableData,
} from "@/services/payables";

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

  const needsAccount = !["commission", "credit_refund"].includes(item.payable_type);
  const selectedAccount = accounts.find((a) => String(a.id) === financeAccountId);

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
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Execute Payment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.reference} · {item.party_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Type</div>
              <div className="font-medium text-gray-900 dark:text-white mt-1">{item.payable_type_label}</div>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Outstanding</div>
              <div className="font-semibold text-red-600 dark:text-red-400 mt-1">{rupee(item.outstanding)}</div>
            </div>
          </div>

          {/* Payment mode — finance account */}
          {needsAccount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment mode (Cash / UPI / Bank)
              </label>
              {accounts.length === 0 ? (
                <div className="text-sm text-red-600 dark:text-red-400">No active finance accounts found. Configure them in Finance Accounts setup first.</div>
              ) : (
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
              )}
              {selectedAccount && (
                <div className="mt-1.5 flex gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_COLOR[selectedAccount.kind] ?? ""}`}>{selectedAccount.kind}</span>
                  <span className="text-gray-400">{selectedAccount.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-400">Max: {rupee(item.outstanding)}</p>
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
                placeholder="UTR / cheque / receipt no."
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

          {/* Journal notice */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-4 py-2 text-xs text-blue-700 dark:text-blue-300">
            A journal entry will be auto-posted to the selected payment account. The bridge reconciliation queue will be updated immediately.
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={busy || (needsAccount && !financeAccountId)}
            className="px-5 py-2 text-sm font-semibold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Processing…" : `Pay ${rupee(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const TYPES: { value: string; label: string }[] = [
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
    setTimeout(() => setToast(null), 4000);
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Unified Payment Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            All outgoing obligations — salary, vendor, commission, expenses, refunds — in one queue. Select an item and pay with Cash, UPI, or Bank. Journal entries are auto-posted.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:shadow"
        >
          ↻ Refresh
        </button>
      </div>

      {/* KPI summary */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Total outstanding</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{rupee(data.total_outstanding)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{data.total_items} items</div>
          </div>
          {data.type_summary.map((ts) => (
            <div
              key={ts.payable_type}
              className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 shadow-sm cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => setTypeFilter(typeFilter === ts.payable_type ? "" : ts.payable_type)}
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{ts.label}</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{rupee(ts.total)}</div>
              <div className="text-xs text-gray-400 mt-0.5">{ts.count} pending</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading payables…</div>
      ) : error ? (
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-5 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => void load()} className="ml-3 underline">Retry</button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✓</div>
          <div className="text-lg font-medium">No pending payables</div>
          <div className="text-sm mt-1">All obligations are settled for the selected filter.</div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Journal</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[item.payable_type] ?? "bg-gray-100 text-gray-700"}`}>
                        {item.payable_type_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div>{item.reference}</div>
                      {item.notes && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-40">{item.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white">{item.party_name}</div>
                      <div className="text-xs text-gray-400">{item.party_type}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{rupee(item.amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">{rupee(item.outstanding)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{item.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item.journal_posted ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Posted</span>
                      ) : (
                        <span className="text-xs text-amber-500">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{item.date ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPaying(item)}
                        className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer total */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 flex justify-end gap-6 text-sm">
            <span className="text-gray-500 dark:text-gray-400">{data.total_items} items</span>
            <span className="font-semibold text-red-600 dark:text-red-400">Total outstanding: {rupee(data.total_outstanding)}</span>
          </div>
        </div>
      )}

      {/* Finance accounts reference */}
      {accounts.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Available payment accounts</h3>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_COLOR[a.kind] ?? ""}`}>{a.kind}</span>
                <span className="text-gray-700 dark:text-gray-300">{a.name}</span>
                {a.branch_name && <span className="text-gray-400">{a.branch_name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
