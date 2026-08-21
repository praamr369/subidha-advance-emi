"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
  AccountingPeriodFilters,
} from "@/components/accounting/shared";
import { getAccessToken } from "@/lib/auth/tokens";
import { getStoredSession } from "@/lib/auth/session";
import type { InventoryValuationReport, InventoryValuationRow, StockLocation } from "@/services/inventory";
import { getInventoryValuation, listStockLocations, listInventoryCategories } from "@/services/inventory";

const columns: EnterpriseColumnDef<InventoryValuationRow>[] = [
  { key: "product_code", header: "Product" },
  { key: "product_name", header: "Item" },
  { key: "sku", header: "SKU" },
  { key: "valuation_method", header: "Method" },
  { key: "on_hand_qty", header: "On Hand" },
  { key: "unit_cost", header: "Unit Cost", render: (row) => accountingMoney(row.unit_cost) },
  { key: "stock_value", header: "Stock Value", render: (row) => accountingMoney(row.stock_value) },
];

const today = new Date().toISOString().slice(0, 10);

export default function InventoryValuationPage() {
  const [report, setReport] = useState<InventoryValuationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(today);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");
  const [excludeZero, setExcludeZero] = useState(true);
  const [pageIndex, setPageIndex] = useState(1);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 350);
  const debouncedCategory = useDebounce(category, 350);

  // Load locations on mount
  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      setLocationsLoading(true);
      try {
        const response = await listStockLocations({ is_active: true });
        if (cancelled) return;
        setLocations(response.results || []);
      } catch (err) {
        if (!cancelled) console.error("Failed to load stock locations:", err);
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    }

    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load categories on mount
  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const response = await listInventoryCategories();
        if (cancelled) return;
        setCategories(response.categories || []);
      } catch (err) {
        if (!cancelled) console.error("Failed to load categories:", err);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    }

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load valuation data
  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const payload = await getInventoryValuation({
          as_of_date: asOfDate || undefined,
          search: debouncedSearch || undefined,
          category: debouncedCategory || undefined,
          exclude_zero: excludeZero || undefined,
          stock_location_id: locationId || undefined,
          page: pageIndex,
          page_size: 25,
        });
        if (cancelled) return;
        setReport(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setReport(null);
        setError(accountingErrorMessage(err, "Failed to load inventory valuation."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [asOfDate, debouncedSearch, debouncedCategory, excludeZero, locationId, pageIndex]);

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      // Raw fetch is intentional here: apiFetch parses JSON, but this endpoint
      // returns a CSV blob that must be handled with response.blob().
      const accessToken = getAccessToken() ?? getStoredSession()?.accessToken ?? null;
      const response = await fetch(
        `/api/v1/admin/inventory/valuation/?export=csv&as_of_date=${encodeURIComponent(asOfDate)}&search=${encodeURIComponent(debouncedSearch)}&category=${encodeURIComponent(debouncedCategory)}&exclude_zero=${excludeZero ? "true" : "false"}${locationId ? `&stock_location_id=${locationId}` : ""}`,
        {
          credentials: "include",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        }
      );
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory_valuation_${asOfDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed:", err);
      setError("Failed to export CSV");
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="Inventory Valuation Review"
      title="Inventory Valuation"
      subtitle="Current stock value is derived from tracked inventory items and purchase cost foundations without touching product selling-price or EMI contract semantics."
      helperNote="Inventory valuation is a ledger-backed stock review surface. It is not a billing revenue view or an accounting balance substitute."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Valuation" },
      ]}
      stats={[
        { label: "As Of", value: accountingDate(report?.as_of_date || asOfDate), tone: "info" },
        { label: "Rows", value: String(report?.count ?? 0) },
        { label: "Total Value", value: accountingMoney(report?.total_value) },
      ]}
      statusBadge={{ label: "Foundation Only", tone: "warning" }}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Move between valuation, live stock, ledger review, movements, and opening-stock control from one inventory workspace."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <ERPSectionShell title="Valuation Filters" description="Filter the stock valuation snapshot by date, product, location, and stock levels.">
        <div className="flex flex-col gap-4">
          <AccountingPeriodFilters asOf={asOfDate} onAsOfChange={setAsOfDate} />

          <div className="flex flex-wrap items-center gap-4 p-4 border rounded-md bg-muted/20">
            <div className="flex flex-col gap-1.5 min-w-[240px] flex-1">
              <label className="text-sm font-medium text-foreground">Search Products</label>
              <input
                type="text"
                placeholder="Search by SKU, product name, or code..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                disabled={categoriesLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Location</label>
              <select
                disabled={locationsLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={locationId || ""}
                onChange={(e) => {
                  setLocationId(e.target.value ? parseInt(e.target.value) : null);
                  setPageIndex(1);
                }}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="excludeZero"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={excludeZero}
                onChange={(e) => {
                  setExcludeZero(e.target.checked);
                  setPageIndex(1);
                }}
              />
              <label htmlFor="excludeZero" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Hide zero stock
              </label>
            </div>

            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || loading}
              className="h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingCsv ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell title="Valuation Register" description="Read-only valuation rows derived from ledger-backed stock.">
        <div className="space-y-4">
          <EnterpriseDataTable
            data={report?.rows ?? []}
            columns={columns}
            loading={loading}
            error={error}
            emptyTitle="No valuation rows found"
            emptyDescription="Create inventory items and post stock movements to produce valuation rows."
          />

          {/* Pagination Controls */}
          {report && report.num_pages > 1 && (
            <div className="flex items-center justify-between gap-4 p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min((pageIndex - 1) * 25 + 1, report.count)} to{" "}
                {Math.min(pageIndex * 25, report.count)} of {report.count} items
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPageIndex(Math.max(1, pageIndex - 1))}
                  disabled={pageIndex === 1 || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, report.num_pages) }, (_, i) => {
                    let pageNum: number;
                    if (report.num_pages <= 5) {
                      pageNum = i + 1;
                    } else if (pageIndex <= 3) {
                      pageNum = i + 1;
                    } else if (pageIndex >= report.num_pages - 2) {
                      pageNum = report.num_pages - 4 + i;
                    } else {
                      pageNum = pageIndex - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPageIndex(pageNum)}
                        className={`h-9 px-3 rounded-md text-sm ${
                          pageNum === pageIndex
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
                  onClick={() => setPageIndex(Math.min(report.num_pages, pageIndex + 1))}
                  disabled={pageIndex === report.num_pages || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
