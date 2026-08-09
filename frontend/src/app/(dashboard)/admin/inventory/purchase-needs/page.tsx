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
import { getBulkPurchaseNeeds, updatePurchaseNeedStatus, type PurchaseNeedsRow, type PurchaseNeedsPayload } from "@/services/direct-sale-workspace";

// Export to CSV helper
function exportPurchaseNeedsToCSV(rows: PurchaseNeedsRow[], filename: string = "purchase-needs.csv") {
  const headers = ["Need No", "Product", "Source", "Customer", "Required Qty", "Available Qty", "Shortage Qty", "Priority", "Status", "Created"];
  const csvContent = [
    headers.join(","),
    ...rows.map(row =>
      [
        row.need_no || "",
        row.product_name || "",
        row.source_module || "",
        row.customer_name || "",
        row.required_quantity || "0.000",
        row.available_quantity || "0.000",
        row.shortage_quantity || "0.000",
        row.priority || "",
        row.status || "",
        row.created_at || "",
      ].map(field => `"${String(field).replace(/"/g, '""')}"`)
      .join(",")
    )
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

export default function AdminInventoryPurchaseNeedsPage() {
  const [rows, setRows] = useState<PurchaseNeedsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  // Pagination & Filter State
  const [pagination, setPagination] = useState({ page: 1, page_size: 50, total_count: 0, num_pages: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [summary, setSummary] = useState({ total_open: 0, total_all: 0, by_source: {} as Record<string, number> });
  const debouncedSearch = useDebounce(searchQuery, 350);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = (await getBulkPurchaseNeeds({
        page: pagination.page,
        page_size: pagination.page_size,
        search: debouncedSearch || undefined,
        source_module: sourceFilter || undefined,
      })) as PurchaseNeedsPayload;

      setRows(payload.results ?? []);
      setSummary(payload.summary ?? { total_open: 0, total_all: 0, by_source: {} });
      setPagination(prev => ({
        ...prev,
        total_count: payload.count,
        num_pages: payload.num_pages,
      }));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load purchase needs.");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.page_size, debouncedSearch, sourceFilter]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleStatusChange = async (needId: number, newStatus: string) => {
    setUpdating(needId);
    try {
      await updatePurchaseNeedStatus(needId, newStatus);
      // Reload the page to reflect changes
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setUpdating(null);
    }
  };

  const columns: EnterpriseColumnDef<PurchaseNeedsRow>[] = [
    { key: "need_no", header: "Need No", width: "100px" },
    { key: "product_name", header: "Product", width: "200px" },
    {
      key: "source_module",
      header: "Source",
      width: "120px",
      render: (row) => {
        const sourceMap: Record<string, string> = {
          DIRECT_SALE: "Direct Sale",
          WINNER_DELIVERY: "Winner",
          SUBSCRIPTION_DEMAND: "Subscription",
          GENERAL: "General",
        };
        return sourceMap[row.source_module] || row.source_module;
      },
    },
    { key: "customer_name", header: "Customer", width: "150px" },
    {
      key: "required_quantity",
      header: "Required Qty",
      width: "100px",
      render: (row) => parseFloat(row.required_quantity).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    {
      key: "available_quantity",
      header: "Available Qty",
      width: "100px",
      render: (row) => parseFloat(row.available_quantity).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    {
      key: "shortage_quantity",
      header: "Shortage Qty",
      width: "100px",
      render: (row) => parseFloat(row.shortage_quantity).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    },
    {
      key: "priority",
      header: "Priority",
      width: "80px",
      render: (row) => {
        const priorityColor: Record<string, string> = {
          LOW: "text-blue-600 font-medium",
          MEDIUM: "text-yellow-600 font-medium",
          HIGH: "text-orange-600 font-medium",
          URGENT: "text-red-600 font-medium",
        };
        return <span className={priorityColor[row.priority] || ""}>{row.priority}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (row) => {
        const statusColor: Record<string, string> = {
          OPEN: "bg-red-100 text-red-800",
          ORDER_PLACED: "bg-blue-100 text-blue-800",
          DISMISSED: "bg-gray-100 text-gray-800",
          RESOLVED: "bg-green-100 text-green-800",
          FULFILLED: "bg-green-100 text-green-800",
          CANCELLED: "bg-red-100 text-red-800",
        };
        return (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[row.status] || "bg-gray-100 text-gray-800"}`}>
            {row.status}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      width: "180px",
      render: (row: PurchaseNeedsRow) => (
        <div className="flex flex-wrap gap-1.5">
          {row.status === "OPEN" && (
            <>
              <button
                onClick={() => handleStatusChange(row.id, "ORDER_PLACED")}
                disabled={updating === row.id || loading}
                className="whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title="Mark as Order Placed"
              >
                {updating === row.id ? "..." : "Order"}
              </button>
              <button
                onClick={() => handleStatusChange(row.id, "DISMISSED")}
                disabled={updating === row.id || loading}
                className="whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                title="Dismiss this alert"
              >
                Dismiss
              </button>
            </>
          )}
          {row.status === "ORDER_PLACED" && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              ✓ Ordered
            </span>
          )}
          {row.status === "DISMISSED" && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              —
            </span>
          )}
          {(row.status === "FULFILLED" || row.status === "RESOLVED") && (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              ✓ Done
            </span>
          )}
          {row.status === "CANCELLED" && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
              ✗ Cancelled
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Inventory Purchase Needs"
      subtitle="Required products and inventory needs generated from direct sales and other demand sources. Mark alerts as 'Ordered' or 'Dismissed' to manage the backlog."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Purchase Needs" },
      ]}
      stats={[
        { label: "Open Alerts", value: String(summary.total_open), tone: summary.total_open > 0 ? "warning" : "success" },
        { label: "Total Needs", value: String(summary.total_all), tone: "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell
        title="Required Products / Inventory Needs"
        description="Operational workbench with enterprise filtering, pagination, and action buttons. Update alert status to manage procurement workflow."
      >
        {/* Search, Filter, and Export Controls */}
        <div className="mb-6 space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
          {/* Row 1: Search Bar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by customer name or product…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Row 2: Source Filter & Export */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPagination(p => ({ ...p, page: 1 }));
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">All Sources</option>
              <option value="DIRECT_SALE">Direct Sales</option>
              <option value="WINNER_DELIVERY">Winner Deliveries</option>
              <option value="SUBSCRIPTION_DEMAND">Subscriptions/EMI</option>
              <option value="GENERAL">General</option>
            </select>

            {/* Export Button */}
            <button
              onClick={() => exportPurchaseNeedsToCSV(rows, `purchase-needs-${new Date().toISOString().slice(0, 10)}.csv`)}
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
          {loading ? <ERPLoadingState label="Loading purchase needs..." /> : null}
          {!loading && error ? <ERPErrorState title="Unable to load purchase needs" description={error} /> : null}
          {!loading && !error ? (
            <>
              <EnterpriseDataTable
                data={rows}
                columns={columns}
                emptyTitle="No purchase needs"
                emptyDescription={sourceFilter ? "No alerts matching this source." : "No open inventory requirements at the moment."}
              />

              {/* Pagination Controls */}
              {pagination.num_pages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-border p-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {Math.min((pagination.page - 1) * pagination.page_size + 1, pagination.total_count)} to {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count} needs
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
