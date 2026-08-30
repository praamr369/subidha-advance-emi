"use client";

import { useEffect, useMemo, useState } from "react";
import { listVendorOpeningBalances, saveVendorOpeningBalance } from "@/services/data-migration";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface VendorWithBalance {
  id: number;
  name: string;
  phone: string;
  opening_balance: string;
}

export default function VendorOutstandingQuickEntry() {
  const [vendors, setVendors] = useState<VendorWithBalance[]>([]);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    listVendorOpeningBalances()
      .then((res) => setVendors(res))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q) || v.phone.includes(q));
  }, [vendors, search]);

  async function save(vendor: VendorWithBalance) {
    const amount = editing[vendor.id] ?? vendor.opening_balance;
    setBusy(vendor.id);
    setError(null);
    setNotice(null);
    try {
      await saveVendorOpeningBalance(vendor.id, { amount, entry_date: entryDate, notes: "Opening payable from old books" });
      setVendors((prev) => prev.map((v) => v.id === vendor.id ? { ...v, opening_balance: amount } : v));
      setNotice(`${vendor.name} opening payable saved — journal posted to Accounts Payable.`);
      setEditing((prev) => { const n = { ...prev }; delete n[vendor.id]; return n; });
    } catch (e) {
      setError(toErr(e));
    } finally {
      setBusy(null);
    }
  }

  function VendorRow({ vendor }: { vendor: VendorWithBalance }) {
    const value = editing[vendor.id] ?? vendor.opening_balance;
    const changed = String(value) !== String(vendor.opening_balance);
    const hasBalance = parseFloat(vendor.opening_balance) > 0;

    return (
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${hasBalance ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background"}`}>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{vendor.name}</div>
          <div className="text-xs text-muted-foreground">{vendor.phone || "No phone"}</div>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-36 shrink-0 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm tabular-nums"
          value={value}
          placeholder="0.00"
          onChange={(e) => setEditing((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy === vendor.id || !changed}
          onClick={() => void save(vendor)}
          className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-40"
        >
          {busy === vendor.id ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  const withBalance = vendors.filter((v) => parseFloat(v.opening_balance) > 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Vendor Opening Payables</h2>
        <p className="text-sm text-muted-foreground">Enter outstanding amounts owed to vendors as of your migration date. Each save posts a balanced journal to Accounts Payable.</p>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Enter only vendors that had an outstanding payable in your old books. Leave balance as 0 for vendors with no outstanding.
      </div>

      <label className="block max-w-xs text-xs font-medium text-muted-foreground">
        Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </label>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/10 dark:text-emerald-300">{notice}</div>}

      {withBalance.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-700">
          {withBalance.length} vendor{withBalance.length !== 1 ? "s" : ""} with outstanding balances set
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading vendors…</div>
      ) : vendors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          No vendors found. <Link href={ROUTES.admin.vendors} className="font-semibold text-primary underline">Set up vendors first →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors by name or phone…"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="text-xs text-muted-foreground">{filtered.length} of {vendors.length} vendors</div>
          <div className="space-y-2 max-h-[28rem] overflow-auto pr-1">
            {filtered.map((v) => <VendorRow key={v.id} vendor={v} />)}
          </div>
        </div>
      )}
    </div>
  );
}
