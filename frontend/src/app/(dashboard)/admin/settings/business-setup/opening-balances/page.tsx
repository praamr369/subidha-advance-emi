"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  listCustomerOpeningOutstandings,
  createCustomerOpeningOutstanding,
  listVendorOpeningBalances,
  setVendorOpeningBalance,
  setFinanceOpeningBalance,
  type CustomerOpeningOutstanding,
  type VendorOpeningBalanceRow,
} from "@/services/vendor-ops";

function toErr(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "Request failed.";
}

function formatRupee(v: string | number | undefined) {
  const n = Number(v ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── 1. Finance Account Opening Balances ──────────────────────────────────────

function FinanceOpeningSection() {
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

// ── 2. Vendor Opening Outstandings ───────────────────────────────────────────

function VendorOpeningSection() {
  const [vendors, setVendors] = useState<VendorOpeningBalanceRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await listVendorOpeningBalances();
      setVendors(res.results);
      // Pre-fill amounts for vendors that already have an opening balance
      const initial: Record<number, string> = {};
      res.results.forEach((v) => {
        if (Number(v.opening_balance) > 0) initial[v.id] = v.opening_balance;
      });
      setAmounts(initial);
    } catch (e) { setError(toErr(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(vendor: VendorOpeningBalanceRow) {
    const amount = amounts[vendor.id] ?? "0";
    setBusy(vendor.id);
    setError(null);
    try {
      await setVendorOpeningBalance(vendor.id, amount, entryDate);
      setVendors((prev) => prev.map((v) => v.id === vendor.id ? { ...v, opening_balance: amount } : v));
      setSaved((prev) => ({ ...prev, [vendor.id]: true }));
      setNotice(`${vendor.name} opening balance saved.`);
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading vendors…</div>;

  if (vendors.length === 0) return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
      No vendors found. <Link href={ROUTES.admin.vendors} className="font-semibold text-primary underline">Add vendors first →</Link>
    </div>
  );

  const withBalance = vendors.filter((v) => Number(v.opening_balance) > 0);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
        Enter what you owed each vendor at cutover. Each save retains prior ledger rows and posts Accounts Payable against the opening-balance adjustment account.
        {withBalance.length > 0 && <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">{withBalance.length} vendor{withBalance.length !== 1 ? "s" : ""} already have an opening balance set.</span>}
      </div>
      <label className="block max-w-xs text-xs font-medium text-muted-foreground">Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </label>
      <div className="space-y-2">
        {vendors.map((vendor) => {
          const amount = amounts[vendor.id] ?? vendor.opening_balance ?? "0.00";
          const existing = vendor.opening_balance;
          const changed = String(amount) !== String(existing);
          return (
            <div key={vendor.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{vendor.name}</div>
                {Number(existing) > 0
                  ? <div className="text-xs text-emerald-700 dark:text-emerald-400">Opening balance: {formatRupee(existing)}</div>
                  : <div className="text-xs text-muted-foreground">No opening balance set</div>}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm tabular-nums"
                value={amounts[vendor.id] ?? (Number(existing) > 0 ? existing : "")}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy === vendor.id}
                onClick={() => void save(vendor)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${saved[vendor.id] && !changed ? "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300" : "bg-foreground text-background"}`}
              >
                {busy === vendor.id ? "Saving…" : saved[vendor.id] && !changed ? "Saved ✓" : "Save"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Customer Opening Outstandings ─────────────────────────────────────────

function CustomerOpeningSection() {
  const [rows, setRows] = useState<CustomerOpeningOutstanding[]>([]);
  const [settledRows, setSettledRows] = useState<CustomerOpeningOutstanding[]>([]);
  const [total, setTotal] = useState("0.00");
  const [showSettled, setShowSettled] = useState(false);
  const [form, setForm] = useState({ customer_name: "", phone: "", outstanding_amount: "", entry_date: today(), notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [pending, settled] = await Promise.all([
        listCustomerOpeningOutstandings(false),
        listCustomerOpeningOutstandings(true),
      ]);
      setRows(pending.results);
      setSettledRows(settled.results);
      setTotal(pending.total_outstanding);
    } catch (e) { setError(toErr(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!form.customer_name.trim()) { setError("Customer name is required."); return; }
    if (!form.outstanding_amount || Number(form.outstanding_amount) <= 0) { setError("Enter a valid outstanding amount."); return; }
    setBusy(true); setError(null);
    try {
      await createCustomerOpeningOutstanding({ ...form });
      setForm({ customer_name: "", phone: "", outstanding_amount: "", entry_date: today(), notes: "" });
      setNotice("Customer opening balance added.");
      await load();
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(false); }
  }

  const displayRows = showSettled ? settledRows : rows;
  const filtered = search.trim()
    ? displayRows.filter((r) => r.customer_name.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search))
    : displayRows;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-foreground">
        Enter each old customer receivable separately. Saving posts Accounts Receivable against Opening Balance Adjustment.
        To collect payment from a customer, use the <Link href={ROUTES.admin.financeCollect} className="font-semibold text-primary underline">Finance Collection</Link> workflow — this page cannot mark money as received.
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}

      {/* Add form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-foreground">Add customer outstanding</div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Customer name *</label>
            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Ramesh Kumar" value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="98765 43210" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Outstanding amount (₹) *</label>
            <input type="number" min="1" step="0.01" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="5000.00" value={form.outstanding_amount} onChange={(e) => setForm((p) => ({ ...p, outstanding_amount: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">As of date</label>
            <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={form.entry_date} onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Sofa set purchased Mar 2024, 3 EMIs pending" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={busy} onClick={() => void add()} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
            {busy ? "Adding…" : "Add customer"}
          </button>
        </div>
      </div>

      {/* List header + search + toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-[160px] rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          <button onClick={() => setShowSettled(false)} className={`px-3 py-1.5 transition ${!showSettled ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            Pending ({rows.length})
          </button>
          <button onClick={() => setShowSettled(true)} className={`px-3 py-1.5 transition ${showSettled ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            Settled ({settledRows.length})
          </button>
        </div>
      </div>

      {!showSettled && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground">
          Total pending: {formatRupee(total)}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="divide-y divide-border">
            {filtered.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{row.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{row.phone ? `${row.phone} · ` : ""}{row.entry_date}{row.notes ? ` · ${row.notes}` : ""}</div>
                  {row.is_settled && row.settled_at && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400">Settled {new Date(row.settled_at).toLocaleDateString()}</div>
                  )}
                </div>
                <div className={`text-sm font-semibold tabular-nums ${row.is_settled ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {formatRupee(row.outstanding_amount)}
                </div>
                {!row.is_settled && (
                  <Link href={ROUTES.admin.financeCollect} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-300">
                    Collect
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-center text-sm text-muted-foreground">
          {search ? "No results match your search." : showSettled ? "No settled customer outstandings yet." : "No pending customer outstandings. Add your first one above."}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "finance", label: "Cash & Bank" },
  { id: "customers", label: "Customer Outstandings" },
  { id: "vendors", label: "Vendor Outstandings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function OpeningBalancesPage() {
  const [tab, setTab] = useState<TabId>("finance");

  return (
    <ERPPageShell
      eyebrow="Setup"
      title="Opening Balances"
      subtitle="Enter opening cash & bank balances, customer receivables, and vendor payables as of your system cutover date."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Business Setup", href: ROUTES.admin.settingsBusinessSetup },
        { label: "Opening Balances" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        <BusinessSetupLinks />

        {/* Info banner */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">How to use this page</div>
          <div className="mt-2 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div><span className="font-semibold text-foreground">1. Cash & Bank</span><br />Set your opening cash balance and bank/UPI balance as of day 1. Bank and UPI share the same physical money — enter the combined amount on the Bank account and leave UPI at 0.</div>
            <div><span className="font-semibold text-foreground">2. Customer Outstandings</span><br />People who owe you money from your old records. Add each customer name and amount. They are marked settled when you collect payment through Finance Collection.</div>
            <div><span className="font-semibold text-foreground">3. Vendor Outstandings</span><br />Suppliers you owed money to on day 1. Select the vendor and enter the amount. All saves are journaled and reversible.</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href={ROUTES.admin.inventoryOpeningStock} className="font-semibold text-primary underline-offset-2 hover:underline">Opening stock (inventory) →</Link>
            <Link href={ROUTES.admin.hrStaff} className="font-semibold text-primary underline-offset-2 hover:underline">Staff data →</Link>
            <Link href={ROUTES.admin.settingsBusinessSetupMigration} className="font-semibold text-primary underline-offset-2 hover:underline">Bulk import via Migration Center →</Link>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "finance" ? (
          <WorkspaceSection title="Cash & Bank Opening Balances" description="Set the actual balance of each finance account on day 1.">
            <FinanceOpeningSection />
          </WorkspaceSection>
        ) : tab === "customers" ? (
          <WorkspaceSection title="Customer Opening Outstandings" description="Receivables from your old records — people who owe you money.">
            <CustomerOpeningSection />
          </WorkspaceSection>
        ) : (
          <WorkspaceSection title="Vendor Opening Outstandings" description="Payables to suppliers — what you owed on day 1.">
            <VendorOpeningSection />
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
