"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import { ROUTES } from "@/lib/routes";
import { listStockReservations, exportStockReservationsToCSV, type StockReservationRow, type StockReservationSummary } from "@/services/inventory";
import { accountingErrorMessage } from "@/components/accounting/shared";

interface StockReservationPayload {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  summary: StockReservationSummary;
  results: StockReservationRow[];
}

export default function AdminInventoryReservationsPage() {
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [rows, setRows] = useState<StockReservationRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 350);

  const [filters, setFilters] = useState({ status: "", source_module: "" });
  const [summary, setSummary] = useState<StockReservationSummary | null>(null);
  const [sourceModules, setSourceModules] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function loadPage() {
    setLoading(true);
    try {
      const payload = await listStockReservations({
        page: pagination.page,
        page_size: pagination.page_size,
        q: debouncedSearch || undefined,
        status: filters.status || undefined,
        source_module: filters.source_module || undefined,
      });
      setRows(payload.results);
      setSummary(payload.summary);
      setSourceModules(payload.summary.source_modules);
      setPagination({
        page: payload.count > 0 ? pagination.page : 1,
        page_size: pagination.page_size,
        total_count: payload.count,
        num_pages: payload.num_pages,
      });
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load stock reservations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [pagination.page, debouncedSearch, filters.status, filters.source_module]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportStockReservationsToCSV({
        q: searchQuery,
        status: filters.status,
        source_module: filters.source_module,
      });
    } catch (err) {
      alert(accountingErrorMessage(err, "Export failed."));
    } finally {
      setExporting(false);
    }
  }

  const columns: EnterpriseColumnDef<StockReservationRow>[] = [
    { key: "id", header: "ID", render: (row) => `#${row.id}` },
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product" },
    { key: "warehouse_name", header: "Warehouse" },
    { key: "quantity", header: "Qty Reserved" },
    { key: "source_module", header: "Source Module" },
    { key: "source_object_id", header: "Source ID" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <ERPStatusBadge
          status={row.status}
          label={row.status}
        />
      ),
    },
    { key: "created_by_username", header: "Created By" },
    {
      key: "created_at",
      header: "Created",
      render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString() : "—",
    },
    { key: "note", header: "Note" },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Stock Reservations"
      subtitle="Active and historical stock reservations by item and purpose. Read-only visibility."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Reservations" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Reservations", value: summary?.total_reservations ?? "—", tone: "info" },
        { label: "Total Qty Reserved", value: summary?.total_reserved_qty ?? "—", tone: "default" },
        { label: "Active Reservations", value: summary?.active_count ?? "—", tone: "success" },
        { label: "Released", value: summary?.released_count ?? "—", tone: "warning" },
      ]}
    >
      <ERPAuditNote title="Read-only" tone="info">
        Stock reservations are system-managed. To release a reservation, use the relevant
        source workflow (delivery, subscription, or direct-sale).
      </ERPAuditNote>

      <ERPSectionShell
        title="Reservation Register"
        description="Track inventory reserved for pending orders, subscriptions, and other business purposes."
      >
        {/* Search & Filters Bar */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[240px]">
              <label htmlFor="f-search" className="text-sm font-medium text-foreground">Search</label>
              <input id="f-search"
                type="text"
                placeholder="Search by product, warehouse, or source ID…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              />
            </div>

            <div className="min-w-[180px]">
              <label htmlFor="f-status" className="text-sm font-medium text-foreground">Status</label>
              <select id="f-status"
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="RELEASED">Released</option>
              </select>
            </div>

            <div className="min-w-[180px]">
              <label htmlFor="f-source-module" className="text-sm font-medium text-foreground">Source Module</label>
              <select id="f-source-module"
                value={filters.source_module}
                onChange={(e) => {
                  setFilters({ ...filters, source_module: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              >
                <option value="">All Sources</option>
                {sourceModules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              className="h-10 px-4 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Data Table */}
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No stock reservations found"
          emptyDescription="No reservations match the current filters."
        />

        {/* Pagination Controls */}
        {pagination.num_pages > 1 && (
          <div className="flex items-center justify-between gap-4 p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)}{" "}
              to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{" "}
              {pagination.total_count} reservations
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
      </ERPSectionShell>
    </ERPPageShell>
  );
}
