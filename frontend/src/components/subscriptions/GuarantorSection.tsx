"use client";

import { useCallback, useEffect, useState } from "react";

import { createGuarantor, deleteGuarantor, listGuarantors, type Guarantor } from "@/services/gstr-recovery";

const RELATIONS = ["SPOUSE", "PARENT", "SIBLING", "FRIEND", "EMPLOYER", "OTHER"];
const RELATION_LABELS: Record<string, string> = {
  SPOUSE: "Spouse", PARENT: "Parent", SIBLING: "Sibling",
  FRIEND: "Friend", EMPLOYER: "Employer", OTHER: "Other",
};

interface Props {
  subscriptionId: number;
}

export default function GuarantorSection({ subscriptionId }: Props) {
  const [guarantors, setGuarantors] = useState<Guarantor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", phone: "", relation: "OTHER",
    aadhaar_no: "", address: "", is_primary: false, notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listGuarantors(subscriptionId);
      setGuarantors(rows);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!form.name || !form.phone) {
      setErr("Name and phone are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const g = await createGuarantor(subscriptionId, form);
      setGuarantors((prev) => [...prev, g]);
      setForm({ name: "", phone: "", relation: "OTHER", aadhaar_no: "", address: "", is_primary: false, notes: "" });
      setShowForm(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add guarantor.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this guarantor?")) return;
    try {
      await deleteGuarantor(subscriptionId, id);
      setGuarantors((prev) => prev.filter((g) => g.id !== id));
    } catch { /* noop */ }
  }

  return (
    <div className="rounded-xl border border-border bg-[var(--surface-card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-sm text-foreground">Guarantors / Co-applicants</div>
          <div className="text-xs text-muted-foreground mt-0.5">Linked guarantors for recovery reference</div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="h-8 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
        >
          {showForm ? "Cancel" : "+ Add Guarantor"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border border-border bg-muted/50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Guarantor full name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone *</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="10-digit mobile"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Relation</label>
              <select
                value={form.relation}
                onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
              >
                {RELATIONS.map((r) => <option key={r} value={r}>{RELATION_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Aadhaar No</label>
              <input
                value={form.aadhaar_no}
                onChange={(e) => setForm((f) => ({ ...f, aadhaar_no: e.target.value }))}
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
              placeholder="Residential address"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_primary"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="is_primary" className="text-sm text-foreground">Primary guarantor</label>
          </div>
          {err && <div className="text-xs text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{err}</div>}
          <button
            onClick={() => void handleAdd()}
            disabled={saving}
            className="h-9 rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add Guarantor"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground py-3">Loading guarantors…</div>
      ) : guarantors.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center">No guarantors recorded for this contract.</div>
      ) : (
        <div className="space-y-2">
          {guarantors.map((g) => (
            <div key={g.id} className="flex items-start justify-between rounded-xl border border-border bg-background p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{g.name}</span>
                  {g.is_primary && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-semibold">Primary</span>
                  )}
                  <span className="text-xs text-muted-foreground">{RELATION_LABELS[g.relation] ?? g.relation}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{g.phone}{g.aadhaar_no ? ` · Aadhaar: ${g.aadhaar_no}` : ""}</div>
                {g.address && <div className="text-xs text-muted-foreground">{g.address}</div>}
              </div>
              <button
                onClick={() => void handleDelete(g.id)}
                className="text-xs text-red-500 hover:text-red-700 ml-3 flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
