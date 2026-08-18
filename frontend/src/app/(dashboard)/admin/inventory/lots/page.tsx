"use client";

import { useEffect, useState, useCallback } from "react";
import { Printer, Download, ChevronLeft, ChevronRight, Loader2, Search, Filter } from "lucide-react";

import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { useDebounce } from "@/hooks/useDebounce";
import {
  listLots,
  exportLotsCSV,
  downloadCSV,
  type LotTrackingResult,
  type LotTrackingListResponse,
} from "@/services/inventory";

function openPrintLotLabel(lotCode: string, productName: string, barcode: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Lot Label - ${lotCode}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; }
    .label { width: 4in; height: 3in; border: 1px solid #000; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
    .lot-code { font-size: 16px; font-weight: bold; color: #d32f2f; margin-bottom: 4px; }
    .product-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 8px; }
    .tracking-label { font-weight: bold; font-size: 10px; margin-bottom: 2px; }
    .tracking-value { font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; word-break: break-all; background: #f5f5f5; padding: 3px; border-radius: 2px; }
    @media print { body { margin: 0; padding: 0; } }
  </style>
</head>
<body>
  <div class="label">
    <div>
      <div class="lot-code">${lotCode}</div>
      <div class="product-name">${productName}</div>
    </div>
    ${barcode ? `<div><div class="tracking-label">Barcode:</div><div class="tracking-value">${barcode}</div></div>` : ""}
  </div>
</body>
</html>`);
  printWindow.document.close();
  printWindow.print();
}

const STATUS_OPTIONS = ["ACTIVE", "DEPLETED", "QUARANTINED", "EXPIRED"];

export default function InventoryLotsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [data, setData] = useState<LotTrackingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 350);

  const loadLots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listLots({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      });
      setData(response);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load lots."));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadLots();
  }, [loadLots]);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const blob = await exportLotsCSV({
        search: searchQuery || undefined,
        status: statusFilter || undefined,
      });
      downloadCSV(blob, `lots-${new Date().toISOString().split("T")[0]}.csv`);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to export CSV."));
    } finally {
      setExporting(false);
    }
  };

  const rows: LotTrackingResult[] = data?.results ?? [];
  const totalPages = data?.num_pages ?? 0;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Lot Tracking"
      subtitle="Server-side paginated lot register with search, status filter, and CSV export."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Lots" },
      ]}
      statusBadge={{ label: "Enterprise", tone: "info" }}
      stats={[
        { label: "Total Lots", value: loading ? "—" : (data?.summary?.total_lots ?? 0), tone: "info" },
        { label: "Active", value: loading ? "—" : (data?.summary?.active_lots ?? 0), tone: "success" },
        {
          label: "Critical",
          value: loading ? "—" : (data?.summary?.critical_shortage_count ?? 0),
          tone: (data?.summary?.critical_shortage_count ?? 0) > 0 ? "warning" : "default",
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

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search lot code, product, SKU, or barcode…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                className="w-full pl-9 pr-4 py-2 border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-card hover:bg-muted text-sm font-medium"
            >
              <Filter className="h-4 w-4" />
              Filters
              {statusFilter && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">1</span>
              )}
            </button>
          </div>

          {filtersOpen && (
            <div className="rounded-lg border bg-card p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              </div>
              {statusFilter && (
                <div className="mt-3 flex justify-end border-t pt-3">
                  <button
                    onClick={() => setStatusFilter("")}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* KPI summary strip */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Qty on Hand</div>
              <div className="text-lg font-semibold">{parseFloat(data.summary.total_quantity).toFixed(0)}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Depleted</div>
              <div className="text-lg font-semibold text-orange-600">{data.summary.depleted_lots}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Quarantined</div>
              <div className="text-lg font-semibold text-destructive">{data.summary.quarantined_lots}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground mb-1">Expired</div>
              <div className="text-lg font-semibold text-destructive">{data.summary.expired_lots}</div>
            </div>
          </div>
        )}

        {/* Export */}
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

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading lots…
            </div>
          ) : !rows.length ? (
            <div className="p-8 text-center text-muted-foreground">
              No lots found. Try adjusting your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lot Code</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU / Barcode</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty on Hand</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Received</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expiry</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{row.lot_code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{row.product_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.product_code}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div>{row.sku || "—"}</div>
                        {row.barcode && <div className="font-mono">{row.barcode}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {parseFloat(row.quantity_on_hand).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <ERPStatusBadge status={row.status} label={row.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.location_name || row.location_code || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {row.source_model ? (
                          <span>
                            {row.source_model}
                            {row.source_id && <span className="ml-1 text-muted-foreground/60">#{row.source_id}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.received_date ? accountingDate(row.received_date) : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {row.expiry_date ? accountingDate(row.expiry_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openPrintLotLabel(row.lot_code, row.product_name || row.product_code, row.barcode)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-background hover:bg-muted text-xs font-medium"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && totalPages > 0 && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
            <div className="text-sm text-muted-foreground">
              Showing {data.range_start}–{data.range_end} of {data.count} lots
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
                  Page {data.page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
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
