"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Download, CheckSquare } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import {
  listInventoryProfiles,
  bulkPrepareProfiles,
  exportInventoryProfilesToCSV,
  type InventoryProfileListRow,
  type StockLocation,
  listStockLocations,
} from "@/services/inventory";

export default function InventoryProfilesPage() {
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [rows, setRows] = useState<InventoryProfileListRow[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 350);

  const [filters, setFilters] = useState({ stock_tracking_enabled: "" });
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkPrepareDialog, setShowBulkPrepareDialog] = useState(false);
  const [bulkPrepareForm, setBulkPrepareForm] = useState({
    default_location_id: "",
    reorder_level_qty: "0.000",
    stock_item_type: "FINISHED_GOOD",
  });
  const [bulkPrepareLoading, setBulkPrepareLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage() {
    setLoading(true);
    try {
      const [profilesPayload, locationPayload] = await Promise.all([
        listInventoryProfiles({
          page: pagination.page,
          page_size: pagination.page_size,
          search: debouncedSearch || undefined,
          stock_tracking_enabled:
            filters.stock_tracking_enabled === "true"
              ? true
              : filters.stock_tracking_enabled === "false"
                ? false
                : undefined,
        }),
        listStockLocations({ is_active: true }),
      ]);
      setRows(profilesPayload.results);
      setSummary(profilesPayload.summary);
      setPagination({
        page: profilesPayload.count > 0 ? pagination.page : 1,
        page_size: pagination.page_size,
        total_count: profilesPayload.count,
        num_pages: profilesPayload.num_pages,
      });
      setLocations(locationPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load inventory profiles."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [pagination.page, debouncedSearch, filters.stock_tracking_enabled]);

  const toggleItemSelection = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.id));
    }
  };

  const handleBulkPrepare = async () => {
    if (selectedIds.length === 0) return;

    setBulkPrepareLoading(true);
    try {
      const result = await bulkPrepareProfiles({
        item_ids: selectedIds,
        default_location_id: bulkPrepareForm.default_location_id
          ? Number(bulkPrepareForm.default_location_id)
          : null,
        reorder_level_qty: bulkPrepareForm.reorder_level_qty,
        stock_item_type: bulkPrepareForm.stock_item_type,
      });

      if (result.success) {
        setMessage(`Successfully prepared ${result.updated_count} profiles.`);
        setSelectedIds([]);
        setShowBulkPrepareDialog(false);
        setBulkPrepareForm({
          default_location_id: "",
          reorder_level_qty: "0.000",
          stock_item_type: "FINISHED_GOOD",
        });
        await loadPage();
      } else {
        setError(`Bulk prepare failed. Updated ${result.updated_count} of ${selectedIds.length} items.`);
      }
    } catch (err) {
      setError(accountingErrorMessage(err, "Bulk prepare failed."));
    } finally {
      setBulkPrepareLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await exportInventoryProfilesToCSV({
        search: debouncedSearch || undefined,
        stock_tracking_enabled:
          filters.stock_tracking_enabled === "true"
            ? true
            : filters.stock_tracking_enabled === "false"
              ? false
              : undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory_profiles_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(accountingErrorMessage(err, "CSV export failed."));
    }
  };

  const columns: EnterpriseColumnDef<InventoryProfileListRow>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={selectedIds.length > 0 && selectedIds.length === rows.length}
          onChange={toggleAllSelection}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.id)}
          onChange={() => toggleItemSelection(row.id)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
      ),
    },
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product" },
    { key: "sku", header: "SKU" },
    {
      key: "stock_item_type",
      header: "Stock Type",
      render: (row) => row.stock_item_type.replaceAll("_", " "),
    },
    {
      key: "default_location_name",
      header: "Default Location",
      render: (row) => row.default_location_name || "Unassigned",
    },
    { key: "reorder_level_qty", header: "Reorder Level" },
    {
      key: "stock_tracking_enabled",
      header: "Tracking",
      render: (row) => (
        <ERPStatusBadge
          status={row.stock_tracking_enabled ? "ACTIVE" : "INACTIVE"}
          label={row.stock_tracking_enabled ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Link
          href={`${ROUTES.admin.inventoryProfiles}/${row.id}`}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          View Profile
        </Link>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory Master Control"
      title="Inventory Profiles"
      subtitle="Prepare stock-trackable product profiles with bulk setup tools for rapid onboarding."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Profiles" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Total Profiles", value: String(summary?.total_profiles ?? "—"), tone: "info" },
        { label: "Tracking Active", value: String(summary?.tracking_active ?? "—"), tone: "success" },
        { label: "Tracking Inactive", value: String(summary?.tracking_inactive ?? "—"), tone: "warning" },
      ]}
    >
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
        title="Profile Register"
        description="Prepare inventory profiles to enable stock tracking per product. Set default locations, reorder controls, and track by lot or expiry."
      >
        {/* Search & Filters Bar */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[240px]">
              <label className="text-sm font-medium text-foreground">Search</label>
              <input
                type="text"
                placeholder="Search by product name, SKU, product code..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              />
            </div>

            <div className="min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Stock Tracking</label>
              <select
                value={filters.stock_tracking_enabled}
                onChange={(e) => {
                  setFilters({ ...filters, stock_tracking_enabled: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              >
                <option value="">All Profiles</option>
                <option value="true">Tracking Active</option>
                <option value="false">Tracking Inactive</option>
              </select>
            </div>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background hover:bg-muted text-sm font-medium"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>

          {/* Bulk Actions Menu */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-4 p-3 border rounded bg-blue-50 dark:bg-blue-950">
              <span className="text-sm font-medium">{selectedIds.length} profiles selected</span>
              <button
                onClick={() => setShowBulkPrepareDialog(true)}
                className="flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                <CheckSquare className="h-4 w-4" /> Prepare Selected
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="flex items-center gap-2 h-9 px-3 rounded-md border border-input hover:bg-muted text-sm"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Data Table */}
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No inventory profiles found"
          emptyDescription="Create inventory profiles from the product workspace to enable stock tracking."
        />

        {/* Pagination Controls */}
        {pagination.num_pages > 1 && (
          <div className="flex items-center justify-between gap-4 p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)}{" "}
              to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{" "}
              {pagination.total_count} profiles
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
                }
                disabled={pagination.page === 1 || loading}
                className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from(
                  { length: Math.min(5, pagination.num_pages) },
                  (_, i) => {
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
                        onClick={() =>
                          setPagination((p) => ({ ...p, page: pageNum }))
                        }
                        className={`h-9 px-3 rounded-md text-sm ${
                          pageNum === pagination.page
                            ? "bg-primary text-primary-foreground"
                            : "border border-input bg-background hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                )}
              </div>
              <button
                onClick={() =>
                  setPagination((p) => ({
                    ...p,
                    page: Math.min(p.num_pages, p.page + 1),
                  }))
                }
                disabled={pagination.page === pagination.num_pages || loading}
                className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Bulk Prepare Dialog */}
        {showBulkPrepareDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-lg border border-border bg-background p-6 shadow-lg w-96">
              <h3 className="text-lg font-semibold mb-4">
                Prepare {selectedIds.length} Profiles
              </h3>

              <div className="space-y-4 mb-6">
                <label className="grid gap-2 text-sm text-foreground">
                  <span className="font-medium">Default Stock Location</span>
                  <select
                    value={bulkPrepareForm.default_location_id}
                    onChange={(e) =>
                      setBulkPrepareForm({
                        ...bulkPrepareForm,
                        default_location_id: e.target.value,
                      })
                    }
                    disabled={bulkPrepareLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">None (Optional)</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} - {loc.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-foreground">
                  <span className="font-medium">Reorder Level Quantity</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={bulkPrepareForm.reorder_level_qty}
                    onChange={(e) =>
                      setBulkPrepareForm({
                        ...bulkPrepareForm,
                        reorder_level_qty: e.target.value,
                      })
                    }
                    disabled={bulkPrepareLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>

                <label className="grid gap-2 text-sm text-foreground">
                  <span className="font-medium">Stock Item Type</span>
                  <select
                    value={bulkPrepareForm.stock_item_type}
                    onChange={(e) =>
                      setBulkPrepareForm({
                        ...bulkPrepareForm,
                        stock_item_type: e.target.value,
                      })
                    }
                    disabled={bulkPrepareLoading}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="FINISHED_GOOD">Finished Good</option>
                    <option value="ACCESSORY">Accessory</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowBulkPrepareDialog(false);
                    setBulkPrepareForm({
                      default_location_id: "",
                      reorder_level_qty: "0.000",
                      stock_item_type: "FINISHED_GOOD",
                    });
                  }}
                  disabled={bulkPrepareLoading}
                  className="h-9 px-4 rounded-md border border-input bg-background hover:bg-muted text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkPrepare}
                  disabled={bulkPrepareLoading}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 text-sm font-medium"
                >
                  {bulkPrepareLoading ? "Preparing..." : "Prepare Profiles"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
