"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { setFinanceOpeningBalance } from "@/services/vendor-ops";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function FinanceOpeningSection() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());

  useEffect(() => {
    void listFinanceAccounts({ is_real_settlement_account: "true" }).then((res) => {
      const rows = Array.isArray(res) ? res : ((res as { results?: FinanceAccount[] }).results ?? []);
      setAccounts(rows.filter((a) => a.is_active));
    });
  }, []);

  async function save(account: FinanceAccount) {
    const amount = editing[account.id] ?? account.opening_balance;
    setBusy(account.id);
    setError(null);
    try {
      await setFinanceOpeningBalance(account.id, amount, entryDate);
      setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, opening_balance: amount } : a));
      setNotice(`${account.name} opening balance saved.`);
      setEditing((prev) => { const n = { ...prev }; delete n[account.id]; return n; });
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  const cashAccounts = accounts.filter((a) => a.kind === "CASH");
  const bankAndUpiAccounts = accounts.filter((a) => a.kind === "BANK" || a.kind === "UPI");

  function AccountRow({ account }: { account: FinanceAccount }) {
    const value = editing[account.id] ?? account.opening_balance;
    const changed = String(value) !== String(account.opening_balance);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{account.name}</div>
          <div className="text-xs text-muted-foreground">{account.kind}{account.bank_last4 ? ` ···${account.bank_last4}` : ""}{account.upi_handle ? ` · ${account.upi_handle}` : ""}</div>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm tabular-nums"
          value={value}
          onChange={(e) => setEditing((prev) => ({ ...prev, [account.id]: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy === account.id || !changed}
          onClick={() => void save(account)}
          className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-40"
        >
          {busy === account.id ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Enter balances as of the system cutover date. Each save posts a balanced journal against the Opening Balance Adjustment account — it does not create receipts or rewrite old transactions.
      </div>
      <label className="block max-w-xs text-xs font-medium text-muted-foreground">Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </label>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}

      {cashAccounts.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash in Hand</div>
          <div className="space-y-2">{cashAccounts.map((a) => <AccountRow key={a.id} account={a} />)}</div>
        </div>
      )}

      {bankAndUpiAccounts.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank & UPI</div>
          <div className="mb-2 text-xs text-muted-foreground">UPI payments settle into your bank account — they are the same physical money. Enter the combined balance once on your bank account; set UPI to 0.</div>
          <div className="space-y-2">{bankAndUpiAccounts.map((a) => <AccountRow key={a.id} account={a} />)}</div>
        </div>
      )}

      {accounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          No finance accounts found. <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="font-semibold text-primary underline">Set up finance accounts first →</Link>
        </div>
      )}
    </div>
  );
}
