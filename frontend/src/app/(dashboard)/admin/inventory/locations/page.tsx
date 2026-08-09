"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Download, Search } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listBranches, type BranchRecord } from "@/services/branch-control";
import type { StockLocation, StockLocationsRow, StockLocationsPayload } from "@/services/inventory";
import {
  createStockLocation,
  listStockLocations,
  updateStockLocation,
} from "@/services/inventory";

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type LocationFormState = {
  id: number | null;
  code: string;
  name: string;
  branch: string;
  location_type: StockLocation["location_type"];
  is_active: boolean;
  notes: string;
  address: string;
  phone: string;
  is_default_receiving_location: boolean;
};

const EMPTY_FORM: LocationFormState = {
  id: null,
  code: "",
  name: "",
  branch: "",
  location_type: "STORE",
  is_active: true,
  notes: "",
  address: "",
  phone: "",
  is_default_receiving_location: false,
};

function toFormState(location: StockLocation): LocationFormState {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    branch: location.branch ? String(location.branch) : "",
    location_type: location.location_type,
    is_active: location.is_active,
    notes: location.notes ?? "",
    address: location.address ?? "",
    phone: location.phone ?? "",
    is_default_receiving_location: location.is_default_receiving_location ?? false,
  };
}

// Export to CSV helper
function exportLocationsToCSV(rows: StockLocationsRow[], filename: string = "stock-locations.csv") {
  const headers = ["Code", "Name", "Type", "Branch", "Address", "Phone", "Default Receiving", "Status"];
  const csvContent = [
    headers.join(","),
    ...rows.map(row => [
      row.code || "",
      row.name || "",
      row.location_type || "",
      row.branch_name || "",
      row.address || "",
      row.phone || "",
      row.is_default_receiving_location ? "Yes" : "No",
      row.is_active ? "Active" : "Inactive",
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function InventoryLocationsPage() {
  const [rows, setRows] = useState<StockLocationsRow[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Pagination & Filter State
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 350);

  // KPI State
  const [kpiCounts, setKpiCounts] = useState({ active: 0, warehouse: 0, showroom: 0, store: 0 });

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [payload, branchPayload] = await Promise.all([
        listStockLocations({
          page: pagination.page,
          page_size: pagination.page_size,
          location_type: typeFilter || undefined,
          is_active: activeFilter ? activeFilter === "active" : undefined,
          search: debouncedSearch || undefined,
        }) as Promise<StockLocationsPayload>,
        listBranches({ status: "ACTIVE" }),
      ]);
      setRows(payload.results ?? []);
      setKpiCounts({
        active: payload.active_count,
        warehouse: payload.warehouse_count,
        showroom: payload.showroom_count,
        store: payload.store_count,
      });
      setPagination(prev => ({
        ...prev,
        total_count: payload.count,
        num_pages: payload.num_pages,
      }));
      setBranches(branchPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setBranches([]);
      setError(accountingErrorMessage(err, "Failed to load stock locations."));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.page_size, typeFilter, activeFilter, debouncedSearch]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const columns: EnterpriseColumnDef<StockLocationsRow>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    {
      key: "branch_name",
      header: "Branch",
      render: (row) => row.branch_name || "Primary default",
    },
    { key: "location_type", header: "Type" },
    {
      key: "address",
      header: "Address",
      render: (row) => row.address?.trim() || "—",
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => row.phone?.trim() || "—",
    },
    {
      key: "is_default_receiving_location",
      header: "Default Receiving",
      render: (row) => row.is_default_receiving_location ? "✓ Yes" : "—",
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => <ERPStatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setForm(toFormState(row));
            setMessage(null);
            setError(null);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (form.id) {
        await updateStockLocation(form.id, {
          code: form.code,
          name: form.name,
          branch: form.branch ? Number(form.branch) : null,
          location_type: form.location_type,
          is_active: form.is_active,
          notes: form.notes,
          address: form.address,
          phone: form.phone,
          is_default_receiving_location: form.is_default_receiving_location,
        });
        setMessage("Stock location updated.");
      } else {
        await createStockLocation({
          code: form.code,
          name: form.name,
          branch: form.branch ? Number(form.branch) : null,
          location_type: form.location_type,
          is_active: form.is_active,
          notes: form.notes,
          address: form.address,
          phone: form.phone,
          is_default_receiving_location: form.is_default_receiving_location,
        });
        setMessage("Stock location created.");
      }
      setForm(EMPTY_FORM);
      await loadPage();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save stock location."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Inventory Master Control"
      title="Stock Locations"
      subtitle="Govern store, warehouse, and showroom stock locations as explicit operational masters separate from product and contract truth."
      helperNote="Stock locations remain inventory-only masters. They do not alter product identity, billing documents, or contract state."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Locations" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryItems, label: "Inventory Items", variant: "secondary" },
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "primary" },
      ]}
      stats={[
        { label: "Total Locations", value: loading ? "—" : pagination.total_count, tone: "info" },
        { label: "Active", value: loading ? "—" : kpiCounts.active, tone: "success" },
        { label: "Warehouses", value: loading ? "—" : kpiCounts.warehouse },
        { label: "Showrooms", value: loading ? "—" : kpiCounts.showroom },
      ]}
      statusBadge={{ label: "Master Data", tone: "info" }}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Use the shared inventory directory to move between stock masters, live stock review, movement registers, and counted stock workflows."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ERPSectionShell
        title={form.id ? "Edit Location" : "Create Location"}
        description="Location codes and names are stock-only masters. Use them for inventory issue, receipt, and daily location visibility."
      >
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Code</span>
              <input
                type="text"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="MAIN"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="Main Showroom"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Location Type</span>
              <select
                value={form.location_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    location_type: event.target.value as StockLocation["location_type"],
                  }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              >
                <option value="STORE">Store</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="SHOWROOM">Showroom</option>
                <option value="QUARANTINE">Quarantine (Damaged/Defective)</option>
                <option value="TRANSIT">Transit (In-Branch Transfer)</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Branch</span>
              <select
                value={form.branch}
                onChange={(event) =>
                  setForm((current) => ({ ...current, branch: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
              >
                <option value="">Primary default</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Physical Address</span>
              <input
                type="text"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({ ...current, address: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="Street address for delivery dispatch and staff navigation"
              />
            </label>
            <label className="grid gap-2 text-sm text-foreground">
              <span className="font-medium">Contact Phone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                disabled={saving}
                className={FIELD_CLASS}
                placeholder="+91 or 10-digit number"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-4">
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm((current) => ({ ...current, is_active: event.target.checked }))
                }
                disabled={saving}
              />
              <span className="font-medium">Location is active for daily stock operations</span>
            </label>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_default_receiving_location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, is_default_receiving_location: event.target.checked }))
                }
                disabled={saving}
              />
              <span className="font-medium">Default receiving dock for supplier deliveries</span>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-foreground">
            <span className="font-medium">Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={3}
              disabled={saving}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Optional operational note"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : form.id ? "Update Location" : "Create Location"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setMessage(null);
                setError(null);
              }}
              disabled={saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Location Register"
        description="Inventory locations are reusable stock masters that inventory items and stock movements can reference safely."
      >
        {/* Search, Filter, and Export Controls */}
        <div className="mb-6 space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by code or name…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPagination(p => ({ ...p, page: 1 }));
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring"
            >
              <option value="">All Types</option>
              <option value="WAREHOUSE">Warehouse</option>
              <option value="STORE">Store</option>
              <option value="SHOWROOM">Showroom</option>
              <option value="QUARANTINE">Quarantine</option>
              <option value="TRANSIT">Transit</option>
            </select>

            {/* Active Filter */}
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPagination(p => ({ ...p, page: 1 }));
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring"
            >
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>

            {/* Export Button */}
            <button
              onClick={() => exportLocationsToCSV(rows, `stock-locations-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={loading || rows.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {/* Table with Pagination */}
        <div className="space-y-4">
          <EnterpriseDataTable
            data={rows}
            columns={columns}
            loading={loading}
            error={error}
            emptyTitle="No stock locations configured"
            emptyDescription="Create at least one active location before relying on stock issues and receipts in daily operations."
          />

          {/* Pagination Controls */}
          {pagination.num_pages > 1 && (
            <div className="flex items-center justify-between gap-4 border-t border-border p-4">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)} to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count} locations
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination(p => ({...p, page: Math.max(1, p.page - 1)}))}
                  disabled={pagination.page === 1 || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, pagination.num_pages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.num_pages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.num_pages - 2) {
                      pageNum = pagination.num_pages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPagination(p => ({...p, page: pageNum}))}
                        className={`h-9 px-3 rounded-md text-sm ${
                          pageNum === pagination.page
                            ? "bg-primary text-primary-foreground"
                            : "border border-input bg-background hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPagination(p => ({...p, page: Math.min(p.num_pages, p.page + 1)}))}
                  disabled={pagination.page === pagination.num_pages || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
