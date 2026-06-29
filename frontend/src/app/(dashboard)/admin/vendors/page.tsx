"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";

import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import EntityDrawer from "@/components/admin-workbench/EntityDrawer";
import RightInspector from "@/components/admin-workbench/RightInspector";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import {
  createVendor,
  listVendorCategories,
  listVendors,
  updateVendor,
  type Vendor,
  type VendorCategory,
  type VendorStatus,
  type VendorWritePayload,
} from "@/services/vendors";

type VendorFormState = {
  vendor_code: string;
  name: string;
  display_name: string;
  legal_name: string;
  contact_person: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  gstin: string;
  pan: string;
  state_code: string;
  state_name: string;
  status: VendorStatus;
  payment_terms: string;
  credit_period_days: string;
  notes: string;
  is_active: boolean;
  categories: number[];
};

const EMPTY_FORM: VendorFormState = {
  vendor_code: "",
  name: "",
  display_name: "",
  legal_name: "",
  contact_person: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  gstin: "",
  pan: "",
  state_code: "",
  state_name: "",
  status: "ACTIVE",
  payment_terms: "",
  credit_period_days: "0",
  notes: "",
  is_active: true,
  categories: [],
};

function normalizeVendors(payload: Awaited<ReturnType<typeof listVendors>>): Vendor[] {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

function normalizeCategories(
  payload: Awaited<ReturnType<typeof listVendorCategories>>
): VendorCategory[] {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

function toFormState(vendor: Vendor): VendorFormState {
  return {
    vendor_code: vendor.vendor_code ?? "",
    name: vendor.name ?? "",
    display_name: vendor.display_name ?? "",
    legal_name: vendor.legal_name ?? "",
    contact_person: vendor.contact_person ?? "",
    phone: vendor.phone ?? "",
    whatsapp: vendor.whatsapp ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    gstin: vendor.gstin ?? "",
    pan: vendor.pan ?? "",
    state_code: vendor.state_code ?? "",
    state_name: vendor.state_name ?? "",
    status: vendor.status ?? "ACTIVE",
    payment_terms: vendor.payment_terms ?? "",
    credit_period_days: String(vendor.credit_period_days ?? 0),
    notes: vendor.notes ?? "",
    is_active: vendor.is_active,
    categories: vendor.categories ?? [],
  };
}

function toPayload(form: VendorFormState): VendorWritePayload {
  return {
    vendor_code: form.vendor_code.trim() || undefined,
    name: form.name.trim(),
    display_name: form.display_name.trim(),
    legal_name: form.legal_name.trim(),
    contact_person: form.contact_person.trim(),
    phone: form.phone.trim(),
    whatsapp: form.whatsapp.trim(),
    email: form.email.trim(),
    address: form.address.trim(),
    gstin: form.gstin.trim(),
    pan: form.pan.trim(),
    state_code: form.state_code.trim(),
    state_name: form.state_name.trim(),
    status: form.status,
    payment_terms: form.payment_terms.trim(),
    credit_period_days: Math.max(0, Number(form.credit_period_days || 0)),
    notes: form.notes.trim(),
    is_active: form.is_active,
    categories: form.categories,
  };
}

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<number | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [vendorPayload, categoryPayload] = await Promise.all([
        listVendors(),
        listVendorCategories(),
      ]);
      const nextVendors = normalizeVendors(vendorPayload);
      setVendors(nextVendors);
      setCategories(normalizeCategories(categoryPayload));
      setSelectedVendorId((current) =>
        current && nextVendors.some((vendor) => vendor.id === current) ? current : null
      );
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load the vendor register."));
      if (mode === "initial") {
        setVendors([]);
        setCategories([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === selectedVendorId) ?? null,
    [selectedVendorId, vendors]
  );

  const activeCount = vendors.filter((vendor) => vendor.is_active).length;
  const blockedCount = vendors.filter(
    (vendor) => vendor.status === "BLOCKED" || vendor.status === "ARCHIVED"
  ).length;

  function openCreate() {
    setEditingVendorId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
    setDrawerOpen(true);
  }

  function openEdit(vendor: Vendor) {
    setEditingVendorId(vendor.id);
    setForm(toFormState(vendor));
    setSelectedVendorId(vendor.id);
    setError(null);
    setNotice(null);
    setDrawerOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = toPayload(form);
      const saved = editingVendorId
        ? await updateVendor(editingVendorId, payload)
        : await createVendor(payload);
      setDrawerOpen(false);
      setEditingVendorId(null);
      setForm(EMPTY_FORM);
      setSelectedVendorId(saved.id);
      setNotice(
        editingVendorId
          ? `Vendor ${saved.display_name || saved.name} updated.`
          : `Vendor ${saved.display_name || saved.name} created. You can create another vendor now.`
      );
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save the vendor."));
    } finally {
      setSaving(false);
    }
  }

  const columns: EnterpriseColumnDef<Vendor>[] = [
    { key: "vendor_code", header: "Code", render: (row) => row.vendor_code || "Auto" },
    {
      key: "name",
      header: "Vendor",
      render: (row) => (
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={`${ROUTES.admin.vendors}/${row.id}`}>
          {row.display_name || row.name}
        </Link>
      ),
    },
    {
      key: "contact_person",
      header: "Contact",
      render: (row) => (
        <div>
          <div>{row.contact_person || "—"}</div>
          <div className="text-xs text-muted-foreground">{row.phone || row.email || "No contact"}</div>
        </div>
      ),
    },
    { key: "gstin", header: "GSTIN", render: (row) => row.gstin || "—" },
    {
      key: "status",
      header: "Status",
      render: (row) => <ERPStatusBadge status={row.status || (row.is_active ? "ACTIVE" : "INACTIVE")} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold transition hover:bg-muted"
            onClick={() => setSelectedVendorId(row.id)}
          >
            Inspect
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold transition hover:bg-muted"
            onClick={() => openEdit(row)}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendors"
      subtitle="Create and maintain supplier profiles used by procurement, sourcing, payables, KYC, and vendor portal access."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendors" }]}
      actions={[
        { href: ROUTES.admin.vendorsCategories, label: "Categories", variant: "secondary" },
        { href: ROUTES.admin.vendorsQuotes, label: "Quotes / RFQ", variant: "secondary" },
        { href: ROUTES.admin.purchases, label: "Purchases", variant: "primary" },
      ]}
      stats={[
        { label: "Vendors", value: String(vendors.length), tone: "info" },
        { label: "Active", value: String(activeCount), tone: "success" },
        { label: "Blocked / archived", value: String(blockedCount), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-4">
        {notice ? <AccountingNotice message={notice} /> : null}
        {error && drawerOpen ? <AccountingNotice tone="danger" message={error} /> : null}

        <ERPSectionShell
          title="Vendor command bar"
          description="Add another vendor at any time, refresh the register, or continue into procurement and payable workflows."
          actions={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-95"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" /> Create vendor
              </button>
            </div>
          }
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <EnterpriseDataTable
              data={vendors}
              columns={columns}
              loading={loading}
              error={!drawerOpen ? error : null}
              onRetry={() => void loadPage("refresh")}
              globalFilterPlaceholder="Search code, name, phone, email, GSTIN…"
              emptyTitle="No vendors found"
              emptyDescription="Create the first vendor profile to enable procurement and payable workflows."
            />

            <RightInspector title={selectedVendor ? selectedVendor.display_name || selectedVendor.name : "Vendor details"}>
              {selectedVendor ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><div className="text-xs uppercase tracking-wide">Code</div><div className="mt-1 font-semibold text-foreground">{selectedVendor.vendor_code || "—"}</div></div>
                    <div><div className="text-xs uppercase tracking-wide">Status</div><div className="mt-1"><ERPStatusBadge status={selectedVendor.status} /></div></div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="font-medium text-foreground">{selectedVendor.contact_person || "No contact person"}</div>
                    <div className="mt-1 text-xs">{selectedVendor.phone || "No phone"}</div>
                    <div className="text-xs">{selectedVendor.email || "No email"}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button type="button" className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted" onClick={() => openEdit(selectedVendor)}>Edit vendor</button>
                    <Link className="flex h-10 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground" href={`${ROUTES.admin.vendors}/${selectedVendor.id}`}>Open full profile</Link>
                  </div>
                </>
              ) : (
                <p>Select Inspect on a vendor row, or create a new vendor.</p>
              )}
            </RightInspector>
          </div>
        </ERPSectionShell>
      </div>

      <EntityDrawer
        open={drawerOpen}
        title={editingVendorId ? "Edit vendor" : "Create vendor"}
        description="Vendor identity and procurement defaults. Financial postings remain controlled by purchase and accounting services."
        onClose={() => {
          if (!saving) setDrawerOpen(false);
        }}
        disableClose={saving}
        size="wide"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50" disabled={saving} onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button type="submit" form="vendor-master-form" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={saving}>{saving ? "Saving…" : editingVendorId ? "Update vendor" : "Create vendor"}</button>
          </div>
        }
      >
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        <form id="vendor-master-form" className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-muted-foreground">Vendor name *<input className={accountingFieldClassName()} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required autoFocus /></label>
          <label className="text-sm font-medium text-muted-foreground">Display name<input className={accountingFieldClassName()} value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder="Defaults to vendor name" /></label>
          <label className="text-sm font-medium text-muted-foreground">Vendor code<input className={accountingFieldClassName()} value={form.vendor_code} onChange={(event) => setForm((current) => ({ ...current, vendor_code: event.target.value.toUpperCase() }))} placeholder="Generated automatically when blank" /></label>
          <label className="text-sm font-medium text-muted-foreground">Legal name<input className={accountingFieldClassName()} value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">Contact person<input className={accountingFieldClassName()} value={form.contact_person} onChange={(event) => setForm((current) => ({ ...current, contact_person: event.target.value }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">Phone<input className={accountingFieldClassName()} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} inputMode="tel" /></label>
          <label className="text-sm font-medium text-muted-foreground">WhatsApp<input className={accountingFieldClassName()} value={form.whatsapp} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} inputMode="tel" /></label>
          <label className="text-sm font-medium text-muted-foreground">Email<input className={accountingFieldClassName()} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" /></label>
          <label className="text-sm font-medium text-muted-foreground">GSTIN<input className={accountingFieldClassName()} value={form.gstin} onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">PAN<input className={accountingFieldClassName()} value={form.pan} onChange={(event) => setForm((current) => ({ ...current, pan: event.target.value.toUpperCase() }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">State code<input className={accountingFieldClassName()} value={form.state_code} onChange={(event) => setForm((current) => ({ ...current, state_code: event.target.value.toUpperCase() }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">State name<input className={accountingFieldClassName()} value={form.state_name} onChange={(event) => setForm((current) => ({ ...current, state_name: event.target.value }))} /></label>
          <label className="text-sm font-medium text-muted-foreground">Status<select className={accountingFieldClassName()} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as VendorStatus }))}><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="BLOCKED">Blocked</option><option value="ARCHIVED">Archived</option></select></label>
          <label className="text-sm font-medium text-muted-foreground">Credit period (days)<input className={accountingFieldClassName()} value={form.credit_period_days} onChange={(event) => setForm((current) => ({ ...current, credit_period_days: event.target.value }))} type="number" min="0" step="1" /></label>
          <label className="text-sm font-medium text-muted-foreground md:col-span-2">Payment terms<input className={accountingFieldClassName()} value={form.payment_terms} onChange={(event) => setForm((current) => ({ ...current, payment_terms: event.target.value }))} placeholder="Example: Net 30 after accepted goods receipt" /></label>
          <label className="text-sm font-medium text-muted-foreground md:col-span-2">Address<textarea className={accountingFieldClassName()} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} rows={3} /></label>
          <fieldset className="rounded-xl border border-border p-4 md:col-span-2">
            <legend className="px-2 text-sm font-semibold text-foreground">Vendor categories</legend>
            {categories.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <label key={category.id} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm"><input type="checkbox" checked={form.categories.includes(category.id)} onChange={(event) => setForm((current) => ({ ...current, categories: event.target.checked ? [...current.categories, category.id] : current.categories.filter((id) => id !== category.id) }))} />{category.name}</label>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No categories configured. You can save the vendor without one.</p>}
          </fieldset>
          <label className="text-sm font-medium text-muted-foreground md:col-span-2">Notes<textarea className={accountingFieldClassName()} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={3} /></label>
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground md:col-span-2"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />Available for new procurement workflows</label>
        </form>
      </EntityDrawer>
    </ERPPageShell>
  );
}
