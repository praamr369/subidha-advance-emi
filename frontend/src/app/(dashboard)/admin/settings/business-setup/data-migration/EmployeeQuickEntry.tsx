"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

function toErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "readableMessage" in e) return String((e as { readableMessage: unknown }).readableMessage);
  return "Request failed.";
}

export default function EmployeeQuickEntry() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "STORE_STAFF", // typical default
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiFetch("/api/v1/admin/hr/staff/", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setNotice(`Employee "${form.first_name} ${form.last_name}" created successfully.`);
      setForm({ first_name: "", last_name: "", email: "", phone: "", role: "STORE_STAFF" });
    } catch (err) {
      setError(toErr(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Employee / Staff Master</h2>
        <p className="text-sm text-muted-foreground">Quickly create new staff members and assign their roles.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            First Name *
            <input
              required
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Rahul"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Last Name *
            <input
              required
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. Sharma"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-foreground">
            Email *
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
              placeholder="e.g. rahul@example.com"
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
        <div className="grid gap-4 sm:grid-cols-1">
          <label className="block text-sm font-medium text-foreground">
            Role
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
            >
              <option value="STORE_MANAGER">Store Manager</option>
              <option value="STORE_STAFF">Store Staff</option>
              <option value="FIELD_AGENT">Field Agent</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        </div>
        
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={busy || !form.first_name || !form.last_name || !form.email || !form.phone}
            className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save & Add Another"}
          </button>
        </div>
      </form>
    </div>
  );
}
