"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Calculator, LayoutGrid, MapPin, Package, Table2 } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import InventoryCategoryAttributeFilterBar from "@/components/admin/inventory/InventoryCategoryAttributeFilterBar";
import StockCalculationDrawer from "@/components/admin/inventory/StockCalculationDrawer";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDocumentMoney } from "@/lib/documents/formatters";
import { ROUTES } from "@/lib/routes";
import {
  getStockOnHandFacets,
  listFinishedGoods,
  type FinishedGoodRow,
  type StockOnHandFacets,
  type StockOnHandFilteredSummary,
} from "@/services/inventory";

export default function FinishedGoodsPage() {
  const [rows, setRows] = useState<FinishedGoodRow[]>([]);
  const [summary, setSummary] = useState<StockOnHandFilteredSummary | null>(null);
  const [facets, setFacets] = useState<StockOnHandFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [category, setCategory] = useState("ALL");
  const [subcategory, setSubcategory] = useState("ALL");
  const [stockStatus, setStockStatus] = useState("all");
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState("category");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [inspectItemId, setInspectItemId] = useState<number | null>(null);
  const PAGE_SIZE = 25;

  useEffect(() => {
    let cancelled = false;
    getStockOnHandFacets({
      item_type: "FINISHED_GOOD",
      category,
      subcategory,
    })
      .then((res) => {
        if (!cancelled) setFacets(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [category, subcategory]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listFinishedGoods({
        q: debouncedSearch.trim() || undefined,
        category: category !== "ALL" ? category : undefined,
        subcategory: subcategory !== "ALL" ? subcategory : undefined,
        stock_status: stockStatus !== "all" ? stockStatus : undefined,
        attribute_filters: Object.keys(attributeFilters).length > 0 ? attributeFilters : undefined,
        sort_by: sortBy,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(payload.results ?? []);
      setTotal(payload.count ?? 0);
      setSummary(payload.summary ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finished goods.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category, subcategory, stockStatus, attributeFilters, sortBy, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleAttribute = (key: string, value: string) => {
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
  };

  const clearAllFilters = () => {
    setPage(1);
    setSearch("");
    setCategory("ALL");
    setSubcategory("ALL");
    setStockStatus("all");
    setAttributeFilters({});
  };

  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Finished Goods"
      subtitle="Trace sellable products by category, subcategory, material, size, location, and live ATP availability."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Finished Goods" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Matching SKUs", value: loading ? "—" : total, tone: "info" },
        {
          label: "Available (ATP)",
          value: loading || !summary ? "—" : parseFloat(summary.total_available_qty).toFixed(0),
          tone: "success",
        },
        {
          label: "Out of Stock",
          value: loading || !summary ? "—" : summary.out_of_stock_count,
          tone: summary && summary.out_of_stock_count > 0 ? "warning" : "default",
        },
      ]}
      actions={[
        { href: `${ROUTES.admin.inventoryStockOnHand}?item_type=FINISHED_GOOD`, label: "Stock Command Center", variant: "primary" },
        { href: ROUTES.admin.inventoryRawMaterials, label: "Raw Materials", variant: "secondary" },
        { href: ROUTES.admin.inventoryAccessories, label: "Accessories", variant: "secondary" },
        { href: ROUTES.admin.inventoryServiceCatalog, label: "Services", variant: "secondary" },
      ]}
    >
      <div className="space-y-4">
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
          sortBy={sortBy}
          onSortChange={(val) => {
            setSortBy(val);
            setPage(1);
          }}
          filteredSummary={summary}
          searchPlaceholder="Search bed, steel, wood, SKU, code…"
        />

        <ERPSectionShell
          title="Finished Goods Register"
          description="Category, subcategory, attributes, physical/reserved/available stock, and linked accessories/services/BOMs."
          actions={
            <div className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "table"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === "cards"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
            </div>
          }
        >
          <div aria-live="polite">
            {loading ? <ERPLoadingState label="Loading finished goods…" /> : null}
            {!loading && error ? <ERPErrorState title="Unable to load" description={error} /> : null}
          </div>
          {!loading && !error && rows.length === 0 ? (
            <ERPEmptyState
              title="No finished goods found"
              description="Adjust your category, attribute, or stock status filters, or prepare inventory profiles for finished goods."
            />
          ) : null}

          {!loading && !error && rows.length > 0 && viewMode === "table" ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] border-collapse text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2.5 text-left">SKU / Code</th>
                    <th className="px-3 py-2.5 text-left">Product &amp; Category</th>
                    <th className="px-3 py-2.5 text-left">Attributes / Material / Size</th>
                    <th className="px-3 py-2.5 text-right">Physical</th>
                    <th className="px-3 py-2.5 text-right">Reserved</th>
                    <th className="px-3 py-2.5 text-right">Available</th>
                    <th className="px-3 py-2.5 text-left">Locations</th>
                    <th className="px-3 py-2.5 text-right">Cost / MRP</th>
                    <th className="px-3 py-2.5 text-right">Value</th>
                    <th className="px-3 py-2.5 text-left">Links &amp; Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((row) => {
                    const phys = parseFloat(row.physical_qty ?? "0");
                    const res = parseFloat(row.reserved_qty ?? "0");
                    const avail = parseFloat(row.available_qty ?? row.physical_qty ?? "0");
                    const reorder = parseFloat(row.reorder_level_qty ?? "0");
                    const isOut = avail <= 0;
                    const isLow = !isOut && reorder > 0 && avail <= reorder;
                    return (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors align-top">
                        <td className="px-3 py-2.5 font-mono">
                          <div className="font-bold text-foreground">{row.sku || row.product_code}</div>
                          {row.sku && row.sku !== row.product_code && (
                            <div className="text-[10px] text-muted-foreground">{row.product_code}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            href={`${ROUTES.admin.inventoryFinishedGoods}/${row.id}`}
                            className="font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {row.product_name}
                          </Link>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {row.category || "Uncategorized"}
                            {row.subcategory ? ` › ${row.subcategory}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {row.attributes && row.attributes.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {row.attributes.map((a) => (
                                <button
                                  key={`${a.name}-${a.value}`}
                                  type="button"
                                  onClick={() => handleToggleAttribute(a.name, a.value)}
                                  className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
                                >
                                  <strong className="text-muted-foreground">{a.name}:</strong> {a.value}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">
                          {phys.toFixed(2)}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">{row.unit_of_measure}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {res > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">−{res.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          <span
                            className={`font-bold ${
                              isOut
                                ? "text-rose-600 dark:text-rose-400"
                                : isLow
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {avail.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[10px]">
                          {row.location_breakdown && row.location_breakdown.length > 0 ? (
                            row.location_breakdown.slice(0, 2).map((l, idx) => (
                              <div key={`${l.location_id ?? "u"}-${idx}`} className="flex justify-between gap-2">
                                <span className="text-muted-foreground truncate max-w-[90px]">{l.location_name}</span>
                                <span className="font-mono font-semibold">{parseFloat(l.on_hand_qty).toFixed(0)}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-muted-foreground">{row.default_location_name || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          <div>{formatDocumentMoney(row.standard_unit_cost)}</div>
                          <div className="text-[10px] text-muted-foreground">MRP {formatDocumentMoney(row.base_price)}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">
                          {row.valuation_total ? formatDocumentMoney(row.valuation_total) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-1">
                            <ERPStatusBadge status={row.stock_tracking_status} label={row.stock_tracking_status} />
                            <div className="text-[10px] text-muted-foreground">
                              {row.accessory_count} acc · {row.service_count} svc · {row.has_bom ? "BOM" : "No BOM"}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectItemId(row.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                              title="Audit stock math & movements"
                            >
                              <Calculator className="h-3 w-3 text-primary" />
                              Audit
                            </button>
                            <Link
                              href={`${ROUTES.admin.inventoryFinishedGoods}/${row.id}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                            >
                              <Package className="h-3 w-3" />
                              Profile
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && !error && rows.length > 0 && viewMode === "cards" ? (
            <div className="grid gap-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="group rounded-xl border border-border bg-card px-4 py-4 transition hover:bg-muted/30 hover:border-ring"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`${ROUTES.admin.inventoryFinishedGoods}/${row.id}`}
                        className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                      >
                        {row.product_name}{" "}
                        <span className="text-muted-foreground font-normal">({row.product_code})</span>
                      </Link>
                      <div className="mt-1 text-xs text-muted-foreground">
                        SKU: {row.sku ?? "—"} · UoM: {row.unit_of_measure} · Cost: ₹{row.standard_unit_cost} · MRP: ₹{row.base_price}
                        {" · "}
                        <span
                          className={(() => {
                            const qty = parseFloat(row.available_qty ?? row.physical_qty ?? "0");
                            const reorder = parseFloat(row.reorder_level_qty ?? "0");
                            return qty <= 0
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : reorder > 0 && qty <= reorder
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "font-semibold text-emerald-600 dark:text-emerald-400";
                          })()}
                        >
                          Avail: {parseFloat(row.available_qty ?? row.physical_qty ?? "0").toFixed(2)} / SOH:{" "}
                          {parseFloat(row.physical_qty ?? "0").toFixed(2)}
                        </span>
                      </div>
                      {row.category ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.category}
                          {row.subcategory ? ` › ${row.subcategory}` : ""}
                        </div>
                      ) : null}
                      {row.attributes && row.attributes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.attributes.map((a) => (
                            <span
                              key={`${a.name}-${a.value}`}
                              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
                            >
                              <strong className="text-muted-foreground">{a.name}:</strong> {a.value}
                            </span>
                          ))}
                          {(row.location_breakdown ?? []).map((loc, idx) => (
                            <span
                              key={`${loc.location_id ?? "u"}-${idx}`}
                              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              <MapPin className="h-2.5 w-2.5" />
                              {loc.location_name}: {parseFloat(loc.on_hand_qty).toFixed(0)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ERPStatusBadge status={row.stock_tracking_status} label={row.stock_tracking_status} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className={`font-medium ${row.accessory_count > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                      {row.accessory_count} accessor{row.accessory_count === 1 ? "y" : "ies"}
                    </span>
                    <span className={`font-medium ${row.service_count > 0 ? "text-purple-600 dark:text-purple-400" : ""}`}>
                      {row.service_count} service{row.service_count === 1 ? "" : "s"}
                    </span>
                    {row.has_bom ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">BOM active</span>
                    ) : (
                      <span>No active BOM</span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectItemId(row.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                      >
                        <Calculator className="h-3 w-3 text-primary" />
                        Audit Math
                      </button>
                      <Link
                        href={`${ROUTES.admin.inventoryFinishedGoods}/${row.id}`}
                        className="font-semibold uppercase tracking-[0.12em] text-primary hover:underline"
                      >
                        Open profile →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Pagination */}
          {!loading && numPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page} of {numPages} ({total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                  className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50"
                >
                  Prev
                </button>
                <button
                  disabled={page >= numPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </ERPSectionShell>
      </div>

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
