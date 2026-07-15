"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function OpeningStockQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    inventory_item: "",
    stock_location: "",
    quantity: "",
    unit_cost_snapshot: "",
    effective_date: today(),
    note: "Quick entry",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      // 1. Create the opening stock draft
      const draftRes: any = await apiFetch("/api/v1/admin/inventory/opening-stock/", {
        method: "POST",
        body: JSON.stringify({
          inventory_item: { pk: parseInt(form.inventory_item) },
          stock_location: { pk: parseInt(form.stock_location) },
          quantity: parseInt(form.quantity),
          unit_cost_snapshot: form.unit_cost_snapshot || null,
          effective_date: form.effective_date,
          note: form.note,
        }),
      });

      // 2. Post the entry to make it active
      await apiFetch(`/api/v1/admin/inventory/opening-stock/${draftRes.id}/post/`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      setNotice(`Opening stock of ${form.quantity} added successfully.`);
      setForm({ ...form, inventory_item: "", quantity: "", unit_cost_snapshot: "" }); // keep location and date
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Opening Stock Master</h2>
        <p className="text-sm text-muted-foreground">Quickly add opening inventory balances without a spreadsheet.</p>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Note: You must use the internal ID for Inventory Item and Stock Location. 
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Inventory Item ID *
            <input
              required
              type="number"
              value={form.inventory_item}
              onChange={(e) => setForm((p) => ({ ...p, inventory_item: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. 15"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Stock Location ID *
            <input
              required
              type="number"
              value={form.stock_location}
              onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. 1"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Quantity *
            <input
              required
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 tabular-nums"
              placeholder="e.g. 100"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Unit Cost (Optional)
            <input
              type="number"
              step="0.01"
              value={form.unit_cost_snapshot}
              onChange={(e) => setForm((p) => ({ ...p, unit_cost_snapshot: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 tabular-nums"
              placeholder="0.00"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Effective Date *
            <input
              required
              type="date"
              value={form.effective_date}
              onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Notes
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Migration entry"
            />
          </label>
        </div>
        
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={busy || !form.inventory_item || !form.stock_location || !form.quantity}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
