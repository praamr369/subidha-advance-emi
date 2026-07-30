"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  ExternalLink,
  Factory,
  FileText,
  Filter,
  Info,
  Layers,
  MapPin,
  Package,
  PackageX,
  ShieldCheck,
  Tag,
  TrendingDown,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";

import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import type { StockSummaryRow, StockSummaryMetrics } from "@/services/inventory";
import { getStockSummary } from "@/services/inventory";

type StockItemType = "ALL" | "FINISHED_GOOD" | "RAW_MATERIAL" | "ACCESSORY";
type StockFilter = "all" | "ok" | "low" | "out" | "reserved";

const TYPE_META: Record<StockItemType, { label: string; icon: React.ReactNode; color: string; badge: string }> = {
  ALL: { label: "All items", icon: <Layers className="h-4 w-4" />, color: "text-muted-foreground", badge: "bg-muted text-muted-foreground border-border" },
  FINISHED_GOOD: { label: "Finished Goods", icon: <Package className="h-4 w-4" />, color: "text-sky-700", badge: "bg-sky-50 text-sky-800 border-sky-200" },
  RAW_MATERIAL: { label: "Raw Materials", icon: <Factory className="h-4 w-4" />, color: "text-violet-700", badge: "bg-violet-50 text-violet-800 border-violet-200" },
  ACCESSORY: { label: "Accessories", icon: <Wrench className="h-4 w-4" />, color: "text-amber-700", badge: "bg-amber-50 text-amber-800 border-amber-200" },
};

function getStockStatus(row: StockSummaryRow): "out" | "low" | "reserved" | "ok" {
  const onHand = parseFloat(row.on_hand_qty || "0");
  const available = parseFloat(row.available_qty || row.on_hand_qty || "0");
  const reorder = parseFloat(row.reorder_level_qty || "0");
  if (onHand <= 0) return "out";
  if (reorder > 0 && onHand <= reorder) return "low";
  if (available <= 0 && onHand > 0) return "reserved";
  return "ok";
}

function StockStatusBadge({ row }: { row: StockSummaryRow }) {
  const status = getStockStatus(row);
  if (status === "out") return <ERPStatusBadge status="FAILED" label="Out of Stock" />;
  if (status === "low") return <ERPStatusBadge status="PENDING" label="Low Stock" />;
  if (status === "reserved") return <ERPStatusBadge status="UNDER_REVIEW" label="Fully Reserved" />;
  return <ERPStatusBadge status="AVAILABLE" label="In Stock" />;
}

function TypeBadge({ type }: { type: string }) {
  const key = (type as StockItemType) in TYPE_META ? (type as StockItemType) : "ALL";
  const meta = TYPE_META[key];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function QtyCell({ value, warn }: { value: string | number | null | undefined; warn?: boolean }) {
  const n = parseFloat(String(value ?? 0));
  const formatted = Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "—";
  return (
    <span className={`font-semibold tabular-nums ${warn && n <= 0 ? "text-destructive" : n > 0 ? "text-foreground" : "text-muted-foreground"}`}>
      {formatted}
    </span>
  );
}

function formatINR(amount: string | number | undefined | null): string {
  const num = parseFloat(String(amount ?? 0));
  if (isNaN(num)) return "₹0.00";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(num);
}

export default function InventoryStockOnHandPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<StockSummaryMetrics | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<StockItemType>("ALL");
  const [statusFilter, setStatusFilter] = useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [trackingStatusFilter, setTrackingStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Right Inspector Panel selection
  const [selectedRow, setSelectedRow] = useState<StockSummaryRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getStockSummary();
        if (cancelled) return;
        setRows(payload.results);
        if (payload.summary) {
          setSummaryMetrics(payload.summary);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load stock on hand."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // KPI breakdowns
  const kpis = useMemo(() => {
    const finished = rows.filter(r => r.stock_item_type === "FINISHED_GOOD");
    const raw = rows.filter(r => r.stock_item_type === "RAW_MATERIAL");
    const accessory = rows.filter(r => r.stock_item_type === "ACCESSORY");
    const outOfStock = rows.filter(r => getStockStatus(r) === "out");
    const lowStock = rows.filter(r => getStockStatus(r) === "low");
    const inStock = rows.filter(r => getStockStatus(r) === "ok");
    const totalVal = rows.reduce((acc, r) => acc + (parseFloat(r.valuation_amount || "0") || 0), 0);
    const activeStockCount = rows.filter(r => r.stock_tracking_status === "STOCK_ACTIVE").length;
    return {
      total: rows.length,
      finished: finished.length,
      raw: raw.length,
      accessory: accessory.length,
      outOfStock: outOfStock.length,
      lowStock: lowStock.length,
      inStock: inStock.length,
      totalValuation: totalVal,
      activeStockCount: activeStockCount,
    };
  }, [rows]);

  // Unique attribute options for filter dropdowns
  const categoryOptions = useMemo(() => {
    const cats = new Set(rows.map(r => r.category).filter((c): c is string => Boolean(c)));
    return Array.from(cats).sort();
  }, [rows]);

  const subcategoryOptions = useMemo(() => {
    const subcats = new Set(
      rows
        .filter(r => !categoryFilter || r.category === categoryFilter)
        .map(r => r.subcategory)
        .filter((sc): sc is string => Boolean(sc))
    );
    return Array.from(subcats).sort();
  }, [rows, categoryFilter]);

  const locationOptions = useMemo(() => {
    const locs = new Set(rows.map(r => r.default_stock_location_name).filter((l): l is string => Boolean(l)));
    return Array.from(locs).sort();
  }, [rows]);

  const trackingOptions = useMemo(() => {
    const tracks = new Set(rows.map(r => r.stock_tracking_status).filter((t): t is string => Boolean(t)));
    return Array.from(tracks).sort();
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    let out = rows;
    if (typeFilter !== "ALL") out = out.filter(r => r.stock_item_type === typeFilter);
    if (statusFilter !== "all") {
      if (statusFilter === "out") out = out.filter(r => getStockStatus(r) === "out");
      else if (statusFilter === "low") out = out.filter(r => getStockStatus(r) === "low");
      else if (statusFilter === "reserved") out = out.filter(r => getStockStatus(r) === "reserved");
      else if (statusFilter === "ok") out = out.filter(r => getStockStatus(r) === "ok");
    }
    if (categoryFilter) out = out.filter(r => r.category === categoryFilter);
    if (subcategoryFilter) out = out.filter(r => r.subcategory === subcategoryFilter);
    if (locationFilter) out = out.filter(r => r.default_stock_location_name === locationFilter);
    if (trackingStatusFilter) out = out.filter(r => r.stock_tracking_status === trackingStatusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        r =>
          (r.product_name ?? "").toLowerCase().includes(q) ||
          (r.sku ?? "").toLowerCase().includes(q) ||
          (r.product_code ?? "").toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q) ||
          (r.subcategory ?? "").toLowerCase().includes(q) ||
          (r.hsn_sac_code ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, typeFilter, statusFilter, categoryFilter, subcategoryFilter, locationFilter, trackingStatusFilter, search]);

  const pageStats = [
    { label: "SKUs Tracked", value: loading ? "—" : kpis.total, tone: "info" as const },
    { label: "Active Stock (150)", value: loading ? "—" : kpis.inStock, tone: "success" as const },
    { label: "No Stock (107)", value: loading ? "—" : kpis.outOfStock, tone: (!loading && kpis.outOfStock > 0 ? "warning" : "success") as "warning" | "success" },
    { label: "On-Hand Valuation", value: loading ? "—" : formatINR(summaryMetrics?.total_valuation_amount ?? kpis.totalValuation), tone: "info" as const },
  ];

  return (
    <ERPPageShell
      eyebrow="Enterprise Inventory Workbench"
      title="Stock Register & Control Room"
      subtitle="Live inventory snapshot by category, subcategory, HSN parameters, warehouse location, and financial valuation."
      helperNote="Enterprise desktop workbench: click any row to inspect deep costing, HSN tax rates, demand allocation, and stock ledger tracing."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock On Hand" },
      ]}
      statusBadge={{ label: "Desktop Workbench Ready", tone: "success" as const }}
      stats={pageStats}
      actions={[
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "secondary" },
        { href: ROUTES.admin.inventoryAdjustments, label: "Adjustments", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Ledger Tracing", variant: "secondary" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Navigate between stock review, ledger tracing, adjustments, and opening stock baselines."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      {/* Primary KPI & Category Quick-Filter Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {/* Total */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ALL"); setStatusFilter("all"); setCategoryFilter(""); setSubcategoryFilter(""); }}
          className={`col-span-1 rounded-2xl border p-4 text-left transition ${typeFilter === "ALL" && statusFilter === "all" && !categoryFilter ? "border-primary/40 bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-border hover:bg-muted/30"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-3.5 w-3.5" /> All SKUs
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.total}</div>
        </button>

        {/* Finished Goods */}
        <button
          type="button"
          onClick={() => { setTypeFilter("FINISHED_GOOD"); setStatusFilter("all"); }}
          className={`rounded-2xl border p-4 text-left transition ${typeFilter === "FINISHED_GOOD" ? "border-sky-300/60 bg-sky-50 ring-2 ring-sky-200/50" : "border-border bg-card hover:bg-sky-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
            <Package className="h-3.5 w-3.5" /> Finished Goods
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.finished}</div>
        </button>

        {/* Raw Materials */}
        <button
          type="button"
          onClick={() => { setTypeFilter("RAW_MATERIAL"); setStatusFilter("all"); }}
          className={`rounded-2xl border p-4 text-left transition ${typeFilter === "RAW_MATERIAL" ? "border-violet-300/60 bg-violet-50 ring-2 ring-violet-200/50" : "border-border bg-card hover:bg-violet-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
            <Factory className="h-3.5 w-3.5" /> Raw Materials
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.raw}</div>
        </button>

        {/* Accessories */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ACCESSORY"); setStatusFilter("all"); }}
          className={`rounded-2xl border p-4 text-left transition ${typeFilter === "ACCESSORY" ? "border-amber-300/60 bg-amber-50 ring-2 ring-amber-200/50" : "border-border bg-card hover:bg-amber-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <Wrench className="h-3.5 w-3.5" /> Accessories
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.accessory}</div>
        </button>

        {/* In Stock */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ALL"); setStatusFilter("ok"); }}
          className={`rounded-2xl border p-4 text-left transition ${statusFilter === "ok" ? "border-emerald-300/60 bg-emerald-50 ring-2 ring-emerald-200/50" : "border-border bg-card hover:bg-emerald-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> In Stock
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.inStock}</div>
        </button>

        {/* Low Stock */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ALL"); setStatusFilter("low"); }}
          className={`rounded-2xl border p-4 text-left transition ${statusFilter === "low" ? "border-amber-300/60 bg-amber-50 ring-2 ring-amber-200/50" : "border-border bg-card hover:bg-amber-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <TrendingDown className="h-3.5 w-3.5" /> Low Stock
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.lowStock}</div>
        </button>

        {/* Out of Stock */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ALL"); setStatusFilter("out"); }}
          className={`rounded-2xl border p-4 text-left transition ${statusFilter === "out" ? "border-red-300/60 bg-red-50 ring-2 ring-red-200/50" : "border-border bg-card hover:bg-red-50/40"}`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
            <PackageX className="h-3.5 w-3.5" /> Out of Stock
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{loading ? "—" : kpis.outOfStock}</div>
        </button>
      </div>

      {/* Main Grid: Data Grid + Right Inspector Panel */}
      <div className="mt-4 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Table Column */}
        <div className={selectedRow ? "lg:col-span-8 xl:col-span-8" : "lg:col-span-12"}>
          <ERPSectionShell
            title="Stock register data grid"
            description="Enterprise desktop register. Click any item row to launch the deep costing and availability inspector."
          >
            {/* Multi-Parameter Toolbar */}
            <div className="flex flex-wrap items-center gap-3 bg-muted/20 p-3 rounded-xl border border-border">
              {/* Search */}
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search SKU, name, code, category, HSN…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Category filter */}
              <select
                value={categoryFilter}
                onChange={e => { setCategoryFilter(e.target.value); setSubcategoryFilter(""); }}
                className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All Categories</option>
                {categoryOptions.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Subcategory filter */}
              {subcategoryOptions.length > 0 ? (
                <select
                  value={subcategoryFilter}
                  onChange={e => setSubcategoryFilter(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">All Subcategories</option>
                  {subcategoryOptions.map(subcat => (
                    <option key={subcat} value={subcat}>{subcat}</option>
                  ))}
                </select>
              ) : null}

              {/* Location filter */}
              {locationOptions.length > 0 ? (
                <select
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">All Locations</option>
                  {locationOptions.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              ) : null}

              {/* Tracking Status filter */}
              {trackingOptions.length > 1 ? (
                <select
                  value={trackingStatusFilter}
                  onChange={e => setTrackingStatusFilter(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">All Tracking States</option>
                  {trackingOptions.map(trk => (
                    <option key={trk} value={trk}>{trk}</option>
                  ))}
                </select>
              ) : null}

              {/* Clear filters */}
              {(typeFilter !== "ALL" || statusFilter !== "all" || categoryFilter || subcategoryFilter || locationFilter || trackingStatusFilter || search) ? (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter("ALL");
                    setStatusFilter("all");
                    setCategoryFilter("");
                    setSubcategoryFilter("");
                    setLocationFilter("");
                    setTrackingStatusFilter("");
                    setSearch("");
                  }}
                  className="h-9 rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  Clear filters
                </button>
              ) : null}

              <div className="ml-auto text-xs font-medium text-muted-foreground">
                Showing <span className="font-bold text-foreground">{filtered.length}</span> of {rows.length} items
              </div>
            </div>

            {/* Active filter chips */}
            {(typeFilter !== "ALL" || statusFilter !== "all" || categoryFilter || subcategoryFilter || locationFilter || trackingStatusFilter) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {typeFilter !== "ALL" ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${TYPE_META[typeFilter].badge}`}>
                    {TYPE_META[typeFilter].icon} {TYPE_META[typeFilter].label}
                    <button type="button" onClick={() => setTypeFilter("ALL")} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
                {statusFilter !== "all" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                    Status: {statusFilter}
                    <button type="button" onClick={() => setStatusFilter("all")} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
                {categoryFilter ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold">
                    <Tag className="h-3 w-3" /> Category: {categoryFilter}
                    <button type="button" onClick={() => { setCategoryFilter(""); setSubcategoryFilter(""); }} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
                {subcategoryFilter ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-primary/10 text-primary px-2.5 py-1 text-xs font-semibold">
                    Subcat: {subcategoryFilter}
                    <button type="button" onClick={() => setSubcategoryFilter("")} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
                {locationFilter ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                    <MapPin className="h-3 w-3" /> {locationFilter}
                    <button type="button" onClick={() => setLocationFilter("")} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
                {trackingStatusFilter ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground font-mono">
                    {trackingStatusFilter}
                    <button type="button" onClick={() => setTrackingStatusFilter("")} className="ml-1 opacity-60 hover:opacity-100">×</button>
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Data Grid Table */}
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {loading ? (
                <div className="space-y-0">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-20 animate-pulse rounded bg-muted ml-auto" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="px-5 py-8 text-center text-sm text-destructive">{error}</div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Box className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <div className="mt-3 text-sm font-medium text-foreground">No items match the current workbench filters</div>
                  <p className="mt-1 text-xs text-muted-foreground">Try clearing filters or adjusting the category selection.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Product & SKU</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category / Subcat</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On Hand</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reserved</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Available</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Valuation</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((row, i) => {
                        const status = getStockStatus(row);
                        const isSelected = selectedRow?.item_id === row.item_id;
                        return (
                          <tr
                            key={row.sku ?? i}
                            onClick={() => setSelectedRow(row)}
                            className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                              isSelected ? "bg-primary/5 ring-1 ring-inset ring-primary/40 font-medium" : ""
                            } ${status === "out" && !isSelected ? "bg-red-50/20" : status === "low" && !isSelected ? "bg-amber-50/10" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground leading-snug">{row.product_name ?? row.product_code ?? "—"}</div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                {row.sku ? <span className="font-mono">{row.sku}</span> : null}
                                {row.unit_of_measure ? <span>· {row.unit_of_measure}</span> : null}
                                {row.hsn_sac_code ? <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px]">HSN {row.hsn_sac_code}</span> : null}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs font-semibold text-foreground">{row.category || "General"}</div>
                              <div className="text-[11px] text-muted-foreground">{row.subcategory || "Standard"}</div>
                            </td>
                            <td className="px-4 py-3">
                              {row.default_stock_location_name ? (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                                  <MapPin className="h-3 w-3 shrink-0 text-primary" />
                                  {row.default_stock_location_name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">Unassigned</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <QtyCell value={row.on_hand_qty} warn={status === "out"} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <QtyCell value={row.reserved_qty} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <QtyCell value={row.available_qty ?? row.on_hand_qty} warn={status === "reserved"} />
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-foreground font-medium">
                              {formatINR(row.valuation_amount)}
                            </td>
                            <td className="px-4 py-3">
                              <StockStatusBadge row={row} />
                              {status === "low" ? (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                                  <AlertTriangle className="h-3 w-3" /> Reorder needed
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                className={`inline-flex items-center justify-center rounded-lg p-1.5 transition ${
                                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                                }`}
                                title="Inspect Item Parameters"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </ERPSectionShell>
        </div>

        {/* Right-Hand Inspector Workbench Panel */}
        {selectedRow ? (
          <div className="sticky top-6 rounded-2xl border border-primary/30 bg-card p-5 shadow-xl lg:col-span-4 xl:col-span-4 animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Inspector Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <StockStatusBadge row={selectedRow} />
                  <TypeBadge type={selectedRow.stock_item_type} />
                </div>
                <h3 className="mt-2 text-base font-bold text-foreground leading-tight">{selectedRow.product_name}</h3>
                <div className="mt-1 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span>SKU: {selectedRow.sku || "N/A"}</span>
                  <span>· CODE: {selectedRow.product_code}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                title="Close Inspector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Section 1: Classification & Catalog Parameters */}
            <div className="mt-4 border-b border-border pb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-primary" /> Classification Parameters
              </h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{selectedRow.category || "General"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Subcategory</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{selectedRow.subcategory || "Standard"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">HSN / SAC Code</dt>
                  <dd className="font-mono font-semibold text-foreground mt-0.5">{selectedRow.hsn_sac_code || "9403"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">GST Tax Rate</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{selectedRow.gst_rate ? `${selectedRow.gst_rate}%` : "18.00%"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Unit of Measure</dt>
                  <dd className="font-semibold text-foreground mt-0.5">{selectedRow.unit_of_measure}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lifecycle State</dt>
                  <dd className="font-semibold text-emerald-600 mt-0.5 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> {selectedRow.lifecycle_status || "ACTIVE"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Section 2: Financial Valuation & Costing */}
            <div className="mt-4 border-b border-border pb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> Valuation & Costing
              </h4>
              <div className="mt-3 rounded-xl bg-muted/40 p-3 border border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Standard Unit Cost</span>
                  <span className="font-mono font-bold text-foreground">{formatINR(selectedRow.standard_unit_cost)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Base Selling Price</span>
                  <span className="font-mono font-bold text-foreground">{formatINR(selectedRow.base_price)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-sm">
                  <span className="font-bold text-foreground">Total On-Hand Value</span>
                  <span className="font-mono font-extrabold text-primary">{formatINR(selectedRow.valuation_amount)}</span>
                </div>
              </div>
            </div>

            {/* Section 3: Stock Availability Breakdown */}
            <div className="mt-4 border-b border-border pb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-sky-600" /> Availability & Demand Tracing
              </h4>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="bg-card p-2 rounded border border-border">
                  <dt className="text-muted-foreground">Physical On Hand</dt>
                  <dd className="text-base font-bold text-foreground mt-0.5 tabular-nums">{selectedRow.on_hand_qty}</dd>
                </div>
                <div className="bg-card p-2 rounded border border-border">
                  <dt className="text-muted-foreground">Available to Promise</dt>
                  <dd className="text-base font-bold text-emerald-600 mt-0.5 tabular-nums">{selectedRow.available_qty ?? selectedRow.on_hand_qty}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reserved Qty</dt>
                  <dd className="font-semibold text-foreground mt-0.5 tabular-nums">{selectedRow.reserved_qty || "0.000"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reorder Alert Level</dt>
                  <dd className="font-semibold text-amber-700 mt-0.5 tabular-nums">{selectedRow.reorder_level_qty || "0.000"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Winners Demand</dt>
                  <dd className="font-semibold text-foreground mt-0.5 tabular-nums">{selectedRow.required_for_winners || "0"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Confirmed Orders</dt>
                  <dd className="font-semibold text-foreground mt-0.5 tabular-nums">{selectedRow.required_for_confirmed_orders || "0"}</dd>
                </div>
              </dl>
            </div>

            {/* Section 4: Storage & Location Reference */}
            <div className="mt-4 border-b border-border pb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-600" /> Location & Storage State
              </h4>
              <div className="mt-2 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned Warehouse:</span>
                  <span className="font-semibold text-foreground">{selectedRow.default_stock_location_name || "Unassigned"} ({selectedRow.default_stock_location_code || "N/A"})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tracking State:</span>
                  <span className="font-mono font-semibold text-xs rounded bg-muted px-2 py-0.5 text-foreground">{selectedRow.stock_tracking_status || "PREPARED_NO_STOCK"}</span>
                </div>
              </div>
            </div>

            {/* Section 5: Workbench Peripheral Actions */}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Operational Shortcuts
              </h4>
              <Link
                href={`${ROUTES.admin.inventoryLedger}?item_id=${selectedRow.item_id}`}
                className="flex items-center justify-between w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
              >
                <span>Trace in Stock Ledger</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={ROUTES.admin.inventoryAdjustments}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
                >
                  <Wrench className="h-3.5 w-3.5" /> Adjust Stock
                </Link>
                <Link
                  href={ROUTES.admin.products}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> PIM Catalog
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
