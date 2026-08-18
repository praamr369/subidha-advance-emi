"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, Printer } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import StockOnHandKPIStrip from "@/components/admin/inventory/StockOnHandKPIStrip";
import { ROUTES } from "@/lib/routes";
import {
  getStockOnHandSummary,
  getCriticalShortages,
  type StockOnHandSummaryResponse,
  type CriticalShortagesListResponse,
  type CriticalShortage,
} from "@/services/inventory";
import { accountingErrorMessage } from "@/components/accounting/shared";

const columns: EnterpriseColumnDef<CriticalShortage>[] = [
  { key: "product_code", header: "Product Code" },
  { key: "product_name", header: "Product Name" },
  { key: "sku", header: "SKU", render: (row) => row.sku || "—" },
  {
    key: "physical_qty",
    header: "Physical Qty",
    render: (row) => parseFloat(row.physical_qty).toFixed(2),
  },
  {
    key: "reorder_point",
    header: "Reorder Point",
    render: (row) => parseFloat(row.reorder_point).toFixed(2),
  },
  {
    key: "shortage_qty",
    header: "Shortage Qty",
    render: (row) => (
      <span className="font-semibold text-destructive">
        {parseFloat(row.shortage_qty).toFixed(2)}
      </span>
    ),
  },
];

export default function StockOnHandPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [summary, setSummary] = useState<StockOnHandSummaryResponse | null>(null);
  const [criticalShortages, setCriticalShortages] = useState<CriticalShortagesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, shortagesData] = await Promise.all([
        getStockOnHandSummary(),
        getCriticalShortages(page, pageSize),
      ]);
      setSummary(summaryData);
      setCriticalShortages(shortagesData);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load stock on hand data."));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePrintLabels = () => {
    const items = criticalShortages?.results;
    if (!items?.length) {
      alert("No items to print.");
      return;
    }

    setPrinting(true);
    try {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Critical Shortages Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: white; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .timestamp { font-size: 12px; color: #666; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    thead { background: #f5f5f5; }
    th { padding: 10px; text-align: left; border-bottom: 2px solid #333; font-weight: bold; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    .critical { color: #d32f2f; font-weight: bold; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Critical Stock Shortages Report</h1>
  <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
  <table>
    <thead>
      <tr>
        <th>Product Code</th>
        <th>Product Name</th>
        <th>SKU</th>
        <th>Physical Qty</th>
        <th>Reorder Point</th>
        <th class="critical">Shortage Qty</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item) => `
        <tr>
          <td>${item.product_code}</td>
          <td>${item.product_name}</td>
          <td>${item.sku || "—"}</td>
          <td>${parseFloat(item.physical_qty).toFixed(2)}</td>
          <td>${parseFloat(item.reorder_point).toFixed(2)}</td>
          <td class="critical">${parseFloat(item.shortage_qty).toFixed(2)}</td>
        </tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    } finally {
      setPrinting(false);
    }
  };

  const totalPages = criticalShortages?.num_pages ?? 0;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Stock on Hand Command Center"
      subtitle="Real-time inventory KPIs and critical shortage alerts."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock on Hand" },
      ]}
      statusBadge={{ label: "Command Center", tone: "info" }}
      stats={[
        {
          label: "Total Physical",
          value: loading ? "—" : summary ? parseFloat(summary.summary.total_physical_qty).toFixed(0) : "0",
          tone: "info",
        },
        {
          label: "Available",
          value: loading ? "—" : summary ? parseFloat(summary.summary.total_available_qty).toFixed(0) : "0",
          tone: "success",
        },
        {
          label: "Critical Alerts",
          value: loading ? "—" : (summary?.summary.critical_shortage_count ?? 0),
          tone: (summary?.summary.critical_shortage_count ?? 0) > 0 ? "warning" : "default",
        },
      ]}
      headerMode="erp"
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* KPI Strip */}
        <StockOnHandKPIStrip summary={summary?.summary ?? null} isLoading={loading} />

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handlePrintLabels}
            disabled={printing || loading || !criticalShortages?.results?.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {printing ? "Printing..." : "Print Report"}
          </button>
        </div>

        {/* Critical Shortages Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="bg-muted/40 p-4 border-b">
            <h2 className="font-semibold text-foreground">
              Critical Shortages ({criticalShortages?.count ?? 0} items)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              SKUs currently below their reorder point.
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading inventory...
            </div>
          ) : !criticalShortages?.results?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="mb-2 font-medium">✓ No critical shortages</div>
              <div className="text-sm">All SKUs are above their reorder points.</div>
            </div>
          ) : (
            <EnterpriseDataTable<CriticalShortage>
              columns={columns}
              data={criticalShortages.results}
            />
          )}
        </div>

        {/* Pagination */}
        {criticalShortages && totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground">
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, criticalShortages.count)} of{" "}
              {criticalShortages.count} critical items
            </div>

            <div className="flex items-center gap-4">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                disabled={loading}
                className="px-3 py-1 text-sm border rounded-md bg-background focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={loading || page === 1}
                  className="p-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={loading || page === totalPages}
                  className="p-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
