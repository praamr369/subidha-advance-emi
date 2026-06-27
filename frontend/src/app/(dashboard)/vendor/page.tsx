"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  MapPin,
  Package,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Tag,
  Wallet,
} from "lucide-react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { resolveApiMediaUrl } from "@/lib/media";
import {
  getVendorNotificationSummary,
  type NotificationSummaryResponse,
} from "@/services/notifications";
import {
  listVendorDashboard,
  listVendorProducts,
  listVendorPurchaseOrders,
  getVendorOutstanding,
} from "@/services/vendor-ops";

type VendorDashboard = {
  pending_quote_requests?: number;
  accepted_quotes?: number;
  outstanding_payable?: string | number;
  purchase_orders?: number;
  purchase_returns?: number;
  products_count?: number;
  pending_purchase_bills?: string | number;
};

type VendorProduct = {
  id: number;
  product_name?: string;
  name?: string;
  product_code?: string;
  category?: string;
  subcategory?: string;
  location?: string;
  stock_location?: string;
  stock_location_name?: string;
  is_approved?: boolean;
  status?: string;
  image?: string | null;
  image_url?: string | null;
  unit_cost?: string | number | null;
  standard_unit_cost?: string | number | null;
  quantity?: string | number;
};

type VendorPO = {
  id: number;
  po_no?: string;
  status?: string;
  po_date?: string;
  vendor_name?: string;
  notes?: string;
  lines?: unknown[];
};

type VendorOutstanding = {
  total_payable?: string | number;
  total_paid?: string | number;
  pending_bills?: string | number;
};

const EMPTY_VENDOR_PRODUCTS: VendorProduct[] = [];
const EMPTY_VENDOR_PURCHASE_ORDERS: VendorPO[] = [];

function fmt(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : String(v);
}

function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "").toUpperCase();
  const cls =
    s === "APPROVED" || s === "RECEIVED" || s === "ACTIVE"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : s === "DRAFT"
      ? "bg-muted text-muted-foreground border-border"
      : s === "SENT" || s === "PENDING"
      ? "bg-sky-50 text-sky-800 border-sky-200"
      : s === "PARTIALLY_RECEIVED"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : s === "CANCELLED"
      ? "bg-red-50 text-red-800 border-red-200"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status ?? "—"}
    </span>
  );
}

function KPICard({ label, value, sub, href, icon, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "info";
}) {
  const accentCls = {
    default: "bg-muted/60 text-muted-foreground",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-red-500/10 text-red-700",
    success: "bg-emerald-500/10 text-emerald-700",
    info: "bg-sky-500/10 text-sky-700",
  }[tone ?? "default"];
  const borderCls = {
    default: "border-border",
    warning: "border-amber-200/60",
    danger: "border-red-200/60",
    success: "border-emerald-200/60",
    info: "border-sky-200/60",
  }[tone ?? "default"];
  const inner = (
    <div className={`group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md ${borderCls}`}>
      <div className={`absolute left-0 top-0 h-full w-1 rounded-r-full ${
        tone === "success" ? "bg-emerald-500/70" :
        tone === "warning" ? "bg-amber-500/70" :
        tone === "danger" ? "bg-red-500/70" :
        tone === "info" ? "bg-sky-500/70" : "bg-muted-foreground/30"
      }`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">{value}</div>
          {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
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

function ProductCard({ product }: { product: VendorProduct }) {
  const name = product.product_name ?? product.name ?? "—";
  const imageUrl = resolveApiMediaUrl(product.image ?? product.image_url ?? null);
  const cost = product.unit_cost ?? product.standard_unit_cost;
  const isApproved = product.is_approved || (product.status ?? "").toUpperCase() === "APPROVED";

  return (
    <div className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md">
      {imageUrl ? (
        <div className="relative h-36 w-full overflow-hidden bg-muted">
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover transition group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {isApproved ? (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </div>
          ) : null}
        </div>
      ) : (
        <div className="relative flex h-36 w-full items-center justify-center bg-muted/50">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          {isApproved ? (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </div>
          ) : null}
        </div>
      )}
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-foreground">{name}</div>
        {product.product_code ? (
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{product.product_code}</div>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {product.category ? (
            <span className="flex items-center gap-0.5">
              <Tag className="h-3 w-3" /> {product.category}
            </span>
          ) : null}
          {product.stock_location_name ?? product.location ? (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {product.stock_location_name ?? product.location}
            </span>
          ) : null}
        </div>
        {cost ? (
          <div className="mt-2 text-sm font-bold text-foreground">
            {formatRupee(cost)} <span className="text-xs font-normal text-muted-foreground">/ unit</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function VendorDashboardPage() {
  // Product filter state
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const coreQuery = useQuery({
    queryKey: ["vendor", "dashboard", "core"],
    queryFn: listVendorDashboard,
  });
  const productsQuery = useQuery({
    queryKey: ["vendor", "dashboard", "products"],
    queryFn: listVendorProducts,
    enabled: coreQuery.isSuccess,
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: ["vendor", "dashboard", "purchase-orders"],
    queryFn: listVendorPurchaseOrders,
    enabled: coreQuery.isSuccess,
  });
  const outstandingQuery = useQuery({
    queryKey: ["vendor", "dashboard", "outstanding"],
    queryFn: getVendorOutstanding,
    enabled: coreQuery.isSuccess,
  });
  const notificationSummaryQuery = useQuery({
    queryKey: ["vendor", "dashboard", "notification-summary"],
    queryFn: getVendorNotificationSummary,
    enabled: coreQuery.isSuccess,
  });

  const productsPayload = productsQuery.data as
    | { results?: VendorProduct[] }
    | VendorProduct[]
    | undefined;
  const ordersPayload = purchaseOrdersQuery.data as
    | { results?: VendorPO[] }
    | VendorPO[]
    | undefined;
  const dashboard = (coreQuery.data as VendorDashboard | undefined) ?? null;
  const products = productsPayload
    ? Array.isArray(productsPayload)
      ? productsPayload
      : (productsPayload.results ?? EMPTY_VENDOR_PRODUCTS)
    : EMPTY_VENDOR_PRODUCTS;
  const purchaseOrders = ordersPayload
    ? Array.isArray(ordersPayload)
      ? ordersPayload
      : (ordersPayload.results ?? EMPTY_VENDOR_PURCHASE_ORDERS)
    : EMPTY_VENDOR_PURCHASE_ORDERS;
  const outstanding =
    (outstandingQuery.data as VendorOutstanding | undefined) ?? null;
  const notifSummary: NotificationSummaryResponse | null =
    notificationSummaryQuery.data ?? null;
  const loading = coreQuery.isPending;
  const refreshing = [
    coreQuery,
    productsQuery,
    purchaseOrdersQuery,
    outstandingQuery,
    notificationSummaryQuery,
  ].some((query) => query.isFetching && !query.isPending);
  const error = coreQuery.error
    ? coreQuery.error instanceof Error
      ? coreQuery.error.message
      : "Unable to load vendor dashboard."
    : null;

  function refreshDashboard() {
    void coreQuery.refetch();
    void productsQuery.refetch();
    void purchaseOrdersQuery.refetch();
    void outstandingQuery.refetch();
    void notificationSummaryQuery.refetch();
  }

  // Derived filter lists
  const categories = useMemo(() => {
    const s = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [products]);

  const locations = useMemo(() => {
    const s = new Set(products.map(p => p.stock_location_name ?? p.location).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let out = products;
    if (categoryFilter) out = out.filter(p => p.category === categoryFilter);
    if (locationFilter) out = out.filter(p => (p.stock_location_name ?? p.location) === locationFilter);
    return out;
  }, [products, categoryFilter, locationFilter]);

  const openPOs = purchaseOrders.filter(po => {
    const s = (po.status ?? "").toUpperCase();
    return s !== "RECEIVED" && s !== "CANCELLED";
  });

  const unread = notifSummary?.unread_count ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top nav bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Vendor Portal</div>
            <div className="text-lg font-bold text-foreground">Dashboard</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <Link href={ROUTES.vendor.notifications} className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted">
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-4 py-6">
        {loading ? (
          <ERPLoadingState label="Loading vendor dashboard…" />
        ) : error ? (
          <ERPErrorState title="Dashboard unavailable" description={error} onRetry={() => void coreQuery.refetch()} />
        ) : (
          <>
            {/* ── KPI band ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="Open Quote Requests"
                value={fmt(dashboard?.pending_quote_requests)}
                sub="Pending your response"
                href={ROUTES.vendor.quotes}
                icon={<FileText className="h-5 w-5" />}
                tone="info"
              />
              <KPICard
                label="Purchase Orders"
                value={fmt(dashboard?.purchase_orders ?? openPOs.length)}
                sub="Active POs from admin"
                href={ROUTES.vendor.orders}
                icon={<ShoppingCart className="h-5 w-5" />}
                tone={openPOs.length > 0 ? "warning" : "default"}
              />
              <KPICard
                label="Outstanding Payable"
                value={formatRupee(outstanding?.total_payable ?? dashboard?.outstanding_payable)}
                sub="Amount owed to you"
                href={ROUTES.vendor.outstanding}
                icon={<Wallet className="h-5 w-5" />}
                tone={Number(outstanding?.total_payable ?? dashboard?.outstanding_payable ?? 0) > 0 ? "success" : "default"}
              />
              <KPICard
                label="Catalog Products"
                value={fmt(products.length || dashboard?.products_count)}
                sub="Products in your catalog"
                href={ROUTES.vendor.products}
                icon={<Package className="h-5 w-5" />}
                tone="default"
              />
            </div>

            {/* ── Outstanding summary strip ── */}
            {outstanding ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Wallet className="h-4 w-4 text-emerald-600" /> Payment Summary
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex flex-wrap items-center gap-5 text-sm">
                  <span>
                    <span className="text-muted-foreground">Total payable: </span>
                    <span className="font-bold text-foreground">{formatRupee(outstanding.total_payable)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Paid: </span>
                    <span className="font-bold text-emerald-700">{formatRupee(outstanding.total_paid)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Pending bills: </span>
                    <span className="font-bold text-amber-700">{formatRupee(outstanding.pending_bills ?? dashboard?.pending_purchase_bills)}</span>
                  </span>
                </div>
                <Link href={ROUTES.vendor.outstanding} className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Full statement <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}

            {/* ── Products section ── */}
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-bold text-foreground">Your Product Catalog</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Products you supply to admin — photos, categories, and delivery locations.
                  </div>
                </div>
                <Link href={ROUTES.vendor.products} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                  Manage catalog <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Filters */}
              {(categories.length > 0 || locations.length > 0) ? (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {categories.length > 0 ? (
                    <select
                      value={categoryFilter}
                      onChange={e => setCategoryFilter(e.target.value)}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground"
                    >
                      <option value="">All categories</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : null}
                  {locations.length > 0 ? (
                    <select
                      value={locationFilter}
                      onChange={e => setLocationFilter(e.target.value)}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground"
                    >
                      <option value="">All locations</option>
                      {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : null}
                  {(categoryFilter || locationFilter) ? (
                    <button
                      type="button"
                      onClick={() => { setCategoryFilter(""); setLocationFilter(""); }}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">{filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}</span>
                </div>
              ) : null}

              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                  <div className="mt-3 text-sm font-semibold text-foreground">No products yet</div>
                  <div className="mt-1 text-xs text-muted-foreground">Add products to your catalog to get started.</div>
                  <Link href={ROUTES.vendor.products} className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                    Manage catalog
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredProducts.slice(0, 12).map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
              {filteredProducts.length > 12 ? (
                <div className="mt-4 text-center">
                  <Link href={ROUTES.vendor.products} className="text-xs font-semibold text-primary hover:underline">
                    View all {filteredProducts.length} products →
                  </Link>
                </div>
              ) : null}
            </section>

            {/* ── Purchase Orders ── */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-base font-bold text-foreground">Purchase Orders</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Open and recent POs from admin — fulfillment status and actions.</div>
                </div>
                <Link href={ROUTES.vendor.orders} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                  All orders <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {purchaseOrders.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
                  <ClipboardList className="h-5 w-5 shrink-0" />
                  No purchase orders yet. POs from admin will appear here.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">PO Number</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Items</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.slice(0, 8).map((po, i) => (
                        <tr key={po.id} className={`border-b border-border last:border-0 transition hover:bg-muted/30 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{po.po_no ?? `PO-${po.id}`}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{po.po_date ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{Array.isArray(po.lines) ? po.lines.length : "—"}</td>
                          <td className="px-4 py-3"><StatusPill status={po.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <Link href={ROUTES.vendor.orders} className="text-xs font-semibold text-primary hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {purchaseOrders.length > 8 ? (
                    <div className="border-t border-border px-4 py-2 text-center">
                      <Link href={ROUTES.vendor.orders} className="text-xs font-semibold text-primary hover:underline">
                        View all {purchaseOrders.length} purchase orders →
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/* ── Quick actions ── */}
            <section>
              <div className="mb-4 text-base font-bold text-foreground">Quick Actions</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[
                  { href: ROUTES.vendor.quotes, icon: <FileText className="h-5 w-5 text-sky-600" />, label: "Quote Requests", desc: "Submit rates for open RFQ requests.", bg: "bg-sky-50" },
                  { href: ROUTES.vendor.orders, icon: <ShoppingCart className="h-5 w-5 text-violet-600" />, label: "Purchase Orders", desc: "Track POs and fulfillment.", bg: "bg-violet-50" },
                  { href: ROUTES.vendor.outstanding, icon: <Wallet className="h-5 w-5 text-emerald-600" />, label: "Outstanding", desc: "View payable balance and status.", bg: "bg-emerald-50" },
                  { href: ROUTES.vendor.ledger, icon: <ClipboardList className="h-5 w-5 text-amber-600" />, label: "Ledger", desc: "Review all posted ledger entries.", bg: "bg-amber-50" },
                  { href: ROUTES.vendor.products, icon: <Package className="h-5 w-5 text-rose-600" />, label: "Products", desc: "Manage your product catalog.", bg: "bg-rose-50" },
                  { href: ROUTES.vendor.purchaseReturns, icon: <RotateCcw className="h-5 w-5 text-orange-600" />, label: "Purchase Returns", desc: "View and track return records.", bg: "bg-orange-50" },
                  { href: ROUTES.vendor.documents, icon: <PackageCheck className="h-5 w-5 text-teal-600" />, label: "Documents", desc: "Access bills, agreements, receipts.", bg: "bg-teal-50" },
                  { href: ROUTES.vendor.notifications, icon: <Bell className="h-5 w-5 text-indigo-600" />, label: "Notifications", desc: "Alerts and action items.", bg: "bg-indigo-50" },
                ].map(({ href, icon, label, desc, bg }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md hover:border-ring"
                  >
                    <div className={`mt-0.5 shrink-0 rounded-xl p-2 ${bg}`}>{icon}</div>
                    <div>
                      <div className="text-sm font-semibold text-foreground group-hover:text-primary">{label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                    </div>
                    <ChevronRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </section>

            {/* Stats summary row */}
            <div className="flex flex-wrap gap-4 rounded-2xl border border-border bg-muted/30 px-5 py-4 text-sm">
              <span><span className="text-muted-foreground">Accepted quotes: </span><span className="font-bold">{fmt(dashboard?.accepted_quotes)}</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Returns: </span><span className="font-bold">{fmt(dashboard?.purchase_returns)}</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Pending bills: </span><span className="font-bold">{formatRupee(dashboard?.pending_purchase_bills)}</span></span>
              <span className="text-border">|</span>
              <span><span className="text-muted-foreground">Catalog items: </span><span className="font-bold">{fmt(products.length || dashboard?.products_count)}</span></span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
