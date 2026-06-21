"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Edit3, RefreshCw, Save } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import Modal from "@/components/ui/modal";
import {
  bulkUpdateBrochureProductSettings,
  getBrochureProductSettings,
  listBrochureProductSettings,
  updateBrochureProductSettings,
  type BrochureProductSettingsListParams,
  type BrochureProductSettingsRow,
  type BrochureProductSettingsUpdate,
  type BrochureType,
} from "@/services/brochures";


type EditForm = {
  visible_on_public_catalog: boolean;
  visible_on_rent_catalog: boolean;
  visible_on_lease_catalog: boolean;
  visible_on_lucky_emi_catalog: boolean;
  visible_on_sale_catalog: boolean;
  monthly_rent: string;
  lease_monthly_amount: string;
  security_deposit: string;
  brochure_sort_order: string;
  brochure_featured: boolean;
  short_description: string;
  public_badge: string;
};

type BulkForm = {
  public_visibility: string;
  rent_visibility: string;
  lease_visibility: string;
  lucky_visibility: string;
  sale_visibility: string;
  featured: string;
  monthly_rent: string;
  lease_monthly_amount: string;
  security_deposit: string;
};

const EMPTY_BULK: BulkForm = {
  public_visibility: "",
  rent_visibility: "",
  lease_visibility: "",
  lucky_visibility: "",
  sale_visibility: "",
  featured: "",
  monthly_rent: "",
  lease_monthly_amount: "",
  security_deposit: "",
};

function editForm(row: BrochureProductSettingsRow): EditForm {
  return {
    visible_on_public_catalog: row.visible_on_public_catalog,
    visible_on_rent_catalog: row.visible_on_rent_catalog,
    visible_on_lease_catalog: row.visible_on_lease_catalog,
    visible_on_lucky_emi_catalog: row.visible_on_lucky_emi_catalog,
    visible_on_sale_catalog: row.visible_on_sale_catalog,
    monthly_rent: row.monthly_rent ?? "",
    lease_monthly_amount: row.lease_monthly_amount ?? "",
    security_deposit: row.security_deposit ?? "",
    brochure_sort_order: String(row.brochure_sort_order),
    brochure_featured: row.brochure_featured,
    short_description: row.short_description,
    public_badge: row.public_badge,
  };
}

function money(value: string | null): string {
  if (!value) return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount)
    : value;
}

function optionalMoney(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function validateNonNegative(values: Array<[string, string]>): string | null {
  for (const [label, value] of values) {
    if (!value.trim()) continue;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return `${label} must be zero or greater.`;
  }
  return null;
}

function triState(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function VisibilityCell({ enabled }: { enabled: boolean }) {
  return <ERPStatusBadge status={enabled ? "AVAILABLE" : "NOT_PROVIDED"} label={enabled ? "Yes" : "No"} />;
}

export default function BrochureProductSettingsPage() {
  const [rows, setRows] = useState<BrochureProductSettingsRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [filters, setFilters] = useState<BrochureProductSettingsListParams>({
    q: "",
    category: "",
    brochure_type: "",
    page_size: 25,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<BrochureProductSettingsRow | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [bulk, setBulk] = useState<BulkForm>(EMPTY_BULK);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listBrochureProductSettings({ ...filters, page });
      setRows(payload.results);
      setCount(payload.count);
      setNumPages(payload.num_pages);
      setHasNext(payload.has_next);
      setHasPrevious(payload.has_previous);
      setSelectedIds((current) => new Set([...current].filter((id) => payload.results.some((row) => row.product_id === id))));
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load brochure product settings.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows]
  );

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters((current) => ({
      ...current,
      q: queryInput.trim(),
      category: categoryInput.trim(),
    }));
  }

  function updateFilter(key: keyof BrochureProductSettingsListParams, value: string | boolean | undefined) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSelection(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function openEditor(row: BrochureProductSettingsRow) {
    setError(null);
    try {
      const latest = await getBrochureProductSettings(row.product_id);
      setEditing(latest);
      setForm(editForm(latest));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open product settings.");
    }
  }

  async function saveEditor() {
    if (!editing || !form) return;
    const validationError = validateNonNegative([
      ["Monthly rent", form.monthly_rent],
      ["Lease monthly amount", form.lease_monthly_amount],
      ["Security deposit", form.security_deposit],
      ["Sort order", form.brochure_sort_order],
    ]);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await updateBrochureProductSettings(editing.product_id, {
        visible_on_public_catalog: form.visible_on_public_catalog,
        visible_on_rent_catalog: form.visible_on_rent_catalog,
        visible_on_lease_catalog: form.visible_on_lease_catalog,
        visible_on_lucky_emi_catalog: form.visible_on_lucky_emi_catalog,
        visible_on_sale_catalog: form.visible_on_sale_catalog,
        monthly_rent: optionalMoney(form.monthly_rent),
        lease_monthly_amount: optionalMoney(form.lease_monthly_amount),
        security_deposit: optionalMoney(form.security_deposit),
        brochure_sort_order: Number(form.brochure_sort_order || 0),
        brochure_featured: form.brochure_featured,
        short_description: form.short_description.trim(),
        public_badge: form.public_badge.trim(),
      });
      setWarnings(response.warnings);
      setSuccess(`${response.row.name} brochure settings saved.`);
      setEditing(null);
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save brochure settings.");
    } finally {
      setSaving(false);
    }
  }

  async function applyBulk() {
    if (selectedIds.size === 0) {
      setError("Select at least one product for bulk update.");
      return;
    }
    const validationError = validateNonNegative([
      ["Monthly rent", bulk.monthly_rent],
      ["Lease monthly amount", bulk.lease_monthly_amount],
      ["Security deposit", bulk.security_deposit],
    ]);
    if (validationError) {
      setError(validationError);
      return;
    }
    const updates: BrochureProductSettingsUpdate = {};
    const mappings: Array<[keyof BrochureProductSettingsUpdate, string]> = [
      ["visible_on_public_catalog", bulk.public_visibility],
      ["visible_on_rent_catalog", bulk.rent_visibility],
      ["visible_on_lease_catalog", bulk.lease_visibility],
      ["visible_on_lucky_emi_catalog", bulk.lucky_visibility],
      ["visible_on_sale_catalog", bulk.sale_visibility],
      ["brochure_featured", bulk.featured],
    ];
    mappings.forEach(([key, value]) => {
      const resolved = triState(value);
      if (resolved !== undefined) Object.assign(updates, { [key]: resolved });
    });
    if (bulk.monthly_rent.trim()) updates.monthly_rent = bulk.monthly_rent.trim();
    if (bulk.lease_monthly_amount.trim()) updates.lease_monthly_amount = bulk.lease_monthly_amount.trim();
    if (bulk.security_deposit.trim()) updates.security_deposit = bulk.security_deposit.trim();
    if (Object.keys(updates).length === 0) {
      setError("Choose at least one bulk setting.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await bulkUpdateBrochureProductSettings({
        product_ids: [...selectedIds],
        updates,
      });
      setWarnings(response.warnings.map((warning) => `Product ${warning.product_id}: ${warning.message}`));
      setSuccess(`Updated ${response.updated_count} products; skipped ${response.skipped_count}.`);
      setBulk(EMPTY_BULK);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk brochure settings update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      title="Brochure Product Settings"
      subtitle="Products require brochure settings before they can appear in generated brochures."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Brochures", href: "/admin/brochures" }, { label: "Product Settings" }]}
      actions={[{ href: "/admin/brochures", label: "Back to Brochure Generator", variant: "secondary" }, { href: "/admin/brochures/enquiries", label: "Enquiries", variant: "secondary" }, { href: "/admin/brochures/quotations", label: "Quotations", variant: "secondary" }]}
      statusBadge={{ label: "Explicit publication control", tone: "info" }}
      stats={[{ label: "Filtered products", value: count }, { label: "Selected", value: selectedIds.size }, { label: "Page", value: `${page} / ${numPages || 1}` }]}
    >
      <div className="space-y-6">
        <ERPSectionShell title="Find products" description="Search the product master, then configure only the catalogs that should be public.">
          <form onSubmit={applyFilters} className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_180px_170px_150px_140px_auto]">
            <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search product or code" className="h-10 rounded-xl border border-border bg-background px-4 text-sm" />
            <input list="brochure-settings-categories" value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} placeholder="Category" className="h-10 rounded-xl border border-border bg-background px-4 text-sm" />
            <datalist id="brochure-settings-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
            <select value={filters.brochure_type ?? ""} onChange={(event) => updateFilter("brochure_type", event.target.value as Exclude<BrochureType, "CUSTOM"> | "")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">All brochure types</option><option value="RENT">Rent</option><option value="LEASE">Lease</option><option value="LUCKY_EMI">Lucky EMI</option><option value="DIRECT_SALE">Direct Sale</option>
            </select>
            <select value={filters.missing_settings === undefined ? "" : String(filters.missing_settings)} onChange={(event) => updateFilter("missing_settings", event.target.value === "" ? undefined : event.target.value === "true")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">All settings</option><option value="true">Missing settings</option><option value="false">Configured</option>
            </select>
            <select value={filters.featured === undefined ? "" : String(filters.featured)} onChange={(event) => updateFilter("featured", event.target.value === "" ? undefined : event.target.value === "true")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="">All featured</option><option value="true">Featured</option><option value="false">Not featured</option>
            </select>
            <button type="submit" className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Apply</button>
          </form>
        </ERPSectionShell>

        <ERPSectionShell title={`Bulk update (${selectedIds.size} selected)`} description="Blank values mean no change. Newly created settings remain unpublished except for visibility switches explicitly enabled here.">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {([
              ["public_visibility", "Public"],
              ["rent_visibility", "Rent"],
              ["lease_visibility", "Lease"],
              ["lucky_visibility", "Lucky EMI"],
              ["sale_visibility", "Sale"],
              ["featured", "Featured"],
            ] as Array<[keyof BulkForm, string]>).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-semibold text-muted-foreground"><span>{label}</span><select value={bulk[key]} onChange={(event) => setBulk((current) => ({ ...current, [key]: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"><option value="">No change</option><option value="true">Enable</option><option value="false">Disable</option></select></label>
            ))}
            <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>Monthly rent</span><input type="number" min="0" step="0.01" value={bulk.monthly_rent} onChange={(event) => setBulk((current) => ({ ...current, monthly_rent: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
            <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>Lease monthly</span><input type="number" min="0" step="0.01" value={bulk.lease_monthly_amount} onChange={(event) => setBulk((current) => ({ ...current, lease_monthly_amount: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
            <label className="space-y-1 text-xs font-semibold text-muted-foreground"><span>Security deposit</span><input type="number" min="0" step="0.01" value={bulk.security_deposit} onChange={(event) => setBulk((current) => ({ ...current, security_deposit: event.target.value }))} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground" /></label>
            <div className="flex items-end xl:col-span-3"><button type="button" onClick={() => void applyBulk()} disabled={saving || selectedIds.size === 0} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" /> Apply to selected</button></div>
          </div>
        </ERPSectionShell>

        {error ? <ERPErrorState title="Brochure settings action failed" description={error} onRetry={() => void load()} /> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{success}</div> : null}
        {warnings.length ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><div className="font-semibold">Warnings</div><ul className="mt-1 list-disc pl-5">{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div> : null}

        <ERPSectionShell title="Product settings register" actions={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Refresh</button>}>
          {loading ? <ERPLoadingState label="Loading brochure product settings..." /> : null}
          {!loading && rows.length === 0 ? <ERPEmptyState title="No products found" description="Change the filters or add products to the product master." /> : null}
          {!loading && rows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1500px] divide-y divide-border text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Select</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Code</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Public</th><th className="px-3 py-3">Rent</th><th className="px-3 py-3">Lease</th><th className="px-3 py-3">Lucky EMI</th><th className="px-3 py-3">Sale</th><th className="px-3 py-3">Monthly rent</th><th className="px-3 py-3">Lease monthly</th><th className="px-3 py-3">Deposit</th><th className="px-3 py-3">Featured</th><th className="px-3 py-3">Sort</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-border bg-card">
                    {rows.map((row) => (
                      <tr key={row.product_id}>
                        <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(row.product_id)} onChange={() => toggleSelection(row.product_id)} aria-label={`Select ${row.name}`} className="h-4 w-4 accent-primary" /></td>
                        <td className="px-3 py-3"><div className="font-semibold text-foreground">{row.name}</div><div className="text-xs text-muted-foreground">{row.has_settings ? "Configured" : "Unpublished · settings missing"}</div></td>
                        <td className="px-3 py-3">{row.product_code}</td><td className="px-3 py-3">{row.category}</td>
                        <td className="px-3 py-3"><VisibilityCell enabled={row.visible_on_public_catalog} /></td><td className="px-3 py-3"><VisibilityCell enabled={row.visible_on_rent_catalog} /></td><td className="px-3 py-3"><VisibilityCell enabled={row.visible_on_lease_catalog} /></td><td className="px-3 py-3"><VisibilityCell enabled={row.visible_on_lucky_emi_catalog} /></td><td className="px-3 py-3"><VisibilityCell enabled={row.visible_on_sale_catalog} /></td>
                        <td className="px-3 py-3">{money(row.monthly_rent)}</td><td className="px-3 py-3">{money(row.lease_monthly_amount)}</td><td className="px-3 py-3">{money(row.security_deposit)}</td><td className="px-3 py-3"><VisibilityCell enabled={row.brochure_featured} /></td><td className="px-3 py-3">{row.brochure_sort_order}</td>
                        <td className="max-w-xs px-3 py-3 text-muted-foreground">{row.short_description || "—"}</td>
                        <td className="px-3 py-3"><button type="button" onClick={() => void openEditor(row)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 font-semibold"><Edit3 className="h-4 w-4" /> Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{count} products</span><div className="flex items-center gap-2"><button type="button" disabled={!hasPrevious} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">Previous</button><span className="text-sm">Page {page} of {numPages || 1}</span><button type="button" disabled={!hasNext} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">Next</button></div></div>
            </>
          ) : null}
        </ERPSectionShell>
      </div>

      <Modal title={editing ? `Edit brochure settings · ${editing.name}` : "Edit brochure settings"} open={Boolean(editing && form)} onClose={() => { setEditing(null); setForm(null); }} size="xl">
        {form ? (
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              {([
                ["visible_on_public_catalog", "Public catalog"],
                ["visible_on_rent_catalog", "Rent catalog"],
                ["visible_on_lease_catalog", "Lease catalog"],
                ["visible_on_lucky_emi_catalog", "Lucky EMI catalog"],
                ["visible_on_sale_catalog", "Sale catalog"],
                ["brochure_featured", "Featured"],
              ] as Array<[keyof EditForm, string]>).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm((current) => current ? ({ ...current, [key]: event.target.checked }) : current)} className="h-4 w-4 accent-primary" /> {label}</label>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium"><span>Monthly rent</span><input type="number" min="0" step="0.01" value={form.monthly_rent} onChange={(event) => setForm({ ...form, monthly_rent: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
              <label className="space-y-1 text-sm font-medium"><span>Lease monthly amount</span><input type="number" min="0" step="0.01" value={form.lease_monthly_amount} onChange={(event) => setForm({ ...form, lease_monthly_amount: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
              <label className="space-y-1 text-sm font-medium"><span>Security deposit</span><input type="number" min="0" step="0.01" value={form.security_deposit} onChange={(event) => setForm({ ...form, security_deposit: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
              <label className="space-y-1 text-sm font-medium"><span>Sort order</span><input type="number" min="0" step="1" value={form.brochure_sort_order} onChange={(event) => setForm({ ...form, brochure_sort_order: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
              <label className="space-y-1 text-sm font-medium md:col-span-2"><span>Public badge</span><input maxLength={80} value={form.public_badge} onChange={(event) => setForm({ ...form, public_badge: event.target.value })} className="h-10 w-full rounded-xl border border-border px-3" /></label>
              <label className="space-y-1 text-sm font-medium md:col-span-2"><span>Short description</span><textarea maxLength={180} rows={4} value={form.short_description} onChange={(event) => setForm({ ...form, short_description: event.target.value })} className="w-full rounded-xl border border-border p-3" /><span className="text-xs text-muted-foreground">{form.short_description.length}/180</span></label>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setForm(null); }} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold">Cancel</button><button type="button" onClick={() => void saveEditor()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save settings"}</button></div>
          </div>
        ) : null}
      </Modal>
    </ERPPageShell>
  );
}
