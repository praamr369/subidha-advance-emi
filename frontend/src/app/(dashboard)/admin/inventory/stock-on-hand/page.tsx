"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Boxes,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Loader2,
  Printer,
  Search,
  ShoppingCart,
  Tag,
  Wrench,
  X,
} from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import StockCalculationDrawer from "@/components/admin/inventory/StockCalculationDrawer";
import StockOnHandKPIStrip from "@/components/admin/inventory/StockOnHandKPIStrip";
import RentalAssetsAwaitingRelease from "@/components/customer-intelligence/RentalAssetsAwaitingRelease";
import { ROUTES } from "@/lib/routes";
import { formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getStockOnHandSummary,
  getStockOnHandItems,
  getStockOnHandFacets,
  type StockOnHandSummaryResponse,
  type CriticalShortagesListResponse,
  type CriticalShortage,
  type StockOnHandFacets,
} from "@/services/inventory";
import { accountingErrorMessage } from "@/components/accounting/shared";

export default function StockOnHandPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<string>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [subcategory, setSubcategory] = useState<string>("ALL");
  const [activeAttributeKey, setActiveAttributeKey] = useState<string>("");
  const [activeAttributeValue, setActiveAttributeValue] = useState<string>("");
  const [stockStatus, setStockStatus] = useState<string>("all");

  // Data states
  const [summary, setSummary] = useState<StockOnHandSummaryResponse | null>(null);
  const [stockData, setStockData] = useState<CriticalShortagesListResponse | null>(null);
  const [facets, setFacets] = useState<StockOnHandFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drawer state for math inspection
  const [inspectItemId, setInspectItemId] = useState<number | null>(null);

  // 1. Load Facets
  useEffect(() => {
    let mounted = true;
    getStockOnHandFacets()
      .then((data) => {
        if (!mounted) return;
        setFacets(data);
      })
      .catch(() => {
        // Safe fallback
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Load Stock on Hand Data & Summary
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, itemsRes] = await Promise.all([
        getStockOnHandSummary(),
        getStockOnHandItems({
          page,
          pageSize,
          search: search.trim() || undefined,
          item_type: itemType !== "ALL" ? itemType : undefined,
          category: category !== "ALL" ? category : undefined,
          subcategory: subcategory !== "ALL" ? subcategory : undefined,
          attribute_key: activeAttributeKey || undefined,
          attribute_value: activeAttributeValue || undefined,
          stock_status: stockStatus !== "all" ? stockStatus : undefined,
        }),
      ]);
      setSummary(summaryRes);
      setStockData(itemsRes);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load stock on hand data."));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, itemType, category, subcategory, activeAttributeKey, activeAttributeValue, stockStatus]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Available subcategories filtered by chosen category
  const filteredSubcategories = useMemo(() => {
    if (!facets?.subcategories) return [];
    if (category === "ALL") return facets.subcategories;
    return facets.subcategories;
  }, [facets, category]);

  // Quick Attribute Filter click handler
  const handleToggleAttribute = (key: string, value: string) => {
    setPage(1);
    if (activeAttributeKey === key && activeAttributeValue === value) {
      setActiveAttributeKey("");
      setActiveAttributeValue("");
    } else {
      setActiveAttributeKey(key);
      setActiveAttributeValue(value);
    }
  };

  const clearAllFilters = () => {
    setPage(1);
    setSearch("");
    setItemType("ALL");
    setCategory("ALL");
    setSubcategory("ALL");
    setActiveAttributeKey("");
    setActiveAttributeValue("");
    setStockStatus("all");
  };

  const hasActiveFilters = Boolean(
    search ||
    itemType !== "ALL" ||
    category !== "ALL" ||
    subcategory !== "ALL" ||
    activeAttributeKey ||
    stockStatus !== "all"
  );

  // Printable Report Generation
  const handlePrintLabels = () => {
    const items = stockData?.results;
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
  <title>Stock on Hand &amp; Inventory Valuation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: white; color: #1c1917; }
    h1 { font-size: 20px; margin-bottom: 4px; font-weight: 800; text-transform: uppercase; }
    .subtitle { font-size: 11px; color: #78716c; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
    thead { background: #f5f5f4; }
    th { padding: 8px 6px; text-align: left; border-bottom: 2px solid #44403c; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    td { padding: 6px; border-bottom: 1px solid #e7e5e4; }
    .num { text-align: right; font-family: monospace; }
    .critical { color: #dc2626; font-weight: bold; }
    .healthy { color: #16a34a; font-weight: bold; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Subidha Furniture — Stock on Hand Report</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleString()} · Filter: ${itemType} · Category: ${category}</div>
  <table>
    <thead>
      <tr>
        <th>SKU / Code</th>
        <th>Product Name</th>
        <th>Category</th>
        <th>Specifications</th>
        <th class="num">Physical</th>
        <th class="num">Reserved</th>
        <th class="num">Available</th>
        <th class="num">Standard Cost</th>
        <th class="num">Valuation</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item) => `
        <tr>
          <td><strong>${item.sku || item.product_code}</strong></td>
          <td>${item.product_name}</td>
          <td>${item.category || "—"}</td>
          <td>${item.attributes?.map((a) => `${a.name}: ${a.value}`).join(", ") || "—"}</td>
          <td class="num">${parseFloat(item.physical_qty).toFixed(2)}</td>
          <td class="num">${parseFloat(item.reserved_qty || "0").toFixed(2)}</td>
          <td class="num ${parseFloat(item.available_qty || "0") > 0 ? "healthy" : "critical"}">
            ${parseFloat(item.available_qty || "0").toFixed(2)}
          </td>
          <td class="num">${item.standard_cost ? `₹${parseFloat(item.standard_cost).toFixed(2)}` : "—"}</td>
          <td class="num">${item.valuation_total ? `₹${parseFloat(item.valuation_total).toFixed(2)}` : "—"}</td>
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

  // Grid Columns Definition
  const columns: EnterpriseColumnDef<CriticalShortage>[] = useMemo(
    () => [
      {
        key: "sku",
        header: "SKU / Code",
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-mono font-bold text-foreground text-xs">{row.sku || row.product_code}</span>
            {row.barcode && (
              <span className="font-mono text-[10px] text-muted-foreground">Barcode: {row.barcode}</span>
            )}
          </div>
        ),
      },
      {
        key: "product_name",
        header: "Product & Category",
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground text-xs leading-snug">{row.product_name}</span>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.2 font-medium">{row.category || "General"}</span>
              {row.subcategory && <span>· {row.subcategory}</span>}
              <span className="rounded border border-border px-1 py-0.2 text-[9px] uppercase tracking-wide">
                {row.item_type_display || row.item_type || "FG"}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "attributes",
        header: "Variant Specifications",
        render: (row) => {
          if (!row.attributes || row.attributes.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1 max-w-xs">
              {row.attributes.map((attr) => (
                <button
                  key={attr.name}
                  type="button"
                  onClick={() => handleToggleAttribute(attr.name, attr.value)}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition cursor-pointer ${
                    activeAttributeKey === attr.name && activeAttributeValue === attr.value
                      ? "border-amber-500 bg-amber-100 text-amber-900 font-bold"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                  title={`Filter by ${attr.name}: ${attr.value}`}
                >
                  <strong className="text-muted-foreground font-semibold">{attr.name}:</strong>
                  <span>{attr.value}</span>
                </button>
              ))}
            </div>
          );
        },
      },
      {
        key: "physical_qty",
        header: "Physical (SOH)",
        render: (row) => (
          <div className="text-right font-mono font-semibold text-xs">
            {parseFloat(row.physical_qty).toFixed(2)}
            <span className="text-[10px] text-muted-foreground ml-0.5 font-normal">
              {row.unit_of_measure || "PCS"}
            </span>
          </div>
        ),
      },
      {
        key: "reserved_qty",
        header: "Reserved",
        render: (row) => {
          const res = parseFloat(row.reserved_qty || "0");
          return (
            <div className="text-right font-mono text-xs">
              {res > 0 ? (
                <span className="text-amber-700 dark:text-amber-400 font-semibold">−{res.toFixed(2)}</span>
              ) : (
                <span className="text-muted-foreground">0.00</span>
              )}
            </div>
          );
        },
      },
      {
        key: "available_qty",
        header: "Available (ATP)",
        render: (row) => {
          const avail = parseFloat(row.available_qty || row.physical_qty || "0");
          const reorder = parseFloat(row.reorder_point || "0");
          const isCritical = avail <= 0;
          const isLow = reorder > 0 && avail <= reorder;

          return (
            <div className="text-right flex flex-col items-end">
              <span
                className={`font-mono font-bold text-xs ${
                  isCritical
                    ? "text-destructive"
                    : isLow
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {avail.toFixed(2)}
              </span>
              <span
                className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${
                  isCritical
                    ? "bg-destructive/10 text-destructive"
                    : isLow
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                {isCritical ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
              </span>
            </div>
          );
        },
      },
      {
        key: "standard_cost",
        header: "Unit Cost",
        render: (row) => (
          <div className="text-right font-mono text-xs text-foreground">
            {row.standard_cost ? formatDocumentMoney(row.standard_cost) : "—"}
          </div>
        ),
      },
      {
        key: "selling_price",
        header: "Retail Price",
        render: (row) => (
          <div className="text-right font-mono text-xs font-medium text-foreground">
            {row.selling_price ? formatDocumentMoney(row.selling_price) : "—"}
          </div>
        ),
      },
      {
        key: "valuation_total",
        header: "Stock Valuation",
        render: (row) => (
          <div className="text-right font-mono font-bold text-xs text-primary">
            {row.valuation_total ? formatDocumentMoney(row.valuation_total) : "—"}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setInspectItemId(row.inventory_item_id ?? null)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted shadow-2xs transition"
              title="Inspect real-time stock mathematical formula & movements"
            >
              <Calculator className="h-3.5 w-3.5 text-primary" />
              <span>Audit Math</span>
            </button>
            <Link
              href={`/admin/inventory/ledger?search=${encodeURIComponent(row.sku || row.product_code)}`}
              className="rounded-lg border border-border bg-card p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Open full ledger"
            >
              <Layers className="h-3.5 w-3.5" />
            </Link>
          </div>
        ),
      },
    ],
    [activeAttributeKey, activeAttributeValue]
  );

  const totalPages = stockData?.num_pages ?? 0;

  return (
    <ERPPageShell
      eyebrow="Inventory &amp; Warehousing"
      title="Stock Intelligence &amp; On-Hand Command Center"
      subtitle="Complete stock posture across Finished Goods, Raw Materials, and Accessories with granular category, subcategory, variant attributes (Size, Material), valuation, and live calculation audits."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock on Hand" },
      ]}
      statusBadge={{ label: "Live Ledger Truth", tone: "info" }}
      stats={[
        {
          label: "Total Physical SOH",
          value: loading ? "—" : summary ? parseFloat(summary.summary.total_physical_qty).toFixed(0) : "0",
          tone: "info",
        },
        {
          label: "Available to Promise (ATP)",
          value: loading ? "—" : summary ? parseFloat(summary.summary.total_available_qty).toFixed(0) : "0",
          tone: "success",
        },
        {
          label: "Critical Shortages",
          value: loading ? "—" : (summary?.summary.critical_shortage_count ?? 0),
          tone: (summary?.summary.critical_shortage_count ?? 0) > 0 ? "warning" : "default",
        },
      ]}
      headerMode="erp"
    >
      <div className="space-y-5 font-sans">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Top KPI & Valuation Strip */}
        <StockOnHandKPIStrip summary={summary?.summary ?? null} isLoading={loading} />

        {/* Rental units awaiting release */}
        <div className="rounded-xl border bg-card p-4 empty:hidden">
          <RentalAssetsAwaitingRelease />
        </div>

        {/* ── Item Type Tabs (Finished Goods / Raw Materials / Accessories) ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            {[
              { code: "ALL", label: "All Inventory" },
              { code: "FINISHED_GOOD", label: "🛏️ Finished Goods" },
              { code: "RAW_MATERIAL", label: "🪵 Raw Materials" },
              { code: "ACCESSORY", label: "🔩 Accessories & Hardware" },
            ].map((tab) => (
              <button
                key={tab.code}
                type="button"
                onClick={() => {
                  setItemType(tab.code);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  itemType === tab.code
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintLabels}
              disabled={printing || loading || !stockData?.results?.length}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 shadow-2xs"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              <span>Print Stock Report</span>
            </button>

            <Link
              href="/admin/inventory/purchase-needs"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-95 shadow-xs"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Purchase Order Planning</span>
            </Link>
          </div>
        </div>

        {/* ── Multi-Level Filter Toolbar ── */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* Search Input */}
            <div className="md:col-span-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search SKU, name, barcode, spec…"
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSubcategory("ALL");
                  setPage(1);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                {facets?.categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Subcategory Filter */}
            <div>
              <select
                value={subcategory}
                onChange={(e) => {
                  setSubcategory(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                <option value="ALL">All Subcategories</option>
                {filteredSubcategories.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Stock Posture / Health Status */}
            <div>
              <select
                value={stockStatus}
                onChange={(e) => {
                  setStockStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                <option value="all">All Stock Statuses</option>
                <option value="in_stock">In Stock (&gt;0 Units)</option>
                <option value="low_stock">⚠️ Low Stock (&le; Reorder Point)</option>
                <option value="out_of_stock">⛔ Out of Stock (0 Units)</option>
              </select>
            </div>
          </div>

          {/* ── Variant Attributes Quick Filter Pills (Bed Size, Material, etc.) ── */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-primary" />
                Quick Variant Attribute Filters:
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Clear All Filters
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {/* Size Pills */}
              <span className="text-[10px] font-semibold text-muted-foreground mr-1">Size:</span>
              {["King", "Queen", "Single", "Double", "3-Door"].map((val) => {
                const isActive = activeAttributeKey === "Size" && activeAttributeValue === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleToggleAttribute("Size", val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium border transition cursor-pointer ${
                      isActive
                        ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold shadow-2xs"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {val}
                  </button>
                );
              })}

              <span className="text-muted-foreground mx-1">|</span>

              {/* Material Pills */}
              <span className="text-[10px] font-semibold text-muted-foreground mr-1">Material:</span>
              {["Solid Wood", "Steel", "Plywood", "Engineered Wood"].map((val) => {
                const isActive = activeAttributeKey === "Material" && activeAttributeValue === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleToggleAttribute("Material", val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium border transition cursor-pointer ${
                      isActive
                        ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold shadow-2xs"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {val}
                  </button>
                );
              })}

              {/* Active Attribute Tag Chip */}
              {activeAttributeKey && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  Active Filter: {activeAttributeKey} = {activeAttributeValue}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAttributeKey("");
                      setActiveAttributeValue("");
                    }}
                    className="hover:opacity-75"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Main Data Grid ── */}
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground text-sm">
                Stock Records ({stockData?.count ?? 0} matching items)
              </h2>
              <p className="text-xs text-muted-foreground">
                Showing real-time physical, reserved, and available stock balances computed from the double-entry stock ledger.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-16 text-center text-muted-foreground space-y-2">
              <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" />
              <p className="text-sm">Loading stock inventory and variant attributes…</p>
            </div>
          ) : !stockData?.results?.length ? (
            <div className="p-16 text-center text-muted-foreground space-y-2">
              <Boxes className="h-10 w-10 mx-auto text-muted-foreground/40 mb-1" />
              <div className="font-bold text-foreground text-sm">No inventory items matched your filter criteria</div>
              <p className="text-xs max-w-sm mx-auto">
                Try switching the product type tab or clearing your category and variant attribute filters.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-3 inline-flex items-center gap-1 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-95"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <EnterpriseDataTable<CriticalShortage>
              columns={columns}
              data={stockData.results}
            />
          )}
        </div>

        {/* ── Pagination Controls ── */}
        {stockData && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border border-border rounded-xl bg-card">
            <div className="text-xs text-muted-foreground">
              Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, stockData.count)} of{" "}
              <strong className="text-foreground">{stockData.count}</strong> items
            </div>

            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                disabled={loading}
                className="px-2.5 py-1 text-xs border border-border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-primary"
              >
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={loading || page === 1}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground px-2">
                  Page <strong className="text-foreground">{page}</strong> of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={loading || page === totalPages}
                  className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Math & Calculation Audit Inspector Drawer ── */}
      {inspectItemId && (
        <StockCalculationDrawer
          itemId={inspectItemId}
          isOpen={Boolean(inspectItemId)}
          onClose={() => setInspectItemId(null)}
        />
      )}
    </ERPPageShell>
  );
}
