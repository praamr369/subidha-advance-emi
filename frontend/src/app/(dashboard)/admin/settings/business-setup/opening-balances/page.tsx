"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  listAdminVendors,
  getAdminVendorOutstanding,
  setVendorOpeningBalance,
  setFinanceOpeningBalance,
  listCustomerOpeningOutstandings,
  createCustomerOpeningOutstanding,
  type CustomerOpeningOutstanding,
} from "@/services/vendor-ops";

type Vendor = { id: number; name: string; phone?: string };

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
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  const cashAccounts = accounts.filter((a) => a.kind === "CASH");
  // Bank and UPI share the same physical money — show them together
  const bankAndUpiAccounts = accounts.filter((a) => a.kind === "BANK" || a.kind === "UPI");

  function AccountRow({ account }: { account: FinanceAccount }) {
    const value = editing[account.id] ?? account.opening_balance;
    const changed = value !== account.opening_balance;
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
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        Enter balances as of the system cutover date. Saving posts a separate balanced journal against Retained Earnings / Opening Balance Adjustment; it does not create receipts or rewrite old transactions.
      </div>
      <label className="block max-w-xs text-xs font-medium text-muted-foreground">Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
      </label>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

      {cashAccounts.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash in Hand</div>
          <div className="space-y-2">{cashAccounts.map((a) => <AccountRow key={a.id} account={a} />)}</div>
        </div>
      ) : null}

      {bankAndUpiAccounts.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bank & UPI</div>
          <div className="mb-2 text-xs text-muted-foreground">UPI payments settle into your bank account — they are the same physical money. Enter the combined balance once on your bank account; set UPI to 0.</div>
          <div className="space-y-2">{bankAndUpiAccounts.map((a) => <AccountRow key={a.id} account={a} />)}</div>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          No finance accounts found. <Link href={ROUTES.admin.settingsBusinessSetupFinanceAccounts} className="font-semibold text-primary underline">Set up finance accounts first →</Link>
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground">
        Tip: UPI and Bank share the same physical balance — enter the total on the Bank account; leave UPI account at 0 to avoid double-counting.
      </div>
    </div>
  );
}

// ── 2. Vendor Opening Outstandings ───────────────────────────────────────────

function VendorOpeningSection() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [existingBalances, setExistingBalances] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());

  useEffect(() => {
    void listAdminVendors().then((res) => {
      const rows = (res.results ?? []) as Vendor[];
      setVendors(rows);
      // Load existing opening balances for each vendor
      rows.forEach((v) => {
        void getAdminVendorOutstanding(v.id).then((data) => {
          const ob = String((data as { opening_balance?: string }).opening_balance ?? "0.00");
          if (Number(ob) > 0) {
            setExistingBalances((prev) => ({ ...prev, [v.id]: ob }));
            setAmounts((prev) => ({ ...prev, [v.id]: ob }));
          }
        }).catch(() => null);
      });
    });
  }, []);

  async function save(vendorId: number, vendorName: string) {
    const amount = amounts[vendorId] ?? "0";
    setBusy(vendorId);
    setError(null);
    try {
      await setVendorOpeningBalance(vendorId, amount, entryDate);
      setExistingBalances((prev) => ({ ...prev, [vendorId]: amount }));
      setSaved((prev) => ({ ...prev, [vendorId]: true }));
    } catch (e) { setError(toErr(e)); }
    finally { setBusy(null); }
  }

  if (!vendors.length) return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
      No vendors found. <Link href={ROUTES.admin.vendors} className="font-semibold text-primary underline">Add vendors first →</Link>
    </div>
  );

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Enter what you owed each vendor at cutover. Each save retains prior ledger rows and posts Accounts Payable against the opening-balance adjustment account.
      </div>
      <label className="block max-w-xs text-xs font-medium text-muted-foreground">Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
      </label>
      <div className="space-y-2">
        {vendors.map((vendor) => {
          const amount = amounts[vendor.id] ?? existingBalances[vendor.id] ?? "0.00";
          const existing = existingBalances[vendor.id];
          const changed = amount !== (existing ?? "0.00") && amount !== (existing ?? "");
          return (
            <div key={vendor.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{vendor.name}</div>
                {existing && Number(existing) > 0 ? <div className="text-xs text-emerald-700">Opening balance: {formatRupee(existing)}</div> : <div className="text-xs text-muted-foreground">No opening balance set</div>}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm tabular-nums"
                value={amounts[vendor.id] ?? existing ?? ""}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
              />
              <button
                type="button"
                disabled={busy === vendor.id}
                onClick={() => void save(vendor.id, vendor.name)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${saved[vendor.id] && !changed ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "bg-foreground text-background"}`}
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
  const [total, setTotal] = useState("0.00");
  const [form, setForm] = useState({ customer_name: "", phone: "", outstanding_amount: "", entry_date: today(), notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const res = await listCustomerOpeningOutstandings(false);
      setRows(res.results);
      setTotal(res.total_outstanding);
    } catch (e) { setError(toErr(e)); }
  }

  useEffect(() => { void load(); }, []);

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        Enter each old customer receivable separately. Saving posts Accounts Receivable against Retained Earnings / Opening Balance Adjustment. Later payments must use the real collection workflow; this page cannot mark money as received.
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}

      {/* Add form */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground mb-3">Add customer outstanding</div>
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

      {/* List */}
      {rows.length > 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">Pending outstandings ({rows.length})</div>
            <div className="text-sm font-semibold text-foreground">Total: {formatRupee(total)}</div>
          </div>
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">{row.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{row.phone ? `${row.phone} · ` : ""}{row.entry_date}{row.notes ? ` · ${row.notes}` : ""}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-foreground">{formatRupee(row.outstanding_amount)}</div>
                <Link href={ROUTES.admin.financeCollect} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">Collect payment</Link>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-center text-sm text-muted-foreground">
          No pending customer outstandings. Add your first one above.
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
      subtitle="Enter your real opening data from BillBook — cash & bank balances, customer receivables, and vendor payables."
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
            <div><span className="font-semibold text-foreground">1. Cash & Bank</span><br />Set your opening cash balance and bank/UPI balance. Bank and UPI are the same physical money — enter the combined amount on the Bank account and leave UPI at 0.</div>
            <div><span className="font-semibold text-foreground">2. Customer Outstandings</span><br />People who owe you money from old billbook records. Add each customer name + amount. Mark them settled when they pay.</div>
            <div><span className="font-semibold text-foreground">3. Vendor Outstandings</span><br />Suppliers you owe money to. Find them from your vendor list and enter the amount you owed on day 1.</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href={ROUTES.admin.inventoryOpeningStock} className="font-semibold text-primary underline-offset-2 hover:underline">Opening stock (inventory) →</Link>
            <Link href={ROUTES.admin.hrStaff} className="font-semibold text-primary underline-offset-2 hover:underline">Staff data →</Link>
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
          <WorkspaceSection title="Customer Opening Outstandings" description="Receivables from your old billbook — people who owe you money.">
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
