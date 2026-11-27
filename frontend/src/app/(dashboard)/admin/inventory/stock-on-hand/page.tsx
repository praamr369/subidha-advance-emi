"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Boxes,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderTree,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  ShoppingCart,
  Table2,
  Wrench,
} from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import InventoryCategoryAttributeFilterBar from "@/components/admin/inventory/InventoryCategoryAttributeFilterBar";
import StockCalculationDrawer from "@/components/admin/inventory/StockCalculationDrawer";
import StockOnHandKPIStrip from "@/components/admin/inventory/StockOnHandKPIStrip";
import RentalAssetsAwaitingRelease from "@/components/customer-intelligence/RentalAssetsAwaitingRelease";
import { useDebounce } from "@/hooks/useDebounce";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";
import { ROUTES } from "@/lib/routes";
import { formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getStockOnHandSummary,
  getStockOnHandItems,
  getStockOnHandFacets,
  getStockOnHandExportPath,
  type StockOnHandSummaryResponse,
  type CriticalShortagesListResponse,
  type CriticalShortage,
  type StockOnHandFacets,
} from "@/services/inventory";
import { accountingErrorMessage } from "@/components/accounting/shared";

type ViewMode = "grid" | "grouped";

function formatQty(val: string | number | undefined): string {
  const num = typeof val === "number" ? val : parseFloat(val || "0");
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export default function StockOnHandPage() {
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters (initialized from URL params if present)
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const debouncedSearch = useDebounce(search, 250);
  const [itemType, setItemType] = useState<string>(
    () => (searchParams.get("item_type") || "ALL").toUpperCase()
  );
  const [category, setCategory] = useState<string>(() => searchParams.get("category") || "ALL");
  const [subcategory, setSubcategory] = useState<string>(
    () => searchParams.get("subcategory") || "ALL"
  );
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});
  const [stockStatus, setStockStatus] = useState<string>(() => {
    if (searchParams.get("below_reorder") === "1") return "low_stock";
    return searchParams.get("stock_status") || "all";
  });
  const [locationId, setLocationId] = useState<number | null>(() => {
    const raw = searchParams.get("location_id");
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  });
  const [sortBy, setSortBy] = useState<string>("category");

  // Workbench UI state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showTreeRail, setShowTreeRail] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedRow, setSelectedRow] = useState<CriticalShortage | null>(null);
  const [showInspector, setShowInspector] = useState(true);

  // Data states
  const [summary, setSummary] = useState<StockOnHandSummaryResponse | null>(null);
  const [stockData, setStockData] = useState<CriticalShortagesListResponse | null>(null);
  const [facets, setFacets] = useState<StockOnHandFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drawer state for math audit
  const [inspectItemId, setInspectItemId] = useState<number | null>(null);

  // 1. Load Scoped Facets (re-fetch when itemType, category, subcategory, or locationId changes)
  useEffect(() => {
    let mounted = true;
    getStockOnHandFacets({
      item_type: itemType,
      category,
      subcategory,
      location_id: locationId,
    })
      .then((data) => {
        if (!mounted) return;
        setFacets(data);
        // Auto-expand currently selected category in the tree rail
        if (category !== "ALL") {
          setExpandedCategories((prev) => ({ ...prev, [category]: true }));
        } else if (data.category_tree && data.category_tree.length > 0) {
          setExpandedCategories((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            const initial: Record<string, boolean> = {};
            for (const c of data.category_tree!.slice(0, 3)) {
              initial[c.name] = true;
            }
            return initial;
          });
        }
      })
      .catch(() => {
        // Safe fallback
      });
    return () => {
      mounted = false;
    };
  }, [itemType, category, subcategory, locationId]);

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
          search: debouncedSearch.trim() || undefined,
          item_type: itemType !== "ALL" ? itemType : undefined,
          category: category !== "ALL" ? category : undefined,
          subcategory: subcategory !== "ALL" ? subcategory : undefined,
          attribute_filters:
            Object.keys(attributeFilters).length > 0 ? attributeFilters : undefined,
          stock_status: stockStatus !== "all" ? stockStatus : undefined,
          location_id: locationId,
          sort_by: sortBy,
        }),
      ]);
      setSummary(summaryRes);
      setStockData(itemsRes);
      setSelectedRow((prev) => {
        if (!itemsRes.results?.length) return null;
        if (prev) {
          const updated = itemsRes.results.find(
            (r) => r.inventory_item_id === prev.inventory_item_id
          );
          if (updated) return updated;
        }
        return itemsRes.results[0];
      });
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load stock on hand data."));
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    itemType,
    category,
    subcategory,
    attributeFilters,
    stockStatus,
    locationId,
    sortBy,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Multi-attribute toggle handler
  const handleToggleAttribute = useCallback((key: string, value: string) => {
    setPage(1);
    setAttributeFilters((prev) => {
      const next = { ...prev };
      if ((next[key] || "").toLowerCase() === value.toLowerCase()) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setPage(1);
    setSearch("");
    setItemType("ALL");
    setCategory("ALL");
    setSubcategory("ALL");
    setAttributeFilters({});
    setStockStatus("all");
    setLocationId(null);
  }, []);

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() ||
      itemType !== "ALL" ||
      category !== "ALL" ||
      subcategory !== "ALL" ||
      Object.keys(attributeFilters).length > 0 ||
      stockStatus !== "all" ||
      Boolean(locationId)
  );

  // CSV Export
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const path = getStockOnHandExportPath({
        search: debouncedSearch.trim() || undefined,
        item_type: itemType !== "ALL" ? itemType : undefined,
        category: category !== "ALL" ? category : undefined,
        subcategory: subcategory !== "ALL" ? subcategory : undefined,
        attribute_filters:
          Object.keys(attributeFilters).length > 0 ? attributeFilters : undefined,
        stock_status: stockStatus !== "all" ? stockStatus : undefined,
        location_id: locationId,
        sort_by: sortBy,
      });
      await downloadAuthenticatedFile(
        path,
        `stock_on_hand_${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (err) {
      alert(accountingErrorMessage(err, "CSV export failed."));
    } finally {
      setExportingCsv(false);
    }
  };

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
  <div class="subtitle">Generated on ${new Date().toLocaleString()} · Type: ${itemType} · Category: ${category}${subcategory !== "ALL" ? ` › ${subcategory}` : ""}</div>
  <table>
    <thead>
      <tr>
        <th>SKU / Code</th>
        <th>Product Name</th>
        <th>Category › Subcategory</th>
        <th>Specifications</th>
        <th class="num">Physical</th>
        <th class="num">Reserved</th>
        <th class="num">Available</th>
        <th class="num">Standard Cost</th>
        <th class="num">Valuation</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item) => `
        <tr>
          <td><strong>${item.sku || item.product_code}</strong></td>
          <td>${item.product_name}</td>
          <td>${item.category || "—"}${item.subcategory ? ` › ${item.subcategory}` : ""}</td>
          <td>${item.attributes?.map((a) => `${a.name}: ${a.value}`).join(", ") || "—"}</td>
          <td class="num">${parseFloat(item.physical_qty).toFixed(2)}</td>
          <td class="num">${parseFloat(item.reserved_qty || "0").toFixed(2)}</td>
          <td class="num ${parseFloat(item.available_qty || "0") > 0 ? "healthy" : "critical"}">
            ${parseFloat(item.available_qty || "0").toFixed(2)}
          </td>
          <td class="num">${item.standard_cost ? `₹${parseFloat(item.standard_cost).toFixed(2)}` : "—"}</td>
          <td class="num">${item.valuation_total ? `₹${parseFloat(item.valuation_total).toFixed(2)}` : "—"}</td>
        </tr>`
        )
        .join("")}
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

  // Group results by Category › Subcategory for Grouped View
  const groupedSections = useMemo(() => {
    const items = stockData?.results ?? [];
    const groups = new Map<
      string,
      {
        key: string;
        category: string;
        subcategory: string;
        items: CriticalShortage[];
        physical: number;
        reserved: number;
        available: number;
        value: number;
      }
    >();

    for (const row of items) {
      const cat = row.category || "Uncategorized";
      const sub = row.subcategory || "";
      const key = `${cat}|||${sub}`;
      let entry = groups.get(key);
      if (!entry) {
        entry = {
          key,
          category: cat,
          subcategory: sub,
          items: [],
          physical: 0,
          reserved: 0,
          available: 0,
          value: 0,
        };
        groups.set(key, entry);
      }
      entry.items.push(row);
      entry.physical += parseFloat(row.physical_qty || "0");
      entry.reserved += parseFloat(row.reserved_qty || "0");
      entry.available += parseFloat(row.available_qty || row.physical_qty || "0");
      entry.value += parseFloat(row.valuation_total || "0");
    }

    return Array.from(groups.values());
  }, [stockData]);

  // Grid Columns Definition
  const columns: EnterpriseColumnDef<CriticalShortage>[] = useMemo(
    () => [
      {
        key: "sku",
        header: "SKU / Code",
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-mono font-bold text-foreground text-xs">
              {row.sku || row.product_code}
            </span>
            {row.product_code && row.sku && row.product_code !== row.sku && (
              <span className="font-mono text-[10px] text-muted-foreground">{row.product_code}</span>
            )}
            {row.barcode && (
              <span className="font-mono text-[10px] text-muted-foreground">BC: {row.barcode}</span>
            )}
          </div>
        ),
      },
      {
        key: "product_name",
        header: "Product & Category",
        render: (row) => (
          <div className="flex flex-col min-w-[180px]">
            <span className="font-semibold text-foreground text-xs leading-snug">
              {row.product_name}
              {row.brand ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  ({row.brand})
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCategory(row.category || "ALL");
                  setSubcategory("ALL");
                  setPage(1);
                }}
                className="rounded bg-muted px-1.5 py-0.5 font-medium hover:text-foreground transition"
                title="Filter by this category"
              >
                {row.category || "General"}
              </button>
              {row.subcategory && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategory(row.category || "ALL");
                    setSubcategory(row.subcategory || "ALL");
                    setPage(1);
                  }}
                  className="hover:underline hover:text-foreground"
                  title="Filter by this subcategory"
                >
                  › {row.subcategory}
                </button>
              )}
              <span className="rounded border border-border px-1 py-0.2 text-[9px] uppercase tracking-wide">
                {row.item_type_display || row.item_type || "FG"}
              </span>
            </div>
          </div>
        ),
      },
      {
        key: "attributes",
        header: "Attributes & Specs",
        render: (row) => {
          if (!row.attributes || row.attributes.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1 max-w-xs">
              {row.attributes.map((attr) => {
                const isActive =
                  (attributeFilters[attr.name] || "").toLowerCase() === attr.value.toLowerCase();
                return (
                  <button
                    key={`${attr.name}-${attr.value}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAttribute(attr.name, attr.value);
                    }}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border transition cursor-pointer ${
                      isActive
                        ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                    title={`Filter by ${attr.name}: ${attr.value}`}
                  >
                    <strong className="text-muted-foreground font-semibold">{attr.name}:</strong>
                    <span>{attr.value}</span>
                  </button>
                );
              })}
            </div>
          );
        },
      },
      {
        key: "physical_qty",
        header: "Physical",
        render: (row) => (
          <div className="text-right font-mono font-semibold text-xs">
            {formatQty(row.physical_qty)}
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
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  −{formatQty(res)}
                </span>
              ) : (
                <span className="text-muted-foreground">0</span>
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
          const isLow = !isCritical && reorder > 0 && avail <= reorder;

          return (
            <div className="text-right flex flex-col items-end">
              <span
                className={`font-mono font-bold text-xs ${
                  isCritical
                    ? "text-rose-600 dark:text-rose-400"
                    : isLow
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {formatQty(avail)}
              </span>
              <span
                className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider ${
                  isCritical
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    : isLow
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {isCritical ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
              </span>
            </div>
          );
        },
      },
      {
        key: "locations",
        header: "Locations",
        render: (row) => {
          const locs = row.location_breakdown ?? [];
          if (locs.length === 0) {
            return (
              <span className="text-[11px] text-muted-foreground">
                {row.default_location_name || "—"}
              </span>
            );
          }
          return (
            <div className="flex flex-col gap-0.5 text-[10px]">
              {locs.slice(0, 2).map((l, i) => (
                <div key={`${l.location_id ?? "u"}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground truncate max-w-[95px]">{l.location_name}</span>
                  <span className="font-mono font-semibold text-foreground">{formatQty(l.on_hand_qty)}</span>
                </div>
              ))}
              {locs.length > 2 && (
                <span className="text-[9px] text-primary">+{locs.length - 2} more</span>
              )}
            </div>
          );
        },
      },
      {
        key: "standard_cost",
        header: "Cost / Price",
        render: (row) => (
          <div className="text-right font-mono text-xs">
            <div className="text-foreground font-medium">
              {row.standard_cost ? formatDocumentMoney(row.standard_cost) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              MRP: {row.selling_price ? formatDocumentMoney(row.selling_price) : "—"}
            </div>
          </div>
        ),
      },
      {
        key: "valuation_total",
        header: "Stock Value",
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
              onClick={(e) => {
                e.stopPropagation();
                setInspectItemId(row.inventory_item_id ?? null);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted shadow-2xs transition"
              title="Inspect real-time stock mathematical formula & movements"
            >
              <Calculator className="h-3 w-3 text-primary" />
              <span>Audit</span>
            </button>
            <Link
              href={`/admin/inventory/ledger?search=${encodeURIComponent(row.sku || row.product_code)}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg border border-border bg-card p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Open full stock ledger"
            >
              <Layers className="h-3.5 w-3.5" />
            </Link>
          </div>
        ),
      },
    ],
    [attributeFilters, handleToggleAttribute]
  );

  const totalPages = stockData?.num_pages ?? 0;
  const itemTypeStats = useMemo(() => {
    const map = new Map<string, { count: number; available_qty?: string }>();
    for (const t of facets?.item_types ?? []) {
      map.set(t.code, { count: t.count, available_qty: t.available_qty });
    }
    return map;
  }, [facets]);

  return (
    <ERPPageShell
      eyebrow="Inventory &amp; Warehousing"
      title="Stock Intelligence &amp; On-Hand Command Center"
      subtitle="Trace every Finished Good, Raw Material, and Accessory by Category, Subcategory, Material, Size, and Location — with real-time ATP availability and ledger math."
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
          label: "Available (ATP)",
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
      <div className="space-y-4 font-sans">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Top KPI & Valuation Strip (adapts when filtered!) */}
        <StockOnHandKPIStrip
          summary={summary?.summary ?? null}
          filteredSummary={stockData?.filtered_summary ?? null}
          hasActiveFilter={hasActiveFilters}
          isLoading={loading}
        />

        {/* Rental units awaiting release */}
        <div className="rounded-xl border border-border bg-card p-4 empty:hidden">
          <RentalAssetsAwaitingRelease />
        </div>

        {/* ── Command Bar: Item Type Tabs + View Toggles + Export/Print ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="inline-flex flex-wrap rounded-xl border border-border bg-muted/40 p-1 gap-0.5">
            {[
              { code: "ALL", label: "All Inventory" },
              { code: "FINISHED_GOOD", label: "Finished Goods" },
              { code: "RAW_MATERIAL", label: "Raw Materials" },
              { code: "ACCESSORY", label: "Accessories & Hardware" },
            ].map((tab) => {
              const stat = itemTypeStats.get(tab.code);
              const isActive = itemType === tab.code;
              return (
                <button
                  key={tab.code}
                  type="button"
                  onClick={() => {
                    setItemType(tab.code);
                    setCategory("ALL");
                    setSubcategory("ALL");
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{tab.label}</span>
                  {stat && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {stat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Tree Toggle */}
            <button
              type="button"
              onClick={() => setShowTreeRail((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                showTreeRail
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
              title="Toggle Category & Subcategory Tree"
            >
              <FolderTree className="h-3.5 w-3.5" />
              <span>Categories</span>
            </button>

            {/* Grid vs Category-Grouped Toggle */}
            <div className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "grid"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "grouped"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Category Wise</span>
              </button>
            </div>

            {/* Right Inspector Toggle */}
            <button
              type="button"
              onClick={() => setShowInspector((v) => !v)}
              className="hidden xl:inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
              title="Toggle Right Detail Inspector"
            >
              {showInspector ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
              <span>Inspector</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exportingCsv || loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {exportingCsv ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrintLabels}
              disabled={printing || loading || !stockData?.results?.length}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              <span>Print</span>
            </button>

            <Link
              href="/admin/inventory/purchase-needs"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-95 shadow-xs"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Purchase Needs</span>
            </Link>
          </div>
        </div>

        {/* ── Multi-Level Filter & Dynamic Attribute Breakdown Strip ── */}
        <InventoryCategoryAttributeFilterBar
          facets={facets}
          search={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          category={category}
          onCategoryChange={(val) => {
            setCategory(val);
            setSubcategory("ALL");
            setPage(1);
          }}
          subcategory={subcategory}
          onSubcategoryChange={(val) => {
            setSubcategory(val);
            setPage(1);
          }}
          stockStatus={stockStatus}
          onStockStatusChange={(val) => {
            setStockStatus(val);
            setPage(1);
          }}
          attributeFilters={attributeFilters}
          onToggleAttribute={handleToggleAttribute}
          onClearAll={clearAllFilters}
          locationId={locationId}
          onLocationChange={(val) => {
            setLocationId(val);
            setPage(1);
          }}
          sortBy={sortBy}
          onSortChange={(val) => {
            setSortBy(val);
            setPage(1);
          }}
          filteredSummary={stockData?.filtered_summary ?? null}
          showSummaryStrip={false}
        />

        {/* ── Desktop 3-Zone Workbench: Category Tree | Main Grid/Grouped | Right Inspector ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Rail: Category › Subcategory Tree */}
          {showTreeRail && (
            <aside className="lg:col-span-3 xl:col-span-2 rounded-2xl border border-border bg-card p-3 space-y-2 lg:sticky lg:top-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between px-1 pb-1 border-b border-border">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Category Tree
                </span>
                {category !== "ALL" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("ALL");
                      setSubcategory("ALL");
                      setPage(1);
                    }}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCategory("ALL");
                  setSubcategory("ALL");
                  setPage(1);
                }}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                  category === "ALL"
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <span>All Categories</span>
                <span className="font-mono text-[10px] opacity-80">
                  {facets?.category_tree?.reduce((s, c) => s + c.sku_count, 0) ?? 0}
                </span>
              </button>

              <div className="space-y-1">
                {(facets?.category_tree ?? []).map((catNode) => {
                  const isCatSelected = category.toLowerCase() === catNode.name.toLowerCase();
                  const isExpanded = expandedCategories[catNode.name] ?? isCatSelected;
                  const hasSubs = catNode.subcategories.length > 0;
                  const availCat = parseFloat(catNode.available_qty || "0");

                  return (
                    <div key={catNode.name} className="space-y-0.5">
                      <div
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition ${
                          isCatSelected && subcategory === "ALL"
                            ? "bg-primary/15 text-primary font-bold"
                            : isCatSelected
                            ? "bg-muted font-semibold text-foreground"
                            : "text-foreground/90 hover:bg-muted/60"
                        }`}
                      >
                        {hasSubs ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories((prev) => ({
                                ...prev,
                                [catNode.name]: !isExpanded,
                              }))
                            }
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label={`Toggle ${catNode.name} subcategories`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCategory(catNode.name);
                            setSubcategory("ALL");
                            setExpandedCategories((prev) => ({ ...prev, [catNode.name]: true }));
                            setPage(1);
                          }}
                          className="flex-1 text-left truncate"
                        >
                          {catNode.name}
                        </button>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
                            availCat > 0
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                          title={`${catNode.sku_count} SKUs · ${availCat.toFixed(0)} available`}
                        >
                          {availCat.toFixed(0)}
                        </span>
                      </div>

                      {hasSubs && isExpanded && (
                        <div className="ml-4 pl-2 border-l border-border/70 space-y-0.5">
                          {catNode.subcategories.map((subNode) => {
                            const isSubSelected =
                              isCatSelected &&
                              subcategory.toLowerCase() === subNode.name.toLowerCase();
                            const availSub = parseFloat(subNode.available_qty || "0");
                            return (
                              <button
                                key={`${catNode.name}-${subNode.name}`}
                                type="button"
                                onClick={() => {
                                  setCategory(catNode.name);
                                  setSubcategory(subNode.name);
                                  setPage(1);
                                }}
                                className={`w-full flex items-center justify-between gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                                  isSubSelected
                                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold"
                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                }`}
                              >
                                <span className="truncate text-left">{subNode.name}</span>
                                <span className="font-mono text-[10px] shrink-0">
                                  {availSub.toFixed(0)}/{subNode.sku_count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          )}

          {/* Center Main Area */}
          <div
            className={
              showTreeRail && showInspector
                ? "lg:col-span-9 xl:col-span-7 space-y-4"
                : showTreeRail
                ? "lg:col-span-9 xl:col-span-10 space-y-4"
                : showInspector
                ? "lg:col-span-12 xl:col-span-9 space-y-4"
                : "lg:col-span-12 space-y-4"
            }
          >
            {loading ? (
              <div className="rounded-2xl border border-border bg-card p-16 text-center text-muted-foreground space-y-2">
                <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" />
                <p className="text-sm">Loading stock inventory, categories, and variant attributes…</p>
              </div>
            ) : !stockData?.results?.length ? (
              <div className="rounded-2xl border border-border bg-card p-16 text-center text-muted-foreground space-y-2">
                <Boxes className="h-10 w-10 mx-auto text-muted-foreground/40 mb-1" />
                <div className="font-bold text-foreground text-sm">
                  No inventory items matched your filter criteria
                </div>
                <p className="text-xs max-w-sm mx-auto">
                  Try switching the item type tab or clearing your category, location, and attribute filters.
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
            ) : viewMode === "grid" ? (
              <EnterpriseDataTable<CriticalShortage>
                title="Stock Records"
                subtitle={`Showing ${stockData.results.length} of ${stockData.count} matching items (click any row to inspect details)`}
                columns={columns}
                data={stockData.results}
                pageSize={pageSize}
                rowKey={(row) => String(row.inventory_item_id ?? row.sku ?? row.product_id)}
                onRowClick={(row) => setSelectedRow(row)}
                rowClassName={(row) =>
                  selectedRow?.inventory_item_id === row.inventory_item_id
                    ? "bg-primary/10"
                    : undefined
                }
              />
            ) : (
              /* Category › Subcategory Grouped View */
              <div className="space-y-4">
                {groupedSections.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{group.category}</span>
                        {group.subcategory && (
                          <>
                            <span className="text-muted-foreground">›</span>
                            <span className="text-sm font-semibold text-primary">
                              {group.subcategory}
                            </span>
                          </>
                        )}
                        <span className="rounded-full bg-background border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {group.items.length} SKU{group.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        <span>
                          SOH: <strong className="text-foreground">{formatQty(group.physical)}</strong>
                        </span>
                        {group.reserved > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            Res: <strong>{formatQty(group.reserved)}</strong>
                          </span>
                        )}
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Avail: <strong>{formatQty(group.available)}</strong>
                        </span>
                        <span className="text-primary font-bold">
                          {formatDocumentMoney(group.value.toFixed(2))}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-border/70">
                      {group.items.map((item) => {
                        const avail = parseFloat(item.available_qty || item.physical_qty || "0");
                        const reorder = parseFloat(item.reorder_point || "0");
                        const isCritical = avail <= 0;
                        const isLow = !isCritical && reorder > 0 && avail <= reorder;
                        const isSelected = selectedRow?.inventory_item_id === item.inventory_item_id;

                        return (
                          <div
                            key={item.inventory_item_id ?? item.sku}
                            onClick={() => setSelectedRow(item)}
                            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer transition ${
                              isSelected ? "bg-primary/10" : "hover:bg-muted/30"
                            }`}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-xs text-foreground">
                                  {item.product_name}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {item.sku || item.product_code}
                                </span>
                                <span className="rounded border border-border px-1.5 py-0.2 text-[9px] uppercase text-muted-foreground">
                                  {item.item_type_display || item.item_type}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(item.attributes ?? []).map((a) => (
                                  <span
                                    key={`${a.name}-${a.value}`}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
                                  >
                                    <strong className="text-muted-foreground">{a.name}:</strong>{" "}
                                    {a.value}
                                  </span>
                                ))}
                                {(item.location_breakdown ?? []).map((loc, idx) => (
                                  <span
                                    key={`${loc.location_id ?? "u"}-${idx}`}
                                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    <MapPin className="h-2.5 w-2.5" />
                                    {loc.location_name}: {formatQty(loc.on_hand_qty)}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono">
                              <div className="text-right">
                                <div className="text-[10px] text-muted-foreground uppercase">Avail / SOH</div>
                                <div
                                  className={`font-bold ${
                                    isCritical
                                      ? "text-rose-600 dark:text-rose-400"
                                      : isLow
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {formatQty(avail)} / {formatQty(item.physical_qty)}{" "}
                                  <span className="font-normal text-[10px] text-muted-foreground">
                                    {item.unit_of_measure}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-muted-foreground uppercase">Value</div>
                                <div className="font-bold text-primary">
                                  {item.valuation_total
                                    ? formatDocumentMoney(item.valuation_total)
                                    : "—"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInspectItemId(item.inventory_item_id ?? null);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                              >
                                <Calculator className="h-3 w-3 text-primary" />
                                Audit
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Server-side Pagination Controls */}
            {stockData && totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border border-border rounded-xl bg-card">
                <div className="text-xs text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, stockData.count)} of{" "}
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
                      type="button"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={loading || page === 1}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-muted-foreground px-2">
                      Page <strong className="text-foreground">{page}</strong> of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={loading || page === totalPages}
                      className="p-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Inspector Panel (Desktop) */}
          {showInspector && (
            <aside className="hidden xl:block xl:col-span-3 rounded-2xl border border-border bg-card p-4 space-y-4 sticky top-4">
              {!selectedRow ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <List className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Select any stock row to inspect location breakdown, attributes, pricing, and links.
                </div>
              ) : (
                <>
                  <div className="border-b border-border pb-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {selectedRow.item_type_display || selectedRow.item_type}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-primary">
                        {selectedRow.sku || selectedRow.product_code}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-foreground leading-snug">
                      {selectedRow.product_name}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      {selectedRow.category || "Uncategorized"}
                      {selectedRow.subcategory ? ` › ${selectedRow.subcategory}` : ""}
                      {selectedRow.brand ? ` · ${selectedRow.brand}` : ""}
                    </div>
                  </div>

                  {/* Stock Availability Breakdown */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-border bg-muted/20 p-2">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">Physical</div>
                      <div className="font-mono text-sm font-bold text-foreground">
                        {formatQty(selectedRow.physical_qty)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-2">
                      <div className="text-[9px] uppercase font-bold text-muted-foreground">Reserved</div>
                      <div className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
                        {formatQty(selectedRow.reserved_qty)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                      <div className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                        Available
                      </div>
                      <div className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {formatQty(selectedRow.available_qty ?? selectedRow.physical_qty)}
                      </div>
                    </div>
                  </div>

                  {/* Attributes */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Attributes &amp; Specifications
                    </div>
                    {selectedRow.attributes && selectedRow.attributes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedRow.attributes.map((a) => (
                          <span
                            key={`${a.name}-${a.value}`}
                            className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
                          >
                            <strong className="text-muted-foreground">{a.name}:</strong> {a.value}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No attributes recorded.</div>
                    )}
                  </div>

                  {/* Location Breakdown */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Location Breakdown
                    </div>
                    {selectedRow.location_breakdown && selectedRow.location_breakdown.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedRow.location_breakdown.map((loc, idx) => (
                          <div
                            key={`${loc.location_id ?? "u"}-${idx}`}
                            className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs"
                          >
                            <div>
                              <div className="font-medium text-foreground">{loc.location_name}</div>
                              <div className="text-[10px] text-muted-foreground">{loc.location_type}</div>
                            </div>
                            <span className="font-mono font-bold">
                              {formatQty(loc.on_hand_qty)} {selectedRow.unit_of_measure}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {selectedRow.default_location_name
                          ? `Default: ${selectedRow.default_location_name}`
                          : "No location movements yet."}
                      </div>
                    )}
                  </div>

                  {/* Pricing & Valuation */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unit Cost ({selectedRow.valuation_method || "AVG"})</span>
                      <span className="font-mono font-semibold">
                        {selectedRow.standard_cost ? formatDocumentMoney(selectedRow.standard_cost) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Selling Price</span>
                      <span className="font-mono font-semibold">
                        {selectedRow.selling_price ? formatDocumentMoney(selectedRow.selling_price) : "—"}
                      </span>
                    </div>
                    {selectedRow.margin_percent && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gross Margin</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {selectedRow.margin_percent}%
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                      <span>Stock Value</span>
                      <span className="font-mono text-primary">
                        {selectedRow.valuation_total ? formatDocumentMoney(selectedRow.valuation_total) : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setInspectItemId(selectedRow.inventory_item_id ?? null)}
                      className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-95"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      Audit Math &amp; Movements
                    </button>
                    <Link
                      href={`/admin/inventory/ledger?search=${encodeURIComponent(
                        selectedRow.sku || selectedRow.product_code
                      )}`}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                    >
                      <Layers className="h-3 w-3" />
                      Ledger
                    </Link>
                    <Link
                      href="/admin/inventory/adjustments"
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                    >
                      <Wrench className="h-3 w-3" />
                      Adjust
                    </Link>
                    {selectedRow.item_type === "FINISHED_GOOD" && selectedRow.inventory_item_id && (
                      <Link
                        href={`/admin/inventory/finished-goods/${selectedRow.inventory_item_id}`}
                        className="col-span-2 inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-muted"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open Finished Good Profile ({selectedRow.accessory_count ?? 0} acc ·{" "}
                        {selectedRow.bom_count ?? 0} BOM)
                      </Link>
                    )}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
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
