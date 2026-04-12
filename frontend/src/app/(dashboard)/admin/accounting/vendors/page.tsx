"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createVendor,
  listVendors,
  updateVendor,
  type Vendor,
} from "@/services/accounting";

type VendorFormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  state_code: string;
  state_name: string;
  is_active: boolean;
};

const EMPTY_FORM: VendorFormState = {
  name: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  state_code: "",
  state_name: "",
  is_active: true,
};

function toFormState(vendor: Vendor): VendorFormState {
  return {
    name: vendor.name,
    phone: vendor.phone ?? "",
    email: vendor.email ?? "",
    address: vendor.address ?? "",
    gstin: vendor.gstin ?? "",
    state_code: vendor.state_code ?? "",
    state_name: vendor.state_name ?? "",
    is_active: vendor.is_active,
  };
}

export default function AccountingVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listVendors();
      setVendors(payload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load vendors."));
      if (mode === "initial") setVendors([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === selectedVendorId) ?? null,
    [selectedVendorId, vendors]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (selectedVendor) {
        await updateVendor(selectedVendor.id, form);
        setNotice(`Vendor ${selectedVendor.name} updated.`);
      } else {
        await createVendor(form);
        setNotice("Vendor created.");
      }
      setSelectedVendorId(null);
      setForm(EMPTY_FORM);
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save vendor."));
    } finally {
      setSaving(false);
    }
  }

  const columns: EnterpriseColumnDef<Vendor>[] = [
    { key: "name", header: "Vendor" },
    { key: "phone", header: "Phone" },
    { key: "gstin", header: "GSTIN" },
    { key: "state_name", header: "State" },
    {
      key: "is_active",
      header: "Active",
      render: (row) => (row.is_active ? "Yes" : "No"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedVendorId(row.id);
            setForm(toFormState(row));
            setNotice(null);
            setError(null);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  const activeCount = vendors.filter((vendor) => vendor.is_active).length;

  return (
    <PortalPage
      title="Vendor Register"
      subtitle="Maintain supplier and vendor master data for procurement, expenses, settlements, and future raw-material purchasing without mixing that truth into billing or payment tables."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Vendors" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingPurchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.accountingVendorSettlements, label: "Vendor Settlements", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenses, label: "Expenses", variant: "primary" },
      ]}
      stats={[
        { label: "Vendors", value: String(vendors.length), tone: "info" },
        { label: "Active", value: String(activeCount), tone: "success" },
        { label: "Inactive", value: String(vendors.length - activeCount), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton loading={loading} refreshing={refreshing} onClick={() => void loadPage("refresh")} />
        </div>

        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}

        <WorkspaceSection
          title={selectedVendor ? "Edit Vendor" : "Create Vendor"}
          description="This master is reused by purchase bills, expense vouchers, vendor settlements, and asset procurement records."
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="text-sm text-muted-foreground">
              Name
              <input
                className={accountingFieldClassName()}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Phone
              <input
                className={accountingFieldClassName()}
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Email
              <input
                className={accountingFieldClassName()}
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="text-sm text-muted-foreground">
              GSTIN
              <input
                className={accountingFieldClassName()}
                value={form.gstin}
                onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value }))}
              />
            </label>
            <label className="text-sm text-muted-foreground">
              State code
              <input
                className={accountingFieldClassName()}
                value={form.state_code}
                onChange={(event) => setForm((current) => ({ ...current, state_code: event.target.value }))}
              />
            </label>
            <label className="text-sm text-muted-foreground">
              State name
              <input
                className={accountingFieldClassName()}
                value={form.state_name}
                onChange={(event) => setForm((current) => ({ ...current, state_name: event.target.value }))}
              />
            </label>
            <label className="text-sm text-muted-foreground md:col-span-2">
              Address
              <textarea
                className={accountingFieldClassName()}
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                rows={3}
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Vendor is active for new procurement and expense work
            </label>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving..." : selectedVendor ? "Update Vendor" : "Create Vendor"}
              </button>
              {selectedVendor ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVendorId(null);
                    setForm(EMPTY_FORM);
                    setNotice(null);
                    setError(null);
                  }}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </form>
        </WorkspaceSection>

        <WorkspaceSection
          title="Vendor Master"
          description="Use this register to keep supplier identity and compliance details clean before purchase, expense, or settlement posting."
        >
          <EnterpriseDataTable
            data={vendors}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No vendors found"
            emptyDescription="Create the first vendor above to start procurement and expense operations."
          />
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
