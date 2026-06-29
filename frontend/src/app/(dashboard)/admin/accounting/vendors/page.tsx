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
import { ACCOUNTING_REGISTER_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import EmptyState from "@/components/feedback/EmptyState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createVendor,
  getVendorOperationalSummary,
  listVendors,
  updateVendor,
  type Vendor,
  type VendorOperationalSummary,
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
  const [summary, setSummary] = useState<VendorOperationalSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await listVendors({ page_size: 500 });
      setVendors(payload.results);
      setSelectedVendorId((current) =>
        current && payload.results.some((vendor) => vendor.id === current) ? current : null
      );
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

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      if (!selectedVendorId) {
        setSummary(null);
        return;
      }
      setSummaryLoading(true);
      try {
        const payload = await getVendorOperationalSummary(selectedVendorId);
        if (!active) return;
        setSummary(payload);
      } catch (err) {
        if (!active) return;
        setSummary(null);
        setError(accountingErrorMessage(err, "Failed to load vendor payable summary."));
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [selectedVendorId]);

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
    <ERPPageShell
      eyebrow="Accounting Payables Control"
      title="Vendor Register"
      subtitle="Maintain supplier and vendor master data for procurement, expenses, settlements, and future raw-material purchasing without mixing that truth into billing or payment tables."
      helperNote="Vendor master and payable review remain accounting-side controls. They stay distinct from billing, cashier collection, and EMI customer operations."
      helperTone="info"
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
        <WorkspaceDirectory
          title="Accounting control map"
          description="Move between supplier master, purchase bills, settlements, books, and statements from one accounting workspace."
          groups={ACCOUNTING_REGISTER_DIRECTORY_GROUPS}
        />

        <WorkspaceSection
          title="Supplier payable view"
          description="Select a vendor from the register below to review purchase-bill exposure, settlement history, and the current payable position."
        >
          {!selectedVendor ? (
            <EmptyState
              title="No vendor selected"
              description="Create or select a vendor to inspect purchase and payable activity."
            />
          ) : summaryLoading ? (
            <div className="rounded-xl border border-border bg-background px-4 py-8 text-sm text-muted-foreground">
              Loading payable summary for {selectedVendor.name}...
            </div>
          ) : !summary ? (
            <EmptyState
              title="No payable summary available"
              description="The vendor summary could not be loaded yet."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{summary.vendor.name}</div>
                </div>
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posted purchase bills</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{summary.summary.posted_purchase_bill_count}</div>
                </div>
                <div className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posted settlements</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{summary.summary.posted_settlement_count}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Outstanding payable</div>
                  <div className="mt-1 text-base font-semibold text-amber-900">₹{summary.summary.outstanding_payable_total}</div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground">Recent purchase bills</h3>
                  <div className="mt-3 space-y-3">
                    {summary.purchase_bills.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No purchase bills posted for this vendor yet.</p>
                    ) : (
                      summary.purchase_bills.rows.slice(0, 4).map((bill) => (
                        <div key={bill.id} className="rounded-xl border border-border bg-muted/50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{bill.bill_no}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{bill.branch_name || bill.branch_code || "Primary branch"} · {bill.status}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-foreground">₹{bill.grand_total}</div>
                              <div className="mt-1 text-xs text-amber-700">Outstanding ₹{bill.outstanding_amount}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-foreground">Recent settlements</h3>
                  <div className="mt-3 space-y-3">
                    {summary.settlements.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No settlement history recorded for this vendor yet.</p>
                    ) : (
                      summary.settlements.rows.slice(0, 4).map((settlement) => (
                        <div key={settlement.id} className="rounded-xl border border-border bg-muted/50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{settlement.settlement_no}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{settlement.reference_no || "No reference"} · {settlement.status}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-foreground">₹{settlement.amount}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{settlement.purchase_bill_no || "Vendor-level settlement"}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">Timeline</h3>
                <div className="mt-3 space-y-3">
                  {summary.timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchase or settlement timeline entries available yet.</p>
                  ) : (
                    summary.timeline.slice(0, 6).map((entry) => (
                      <div key={`${entry.kind}-${entry.reference_no}-${entry.date}`} className="rounded-xl border border-border bg-muted/50 px-3 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{entry.reference_no}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{entry.kind.replace("_", " ")} · {entry.status} · {entry.date}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">₹{entry.amount}</div>
                            {entry.outstanding_amount ? (
                              <div className="mt-1 text-xs text-amber-700">Open ₹{entry.outstanding_amount}</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </WorkspaceSection>

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
    </ERPPageShell>
  );
}
