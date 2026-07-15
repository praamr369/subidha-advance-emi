"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

export default function VendorMasterQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    gst_number: "",
    address: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch("/api/v1/admin/vendors/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setNotice(`Vendor "${form.name}" created successfully.`);
      setForm({ name: "", phone: "", email: "", gst_number: "", address: "" });
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Vendor Master</h2>
        <p className="text-sm text-muted-foreground">Quickly create new vendor profiles.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Vendor Name *
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Acme Corp"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Phone Number *
            <input
              required
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
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. contact@acme.com"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            GST Number
            <input
              type="text"
              value={form.gst_number}
              onChange={(e) => setForm((p) => ({ ...p, gst_number: e.target.value.toUpperCase() }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. 27AAAAA0000A1Z5"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-1">
          <label className="block text-sm font-medium text-foreground">
            Address
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="Street, City, State"
            />
          </label>
        </div>
        
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={busy || !form.name || !form.phone}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
