"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { apiFetch } from "@/lib/api";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import { ROUTES } from "@/lib/routes";
import { listServiceCatalog, exportServiceCatalogToCSV, type ServiceCatalogItem, type ServiceCatalogSummary } from "@/services/inventory";
import { accountingErrorMessage } from "@/components/accounting/shared";

interface ServiceCatalogPayload {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  summary: ServiceCatalogSummary;
  results: ServiceCatalogItem[];
}

export default function ServiceCatalogPage() {
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [rows, setRows] = useState<ServiceCatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 350);

  const [filters, setFilters] = useState({ status: "", category: "", service_type: "" });
  const [summary, setSummary] = useState<ServiceCatalogSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [serviceTypes, setServiceTypes] = useState<Array<{ value: string; label: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function loadPage() {
    setLoading(true);
    try {
      const payload = await listServiceCatalog({
        page: pagination.page,
        page_size: pagination.page_size,
        q: debouncedSearch || undefined,
        status: filters.status || undefined,
        category: filters.category || undefined,
        service_type: filters.service_type || undefined,
      });
      setRows(payload.results);
      setSummary(payload.summary);
      setCategories(payload.summary.categories);
      setServiceTypes(payload.summary.service_types);
      setPagination({
        page: payload.count > 0 ? pagination.page : 1,
        page_size: pagination.page_size,
        total_count: payload.count,
        num_pages: payload.num_pages,
      });
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load service catalog."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [pagination.page, debouncedSearch, filters.status, filters.category, filters.service_type]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportServiceCatalogToCSV({
        q: searchQuery,
        status: filters.status,
        category: filters.category,
        service_type: filters.service_type,
      });
    } catch (err) {
      alert(accountingErrorMessage(err, "Export failed."));
    } finally {
      setExporting(false);
    }
  }

  const columns: EnterpriseColumnDef<ServiceCatalogItem>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "category", header: "Category" },
    { key: "service_type_label", header: "Type" },
    { key: "standard_price", header: "Standard Price" },
    { key: "tax_rate_percent", header: "Tax %" },
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
    { key: "hsn_sac_code", header: "HSN/SAC Code" },
    { key: "created_at", header: "Created", render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString() : "—" },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Service Catalog"
      subtitle="Admin-managed catalog of services (installation, warranty, maintenance, AMC) that can be linked to finished goods."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Service Catalog" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Services", value: summary?.total_services ?? "—", tone: "info" },
        { label: "Active Services", value: summary?.active_count ?? "—", tone: "success" },
        { label: "Inactive Services", value: summary?.inactive_count ?? "—", tone: "warning" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryFinishedGoods, label: "← Finished Goods", variant: "secondary" },
      ]}
    >
      <ERPAuditNote title="Read-Only Catalog" tone="info">
        Service Catalog is an admin-managed reference. Services are linked to finished goods for billing and ordering purposes.
      </ERPAuditNote>

      <ERPSectionShell
        title="Service Registry"
        description="Browse, search, and export the complete service catalog."
      >
        {/* Search & Filters Bar */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[240px]">
              <label className="text-sm font-medium text-foreground">Search</label>
              <input
                type="text"
                placeholder="Search by code, name, or category…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              />
            </div>

            <div className="min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Status</label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <div className="min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                value={filters.category}
                onChange={(e) => {
                  setFilters({ ...filters, category: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
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
          emptyTitle="No services found"
          emptyDescription="No services match the current filters."
        />

        {/* Pagination Controls */}
        {pagination.num_pages > 1 && (
          <div className="flex items-center justify-between gap-4 p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing{" "}
              {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)}{" "}
              to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{" "}
              {pagination.total_count} services
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
