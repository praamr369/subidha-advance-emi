"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, RefreshCw, ExternalLink, BookOpen, CreditCard, AlertTriangle, CheckCircle2 } from "lucide-react";
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

// ── helpers ───────────────────────────────────────────────────────────────────

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
  vendor_outstanding: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  commission: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  expense_claim: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  credit_refund: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  payout_batch: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
};

const KIND_COLOR: Record<string, string> = {
  CASH: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  BANK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  UPI: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const JOURNAL_EXPLANATION: Record<string, string> = {
  salary: "Accrual: DR Salary Expense / CR Salary Payable  →  Payment: DR Salary Payable / CR Finance Account",
  vendor_settlement: "DR Accounts Payable / CR Finance Account",
  vendor_outstanding: "Creates & posts a vendor settlement: DR Accounts Payable / CR Finance Account",
  commission: "DR Partner Commission Payable / CR Finance Account",
  expense_claim: "Accrual: DR Expense / CR Accounts Payable  →  Payment: DR Accounts Payable / CR Finance Account",
  credit_refund: "DR Customer Receivable / CR Finance Account",
  payout_batch: "DR Partner Commission Payable / CR Finance Account  (bulk partner disbursement)",
};

// Source-module deep-links per payable type
const SOURCE_LINKS: Record<string, { label: string; href: string }[]> = {
  salary: [
    { label: "HR Payroll", href: ROUTES.admin.hrPayroll },
    { label: "Salary Sheets", href: "/admin/hr/payroll" },
  ],
  vendor_settlement: [
    { label: "Vendors", href: "/admin/vendors" },
    { label: "Accounting Payables", href: "/admin/accounting/payables" },
  ],
  vendor_outstanding: [
    { label: "Vendors", href: "/admin/vendors" },
    { label: "Vendor Payables", href: "/admin/purchases/vendor-payables" },
  ],
  commission: [
    { label: "Commissions", href: "/admin/commissions" },
    { label: "Partner Performance", href: "/admin/partner" },
  ],
  expense_claim: [
    { label: "HR Staff", href: "/admin/hr/staff" },
  ],
  credit_refund: [
    { label: "Refunds", href: "/admin/refunds" },
    { label: "Collections", href: ROUTES.admin.collections },
  ],
  payout_batch: [
    { label: "Payout Batches", href: "/admin/batches" },
    { label: "Commissions", href: "/admin/commissions" },
  ],
};

// ── Pay modal ─────────────────────────────────────────────────────────────────

interface PayModalProps {
  item: PayableItem;
  accounts: FinanceAccount[];
  onClose: () => void;
  onPaid: (msg: string, journalId?: number | null) => void;
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
  const journalExplanation = JOURNAL_EXPLANATION[item.payable_type] ?? "Journal entry will be posted automatically.";
  const sourceLinks = SOURCE_LINKS[item.payable_type] ?? [];

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
      onPaid(result.message, result.journal_entry_id);
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
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Execute Payment</h2>
              {item.needs_posting && (
                <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full px-2 py-0.5 font-medium">
                  Auto-posts accrual first
                </span>
              )}
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_COLOR[item.payable_type] ?? "bg-gray-100"}`}>
                {item.payable_type_label}
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {item.reference} · <span className="font-medium">{item.party_name}</span>
              <span className="ml-1 text-gray-400">({item.party_type})</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Party</div>
              <div className="font-medium text-gray-900 dark:text-white mt-1 truncate">{item.party_name}</div>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">Total Amount</div>
              <div className="font-medium text-gray-900 dark:text-white mt-1">{rupee(item.amount)}</div>
            </div>
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
              <div className="text-xs text-red-500 dark:text-red-400">Outstanding</div>
              <div className="font-semibold text-red-600 dark:text-red-400 mt-1">{rupee(item.outstanding)}</div>
            </div>
          </div>

          {/* Source module links */}
          {sourceLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-400 self-center">Source:</span>
              {sourceLinks.map((l) => (
                <Link
                  key={`${l.label}-${l.href}`}
                  href={l.href}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-0.5"
                >
                  {l.label} <ExternalLink className="h-3 w-3" />
                </Link>
              ))}
            </div>
          )}

          {/* Payment account */}
          {needsAccount && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <CreditCard className="inline h-3.5 w-3.5 mr-1" />Payment account (Cash / UPI / Bank)
              </label>
              {accounts.length === 0 ? (
                <div className="text-sm text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-700 px-3 py-2">
                  No active finance accounts.{" "}
                  <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="underline">Configure →</Link>
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
              type="number" step="0.01" min="0.01" max={item.outstanding}
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
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference no.</label>
              <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="UTR / cheque / receipt"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white resize-none"
              placeholder="Additional remarks…"
            />
          </div>

          {err && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {err}
            </div>
          )}

          {/* Journal explanation */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Journal entries that will be posted</div>
            <div className="font-mono bg-blue-100 dark:bg-blue-900/40 rounded px-2 py-1 leading-relaxed">{journalExplanation}</div>
            {item.needs_posting && (
              <div className="text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Accrual journal auto-posted first (item is still APPROVED).
              </div>
            )}
            <div className="text-blue-600 dark:text-blue-400">
              Posted entries visible in{" "}
              <Link href={ROUTES.admin.accountingBridgeReconciliation} className="underline font-medium">Bridge Reconciliation →</Link>
              {" "}and{" "}
              <Link href={ROUTES.admin.accountingJournals} className="underline font-medium">Journal Ledger →</Link>
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

// ── Success toast ─────────────────────────────────────────────────────────────

function SuccessToast({ msg, journalId, onClose }: { msg: string; journalId?: number | null; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl bg-green-600 text-white shadow-2xl px-5 py-4 space-y-2">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium">{msg}</p>
        <button onClick={onClose} className="ml-auto text-white/70 hover:text-white">×</button>
      </div>
      {journalId && (
        <div className="text-xs text-green-100">
          Journal #{journalId} posted.{" "}
          <Link href={ROUTES.admin.accountingBridgeReconciliation} className="underline font-medium">View in reconciliation →</Link>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TYPES = [
  { value: "", label: "All types" },
  { value: "salary", label: "Salary" },
  { value: "vendor_settlement", label: "Vendor Settlement" },
  { value: "vendor_outstanding", label: "Vendor Outstanding" },
  { value: "commission", label: "Commission" },
  { value: "expense_claim", label: "Expense Claim" },
  { value: "credit_refund", label: "Customer Refund" },
  { value: "payout_batch", label: "Partner Payout Batch" },
];

// Module quick-access links shown in the sidebar
const MODULE_LINKS = [
  { label: "HR Payroll", href: ROUTES.admin.hrPayroll, desc: "Salary sheets", color: "border-blue-200 dark:border-blue-800" },
  { label: "Vendors", href: "/admin/vendors", desc: "Vendor settlements", color: "border-purple-200 dark:border-purple-800" },
  { label: "Commissions", href: "/admin/commissions", desc: "Partner commissions", color: "border-amber-200 dark:border-amber-800" },
  { label: "Payout Batches", href: "/admin/batches", desc: "Bulk partner payouts", color: "border-indigo-200 dark:border-indigo-800" },
  { label: "Refunds", href: "/admin/refunds", desc: "Customer refunds", color: "border-rose-200 dark:border-rose-800" },
  { label: "Finance Accounts", href: ROUTES.admin.settingsBusinessSetupFinanceAccounts, desc: "Cash / Bank / UPI", color: "border-gray-200 dark:border-gray-700" },
  { label: "Journal Ledger", href: ROUTES.admin.accountingJournals, desc: "All posted entries", color: "border-green-200 dark:border-green-800" },
  { label: "Bridge Reconciliation", href: ROUTES.admin.accountingBridgeReconciliation, desc: "Verify posted journals", color: "border-teal-200 dark:border-teal-800" },
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
  const [toast, setToast] = useState<{ msg: string; journalId?: number | null } | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const handlePaid = useCallback((msg: string, journalId?: number | null) => {
    setPaying(null);
    setToast({ msg, journalId });
    setTimeout(() => setToast(null), 8000);
    load();
  }, [load]);

  const needsPostingCount = data?.needs_posting_count ?? 0;
  const totalOutstanding = data?.total_outstanding ?? "0.00";

  return (
    <ERPPageShell
      title="Unified Payables"
      subtitle="All outgoing payment obligations — salary, vendor, commission, payout, refund"
      actions={[
        {
          label: "Add Manual Expense",
          href: "/admin/accounting/expenses",
          variant: "primary",
        },
      ]}
    >
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-2 mb-5">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Outstanding</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{rupee(totalOutstanding)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Payable Items</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{data?.total_items ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4">
          <p className="text-xs text-amber-600 dark:text-amber-400">Need Accrual Posting</p>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{needsPostingCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Finance Accounts</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{accounts.length}</p>
        </div>
      </div>

      {/* Type summary chips */}
      {data && data.type_summary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {data.type_summary.map((s) => (
            <button
              key={s.payable_type}
              onClick={() => setTypeFilter((prev) => prev === s.payable_type ? "" : s.payable_type)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === s.payable_type
                  ? "border-primary bg-primary text-primary-foreground"
                  : `${TYPE_COLOR[s.payable_type] ?? "bg-gray-100 text-gray-700"} border-transparent hover:border-gray-300`
              }`}
            >
              {s.label} · {s.count} · {rupee(s.total)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 flex-wrap mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            placeholder="Search party, reference…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
          />
        </div>
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        >
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Main table */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-5">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-500 dark:text-gray-400">Loading payables…</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-blue-600 underline">Retry</button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No pending payables</p>
            <p className="text-xs text-gray-400 mt-1">All obligations are paid or no items match the filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Party</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Outstanding</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Journal</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[item.payable_type] ?? "bg-gray-100 text-gray-700"}`}>
                        {item.payable_type_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-nowrap">{item.reference}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white text-xs">{item.party_name}</div>
                      <div className="text-xs text-gray-400">{item.party_type}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-700 dark:text-gray-300">{rupee(item.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-red-600 dark:text-red-400">{rupee(item.outstanding)}</td>
                    <td className="px-4 py-3 text-center">
                      {item.needs_posting ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="h-3 w-3" /> Needs accrual
                        </span>
                      ) : item.journal_posted ? (
                        <span className="text-xs text-green-600 dark:text-green-400">✓ Posted</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400 whitespace-nowrap">{item.date ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPaying(item)}
                        className={`inline-flex items-center gap-1 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          item.needs_posting ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {item.needs_posting ? "Post & Pay" : "Pay"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.items.length > 0 && (
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
        )}
      </div>

      {/* Available payment accounts */}
      {accounts.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Available payment accounts</h3>
            <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Manage →
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

      {/* Module quick-access */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Connected modules</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODULE_LINKS.map((link) => (
            <Link
              key={`${link.label}-${link.href}`}
              href={link.href}
              className={`rounded-xl border ${link.color} bg-gray-50 dark:bg-gray-800 px-3 py-3 hover:border-primary/50 hover:bg-primary/5 transition-colors`}
            >
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{link.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{link.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Pay modal */}
      {paying && (
        <PayModal
          item={paying}
          accounts={accounts}
          onClose={() => setPaying(null)}
          onPaid={handlePaid}
        />
      )}

      {/* Success toast */}
      {toast && (
        <SuccessToast
          msg={toast.msg}
          journalId={toast.journalId}
          onClose={() => setToast(null)}
        />
      )}
    </ERPPageShell>
  );
}
