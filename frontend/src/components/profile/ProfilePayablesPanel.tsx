"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, CreditCard, RefreshCw } from "lucide-react";

import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  executePayable,
  getPayableFinanceAccounts,
  getUnifiedPayables,
  type FinanceAccount,
  type PayableItem,
  type PayablePartyType,
  type UnifiedPayableData,
} from "@/services/payables";

/**
 * A party-scoped slice of the unified payables queue, for embedding on a
 * partner / vendor / staff profile. Reuses the exact same backend post path as
 * /admin/payables — every "Pay" here posts a real journal entry.
 */

function rupee(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const JOURNAL_EXPLANATION: Record<string, string> = {
  salary: "Accrual: DR Salary Expense / CR Salary Payable → Payment: DR Salary Payable / CR Finance Account",
  vendor_settlement: "DR Accounts Payable / CR Finance Account",
  vendor_outstanding: "Creates & posts a vendor settlement: DR Accounts Payable / CR Finance Account",
  commission: "DR Partner Commission Payable / CR Finance Account",
  expense_claim: "Accrual: DR Expense / CR Accounts Payable → Payment: DR Accounts Payable / CR Finance Account",
  payout_batch: "DR Partner Commission Payable / CR Finance Account (bulk partner disbursement)",
};

function PayModal({
  item,
  accounts,
  onClose,
  onPaid,
}: {
  item: PayableItem;
  accounts: FinanceAccount[];
  onClose: () => void;
  onPaid: (msg: string, journalId?: number | null) => void;
}) {
  const [financeAccountId, setFinanceAccountId] = useState<string>(
    accounts.length ? String(accounts[0].id) : ""
  );
  const [amount, setAmount] = useState(item.outstanding);
  const [paymentDate, setPaymentDate] = useState(today());
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needsAccount = item.payable_type !== "commission";
  const journalExplanation = JOURNAL_EXPLANATION[item.payable_type] ?? "Journal entry will be posted automatically.";

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
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Execute Payment</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.reference} · <span className="font-medium text-foreground">{item.party_name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Type</div>
              <div className="mt-1 truncate font-medium text-foreground">{item.payable_type_label}</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="mt-1 font-medium text-foreground">{rupee(item.amount)}</div>
            </div>
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
              <div className="text-xs text-red-500">Outstanding</div>
              <div className="mt-1 font-semibold text-red-600">{rupee(item.outstanding)}</div>
            </div>
          </div>

          {needsAccount && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                <CreditCard className="mr-1 inline h-3.5 w-3.5" />Payment account (Cash / UPI / Bank)
              </label>
              {accounts.length === 0 ? (
                <div className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600">
                  No active finance accounts.{" "}
                  <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="underline">Configure →</Link>
                </div>
              ) : (
                <select
                  value={financeAccountId}
                  onChange={(e) => setFinanceAccountId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.kind}] {a.name}{a.branch_name ? ` · ${a.branch_name}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Amount (₹)</label>
            <input
              type="number" step="0.01" min="0.01" max={item.outstanding}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <p className="mt-1 text-xs text-muted-foreground">Max: {rupee(item.outstanding)} · Partial payments allowed</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Payment date</label>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Reference no.</label>
              <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="UTR / cheque / receipt"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Notes (optional)</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              placeholder="Additional remarks…"
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {err}
            </div>
          )}

          <div className="space-y-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <div className="flex items-center gap-1.5 font-semibold"><BookOpen className="h-3.5 w-3.5" /> Journal that will be posted</div>
            <div className="rounded bg-blue-100 px-2 py-1 font-mono leading-relaxed dark:bg-blue-900/40">{journalExplanation}</div>
            {item.needs_posting && (
              <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Accrual journal auto-posted first.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handlePay}
            disabled={busy || (needsAccount && !financeAccountId) || !amount || parseFloat(amount) <= 0}
            className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Processing…" : `Pay ${rupee(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfilePayablesPanel({
  partyType,
  partyId,
  title = "Payout Queue",
  description = "Outstanding obligations for this party. Paying posts a real journal entry.",
}: {
  partyType: PayablePartyType;
  partyId: number;
  title?: string;
  description?: string;
}) {
  const [data, setData] = useState<UnifiedPayableData | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayableItem | null>(null);
  const [toast, setToast] = useState<{ msg: string; journalId?: number | null } | null>(null);

  const load = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    setError(null);
    try {
      const [d, accts] = await Promise.all([
        getUnifiedPayables({ party_type: partyType, party_id: partyId, status_category: "ALL" }),
        getPayableFinanceAccounts(),
      ]);
      setData(d);
      setAccounts(accts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load payout queue.");
    } finally {
      setLoading(false);
    }
  }, [partyType, partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePaid = useCallback((msg: string, journalId?: number | null) => {
    setPaying(null);
    setToast({ msg, journalId });
    setTimeout(() => setToast(null), 8000);
    void load();
  }, [load]);

  return (
    <WorkspaceSection
      title={title}
      description={description}
      action={
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      }
    >
      {/* KPIs */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className="mt-1 text-xl font-bold text-red-600">{rupee(data?.total_outstanding ?? "0.00")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Payable Items</p>
          <p className="mt-1 text-xl font-bold text-foreground">{data?.total_items ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <p className="text-xs text-amber-600">Need Accrual Posting</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{data?.needs_posting_count ?? 0}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading payout queue…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          {error}
          <div className="mt-3">
            <button type="button" onClick={() => void load()} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100">Retry</button>
          </div>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-400" />
          <p className="text-sm font-medium text-muted-foreground">No outstanding payables for this party.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-center">Journal</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {item.payable_type_label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.reference}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-red-600">{rupee(item.outstanding)}</td>
                  <td className="px-4 py-3 text-center">
                    {item.needs_posting ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> Needs accrual
                      </span>
                    ) : item.journal_posted ? (
                      <span className="text-xs text-green-600">✓ Posted</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {parseFloat(item.outstanding) > 0 ? (
                      <button
                        onClick={() => setPaying(item)}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                          item.needs_posting ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {item.needs_posting ? "Post & Pay" : "Pay"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Settled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        Full control:{" "}
        <Link href="/admin/payables" className="underline hover:text-foreground">Unified Payables →</Link>
      </div>

      {paying && (
        <PayModal
          item={paying}
          accounts={accounts}
          onClose={() => setPaying(null)}
          onPaid={handlePaid}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm space-y-2 rounded-2xl bg-green-600 px-5 py-4 text-white shadow-2xl">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">{toast.msg}</p>
            <button onClick={() => setToast(null)} className="ml-auto text-white/70 hover:text-white">×</button>
          </div>
          {toast.journalId && (
            <div className="text-xs text-green-100">
              Journal #{toast.journalId} posted.{" "}
              <Link href={ROUTES.admin.accountingBridgeReconciliation} className="font-medium underline">View →</Link>
            </div>
          )}
        </div>
      )}
    </WorkspaceSection>
  );
}
