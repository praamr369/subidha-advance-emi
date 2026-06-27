"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Factory,
  Layers,
  Package,
  PackageX,
  ScrollText,
  TrendingDown,
  Truck,
  Warehouse,
  Wrench,
} from "lucide-react";

import Phase7Guidance from "@/components/admin/workflow/Phase7Guidance";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import {
  getStockSummary,
  listInventoryItems,
  listInventoryMovements,
  listStockAdjustments,
  listStockLocations,
  type StockAdjustment,
  type StockLedgerRow,
  type StockLocation,
  type StockSummaryRow,
} from "@/services/inventory";

function getStockStatus(row: StockSummaryRow) {
  const onHand = parseFloat(row.on_hand_qty || "0");
  const available = parseFloat(row.available_qty || row.on_hand_qty || "0");
  const reorder = parseFloat(row.reorder_level_qty || "0");
  if (onHand <= 0) return "out";
  if (reorder > 0 && onHand <= reorder) return "low";
  if (available <= 0 && onHand > 0) return "reserved";
  return "ok";
}

function KPIBlock({ label, value, sub, tone, icon, href }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon: React.ReactNode;
  href?: string;
}) {
  const toneCls = {
    default: "border-border bg-card",
    success: "border-emerald-200/60 bg-card",
    warning: "border-amber-200/60 bg-card",
    danger: "border-red-200/60 bg-card",
    info: "border-sky-200/60 bg-card",
  }[tone ?? "default"];

  const accentCls = {
    default: "bg-muted/60 text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-red-500/10 text-red-700",
    info: "bg-sky-500/10 text-sky-700",
  }[tone ?? "default"];

  const inner = (
    <div className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${toneCls}`}>
      <div className={`absolute left-0 top-0 h-full w-1 rounded-r-full ${
        tone === "success" ? "bg-emerald-500/70" :
        tone === "warning" ? "bg-amber-500/70" :
        tone === "danger" ? "bg-red-500/70" :
        tone === "info" ? "bg-sky-500/70" :
        "bg-muted-foreground/30"
      }`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</div>
          {sub ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{sub}</div> : null}
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${accentCls}`}>{icon}</div>
      </div>
      {href ? (
        <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
          View <ArrowRight className="h-3 w-3" />
        </div>
      ) : null}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function CategoryRow({ label, count, inStock, low, out, icon, color }: {
  label: string;
  count: number;
  inStock: number;
  low: number;
  out: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${color}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{count} SKUs total</div>
      </div>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{inStock} healthy</span>
        {low > 0 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{low} low</span> : null}
        {out > 0 ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">{out} out</span> : null}
      </div>
      <Link
        href={ROUTES.admin.inventoryStockOnHand}
        className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
      >
        View
      </Link>
    </div>
  );
}

export default function AdminInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [stockSummary, setStockSummary] = useState<StockSummaryRow[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [bridgeRows, setBridgeRows] = useState<StockLedgerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const [itemsPayload, summaryPayload, adjPayload, locPayload, bridgePayload] = await Promise.all([
          listInventoryItems(),
          getStockSummary(),
          listStockAdjustments(),
          listStockLocations(),
          listInventoryMovements({ movement_type: "EMI_DELIVERY_OUT,EMI_RETURN_IN" }),
        ]);
        if (cancelled) return;
        setItemsCount(itemsPayload.count);
        setStockSummary(summaryPayload.results);
        setAdjustments(adjPayload.results);
        setLocations(locPayload.results);
        setBridgeRows(bridgePayload.results.slice(0, 10));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load inventory operations."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => { cancelled = true; };
  }, []);

  const kpis = useMemo(() => {
    const finished = stockSummary.filter(r => r.stock_item_type === "FINISHED_GOOD");
    const raw = stockSummary.filter(r => r.stock_item_type === "RAW_MATERIAL");
    const acc = stockSummary.filter(r => r.stock_item_type === "ACCESSORY");
    const byStatus = (rows: StockSummaryRow[]) => ({
      ok: rows.filter(r => getStockStatus(r) === "ok").length,
      low: rows.filter(r => getStockStatus(r) === "low").length,
      out: rows.filter(r => getStockStatus(r) === "out").length,
    });
    return {
      total: stockSummary.length,
      finished: { count: finished.length, ...byStatus(finished) },
      raw: { count: raw.length, ...byStatus(raw) },
      acc: { count: acc.length, ...byStatus(acc) },
      outOfStock: stockSummary.filter(r => getStockStatus(r) === "out").length,
      lowStock: stockSummary.filter(r => getStockStatus(r) === "low").length,
      inStock: stockSummary.filter(r => getStockStatus(r) === "ok").length,
      belowReorder: stockSummary.filter(r => r.is_below_reorder).length,
    };
  }, [stockSummary]);

  const activeLocations = useMemo(() => locations.filter(l => l.is_active).length, [locations]);
  const draftAdjustments = useMemo(() => adjustments.filter(a => a.status === "DRAFT").length, [adjustments]);
  const latestAdjustment = adjustments[0];
  const latestBridge = bridgeRows[0];

  return (
    <ERPPageShell
      eyebrow="Inventory & Stock"
      title="Stock Posture"
      subtitle="Full inventory dashboard — stock by category, location, and status. Source workflow for all on-hand, available, reserved, and movement records."
      helperNote="Stock counts derive from the explicit stock ledger and opening balances. Purchase payable and vendor payment belong to Purchases & Vendors — not Inventory."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory" },
      ]}
      statusBadge={{ label: "Inventory & Stock", tone: "info" }}
      actions={[
        { href: ROUTES.admin.inventoryStockOnHand, label: "Stock on Hand", variant: "primary" },
        { href: ROUTES.admin.inventoryItems, label: "Items", variant: "secondary" },
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "secondary" },
        { href: ROUTES.admin.inventoryAdjustments, label: "Adjustments", variant: "secondary" },
        { href: ROUTES.admin.inventoryDemandPlanning, label: "Demand Planning", variant: "secondary" },
        { href: ROUTES.admin.purchases, label: "Purchases", variant: "secondary" },
      ]}
      stats={[
        { label: "Tracked Items", value: loading ? "—" : itemsCount, tone: "info" },
        { label: "Active Locations", value: loading ? "—" : activeLocations, tone: "info" },
        { label: "Below Reorder", value: loading ? "—" : kpis.belowReorder, tone: (!loading && kpis.belowReorder > 0 ? "warning" : "success") as "warning" | "success" },
        { label: "Draft Adjustments", value: loading ? "—" : draftAdjustments, tone: (!loading && draftAdjustments > 0 ? "warning" : "default") as "warning" | "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading inventory operations..." /> : null}
      {!loading && error ? <ERPErrorState title="Inventory load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          {/* Primary KPI band */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KPIBlock
              label="Total SKUs"
              value={kpis.total}
              sub="Inventory profiles with active stock tracking."
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
              href={ROUTES.admin.inventoryStockOnHand}
            />
            <KPIBlock
              label="Stock Locations"
              value={activeLocations}
              sub="Active stores, warehouses, and showrooms."
              icon={<Warehouse className="h-5 w-5" />}
              tone={activeLocations > 0 ? "success" : "warning"}
              href={ROUTES.admin.inventoryLocations}
            />
            <KPIBlock
              label="Reorder Alerts"
              value={kpis.belowReorder}
              sub="Items at or below configured reorder level."
              icon={<TrendingDown className="h-5 w-5" />}
              tone={kpis.belowReorder > 0 ? "warning" : "success"}
              href={ROUTES.admin.inventoryStockOnHand}
            />
            <KPIBlock
              label="Out of Stock"
              value={kpis.outOfStock}
              sub="Zero on-hand — cannot fulfil new commitments."
              icon={<PackageX className="h-5 w-5" />}
              tone={kpis.outOfStock > 0 ? "danger" : "success"}
              href={ROUTES.admin.inventoryStockOnHand}
            />
          </div>

          {/* Category breakdown */}
          <ERPSectionShell
            title="Inventory by category"
            description="Stock posture broken down by product type — Finished Goods (for sale/delivery), Raw Materials (manufacturing input), Accessories (components and add-ons)."
          >
            <div className="space-y-2">
              <CategoryRow
                label="Finished Goods"
                count={kpis.finished.count}
                inStock={kpis.finished.ok}
                low={kpis.finished.low}
                out={kpis.finished.out}
                icon={<Package className="h-4 w-4 text-sky-700" />}
                color="bg-sky-100"
              />
              <CategoryRow
                label="Raw Materials"
                count={kpis.raw.count}
                inStock={kpis.raw.ok}
                low={kpis.raw.low}
                out={kpis.raw.out}
                icon={<Factory className="h-4 w-4 text-violet-700" />}
                color="bg-violet-100"
              />
              <CategoryRow
                label="Accessories"
                count={kpis.acc.count}
                inStock={kpis.acc.ok}
                low={kpis.acc.low}
                out={kpis.acc.out}
                icon={<Wrench className="h-4 w-4 text-amber-700" />}
                color="bg-amber-100"
              />
            </div>

            {/* Alert strip */}
            {kpis.outOfStock > 0 || kpis.lowStock > 0 ? (
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${kpis.outOfStock > 0 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {kpis.outOfStock > 0 ? <><strong>{kpis.outOfStock}</strong> items out of stock — </> : null}
                  {kpis.lowStock > 0 ? <><strong>{kpis.lowStock}</strong> items below reorder level — </> : null}
                  review before creating new delivery or sale commitments.
                </span>
                <Link href={ROUTES.admin.inventoryStockOnHand} className="ml-auto shrink-0 rounded-lg border border-current/30 px-3 py-1 text-xs font-semibold hover:opacity-80">
                  View register
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="text-lg">✓</span>
                All tracked items have stock above reorder levels.
              </div>
            )}
          </ERPSectionShell>

          {/* Stock concept definitions + workflow guidance */}
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <ERPSectionShell
              title="Stock movement concepts"
              description="Each stock category has a distinct meaning. No stock count is fabricated — all values come from the live ledger."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { title: "On hand", desc: "Physical stock present at a location — opening stock + receipts − deliveries out + returns + adjustments.", icon: <Layers className="h-4 w-4" /> },
                  { title: "Available", desc: "On hand minus reserved quantity. Available for new delivery commitments.", icon: <Package className="h-4 w-4" /> },
                  { title: "Reserved", desc: "Stock committed to winners and confirmed orders pending delivery handover.", icon: <ClipboardCheck className="h-4 w-4" /> },
                  { title: "Delivery out", desc: "Stock issued via completed delivery — EMI_DELIVERY_OUT movement reduces on-hand.", icon: <Truck className="h-4 w-4" /> },
                  { title: "Adjustment", desc: "Counted stock correction approved through the adjustment workflow.", icon: <ScrollText className="h-4 w-4" /> },
                  { title: "Purchase receipt", desc: "Stock-in from goods receipt. Source workflow is Purchases & Vendors.", icon: <Warehouse className="h-4 w-4" /> },
                ].map(({ title, desc, icon }) => (
                  <div key={title} className="flex gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>

            <ERPSectionShell title="Adjustment & activity" description="Draft adjustments and recent delivery movements.">
              <div className="space-y-3">
                <Link href={ROUTES.admin.inventoryAdjustments} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/30 transition">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Draft adjustments</div>
                    <div className="mt-1 text-xs text-muted-foreground">Awaiting review and approval</div>
                  </div>
                  <span className={`text-2xl font-bold tabular-nums ${draftAdjustments > 0 ? "text-amber-700" : "text-emerald-700"}`}>{draftAdjustments}</span>
                </Link>

                {latestAdjustment ? (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latest adjustment</div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{latestAdjustment.adjustment_no}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <ERPStatusBadge status={latestAdjustment.status} />
                      <span>{accountingDate(latestAdjustment.adjustment_date)}</span>
                    </div>
                  </div>
                ) : null}

                {bridgeRows.length > 0 ? (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent delivery bridge</div>
                    {bridgeRows.slice(0, 3).map((r, i) => (
                      <div key={i} className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{r.product_code}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{r.movement_type.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{accountingDate(r.movement_date)}</span>
                      </div>
                    ))}
                    {bridgeRows.length > 3 ? (
                      <Link href={ROUTES.admin.inventoryMovements} className="mt-2 block text-xs font-medium text-primary hover:underline">
                        View all {bridgeRows.length} movements →
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {latestBridge ? null : (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                    No delivery-linked movements yet. Delivered subscription items will appear here.
                  </div>
                )}
              </div>
            </ERPSectionShell>
          </div>

          <Phase7Guidance
            items={[
              {
                label: "Review Low Stock",
                href: `${ROUTES.admin.inventoryStockOnHand}?below_reorder=1`,
                note: "Check stock before creating delivery or direct-sale commitments.",
                warning: "Stock unavailable alerts must stay visible before delivery handoff.",
              },
              {
                label: "Post Stock Adjustment",
                href: ROUTES.admin.inventoryAdjustments,
                note: "Use adjustment workflow for audited stock corrections.",
              },
            ]}
          />
        </>
      ) : null}
    </ERPPageShell>
  );
}
