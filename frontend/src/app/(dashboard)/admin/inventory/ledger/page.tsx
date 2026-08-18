"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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

const MOVEMENT_TYPE_OPTIONS = [
  { value: "OPENING_BALANCE_IN", label: "Opening Balance In" },
  { value: "PURCHASE_IN", label: "Purchase In" },
  { value: "PURCHASE_RECEIVE", label: "Purchase Receive" },
  { value: "SALE_OUT", label: "Sale Out" },
  { value: "EMI_DELIVERY_OUT", label: "EMI Delivery Out" },
  { value: "EMI_RETURN_IN", label: "EMI Return In" },
  { value: "CUSTOMER_RETURN", label: "Customer Return" },
  { value: "SALE_RETURN_IN", label: "Sale Return In" },
  { value: "PRODUCTION_ISSUE_OUT", label: "Production Issue Out" },
  { value: "PRODUCTION_RETURN_IN", label: "Production Return In" },
  { value: "PRODUCTION_RECEIPT_IN", label: "Production Receipt In" },
  { value: "PRODUCTION_OUTPUT", label: "Production Output" },
  { value: "PURCHASE_RETURN_OUT", label: "Purchase Return Out" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
  { value: "TRANSFER_IN", label: "Transfer In" },
  { value: "TRANSFER_OUT", label: "Transfer Out" },
  { value: "DAMAGE", label: "Damage" },
  { value: "STOCK_ADJUSTMENT", label: "Stock Adjustment" },
];

function QtyCell({ row }: { row: StockLedgerResult }) {
  const inQty = parseFloat(row.quantity_in || "0");
  const outQty = parseFloat(row.quantity_out || "0");
  if (inQty > 0 && outQty > 0) {
    return (
      <span className="text-xs">
        <span className="text-green-600 font-semibold">+{inQty.toFixed(2)}</span>
        {" / "}
        <span className="text-red-600 font-semibold">−{outQty.toFixed(2)}</span>
      </span>
    );
  }
  if (inQty > 0) return <span className="text-green-600 font-semibold">+{inQty.toFixed(2)}</span>;
  if (outQty > 0) return <span className="text-red-600 font-semibold">−{outQty.toFixed(2)}</span>;
  return <span className="text-muted-foreground">—</span>;
}

export default function StockLedgerPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [movementType, setMovementType] = useState("");
  const [referenceModel, setReferenceModel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [data, setData] = useState<StockLedgerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listStockLedger({
        search: searchQuery || undefined,
        movement_type: movementType || undefined,
        reference_model: referenceModel || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: pageSize,
      });
      setData(response);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load ledger."));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, movementType, referenceModel, startDate, endDate, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, movementType, referenceModel, startDate, endDate]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const blob = await exportStockLedgerCSV({
        search: searchQuery || undefined,
        movement_type: movementType || undefined,
        reference_model: referenceModel || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      downloadCSV(blob, `stock-ledger-${new Date().toISOString().split("T")[0]}.csv`);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to export CSV."));
    } finally {
      setExporting(false);
    }
  };

  const rows: StockLedgerResult[] = data?.results ?? [];

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
        <div className="border rounded-lg p-4 bg-card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Search</label>
              <input
                type="text"
                placeholder="Product, SKU, reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Movement Type</label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
              >
                <option value="">All Types</option>
                {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Reference Model</label>
              <input
                type="text"
                placeholder="e.g. BillingInvoiceLine, StockAdjustment"
                value={referenceModel}
                onChange={(e) => setReferenceModel(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* KPI Summary Strip */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Inbound</div>
              <div className="text-lg font-semibold text-green-600">
                +{parseFloat(data.summary.total_inbound).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Outbound</div>
              <div className="text-lg font-semibold text-red-600">
                −{parseFloat(data.summary.total_outbound).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4">
              <div className="text-xs text-muted-foreground mb-1">Net Change</div>
              <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                {parseFloat(data.summary.net_change) >= 0 ? "+" : ""}
                {parseFloat(data.summary.net_change).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Period</div>
              <div className="text-sm font-semibold text-foreground">{data.summary.period}</div>
            </div>
          </div>
        )}

        {/* Export Button */}
        <div className="flex justify-end">
          <button
            onClick={() => void handleExportCSV()}
            disabled={exporting || loading || !rows.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>

        {/* Data Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading ledger...
            </div>
          ) : !rows.length ? (
            <div className="p-8 text-center text-muted-foreground">
              No transactions found. Try adjusting your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Movement</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reference</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.movement_date ? accountingDate(row.movement_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.product_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.product_code}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.sku || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                          {row.movement_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <QtyCell row={row} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.stock_location || "—"}</td>
                      <td className="px-4 py-3">
                        {row.reference_model ? (
                          <span className="text-xs">
                            <span className="font-medium">{row.reference_model}</span>
                            {row.reference_id && (
                              <span className="text-muted-foreground"> #{row.reference_id}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                        {row.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground">
              Showing {data.range_start} to {data.range_end} of {data.count} transactions
              {searchQuery && " (filtered)"}
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
                  disabled={loading || !data.has_previous}
                  className="p-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {data.page} of {data.num_pages}
                </span>
                <button
                  onClick={() => setPage(Math.min(data.num_pages, page + 1))}
                  disabled={loading || !data.has_next}
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
