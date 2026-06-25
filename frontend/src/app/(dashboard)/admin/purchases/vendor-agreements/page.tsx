"use client";

import { useCallback, useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  createVendorAgreement,
  listVendorAgreements,
  listVendorsLite,
  updateVendorAgreement,
  type VendorAgreement,
  type VendorLite,
} from "@/services/inventory";

function statusBadge(s: VendorAgreement["status"]) {
  const map: Record<VendorAgreement["status"], string> = {
    DRAFT: "bg-blue-50 text-blue-700",
    ACTIVE: "bg-green-50 text-green-700",
    EXPIRED: "bg-gray-100 text-gray-500",
    TERMINATED: "bg-red-50 text-red-700",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[s] ?? ""}`}>{s}</span>;
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN"); } catch { return d; }
}

const AGREEMENT_STATUSES: VendorAgreement["status"][] = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"];

// ── Create/Edit Agreement form ────────────────────────────────────────────────
interface AgreementFormProps {
  vendors: VendorLite[];
  initial?: VendorAgreement | null;
  onSaved: (agreement: VendorAgreement) => void;
  onCancel: () => void;
}

function AgreementForm({ vendors, initial, onSaved, onCancel }: AgreementFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [vendorId, setVendorId] = useState(initial ? String(initial.vendor) : "");
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effective_from ?? today);
  const [effectiveTo, setEffectiveTo] = useState(initial?.effective_to ?? "");
  const [agreementStatus, setAgreementStatus] = useState<VendorAgreement["status"]>(initial?.status ?? "DRAFT");
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms ?? "");
  const [creditPeriodDays, setCreditPeriodDays] = useState(String(initial?.credit_period_days ?? "30"));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!initial;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!vendorId) errs.vendor = "Vendor is required.";
    if (!effectiveFrom) errs.effective_from = "Start date is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setBusy(true);
    try {
      const payload = {
        vendor: Number(vendorId),
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        status: agreementStatus,
        payment_terms: paymentTerms || undefined,
        credit_period_days: Number(creditPeriodDays),
        notes: notes || undefined,
      };
      const agreement = isEdit
        ? await updateVendorAgreement(initial.id, payload)
        : await createVendorAgreement(payload);
      onSaved(agreement);
    } catch (err: unknown) {
      setErrors({ submit: accountingErrorMessage(err, `Failed to ${isEdit ? "update" : "create"} vendor agreement.`) });
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Vendor *</label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls} disabled={isEdit}>
            <option value="">— Select Vendor —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {errors.vendor ? <p className="mt-0.5 text-[10px] text-red-600">{errors.vendor}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select value={agreementStatus} onChange={(e) => setAgreementStatus(e.target.value as VendorAgreement["status"])} className={inputCls}>
            {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Effective From *</label>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputCls} />
          {errors.effective_from ? <p className="mt-0.5 text-[10px] text-red-600">{errors.effective_from}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Effective To (optional)</label>
          <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Credit Period (days)</label>
          <input type="number" min="0" step="1" value={creditPeriodDays} onChange={(e) => setCreditPeriodDays(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Payment Terms</label>
          <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {errors.submit ? <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.submit}</p> : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Cancel</button>
        <button type="submit" disabled={busy} className="h-9 rounded-xl border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : isEdit ? "Update Agreement" : "Save Agreement"}
        </button>
      </div>
    </form>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  agreement: VendorAgreement;
  vendors: VendorLite[];
  onUpdated: (agreement: VendorAgreement) => void;
  onClose: () => void;
}
function AgreementDetailDrawer({ agreement, vendors, onUpdated, onClose }: DetailDrawerProps) {
  const [editing, setEditing] = useState(false);

  function handleSaved(updated: VendorAgreement) {
    onUpdated(updated);
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative z-50 flex h-full w-full max-w-lg flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Vendor Agreement</p>
            <h2 className="text-lg font-semibold text-foreground">{agreement.agreement_no}</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border hover:bg-muted">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {editing ? (
            <>
              <h3 className="text-sm font-semibold text-foreground">Edit Agreement</h3>
              <AgreementForm vendors={vendors} initial={agreement} onSaved={handleSaved} onCancel={() => setEditing(false)} />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[10px] text-muted-foreground">Status</p>{statusBadge(agreement.status)}</div>
              <div><p className="text-[10px] text-muted-foreground">Vendor</p><p className="font-medium">{agreement.vendor_name ?? "—"}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Effective From</p><p>{fmt(agreement.effective_from)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Effective To</p><p>{fmt(agreement.effective_to)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Credit Period</p><p>{agreement.credit_period_days} days</p></div>
              {agreement.payment_terms ? <div><p className="text-[10px] text-muted-foreground">Payment Terms</p><p>{agreement.payment_terms}</p></div> : null}
              {agreement.notes ? <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Notes</p><p className="whitespace-pre-wrap">{agreement.notes}</p></div> : null}
            </div>
          )}
        </div>
        <div className="border-t border-border px-5 py-4 flex gap-3">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Edit</button>
          ) : null}
          <button onClick={onClose} className="ml-auto h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">Close</button>
        </div>
      </aside>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminVendorAgreementsPage() {
  const [rows, setRows] = useState<VendorAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<VendorAgreement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agrRes, vendorRes] = await Promise.allSettled([
        listVendorAgreements(),
        listVendorsLite({ page_size: 200, is_active: true }),
      ]);
      if (agrRes.status === "fulfilled") setRows(agrRes.value.results);
      else setError("Failed to load vendor agreements.");
      if (vendorRes.status === "fulfilled") setVendors(vendorRes.value.results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(agreement: VendorAgreement) {
    setRows((prev) => [agreement, ...prev]);
    setShowCreate(false);
  }

  function handleUpdated(agreement: VendorAgreement) {
    setRows((prev) => prev.map((r) => (r.id === agreement.id ? agreement : r)));
    setSelected(agreement);
  }

  return (
    <ERPPageShell
      title="Vendor Agreements"
      subtitle="Commercial agreement register. Agreement terms are auditable before PO issuance."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Agreements" },
      ]}
    >
      <ERPSectionShell
        title="Vendor Agreements"
        description="Agreement terms are non-financial and can be edited at any time."
        actions={<button onClick={() => setShowCreate(true)} className="h-8 rounded-xl border border-primary bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90">+ New Agreement</button>}
      >
        {loading ? <ERPLoadingState label="Loading vendor agreements…" /> : null}
        {!loading && error ? <ERPErrorState title="Load error" description={error} onRetry={() => void load()} /> : null}

        {showCreate ? (
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">New Vendor Agreement</h3>
            <AgreementForm vendors={vendors} onSaved={handleSaved} onCancel={() => setShowCreate(false)} />
          </div>
        ) : null}

        {!loading && !error && rows.length === 0 && !showCreate ? (
          <ERPEmptyState title="No vendor agreements" description="Create vendor agreements before controlled procurement cycles." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Agreement No</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Credit Period</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((agr) => (
                  <tr key={agr.id} onClick={() => setSelected(agr)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-primary">{agr.agreement_no}</td>
                    <td className="px-4 py-3">{agr.vendor_name ?? "—"}</td>
                    <td className="px-4 py-3">{fmt(agr.effective_from)}</td>
                    <td className="px-4 py-3">{fmt(agr.effective_to)}</td>
                    <td className="px-4 py-3">{agr.credit_period_days}d</td>
                    <td className="px-4 py-3">{statusBadge(agr.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>

      {selected ? (
        <AgreementDetailDrawer
          agreement={selected}
          vendors={vendors}
          onUpdated={handleUpdated}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </ERPPageShell>
  );
}
