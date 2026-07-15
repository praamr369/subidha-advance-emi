"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
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

  useEffect(() => {
    apiFetch("/api/v1/admin/opening-balances/vendors/")
      .then((res: any) => {
        setVendors(res.results || []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(vendor: VendorWithBalance) {
    const amount = editing[vendor.id] ?? vendor.opening_balance;
    setBusy(vendor.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/opening-balances/vendors/${vendor.id}/`, {
        method: "POST",
        body: JSON.stringify({ amount, entry_date: entryDate, notes: "Quick entry" }),
      });
      setVendors((prev) => prev.map((v) => v.id === vendor.id ? { ...v, opening_balance: amount } : v));
      setNotice(`${vendor.name} opening balance saved.`);
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
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">{vendor.name}</div>
          <div className="text-xs text-muted-foreground">{vendor.phone || "No phone"}</div>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-right text-sm tabular-nums"
          value={value}
          onChange={(e) => setEditing((prev) => ({ ...prev, [vendor.id]: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy === vendor.id || !changed}
          onClick={() => void save(vendor)}
          className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-40"
        >
          {busy === vendor.id ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Enter opening payables for vendors as of the system cutover date. Each save posts a balanced journal against the Opening Balance Adjustment account.
      </div>
      
      <label className="block max-w-xs text-xs font-medium text-muted-foreground">Migration / cutover date
        <input type="date" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </label>
      
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading vendors...</div>
      ) : vendors.length > 0 ? (
        <div className="space-y-2 mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendors</div>
          {vendors.map((v) => <VendorRow key={v.id} vendor={v} />)}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-6 text-sm text-muted-foreground">
          No vendors found. <Link href={ROUTES.admin.vendors} className="font-semibold text-primary underline">Set up vendors first →</Link>
        </div>
      )}
    </div>
  );
}
