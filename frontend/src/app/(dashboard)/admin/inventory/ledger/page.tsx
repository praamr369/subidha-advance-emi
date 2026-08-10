// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listStockLedger,
  exportStockLedgerCSV,
  downloadCSV,
  type StockLedgerResult,
  type StockLedgerListResponse,
} from "@/services/inventory";

export default function StockLedgerPage() {
  // Pagination & Filter State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [referenceType, setReferenceType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Data State
  const [data, setData] = useState<StockLedgerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load ledger data
  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listStockLedger({
        q: searchQuery,
        transaction_type: transactionType,
        reference_type: referenceType,
        date_from: dateFrom,
        date_to: dateTo,
        page,
        page_size: pageSize,
      });
      setData(response);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load ledger."));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, transactionType, referenceType, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    setPage(1); // Reset to page 1 when filters change
  }, [searchQuery, transactionType, referenceType, dateFrom, dateTo]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const blob = await exportStockLedgerCSV({
        q: searchQuery,
        transaction_type: transactionType,
        reference_type: referenceType,
        date_from: dateFrom,
        date_to: dateTo,
      });
      downloadCSV(blob, `stock-ledger-${new Date().toISOString().split("T")[0]}.csv`);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to export CSV."));
    } finally {
      setExporting(false);
    }
  };

  const columns: EnterpriseColumnDef<StockLedgerResult>[] = [
    {
      key: "created_at",
      header: "Date",
      render: (row) => (row.created_at ? accountingDate(row.created_at) : "—"),
    },
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product" },
    { key: "sku", header: "SKU", render: (row) => row.sku || "—" },
    { key: "transaction_type", header: "Type" },
    {
      key: "quantity",
      header: "Qty",
      render: (row) => {
        const isOutbound = ["DISPATCH", "RETURN"].includes(row.transaction_type);
        return (
          <span className={isOutbound ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
            {isOutbound ? "−" : "+"}
            {parseFloat(row.quantity).toFixed(2)}
          </span>
        );
      },
    },
    { key: "reference_type", header: "Ref Type", render: (row) => row.reference_type || "—" },
    {
      key: "reference_display",
      header: "Reference",
      render: (row) => (
        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
          {row.reference_display || "—"}
        </code>
      ),
    },
    {
      key: "warehouse_code",
      header: "Warehouse",
      render: (row) => row.warehouse_code || "—",
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Stock Ledger (Immutable Log)"
      subtitle="Immutable transaction history with KPI summary and reference traceability."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Ledger" },
      ]}
      statusBadge={{ label: "Audit Trail", tone: "info" }}
      stats={[
        {
          label: "Total Inbound",
          value: loading ? "—" : data?.summary?.total_inbound ? parseFloat(data.summary.total_inbound).toFixed(0) : "0",
          tone: "success",
        },
        {
          label: "Total Outbound",
          value: loading ? "—" : data?.summary?.total_outbound ? parseFloat(data.summary.total_outbound).toFixed(0) : "0",
          tone: "warning",
        },
        {
          label: "Net Change",
          value: loading ? "—" : data?.summary?.net_change ? parseFloat(data.summary.net_change).toFixed(0) : "0",
          tone: "info",
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
        <div className="border rounded-lg p-4 bg-white space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                placeholder="Product, SKU, reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            {/* Transaction Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">All Types</option>
                <option value="RECEIPT">Receipt (Inbound)</option>
                <option value="DISPATCH">Dispatch (Outbound)</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="RETURN">Return</option>
              </select>
            </div>

            {/* Reference Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Reference Type</label>
              <select
                value={referenceType}
                onChange={(e) => setReferenceType(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">All References</option>
                <option value="INVOICE">Invoice</option>
                <option value="DELIVERY">Delivery</option>
                <option value="PO">Purchase Order</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>

        {/* KPI Summary Strip */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Total Inbound</div>
              <div className="text-lg font-semibold text-green-600">
                +{parseFloat(data.summary.total_inbound).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Total Outbound</div>
              <div className="text-lg font-semibold text-red-600">
                −{parseFloat(data.summary.total_outbound).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4 border-blue-200 bg-blue-50">
              <div className="text-xs text-gray-600 mb-1">Net Change</div>
              <div className="text-lg font-semibold text-blue-700">
                {parseFloat(data.summary.net_change) >= 0 ? "+" : ""}
                {parseFloat(data.summary.net_change).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-gray-600 mb-1">Period</div>
              <div className="text-sm font-semibold text-gray-900">{data.summary.period}</div>
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
              Loading ledger...
            </div>
          ) : !data?.results?.length ? (
            <div className="p-8 text-center text-gray-500">
              No transactions found. Try adjusting your filters.
            </div>
          ) : (
            <EnterpriseDataTable<StockLedgerResult> columns={columns} rows={data.results} />
          )}
        </div>

        {/* Pagination Controls */}
        {data && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-white">
            <div className="text-sm text-gray-600">
              Showing {data.range_start} to {data.range_end} of {data.count} transactions
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
