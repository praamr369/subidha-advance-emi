"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Factory,
  Layers,
  MapPin,
  Package,
  PackageX,
  TrendingDown,
  Wrench,
} from "lucide-react";

import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import type { StockSummaryRow } from "@/services/inventory";
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

export default function InventoryStockOnHandPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<StockItemType>("ALL");
  const [statusFilter, setStatusFilter] = useState<StockFilter>("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await getStockSummary();
        if (cancelled) return;
        setRows(payload.results);
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
    return { total: rows.length, finished: finished.length, raw: raw.length, accessory: accessory.length, outOfStock: outOfStock.length, lowStock: lowStock.length, inStock: inStock.length };
  }, [rows]);

  // Unique locations for filter chips
  const locationOptions = useMemo(() => {
    const locs = new Set(rows.map(r => r.default_stock_location_name).filter(Boolean));
    return Array.from(locs).sort() as string[];
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
    if (locationFilter) out = out.filter(r => r.default_stock_location_name === locationFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        (r.product_name ?? "").toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        (r.product_code ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, typeFilter, statusFilter, locationFilter, search]);

  const pageStats = [
    { label: "SKUs Tracked", value: loading ? "—" : kpis.total, tone: "info" as const },
    { label: "Out of Stock", value: loading ? "—" : kpis.outOfStock, tone: (!loading && kpis.outOfStock > 0 ? "danger" : "success") as "danger" | "success" },
    { label: "Low Stock", value: loading ? "—" : kpis.lowStock, tone: (!loading && kpis.lowStock > 0 ? "warning" : "success") as "warning" | "success" },
    { label: "In Stock", value: loading ? "—" : kpis.inStock, tone: "success" as const },
  ];

  return (
    <ERPPageShell
      eyebrow="Inventory Review"
      title="Stock On Hand"
      subtitle="Live inventory by product, SKU, type and location. Filterable by category, status and warehouse."
      helperNote="Stock on hand is derived from the stock ledger and opening balances — not from billing or EMI schedules."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Stock On Hand" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={pageStats}
      actions={[
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "secondary" },
        { href: ROUTES.admin.inventoryAdjustments, label: "Adjustments", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Ledger", variant: "secondary" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Navigate between stock review, ledger, adjustments, and opening stock."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      {/* Category KPI band */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {/* Total */}
        <button
          type="button"
          onClick={() => { setTypeFilter("ALL"); setStatusFilter("all"); }}
          className={`col-span-1 rounded-2xl border p-4 text-left transition ${typeFilter === "ALL" && statusFilter === "all" ? "border-primary/40 bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card hover:border-border hover:bg-muted/30"}`}
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

      {/* Stock register */}
      <ERPSectionShell
        title="Stock register"
        description="Live snapshot from the stock ledger. Click a category or status card above to filter."
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search SKU, name, code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
            />
          </div>

          {/* Location filter */}
          {locationOptions.length > 0 ? (
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="">All locations</option>
              {locationOptions.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          ) : null}

          {/* Clear filters */}
          {(typeFilter !== "ALL" || statusFilter !== "all" || locationFilter || search) ? (
            <button
              type="button"
              onClick={() => { setTypeFilter("ALL"); setStatusFilter("all"); setLocationFilter(""); setSearch(""); }}
              className="h-9 rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}

          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {rows.length} items
          </div>
        </div>

        {/* Active filter chips */}
        {(typeFilter !== "ALL" || statusFilter !== "all" || locationFilter) ? (
          <div className="flex flex-wrap gap-2">
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
            {locationFilter ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                <MapPin className="h-3 w-3" /> {locationFilter}
                <button type="button" onClick={() => setLocationFilter("")} className="ml-1 opacity-60 hover:opacity-100">×</button>
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
              <div className="mt-3 text-sm font-medium text-foreground">No items match the current filters</div>
              <p className="mt-1 text-xs text-muted-foreground">Try clearing filters or adjusting the category selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On Hand</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reserved</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Available</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Incoming</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reorder</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((row, i) => {
                    const status = getStockStatus(row);
                    return (
                      <tr
                        key={row.sku ?? i}
                        className={`transition-colors hover:bg-muted/30 ${status === "out" ? "bg-red-50/30" : status === "low" ? "bg-amber-50/20" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground leading-snug">{row.product_name ?? row.product_code ?? "—"}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {row.sku ? <span className="font-mono">{row.sku}</span> : null}
                            {row.unit_of_measure ? <span>· {row.unit_of_measure}</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={row.stock_item_type} />
                        </td>
                        <td className="px-4 py-3">
                          {row.default_stock_location_name ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
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
                        <td className="px-4 py-3 text-right">
                          <QtyCell value={row.incoming_qty} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {row.reorder_level_qty ? Number(row.reorder_level_qty).toLocaleString("en-IN") : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StockStatusBadge row={row} />
                          {status === "low" ? (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                              <AlertTriangle className="h-3 w-3" /> Reorder needed
                            </div>
                          ) : null}
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
    </ERPPageShell>
  );
}
