"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  createScheme,
  deleteScheme,
  listSchemes,
  updateScheme,
  type EMIScheme,
} from "@/services/gstr-recovery";

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  PERCENT: "% Discount",
  FLAT_AMOUNT: "Flat Amount Off",
  WAIVE_INSTALLMENTS: "Waive N Installments",
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  "": "All Plans",
  EMI: "EMI",
  RENT: "Rent",
  LEASE: "Lease",
  ADVANCE_EMI: "Advance EMI",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function SchemeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: EMIScheme | null;
  onSave: (s: EMIScheme) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    plan_type: initial?.plan_type ?? "",
    discount_type: initial?.discount_type ?? "PERCENT",
    value: initial?.value ?? "0",
    valid_from: initial?.valid_from ?? today(),
    valid_to: initial?.valid_to ?? today(),
    max_uses: initial?.max_uses != null ? String(initial.max_uses) : "",
    is_active: initial?.is_active ?? true,
    description: initial?.description ?? "",
    applicable_products: [] as number[],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!form.name || !form.code) { setErr("Name and code are required."); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        applicable_products: form.applicable_products,
      } as Parameters<typeof createScheme>[0];

      const saved = initial?.id
        ? await updateScheme(initial.id, payload)
        : await createScheme(payload);
      onSave(saved);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, key: keyof typeof form, type: string = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
      />
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-[var(--surface-muted)] p-5 space-y-4">
      <div className="font-semibold text-sm">{initial ? "Edit Scheme" : "New Scheme"}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("Scheme Name *", "name", "text", "e.g. Diwali 2025")}
        {field("Code *", "code", "text", "e.g. DIWALI25")}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Plan Type</label>
          <select
            value={form.plan_type}
            onChange={(e) => setForm((f) => ({ ...f, plan_type: e.target.value }))}
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {Object.entries(PLAN_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Discount Type</label>
          <select
            value={form.discount_type}
            onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as EMIScheme["discount_type"] }))}
            className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {Object.entries(DISCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {field("Value *", "value", "number", form.discount_type === "PERCENT" ? "e.g. 10 (= 10%)" : form.discount_type === "WAIVE_INSTALLMENTS" ? "e.g. 2 (installments)" : "e.g. 500 (₹)")}
        {field("Valid From *", "valid_from", "date")}
        {field("Valid To *", "valid_to", "date")}
        {field("Max Uses", "max_uses", "number", "Blank = unlimited")}
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
          placeholder="Terms and conditions, applicable products…"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          className="rounded"
        />
        <label htmlFor="is_active" className="text-sm">Active (visible to staff)</label>
      </div>
      {err && <div className="text-xs text-red-600 rounded-xl border border-red-200 bg-red-50 px-3 py-2">{err}</div>}
      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Scheme"}
        </button>
        <button onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SchemesPage() {
  const [schemes, setSchemes] = useState<EMIScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EMIScheme | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSchemes({ active_only: activeOnly });
      setSchemes(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this scheme? This cannot be undone.")) return;
    try {
      await deleteScheme(id);
      setSchemes((prev) => prev.filter((s) => s.id !== id));
    } catch { /* noop */ }
  }

  function onSaved(s: EMIScheme) {
    setSchemes((prev) => {
      const idx = prev.findIndex((x) => x.id === s.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = s; return next; }
      return [s, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  }

  const statusBadge = (s: EMIScheme) =>
    s.is_currently_active
      ? "bg-green-100 text-green-700"
      : s.is_active
      ? "bg-yellow-100 text-yellow-700"
      : "bg-gray-100 text-gray-500";

  const statusLabel = (s: EMIScheme) =>
    s.is_currently_active ? "Active" : s.is_active ? "Scheduled / Expired" : "Inactive";

  return (
    <ERPPageShell
      title="Discount & Scheme Manager"
      description="Festival and promotional EMI schemes — define discount rules, validity periods, and usage limits"
    >
      <ERPSectionShell
        title="Schemes"
        description={`${schemes.length} scheme${schemes.length !== 1 ? "s" : ""} loaded`}
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="rounded"
              />
              Active only
            </label>
            {!showForm && !editing && (
              <button
                onClick={() => setShowForm(true)}
                className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                + New Scheme
              </button>
            )}
          </div>
        }
      >
        {(showForm || editing) && (
          <div className="mb-5">
            <SchemeForm
              initial={editing}
              onSave={onSaved}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          </div>
        )}

        {loading ? <ERPLoadingState label="Loading schemes…" /> : null}
        {!loading && error ? <ERPErrorState title="Error" description={error} /> : null}
        {!loading && !error && schemes.length === 0 ? (
          <ERPEmptyState
            title="No schemes"
            description="Create your first festival or promotional scheme using the + New Scheme button."
          />
        ) : null}

        {!loading && !error && schemes.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Name / Code</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Uses</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schemes.map((s) => (
                  <tr key={s.id} className="border-t border-border/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{s.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{s.code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{PLAN_TYPE_LABELS[s.plan_type] ?? s.plan_type || "All"}</td>
                    <td className="px-4 py-3 text-xs">
                      <div>{DISCOUNT_TYPE_LABELS[s.discount_type]}</div>
                      <div className="font-semibold text-foreground">
                        {s.discount_type === "PERCENT" ? `${s.value}%` :
                         s.discount_type === "FLAT_AMOUNT" ? `₹${s.value}` :
                         `${s.value} installment(s)`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{s.valid_from}</div>
                      <div className="text-muted-foreground">to {s.valid_to}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {s.used_count}{s.max_uses != null ? ` / ${s.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(s)}`}>
                        {statusLabel(s)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditing(s); setShowForm(false); }}
                          className="text-xs text-primary hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(s.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
