"use client";

import { useState } from "react";
import { createCustomerOpeningOutstanding } from "@/services/data-migration";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function CustomerOutstandingQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    outstanding_amount: "",
    entry_date: today(),
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await createCustomerOpeningOutstanding(form);
      setNotice(`Outstanding balance of ₹${form.outstanding_amount} for "${form.customer_name}" saved successfully.`);
      setForm({ ...form, customer_name: "", phone: "", outstanding_amount: "", notes: "" });
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Customer Opening Outstanding</h2>
        <p className="text-sm text-muted-foreground">Record unpaid amounts owed by customers at the time of migration.</p>
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-foreground">
        Each entry creates a Customer Opening Outstanding record mapped directly to the Chart of Accounts. It does NOT create an EMI subscription.
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Customer Name *
            <input
              required
              type="text"
              value={form.customer_name}
              onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. John Doe"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Phone Number
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. 9876543210"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Outstanding Amount (₹) *
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.outstanding_amount}
              onChange={(e) => setForm((p) => ({ ...p, outstanding_amount: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-right tabular-nums"
              placeholder="0.00"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Entry Date *
            <input
              required
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-1">
          <label className="block text-sm font-medium text-foreground">
            Notes / Reference
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Balance from old ledger book page 42"
            />
          </label>
        </div>
        
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={busy || !form.customer_name || !form.outstanding_amount}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
