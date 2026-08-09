"use client";

import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Download, Search } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { getBulkDemandPlanning, type DemandPlanningRow, type DemandPlanningPayload } from "@/services/inventory";

// Export to CSV helper
function exportDemandPlanningToCSV(rows: DemandPlanningRow[], filename: string = "demand-planning.csv") {
  const headers = ["SKU", "Product Code", "Product Name", "On Hand", "Active Subscriptions", "Locked Batch", "Winners Pending", "Direct Sales", "Rent/Lease", "Total Required", "Shortage"];
  const csvContent = [
    headers.join(","),
    ...rows.map(row => {
      const onHand = parseFloat(row.on_hand);
      const totalRequired = parseFloat(row.total_required);
      const shortage = Math.max(0, totalRequired - onHand);
      return [
        row.sku || "",
        row.product_code || "",
        row.product_name || "",
        row.on_hand || "0.000",
        row.active_subscriptions || "0",
        row.locked_batch_demand || "0",
        row.winners_pending_delivery || "0",
        row.direct_sale_orders || "0",
        row.rent_lease_commitments || "0",
        row.total_required || "0.000",
        shortage.toFixed(3),
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
    })
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

export default function AdminInventoryDemandPlanningPage() {
  const [rows, setRows] = useState<DemandPlanningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filter State
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [criticalShortageOnly, setCriticalShortageOnly] = useState(false);
  const [demandSources, setDemandSources] = useState<Set<string>>(new Set(["subscriptions", "direct_sales", "rent_lease"])); // All selected by default
  const debouncedSearch = useDebounce(searchQuery, 350);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const demandSourcesArray = Array.from(demandSources);
      const payload = (await getBulkDemandPlanning({
        page: pagination.page,
        page_size: pagination.page_size,
        search: debouncedSearch || undefined,
        critical_shortage: criticalShortageOnly ? "true" : undefined,
        demand_sources: demandSourcesArray.length > 0 ? demandSourcesArray.join(",") : undefined,
      })) as DemandPlanningPayload;

      setRows(payload.results ?? []);
      setPagination(prev => ({
        ...prev,
        total_count: payload.count,
        num_pages: payload.num_pages,
      }));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load demand planning.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.page_size, debouncedSearch, criticalShortageOnly, demandSources]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const columns: EnterpriseColumnDef<DemandPlanningRow>[] = [
    { key: "sku", header: "SKU" },
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product Name" },
    {
      key: "on_hand",
      header: "On Hand",
      render: (row) => parseFloat(row.on_hand).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    {
      key: "active_subscriptions",
      header: "Active Subs",
      render: (row) => row.active_subscriptions || "—",
    },
    {
      key: "locked_batch_demand",
      header: "Locked Batch",
      render: (row) => row.locked_batch_demand || "—",
    },
    {
      key: "winners_pending_delivery",
      header: "Winners",
      render: (row) => row.winners_pending_delivery || "—",
    },
    {
      key: "direct_sale_orders",
      header: "Direct Sales",
      render: (row) => row.direct_sale_orders || "—",
    },
    {
      key: "rent_lease_commitments",
      header: "Rent/Lease",
      render: (row) => row.rent_lease_commitments || "—",
    },
    {
      key: "total_required",
      header: "Total Required",
      render: (row) => parseFloat(row.total_required).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    {
      key: "shortage",
      header: "Shortage",
      render: (row) => {
        const shortage = Math.max(0, parseFloat(row.total_required) - parseFloat(row.on_hand));
        return shortage > 0
          ? `${shortage.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
          : "✓ In Stock";
      },
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Inventory Demand Planning"
      subtitle="Enterprise demand projection from active subscriptions, locked batches, winners, direct sales, and rent/lease commitments. Single database query per page (no N+1 API calls)."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Demand Planning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Products", value: loading ? "—" : pagination.total_count, tone: "info" },
        { label: "Current Page", value: loading ? "—" : rows.length, tone: "default" },
      ]}
    >
      <ERPSectionShell
        title="Demand by Product"
        description="Projection only. No finance or posting behavior is mutated by this register. Uses 1 bulk API call per page load instead of 100 concurrent requests."
      >
        {/* Search, Filter, and Export Controls */}
        <div className="mb-6 space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
          {/* Row 1: Search Bar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by SKU, product code, or name…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Row 2: Demand Source Filters, Critical Shortage, Export */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
            {/* Demand Source Filters */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm font-medium text-muted-foreground">Demand:</span>
              <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={demandSources.has("subscriptions")}
                  onChange={(e) => {
                    const newSources = new Set(demandSources);
                    if (e.target.checked) {
                      newSources.add("subscriptions");
                    } else {
                      newSources.delete("subscriptions");
                    }
                    setDemandSources(newSources);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Subscriptions/EMI</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={demandSources.has("direct_sales")}
                  onChange={(e) => {
                    const newSources = new Set(demandSources);
                    if (e.target.checked) {
                      newSources.add("direct_sales");
                    } else {
                      newSources.delete("direct_sales");
                    }
                    setDemandSources(newSources);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Direct Sales</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                <input
                  type="checkbox"
                  checked={demandSources.has("rent_lease")}
                  onChange={(e) => {
                    const newSources = new Set(demandSources);
                    if (e.target.checked) {
                      newSources.add("rent_lease");
                    } else {
                      newSources.delete("rent_lease");
                    }
                    setDemandSources(newSources);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Rent/Lease</span>
              </label>
            </div>

            {/* Critical Shortage Toggle */}
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm cursor-pointer hover:bg-muted transition">
              <input
                type="checkbox"
                checked={criticalShortageOnly}
                onChange={(e) => {
                  setCriticalShortageOnly(e.target.checked);
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="h-4 w-4"
              />
              <span className="font-medium">Critical Shortage Only</span>
            </label>

            {/* Export Button */}
            <button
              onClick={() => exportDemandPlanningToCSV(rows, `demand-planning-${new Date().toISOString().slice(0, 10)}.csv`)}
              disabled={loading || rows.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 ml-auto"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {/* Table with Pagination */}
        <div className="space-y-4">
          {loading ? <ERPLoadingState label="Loading demand planning..." /> : null}
          {!loading && error ? <ERPErrorState title="Unable to load demand planning" description={error} /> : null}
          {!loading && !error ? (
            <>
              <EnterpriseDataTable
                data={rows}
                columns={columns}
                emptyTitle="No demand rows"
                emptyDescription={criticalShortageOnly ? "No products with critical shortages found." : "No stock-tracked products were found."}
              />

              {/* Pagination Controls */}
              {pagination.num_pages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-border p-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)} to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count} products
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
            </>
          ) : null}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
