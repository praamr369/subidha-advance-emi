"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  Layers,
  Package,
  PackageCheck,
  PackageX,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
  Sparkles,
} from "lucide-react";

import {
  listInventoryItems,
  getInventoryItemsMetrics,
  fetchFGProfile,
  updateFGAccessoryLink,
  addFGAccessoryLink,
  deleteFGAccessoryLink,
  updateInventoryItem,
  listAccessories,
  type InventoryItem,
  type InventoryItemsMetrics,
  type FGProfileDetail,
  type FGAccessoryLink,
  type AccessoryRow,
} from "@/services/inventory";
import { formatRupee } from "@/lib/utils/currency";
import { downloadCsv, type CsvColumn } from "@/lib/export/csv";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPMetricStrip from "@/components/erp/ERPMetricStrip";

type StockAvailabilityFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
type ItemTypeFilter = "ALL" | "FINISHED_GOOD" | "RAW_MATERIAL" | "ACCESSORY";
type CostSourceFilter = "ALL" | "PURCHASED" | "MANUFACTURED";

export default function PimPurchaseStockPanel() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [metrics, setMetrics] = useState<InventoryItemsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockAvailabilityFilter>("ALL");
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("ALL");
  const [costFilter, setCostFilter] = useState<CostSourceFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Inspector / Modal states
  const [selectedFG, setSelectedFG] = useState<InventoryItem | null>(null);
  const [fgDetail, setFgDetail] = useState<FGProfileDetail | null>(null);
  const [loadingFG, setLoadingFG] = useState(false);
  const [fgError, setFgError] = useState<string | null>(null);

  // Quick cost edit modal
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [costEditForm, setCostEditForm] = useState({
    purchase_unit_cost: "",
    standard_unit_cost: "",
    reorder_level_qty: "",
    manufacturing_cost_enabled: false,
    manufacturing_raw_material_cost: "",
    manufacturing_labour_cost: "",
    manufacturing_overhead_cost: "",
  });
  const [savingCost, setSavingCost] = useState(false);

  // Add accessory modal within FG
  const [showAddAccessory, setShowAddAccessory] = useState(false);
  const [availableAccessories, setAvailableAccessories] = useState<AccessoryRow[]>([]);
  const [loadingAccs, setLoadingAccs] = useState(false);
  const [selectedAccId, setSelectedAccId] = useState<number | "">("");
  const [newAccChargeMode, setNewAccChargeMode] = useState<"FREE" | "CHARGEABLE">("FREE");
  const [newAccSalePrice, setNewAccSalePrice] = useState("0.00");
  const [addingAcc, setAddingAcc] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load metrics once or on refresh
  const loadMetrics = useCallback(async () => {
    try {
      const data = await getInventoryItemsMetrics();
      setMetrics(data);
    } catch {
      // Non-fatal, metrics fallback to local
    }
  }, []);

  // Load inventory items
  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await listInventoryItems({
        page,
        page_size: pageSize,
        search: debouncedSearch || undefined,
        stock_item_type: itemTypeFilter !== "ALL" ? itemTypeFilter : undefined,
        manufacturing_cost_enabled:
          costFilter === "MANUFACTURED" ? true : undefined,
      });

      let results = res.results || [];

      // Filter locally for fine stock and costing conditions if needed
      if (stockFilter === "IN_STOCK") {
        results = results.filter((item) => {
          const qty = Number(item.current_stock_qty || 0);
          const threshold = Number(item.reorder_level_qty || 0);
          return qty > threshold && qty > 0;
        });
      } else if (stockFilter === "LOW_STOCK") {
        results = results.filter((item) => {
          const qty = Number(item.current_stock_qty || 0);
          const threshold = Number(item.reorder_level_qty || 0);
          return threshold > 0 && qty <= threshold && qty > 0;
        });
      } else if (stockFilter === "OUT_OF_STOCK") {
        results = results.filter((item) => Number(item.current_stock_qty || 0) <= 0);
      }

      if (costFilter === "PURCHASED") {
        results = results.filter((item) => !item.manufacturing_cost_enabled);
      }

      setItems(results);
      setTotalCount(res.count || results.length);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load inventory purchase list.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, debouncedSearch, stockFilter, itemTypeFilter, costFilter]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // Load Finished Good Accessories Detail
  const openFGDetail = useCallback(async (item: InventoryItem) => {
    setSelectedFG(item);
    setLoadingFG(true);
    setFgError(null);
    try {
      const detail = await fetchFGProfile(item.id);
      setFgDetail(detail);
    } catch (err: unknown) {
      setFgError(err instanceof Error ? err.message : "Failed to load finished good accessories.");
    } finally {
      setLoadingFG(false);
    }
  }, []);

  const closeFGDetail = () => {
    setSelectedFG(null);
    setFgDetail(null);
    setShowAddAccessory(false);
  };

  // Toggle or update accessory charge mode (FREE vs CHARGEABLE)
  const handleToggleChargeMode = async (link: FGAccessoryLink) => {
    if (!selectedFG) return;
    const nextMode = link.charge_mode === "FREE" ? "CHARGEABLE" : "FREE";
    const nextPrice = nextMode === "FREE" ? "0.00" : (link.accessory_base_price || "500.00");

    try {
      await updateFGAccessoryLink(selectedFG.id, link.id, {
        charge_mode: nextMode,
        sale_price: nextPrice,
      });
      // Refresh FG detail
      const detail = await fetchFGProfile(selectedFG.id);
      setFgDetail(detail);
      loadMetrics();
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update accessory pricing mode.");
    }
  };

  // Delete accessory link
  const handleDeleteAccessoryLink = async (linkId: number) => {
    if (!selectedFG) return;
    if (!confirm("Are you sure you want to remove this accessory from this Finished Good?")) return;
    try {
      await deleteFGAccessoryLink(selectedFG.id, linkId);
      const detail = await fetchFGProfile(selectedFG.id);
      setFgDetail(detail);
      loadMetrics();
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove accessory link.");
    }
  };

  // Open add accessory selector
  const handleOpenAddAccessory = async () => {
    setShowAddAccessory(true);
    setLoadingAccs(true);
    try {
      const res = await listAccessories({ page_size: 100 });
      const accList: AccessoryRow[] = res.results || [];
      // Exclude ones already linked
      const existingIds = new Set(fgDetail?.accessories.map((a) => a.accessory) || []);
      setAvailableAccessories(accList.filter((a) => !existingIds.has(a.id)));
    } catch {
      // non-fatal
    } finally {
      setLoadingAccs(false);
    }
  };

  // Submit adding accessory to FG
  const handleAddAccessorySubmit = async () => {
    if (!selectedFG || !selectedAccId) return;
    setAddingAcc(true);
    try {
      await addFGAccessoryLink(selectedFG.id, {
        accessory: Number(selectedAccId),
        charge_mode: newAccChargeMode,
        sale_price: newAccChargeMode === "FREE" ? "0.00" : newAccSalePrice,
      });
      setShowAddAccessory(false);
      setSelectedAccId("");
      setNewAccChargeMode("FREE");
      setNewAccSalePrice("0.00");
      const detail = await fetchFGProfile(selectedFG.id);
      setFgDetail(detail);
      loadMetrics();
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to link accessory.");
    } finally {
      setAddingAcc(false);
    }
  };

  // Quick edit cost handler
  const handleOpenEditCost = (item: InventoryItem) => {
    setEditingItem(item);
    setCostEditForm({
      purchase_unit_cost: item.purchase_unit_cost || "",
      standard_unit_cost: item.standard_unit_cost || "",
      reorder_level_qty: item.reorder_level_qty || "0",
      manufacturing_cost_enabled: Boolean(item.manufacturing_cost_enabled),
      manufacturing_raw_material_cost: item.manufacturing_raw_material_cost || "0.00",
      manufacturing_labour_cost: item.manufacturing_labour_cost || "0.00",
      manufacturing_overhead_cost: item.manufacturing_overhead_cost || "0.00",
    });
  };

  const handleSaveCost = async () => {
    if (!editingItem) return;
    setSavingCost(true);
    try {
      await updateInventoryItem(editingItem.id, {
        purchase_unit_cost: costEditForm.purchase_unit_cost || undefined,
        standard_unit_cost: costEditForm.standard_unit_cost || undefined,
        reorder_level_qty: costEditForm.reorder_level_qty || undefined,
        manufacturing_cost_enabled: costEditForm.manufacturing_cost_enabled,
        manufacturing_raw_material_cost: costEditForm.manufacturing_raw_material_cost || undefined,
        manufacturing_labour_cost: costEditForm.manufacturing_labour_cost || undefined,
        manufacturing_overhead_cost: costEditForm.manufacturing_overhead_cost || undefined,
      });
      setEditingItem(null);
      loadData();
      loadMetrics();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to save costing updates.");
    } finally {
      setSavingCost(false);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    type ExportRow = {
      product_code: string;
      item_name: string;
      sku: string;
      item_type: string;
      category: string;
      stock_status: string;
      physical_qty: string;
      reorder_level: string;
      purchase_price: string;
      mfg_price: string;
      selling_price: string;
      valuation: string;
      free_acc: number;
      chargeable_acc: number;
    };

    const columns: CsvColumn<ExportRow>[] = [
      { key: "product_code", header: "Product Code" },
      { key: "item_name", header: "Item Name" },
      { key: "sku", header: "SKU" },
      { key: "item_type", header: "Item Type" },
      { key: "category", header: "Category" },
      { key: "stock_status", header: "Stock Availability" },
      { key: "physical_qty", header: "In Hand Qty" },
      { key: "reorder_level", header: "Reorder Level" },
      { key: "purchase_price", header: "Purchase Price (INR)" },
      { key: "mfg_price", header: "Manufacture Final Price (INR)" },
      { key: "selling_price", header: "Base Selling Price (INR)" },
      { key: "valuation", header: "Total In-Hand Valuation (INR)" },
      { key: "free_acc", header: "Free Accessories (Included)" },
      { key: "chargeable_acc", header: "Chargeable Add-ons (Excluded)" },
    ];

    const rows: ExportRow[] = items.map((item) => {
      const physicalQty = Number(item.current_stock_qty || 0);
      const reorderLevel = Number(item.reorder_level_qty || 0);
      let status = "In Hand";
      if (physicalQty <= 0) status = "Not Available (Out of Stock)";
      else if (reorderLevel > 0 && physicalQty <= reorderLevel) status = "Low Stock";

      const purchasePrice = Number(item.purchase_unit_cost || item.standard_unit_cost || 0);
      const mfgRaw = Number(item.manufacturing_raw_material_cost || 0);
      const mfgLabour = Number(item.manufacturing_labour_cost || 0);
      const mfgOverhead = Number(item.manufacturing_overhead_cost || 0);
      const totalMfgPrice = item.manufacturing_cost_enabled ? mfgRaw + mfgLabour + mfgOverhead : 0;
      const finalUnitCost = item.manufacturing_cost_enabled && totalMfgPrice > 0 ? totalMfgPrice : purchasePrice;
      const totalStockValuation = physicalQty * finalUnitCost;

      return {
        product_code: item.product_code || "",
        item_name: item.product_name || item.name || "",
        sku: item.sku || "",
        item_type: item.stock_item_type || "",
        category: item.category || "",
        stock_status: status,
        physical_qty: physicalQty.toFixed(3),
        reorder_level: reorderLevel.toFixed(3),
        purchase_price: purchasePrice.toFixed(2),
        mfg_price: item.manufacturing_cost_enabled ? totalMfgPrice.toFixed(2) : "N/A",
        selling_price: Number(item.product_base_price || item.base_price || 0).toFixed(2),
        valuation: totalStockValuation.toFixed(2),
        free_acc: item.free_accessories_count ?? 0,
        chargeable_acc: item.chargeable_accessories_count ?? 0,
      };
    });

    downloadCsv(`inventory-items-purchase-valuation-${new Date().toISOString().slice(0, 10)}.csv`, columns, rows);
  };

  // Calculations for current page
  const totalPageValuation = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.current_stock_qty || 0);
      const purchasePrice = Number(item.purchase_unit_cost || item.standard_unit_cost || 0);
      const mfgRaw = Number(item.manufacturing_raw_material_cost || 0);
      const mfgLabour = Number(item.manufacturing_labour_cost || 0);
      const mfgOverhead = Number(item.manufacturing_overhead_cost || 0);
      const totalMfgPrice = item.manufacturing_cost_enabled ? mfgRaw + mfgLabour + mfgOverhead : 0;
      const finalCost = item.manufacturing_cost_enabled && totalMfgPrice > 0 ? totalMfgPrice : purchasePrice;
      return sum + qty * finalCost;
    }, 0);
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Informational Guidance Notice */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/20 p-4 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-3">
        <Boxes className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">
            Item Cost, Stock Availability &amp; Finished Goods Bundle Tracker
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Monitor real-time purchase costs, in-house manufacturing final prices (BOM + Labour + Overhead),
            and physical stock posture (<strong>In Hand</strong>, <strong>Low Stock</strong>, or <strong>Not Available / Out of Stock</strong>).
            For <strong>Finished Goods</strong>, track all linked accessories and add-ons with clear visibility into whether they are
            <strong> Included in Base Price (Free)</strong> or <strong> Excluded as Extra Add-ons (Chargeable)</strong>.
          </p>
        </div>
      </div>

      {/* Top ERP Metric Strip */}
      <ERPMetricStrip
        metrics={[
          {
            label: "Total Items Monitored",
            value: metrics?.total_items ?? totalCount,
            detail: `${items.length} items visible`,
          },
          {
            label: "Total Stock Valuation",
            value: formatRupee(metrics ? Number(metrics.total_valuation) : totalPageValuation),
            detail: "In-hand inventory valuation",
          },
          {
            label: "In Hand Stock",
            value: metrics?.in_stock_count ?? items.filter((i) => Number(i.current_stock_qty || 0) > 0).length,
            detail: `${metrics?.total_in_hand_qty ?? "0.000"} units on floor`,
          },
          {
            label: "Low Stock Alert",
            value: metrics?.low_stock_count ?? items.filter((i) => {
              const q = Number(i.current_stock_qty || 0);
              const t = Number(i.reorder_level_qty || 0);
              return t > 0 && q <= t && q > 0;
            }).length,
            detail: "At or below reorder level",
          },
          {
            label: "Not Available (Out of Stock)",
            value: metrics?.out_of_stock_count ?? items.filter((i) => Number(i.current_stock_qty || 0) <= 0).length,
            detail: "Immediate purchase or build needed",
          },
          {
            label: "FG Accessories Tracked",
            value: `${metrics?.free_accessory_links_count ?? 0} Free / ${metrics?.chargeable_accessory_links_count ?? 0} Add-on`,
            detail: "Included vs Chargeable bundles",
          },
        ]}
      />

      {/* Filters and Search Toolbar */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product code, name, SKU, category, or barcode…"
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm outline-none transition focus:border-ring"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Actions: Export CSV & Refresh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition"
              title="Export complete purchase, costing and stock list to CSV"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                loadData();
                loadMetrics();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-border/50 text-xs">
          {/* Stock status filter */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-muted-foreground mr-1">Stock Availability:</span>
            {(
              [
                { id: "ALL", label: "All Items" },
                { id: "IN_STOCK", label: "🟢 In Hand" },
                { id: "LOW_STOCK", label: "🟡 Low Stock" },
                { id: "OUT_OF_STOCK", label: "🔴 Not Available" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStockFilter(f.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  stockFilter === f.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border/70" />

          {/* Item type filter */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-muted-foreground mr-1">Item Type:</span>
            {(
              [
                { id: "ALL", label: "All Types" },
                { id: "FINISHED_GOOD", label: "Finished Goods" },
                { id: "RAW_MATERIAL", label: "Raw Materials" },
                { id: "ACCESSORY", label: "Accessories" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setItemTypeFilter(t.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  itemTypeFilter === t.id
                    ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border/70" />

          {/* Costing source filter */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-muted-foreground mr-1">Pricing Source:</span>
            {(
              [
                { id: "ALL", label: "All" },
                { id: "PURCHASED", label: "Purchased" },
                { id: "MANUFACTURED", label: "Manufactured BOM" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCostFilter(c.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  costFilter === c.id
                    ? "bg-violet-700 text-white font-semibold shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Inventory & Valuation Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center">
            <ERPLoadingState label="Loading items purchase list and stock valuation…" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <ERPErrorState
              title="Could not load inventory items"
              message={error}
              onRetry={() => loadData(true)}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <ERPEmptyState
              title="No items found"
              description="No items match your selected stock status, item type, or search term."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStockFilter("ALL");
                    setItemTypeFilter("ALL");
                    setCostFilter("ALL");
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
                >
                  Clear Filters
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-3.5 py-3 text-left">Code / SKU</th>
                  <th className="px-3.5 py-3 text-left">Item Name &amp; Category</th>
                  <th className="px-3.5 py-3 text-left">Stock Availability</th>
                  <th className="px-3.5 py-3 text-right">Reorder Min</th>
                  <th className="px-3.5 py-3 text-right">Purchase Price</th>
                  <th className="px-3.5 py-3 text-right">Manufacture Final</th>
                  <th className="px-3.5 py-3 text-right">Selling Price</th>
                  <th className="px-3.5 py-3 text-right">In-Hand Valuation</th>
                  <th className="px-3.5 py-3 text-left">FG Accessories (Free / Add-on)</th>
                  <th className="px-3.5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item) => {
                  const physicalQty = Number(item.current_stock_qty || 0);
                  const reorderThreshold = Number(item.reorder_level_qty || 0);
                  const isOutOfStock = physicalQty <= 0;
                  const isLowStock = !isOutOfStock && reorderThreshold > 0 && physicalQty <= reorderThreshold;

                  // Costs
                  const purchaseUnitCost = Number(item.purchase_unit_cost || item.standard_unit_cost || 0);
                  const mfgRaw = Number(item.manufacturing_raw_material_cost || 0);
                  const mfgLabour = Number(item.manufacturing_labour_cost || 0);
                  const mfgOverhead = Number(item.manufacturing_overhead_cost || 0);
                  const totalMfgCost = item.manufacturing_cost_enabled ? mfgRaw + mfgLabour + mfgOverhead : 0;
                  const finalValuationCost = item.manufacturing_cost_enabled && totalMfgCost > 0 ? totalMfgCost : purchaseUnitCost;
                  const lineValuation = physicalQty * finalValuationCost;
                  const isFG = item.stock_item_type === "FINISHED_GOOD";

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-muted/40 transition-colors ${
                        isOutOfStock ? "bg-red-50/20 dark:bg-red-950/10" : isLowStock ? "bg-amber-50/20 dark:bg-amber-950/10" : ""
                      }`}
                    >
                      {/* Code / SKU */}
                      <td className="px-3.5 py-2.5 font-mono text-[11px] whitespace-nowrap">
                        <div className="font-semibold text-foreground">{item.product_code || `ID-${item.id}`}</div>
                        <div className="text-[10px] text-muted-foreground">SKU: {item.sku || "—"}</div>
                        {item.unit_of_measure && (
                          <span className="inline-block px-1 rounded bg-muted text-[9px] text-muted-foreground mt-0.5">
                            {item.unit_of_measure}
                          </span>
                        )}
                      </td>

                      {/* Name & Category */}
                      <td className="px-3.5 py-2.5 max-w-[220px]">
                        <div className="font-medium text-foreground truncate" title={item.product_name || item.name}>
                          {item.product_name || item.name || "Untitled Item"}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap mt-0.5">
                          {item.category && <span>{item.category}</span>}
                          {item.stock_item_type && (
                            <span
                              className={`px-1.5 py-0.2 rounded font-semibold text-[9px] border ${
                                item.stock_item_type === "FINISHED_GOOD"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                  : item.stock_item_type === "RAW_MATERIAL"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                                  : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
                              }`}
                            >
                              {item.stock_item_type === "FINISHED_GOOD" ? "Finished Good" : item.stock_item_type === "RAW_MATERIAL" ? "Raw Material" : "Accessory"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Stock Availability */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {isOutOfStock ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-300 dark:border-red-800">
                            <PackageX className="h-3 w-3 shrink-0" />
                            <span>Not Available (0 {item.unit_of_measure || "PCS"})</span>
                          </div>
                        ) : isLowStock ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span>Low Stock: {physicalQty.toFixed(1)} / {reorderThreshold.toFixed(1)}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 border border-green-300 dark:border-green-800">
                            <PackageCheck className="h-3 w-3 shrink-0" />
                            <span>In Hand: {physicalQty.toFixed(1)} {item.unit_of_measure || "PCS"}</span>
                          </div>
                        )}
                      </td>

                      {/* Reorder Min */}
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {reorderThreshold > 0 ? `${reorderThreshold.toFixed(1)}` : "—"}
                      </td>

                      {/* Purchase Price */}
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {purchaseUnitCost > 0 ? (
                          <div>
                            <span className="font-semibold text-foreground">{formatRupee(purchaseUnitCost)}</span>
                            {item.standard_unit_cost && Number(item.standard_unit_cost) !== purchaseUnitCost && (
                              <div className="text-[10px] text-muted-foreground">Std: {formatRupee(Number(item.standard_unit_cost))}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Manufacture Final Price */}
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {item.manufacturing_cost_enabled ? (
                          <div>
                            <span className="font-semibold text-violet-700 dark:text-violet-400">
                              {formatRupee(totalMfgCost)}
                            </span>
                            <div className="text-[9px] text-muted-foreground" title={`Raw: ₹${mfgRaw.toFixed(2)} | Labour: ₹${mfgLabour.toFixed(2)} | Overhead: ₹${mfgOverhead.toFixed(2)}`}>
                              BOM (R+L+O)
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px]">Non-mfg</span>
                        )}
                      </td>

                      {/* Base Selling Price */}
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-foreground whitespace-nowrap">
                        {formatRupee(Number(item.product_base_price || item.base_price || 0))}
                      </td>

                      {/* In-Hand Valuation */}
                      <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                        {formatRupee(lineValuation)}
                      </td>

                      {/* FG Accessories (Free / Add-on) */}
                      <td className="px-3.5 py-2.5">
                        {isFG ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                              title="Accessories included in base price at no extra charge"
                            >
                              🎁 {item.free_accessories_count ?? 0} Free
                            </span>
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800"
                              title="Accessories excluded from price (chargeable add-ons)"
                            >
                              🏷️ {item.chargeable_accessories_count ?? 0} Add-on
                            </span>
                            <button
                              type="button"
                              onClick={() => openFGDetail(item)}
                              className="text-primary hover:underline text-[11px] font-semibold inline-flex items-center ml-1"
                            >
                              Inspect <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditCost(item)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit purchase cost, manufacturing BOM cost, and reorder levels"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {item.product && (
                            <Link
                              href={`/admin/pim/products/${item.product}/edit`}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Open in full PIM Product Editor"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground bg-muted/30">
            <div>
              Showing page <strong>{page}</strong> of <strong>{Math.ceil(totalCount / pageSize)}</strong> ({totalCount} total items)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-border bg-background disabled:opacity-40 hover:bg-muted"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * pageSize >= totalCount}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-border bg-background disabled:opacity-40 hover:bg-muted"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Finished Goods Accessories & Add-On Tracking Inspector Modal */}
      {selectedFG && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base text-foreground">
                    Finished Good: {selectedFG.product_name || selectedFG.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">({selectedFG.product_code})</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Track all linked accessories and add-ons. Specify whether each is Free (Included in price) or Chargeable (Excluded add-on).
                </p>
              </div>
              <button
                type="button"
                onClick={closeFGDetail}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {loadingFG ? (
                <div className="py-8 text-center">
                  <ERPLoadingState label="Loading finished good accessory bundle..." />
                </div>
              ) : fgError ? (
                <ERPErrorState message={fgError} onRetry={() => openFGDetail(selectedFG)} />
              ) : (
                <>
                  {/* Summary Bar for Finished Good */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-border bg-muted/20 text-xs">
                    <div>
                      <div className="text-muted-foreground text-[11px]">In Hand Stock</div>
                      <div className="text-sm font-bold text-foreground">
                        {Number(selectedFG.current_stock_qty || 0).toFixed(1)} {selectedFG.unit_of_measure || "PCS"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[11px]">Selling Base Price</div>
                      <div className="text-sm font-bold text-foreground">
                        {formatRupee(Number(selectedFG.product_base_price || selectedFG.base_price || 0))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[11px]">Purchase Cost</div>
                      <div className="text-sm font-semibold text-foreground">
                        {formatRupee(Number(selectedFG.purchase_unit_cost || selectedFG.standard_unit_cost || 0))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[11px]">BOM Manufacture Cost</div>
                      <div className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                        {selectedFG.manufacturing_cost_enabled ? formatRupee(Number(selectedFG.total_manufacturing_cost || 0)) : "Not configured"}
                      </div>
                    </div>
                  </div>

                  {/* Accessory Links Header & Add Button */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">
                        Linked Accessories &amp; Add-Ons ({fgDetail?.accessories.length ?? 0})
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Check accessory stock on floor to ensure fulfillment readiness.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenAddAccessory}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> Attach Accessory
                    </button>
                  </div>

                  {/* Add Accessory Inline Form */}
                  {showAddAccessory && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">Attach Accessory to Finished Good</span>
                        <button
                          type="button"
                          onClick={() => setShowAddAccessory(false)}
                          className="text-muted-foreground hover:text-foreground text-xs"
                        >
                          Cancel
                        </button>
                      </div>

                      {loadingAccs ? (
                        <div className="text-xs text-muted-foreground">Loading accessories catalog…</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Select Accessory</label>
                            <select
                              value={selectedAccId}
                              onChange={(e) => setSelectedAccId(Number(e.target.value) || "")}
                              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs outline-none"
                            >
                              <option value="">-- Choose accessory --</option>
                              {availableAccessories.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.product_name || acc.name} ({acc.product_code})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Charge Mode</label>
                            <select
                              value={newAccChargeMode}
                              onChange={(e) => setNewAccChargeMode(e.target.value as "FREE" | "CHARGEABLE")}
                              className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs outline-none font-medium"
                            >
                              <option value="FREE">🎁 Free (Included in Price - ₹0 Extra)</option>
                              <option value="CHARGEABLE">🏷️ Chargeable (Excluded - Extra Add-on)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">
                              {newAccChargeMode === "FREE" ? "Extra Price (INR)" : "Add-on Price (INR)"}
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                disabled={newAccChargeMode === "FREE"}
                                value={newAccChargeMode === "FREE" ? "0.00" : newAccSalePrice}
                                onChange={(e) => setNewAccSalePrice(e.target.value)}
                                className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs outline-none disabled:bg-muted/50"
                              />
                              <button
                                type="button"
                                onClick={handleAddAccessorySubmit}
                                disabled={addingAcc || !selectedAccId}
                                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
                              >
                                {addingAcc ? "Adding…" : "Add"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Accessories Table */}
                  {fgDetail && fgDetail.accessories.length > 0 ? (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold">
                          <tr>
                            <th className="px-3 py-2.5 text-left">Accessory Item</th>
                            <th className="px-3 py-2.5 text-left">Inclusion / Charge Mode</th>
                            <th className="px-3 py-2.5 text-right">Extra Add-on Price</th>
                            <th className="px-3 py-2.5 text-left">Accessory Stock Floor</th>
                            <th className="px-3 py-2.5 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {fgDetail.accessories.map((link) => {
                            const isFree = link.charge_mode === "FREE";
                            const accStock = Number(link.accessory_stock_qty || 0);
                            const accOut = link.is_out_of_stock || accStock <= 0;
                            const accLow = link.is_low_stock;

                            return (
                              <tr key={link.id} className="hover:bg-muted/30 transition">
                                <td className="px-3 py-2.5">
                                  <div className="font-semibold text-foreground">
                                    {link.accessory_name || `Accessory #${link.accessory}`}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    Code: {link.accessory_code || "—"} | SKU: {link.accessory_sku || "—"}
                                  </div>
                                </td>

                                {/* Inclusion Mode Toggle */}
                                <td className="px-3 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleChargeMode(link)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                                      isFree
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                        : "bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800"
                                    }`}
                                    title="Click to toggle between Included Free and Chargeable Add-on"
                                  >
                                    {isFree ? "🎁 Included in Price (FREE)" : "🏷️ Excluded (Chargeable Add-on)"}
                                  </button>
                                </td>

                                {/* Extra Price */}
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                  {isFree ? (
                                    <span className="text-emerald-600 font-semibold">₹0.00 (Included)</span>
                                  ) : (
                                    <span className="text-violet-700 dark:text-violet-300 font-semibold">
                                      +{formatRupee(Number(link.sale_price || 0))}
                                    </span>
                                  )}
                                </td>

                                {/* Accessory Stock Floor */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  {accOut ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/40 dark:text-red-300">
                                      ⚠️ Out of stock ({accStock.toFixed(1)})
                                    </span>
                                  ) : accLow ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300">
                                      🟡 Low stock ({accStock.toFixed(1)})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-800 border border-green-300 dark:bg-green-950/40 dark:text-green-300">
                                      🟢 Available ({accStock.toFixed(1)})
                                    </span>
                                  )}
                                </td>

                                {/* Actions */}
                                <td className="px-3 py-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAccessoryLink(link.id)}
                                    className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    title="Remove accessory from this finished good"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      No accessories attached to this finished good yet. Click <strong>&quot;Attach Accessory&quot;</strong> above to link accessories and specify whether they are Free or Chargeable.
                    </div>
                  )}

                  {/* Active BOM Inspection */}
                  {fgDetail?.active_bom && (
                    <div className="rounded-xl border border-border p-4 space-y-2 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-violet-600" />
                          Active Manufacturing BOM ({fgDetail.active_bom.bom_no})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-semibold dark:bg-violet-950/40 dark:text-violet-300">
                          Revision #{fgDetail.active_bom.revision_no}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead className="text-muted-foreground border-b border-border/70 text-left">
                            <tr>
                              <th className="py-1">Material / Part</th>
                              <th className="py-1">Code</th>
                              <th className="py-1 text-right">Qty Per Unit</th>
                              <th className="py-1 text-right">Wastage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40 font-mono">
                            {fgDetail.active_bom.lines.map((line) => (
                              <tr key={line.id}>
                                <td className="py-1 font-sans text-foreground">{line.product_name}</td>
                                <td className="py-1 text-muted-foreground">{line.product_code}</td>
                                <td className="py-1 text-right tabular-nums">{line.quantity_per_unit} {line.unit_of_measure}</td>
                                <td className="py-1 text-right tabular-nums">{line.wastage_percent}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3 border-t border-border bg-muted/30">
              <button
                type="button"
                onClick={closeFGDetail}
                className="px-4 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Cost & Reorder Level Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
              <div>
                <h3 className="font-semibold text-sm text-foreground">
                  Update Cost &amp; Reorder Level: {editingItem.product_name || editingItem.name}
                </h3>
                <p className="text-[11px] text-muted-foreground font-mono">Code: {editingItem.product_code}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Purchase Unit Cost (INR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costEditForm.purchase_unit_cost}
                    onChange={(e) =>
                      setCostEditForm({ ...costEditForm, purchase_unit_cost: e.target.value })
                    }
                    placeholder="e.g. 1200.00"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Standard Cost (INR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costEditForm.standard_unit_cost}
                    onChange={(e) =>
                      setCostEditForm({ ...costEditForm, standard_unit_cost: e.target.value })
                    }
                    placeholder="e.g. 1250.00"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Reorder Level (Low Stock Threshold Qty)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={costEditForm.reorder_level_qty}
                  onChange={(e) =>
                    setCostEditForm({ ...costEditForm, reorder_level_qty: e.target.value })
                  }
                  placeholder="e.g. 5.000"
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  When physical stock falls below this quantity, the system flags the item with a Low Stock Alert.
                </p>
              </div>

              <div className="pt-2 border-t border-border">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={costEditForm.manufacturing_cost_enabled}
                    onChange={(e) =>
                      setCostEditForm({ ...costEditForm, manufacturing_cost_enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="font-semibold text-xs text-foreground">
                    Enable In-House Manufacturing Final Cost (BOM Breakdown)
                  </span>
                </label>

                {costEditForm.manufacturing_cost_enabled && (
                  <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-muted/40 border border-border mt-2">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5">Raw Material (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={costEditForm.manufacturing_raw_material_cost}
                        onChange={(e) =>
                          setCostEditForm({ ...costEditForm, manufacturing_raw_material_cost: e.target.value })
                        }
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5">Labour (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={costEditForm.manufacturing_labour_cost}
                        onChange={(e) =>
                          setCostEditForm({ ...costEditForm, manufacturing_labour_cost: e.target.value })
                        }
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5">Overhead (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={costEditForm.manufacturing_overhead_cost}
                        onChange={(e) =>
                          setCostEditForm({ ...costEditForm, manufacturing_overhead_cost: e.target.value })
                        }
                        className="w-full h-8 rounded border border-border bg-background px-2 text-xs outline-none font-mono"
                      />
                    </div>
                    <div className="col-span-3 pt-1 text-[11px] text-violet-700 dark:text-violet-400 font-semibold text-right">
                      Total Manufacture Final Price:{" "}
                      {formatRupee(
                        Number(costEditForm.manufacturing_raw_material_cost || 0) +
                          Number(costEditForm.manufacturing_labour_cost || 0) +
                          Number(costEditForm.manufacturing_overhead_cost || 0)
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-muted/30">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCost}
                disabled={savingCost}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {savingCost ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
