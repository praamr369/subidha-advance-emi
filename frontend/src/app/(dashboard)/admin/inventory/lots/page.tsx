"use client";

import { useEffect, useState, useCallback } from "react";
import { Printer, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import LotFiltersPanel from "@/components/admin/inventory/LotFiltersPanel";
import { ROUTES } from "@/lib/routes";
import {
  listLots,
  exportLotsCSV,
  downloadCSV,
  generateLotCode,
  type LotTrackingResult,
  type LotTrackingListResponse,
} from "@/services/inventory";

// Lot Label Printing
function openPrintLotLabel(lotCode: string, productName: string, barcode: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lot Label - ${lotCode}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background: white;
        }
        .label {
          width: 4in;
          height: 3in;
          border: 1px solid #000;
          padding: 12px;
          page-break-after: always;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .lot-code {
          font-size: 16px;
          font-weight: bold;
          color: #d32f2f;
          margin-bottom: 4px;
        }
        .product-name {
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-bottom: 8px;
        }
        .tracking-section {
          font-size: 10px;
          margin-bottom: 4px;
        }
        .tracking-label {
          font-weight: bold;
          font-size: 10px;
          margin-bottom: 2px;
        }
        .tracking-value {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          font-weight: bold;
          word-break: break-all;
          background: #f5f5f5;
          padding: 3px;
          border-radius: 2px;
        }
        @media print {
          body { margin: 0; padding: 0; }
          .label { page-break-after: always; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <div>
          <div class="lot-code">${lotCode}</div>
          <div class="product-name">${productName}</div>
        </div>
        ${
          barcode
            ? `<div>
                 <div class="tracking-section">
                   <div class="tracking-label">Barcode:</div>
                   <div class="tracking-value">${barcode}</div>
                 </div>
               </div>`
            : ""
        }
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

export default function InventoryLotsPage() {
  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Data State
  const [data, setData] = useState<LotTrackingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load lots data
  const loadLots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listLots({
        q: searchQuery,
        status: statusFilter,
        source: sourceFilter,
        priority: priorityFilter,
        page,
        page_size: pageSize,
      });
      setData(response);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load lots."));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, sourceFilter, priorityFilter, page, pageSize]);

  useEffect(() => {
    setPage(1); // Reset to page 1 when filters change
  }, [searchQuery, statusFilter, sourceFilter, priorityFilter]);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const blob = await exportLotsCSV({
        q: searchQuery,
        status: statusFilter,
        source: sourceFilter,
        priority: priorityFilter,
      });
      downloadCSV(blob, `lots-${new Date().toISOString().split("T")[0]}.csv`);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to export CSV."));
    } finally {
      setExporting(false);
    }
  };

  const columns: EnterpriseColumnDef<LotTrackingResult>[] = [
    { key: "lot_code", header: "Lot Code" },
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product" },
    { key: "sku", header: "SKU", render: (row) => row.sku || "—" },
    { key: "barcode", header: "Barcode", render: (row) => row.barcode || "—" },
    { key: "quantity", header: "Qty", render: (row) => parseFloat(row.quantity).toFixed(2) },
    { key: "status", header: "Status", render: (row) => <ERPStatusBadge status={row.status} label={row.status} /> },
    {
      key: "warehouse_code",
      header: "Warehouse",
      render: (row) => row.warehouse_code || "—",
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => (row.created_at ? accountingDate(row.created_at) : "—"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => openPrintLotLabel(row.lot_code, row.product_name || row.product_code, row.barcode)}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      ),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Lot Tracking Enterprise"
      subtitle="Server-side pagination, search, filters, and CSV export for inventory lots."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Lots" },
      ]}
      statusBadge={{ label: "Enterprise", tone: "info" }}
      stats={[
        {
          label: "Total Lots",
          value: loading ? "—" : data?.summary?.total_lots ?? 0,
          tone: "info",
        },
        {
          label: "Active Lots",
          value: loading ? "—" : data?.summary?.active_lots ?? 0,
          tone: "success",
        },
        {
          label: "Critical Shortages",
          value: loading ? "—" : data?.summary?.critical_shortage_count ?? 0,
          tone: data?.summary?.critical_shortage_count ? "warning" : "default",
        },
      ]}
      headerMode="erp"
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Filter Controls */}
        <LotFiltersPanel
          onSearch={setSearchQuery}
          onStatusChange={setStatusFilter}
          onSourceChange={setSourceFilter}
          onPriorityChange={setPriorityFilter}
          isLoading={loading}
        />

        {/* KPI Summary Strip */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Total Quantity</div>
              <div className="text-lg font-semibold">{parseFloat(data.summary.total_quantity).toFixed(0)}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Depleted</div>
              <div className="text-lg font-semibold text-orange-600">{data.summary.depleted_lots}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Quarantined</div>
              <div className="text-lg font-semibold text-red-600">{data.summary.quarantined_lots}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Expired</div>
              <div className="text-lg font-semibold text-red-600">{data.summary.expired_lots}</div>
            </div>
          </div>
        )}

        {/* Export Button */}
        <div className="flex justify-end">
          <button
            onClick={handleExportCSV}
            disabled={exporting || loading || !data?.results?.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        {/* Data Table */}
        <div className="rounded-lg border bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading lots...
            </div>
          ) : !data?.results?.length ? (
            <div className="p-8 text-center text-gray-500">
              No lots found. Try adjusting your filters.
            </div>
          ) : (
            <EnterpriseDataTable<LotTrackingResult> columns={columns} rows={data.results} />
          )}
        </div>

        {/* Pagination Controls */}
        {data && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
            <div className="text-sm text-gray-600">
              Showing {data.range_start} to {data.range_end} of {data.count} lots
              {searchQuery && ` (filtered)`}
            </div>

            <div className="flex items-center gap-4">
              {/* Page Size Selector */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                disabled={loading}
                className="px-3 py-1 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              {/* Pagination Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={loading || !data.has_previous}
                  className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="text-sm text-gray-600 px-2">
                  Page {data.page} of {data.num_pages}
                </div>

                <button
                  onClick={() => setPage(Math.min(data.num_pages, page + 1))}
                  disabled={loading || !data.has_next}
                  className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
