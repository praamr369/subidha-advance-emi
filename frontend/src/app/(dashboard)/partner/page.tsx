"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  CircleDollarSign,
  ClipboardList,
  FileSearch,
  Package,
  RefreshCw,
  ShieldCheck,
  Tag,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";
import { resolveApiMediaUrl } from "@/lib/media";

import { getPartnerDashboard } from "@/services/partner";
import { getPartnerNotificationSummary } from "@/services/notifications";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardUpcoming,
  listDashboardRecentPayments,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import { listPublicProducts, type PublicProduct } from "@/services/public";
import { ROUTES } from "@/lib/routes";

function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type KpiCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "default" | "success" | "warning" | "info";
};

function KpiCard({ icon, label, value, sub, href, tone = "default" }: KpiCardProps) {
  const toneClass = {
    default: "bg-card border-border",
    success: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    warning: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    info: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  }[tone];
  const iconClass = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  }[tone];
  const valueClass = {
    default: "text-foreground",
    success: "text-emerald-700 dark:text-emerald-300",
    warning: "text-amber-700 dark:text-amber-300",
    info: "text-blue-700 dark:text-blue-300",
  }[tone];

  const inner = (
    <div className={`flex items-start gap-3.5 rounded-2xl border p-4 ${toneClass} transition active:scale-[0.98]`}>
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-xl font-bold ${valueClass}`}>{value}</p>
        {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

type QuickLinkProps = { href: string; icon: React.ReactNode; label: string; desc?: string; accent?: boolean };
function QuickLink({ href, icon, label, desc, accent }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className={`flex min-h-16 items-center gap-3.5 rounded-2xl border px-4 py-3.5 transition active:scale-[0.98] ${
        accent
          ? "border-primary/60 bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-white/20" : "bg-muted"}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold">{label}</div>
        {desc ? <div className={`text-xs ${accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{desc}</div> : null}
      </div>
      <ArrowRight className="ml-auto size-4 shrink-0 opacity-60" />
    </Link>
  );
}

export default function PartnerDashboardPage() {
  const [productCategory, setProductCategory] = useState("");

  const coreQ = useQuery({ queryKey: ["partner", "dashboard", "core"], queryFn: getPartnerDashboard });
  const summaryQ = useQuery({
    queryKey: ["partner", "dashboard", "summary"],
    queryFn: () => getDashboardSummaryV2({}),
    enabled: coreQ.isSuccess,
  });
  const overdueQ = useQuery({
    queryKey: ["partner", "dashboard", "overdue"],
    queryFn: () => listDashboardOverdue({ limit: 5 }),
    enabled: coreQ.isSuccess,
  });
  const upcomingQ = useQuery({
    queryKey: ["partner", "dashboard", "upcoming"],
    queryFn: () => listDashboardUpcoming({ limit: 5 }),
    enabled: coreQ.isSuccess,
  });
  const paymentsQ = useQuery({
    queryKey: ["partner", "dashboard", "recent-payments"],
    queryFn: () => listDashboardRecentPayments({ limit: 5 }),
    enabled: coreQ.isSuccess,
  });
  const notifQ = useQuery({
    queryKey: ["partner", "dashboard", "notif"],
    queryFn: getPartnerNotificationSummary,
    enabled: coreQ.isSuccess,
  });
  const productsQ = useQuery({
    queryKey: ["public", "products", "partner-dash"],
    queryFn: listPublicProducts,
    enabled: coreQ.isSuccess,
  });

  const legacy = coreQ.data ?? null;
  const canonicalRaw = summaryQ.data ?? null;
  const summary = canonicalRaw?.summary ?? (legacy?.summary ? normalizeDashboardSummary(legacy.summary as unknown as Record<string, unknown>) : null);
  const loading = coreQ.isPending;
  const refreshing = [coreQ, summaryQ, overdueQ, upcomingQ, paymentsQ].some((q) => q.isFetching && !q.isPending);
  const error = coreQ.error ? (coreQ.error instanceof Error ? coreQ.error.message : "Could not load dashboard.") : null;

  const dueRows = useMemo(
    () => [...(overdueQ.data?.results ?? []), ...(upcomingQ.data?.results ?? [])].slice(0, 6),
    [overdueQ.data, upcomingQ.data]
  );
  const paymentRows = paymentsQ.data?.results ?? [];
  const products: PublicProduct[] = productsQ.data?.products ?? [];

  const pendingRequests =
    (legacy?.summary.under_review_collection_requests ?? 0) +
    (legacy?.summary.submitted_collection_requests ?? 0);
  const unread = notifQ.data?.unread_count ?? 0;
  const commissionEarned =
    Number(legacy?.summary.settled_commission ?? 0) +
    Number(legacy?.summary.pending_commission ?? 0);

  function refetchAll() {
    void coreQ.refetch();
    void summaryQ.refetch();
    void overdueQ.refetch();
    void upcomingQ.refetch();
    void paymentsQ.refetch();
    void notifQ.refetch();
  }

  return (
    <div className="w-full px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8">

      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Partner Portal</p>
          <h1 className="text-2xl font-bold text-foreground">Home</h1>
        </div>
        <button
          type="button"
          onClick={refetchAll}
          disabled={loading || refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* ── KPI grid ── */}
      {loading ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Could not load your dashboard numbers. <button onClick={refetchAll} className="font-semibold underline">Try again</button>
        </div>
      ) : (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Users className="size-5" />}
            label="My Customers"
            value={legacy?.summary.total_customers ?? 0}
            sub="Total customers under you"
            href={ROUTES.partner.customers}
            tone="info"
          />
          <KpiCard
            icon={<ClipboardList className="size-5" />}
            label="My Subscriptions"
            value={legacy?.summary.total_subscriptions ?? 0}
            sub="Active + completed contracts"
            href={ROUTES.partner.subscriptions}
            tone="default"
          />
          <KpiCard
            icon={<TrendingUp className="size-5" />}
            label="My Commission"
            value={money(commissionEarned)}
            sub={`${money(legacy?.summary.pending_commission)} pending`}
            href={ROUTES.partner.commissions}
            tone="success"
          />
          <KpiCard
            icon={<AlertTriangle className="size-5" />}
            label="Pending Requests"
            value={pendingRequests}
            sub={`${legacy?.summary.approved_collection_requests ?? 0} approved`}
            href="/partner/collections"
            tone={pendingRequests > 0 ? "warning" : "default"}
          />
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="mb-6">
        <h2 className="mb-3 text-base font-bold text-foreground">Quick Actions</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <QuickLink
            href="/partner/collections/create"
            icon={<CircleDollarSign className="size-5" />}
            label="Submit a Collection"
            desc="Record a payment received from a customer"
            accent
          />
          <QuickLink
            href="/partner/kyc-requests"
            icon={<UserCheck className="size-5" />}
            label="KYC &amp; Login Requests"
            desc="Request KYC or login setup for a customer"
            accent
          />
          <QuickLink
            href="/partner/collections"
            icon={<ClipboardList className="size-5" />}
            label="My Collection Requests"
            desc="Track submitted payment requests"
          />
          <QuickLink
            href={ROUTES.partner.subscriptions}
            icon={<Package className="size-5" />}
            label="My Subscriptions"
            desc="View active and completed contracts"
          />
          <QuickLink
            href={ROUTES.partner.customers}
            icon={<Users className="size-5" />}
            label="My Customers"
            desc="View all customers linked to you"
          />
          <QuickLink
            href="/partner/subscription-requests"
            icon={<FileSearch className="size-5" />}
            label="Subscription Requests"
            desc="Submit or track new plan requests"
          />
          <QuickLink
            href={ROUTES.partner.commissions}
            icon={<Wallet className="size-5" />}
            label="My Earnings"
            desc="Commission and payout history"
          />
          {unread > 0 ? (
            <QuickLink
              href={ROUTES.partner.notifications}
              icon={<Bell className="size-5" />}
              label={`${unread} New Alert${unread > 1 ? "s" : ""}`}
              desc="Tap to view your notifications"
              accent
            />
          ) : (
            <QuickLink
              href={ROUTES.partner.notifications}
              icon={<Bell className="size-5" />}
              label="Alerts &amp; Notifications"
              desc="View messages from admin"
            />
          )}
        </div>
      </div>

      {/* ── Collections Due / Overdue ── */}
      {dueRows.length > 0 ? (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Collections Due</h2>
            <Link href={ROUTES.partner.subscriptions} className="text-xs font-semibold text-primary hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {dueRows.map((item) => {
              const subId = item.subscription_id ?? item.id;
              const overdue = item.is_overdue;
              return (
                <div
                  key={`${subId}-${item.emi_id ?? "x"}`}
                  className={`rounded-2xl border p-4 ${overdue ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20" : "border-border bg-card"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{item.customer_name || "Customer"}</span>
                        {overdue ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Overdue {item.overdue_days ? `${item.overdue_days}d` : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Due soon
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.subscription_number || `SUB-${subId}`} · Due {fmtDate(item.due_date)}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{money(item.pending_amount)}</div>
                    </div>
                    <Link
                      href={`/partner/collections/create?subscription=${subId}`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
                    >
                      Collect
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Recent Requests ── */}
      {legacy?.recent_collection_requests && legacy.recent_collection_requests.length > 0 ? (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Recent Requests</h2>
            <Link href="/partner/collections" className="text-xs font-semibold text-primary hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {legacy.recent_collection_requests.slice(0, 5).map((item) => {
              const statusColors: Record<string, string> = {
                APPROVED: "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300",
                REJECTED: "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300",
                SUBMITTED: "text-blue-700 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300",
                UNDER_REVIEW: "text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300",
                CANCELLED: "text-muted-foreground bg-muted",
              };
              const s = String(item.status || "SUBMITTED");
              return (
                <div key={String(item.id)} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{item.customer_name || "Customer"}</div>
                    <div className="text-xs text-muted-foreground">{item.subscription_number || "—"} · {money(item.amount)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColors[s] ?? "bg-muted text-muted-foreground"}`}>
                      {s === "UNDER_REVIEW" ? "Under Review" : s.charAt(0) + s.slice(1).toLowerCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(item.payment_date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Recent Payments ── */}
      {paymentRows.length > 0 ? (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Recent Payments Verified</h2>
            <Link href="/partner/payments" className="text-xs font-semibold text-primary hover:underline">
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {paymentRows.slice(0, 4).map((item) => (
              <div key={item.payment_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <BadgeCheck className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{item.customer_name || "Customer"}</div>
                  <div className="text-xs text-muted-foreground">{item.subscription_number || "—"} · {item.method || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{money(item.amount)}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDate(item.payment_date)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Products to Sell ── */}
      {products.length > 0 ? (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Products You Can Sell</h2>
            <Link href={ROUTES.partner.subscriptions} className="text-xs font-semibold text-primary hover:underline">
              View subscriptions
            </Link>
          </div>

          {/* Category filter */}
          {(() => {
            const cats = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];
            return cats.length > 1 ? (
              <div className="mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setProductCategory("")}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${!productCategory ? "border-primary/40 bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  All
                </button>
                {cats.slice(0, 6).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setProductCategory(productCategory === cat ? "" : cat)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${productCategory === cat ? "border-primary/40 bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {products
              .filter((p) => !productCategory || p.category === productCategory)
              .slice(0, 8)
              .map((product) => {
                const imgUrl = resolveApiMediaUrl(product.image ?? null);
                return (
                  <div key={product.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md active:scale-[0.98]">
                    {imgUrl ? (
                      <div className="relative h-28 w-full overflow-hidden bg-muted">
                        <Image src={imgUrl} alt={product.name} fill className="object-cover" sizes="(max-width:640px) 50vw, 25vw" />
                      </div>
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-muted/40">
                        <ImageIcon className="size-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="truncate text-sm font-bold text-foreground">{product.name}</div>
                      {product.category ? (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Tag className="size-3" /> {product.category}
                        </div>
                      ) : null}
                      <div className="mt-1.5 text-base font-extrabold text-foreground">
                        ₹{Number(product.base_price).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* ── Bottom nav shortcuts ── */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">All Sections</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {[
            { href: ROUTES.partner.customers, label: "Customers", icon: <Users className="size-5" /> },
            { href: ROUTES.partner.subscriptions, label: "Subscriptions", icon: <Package className="size-5" /> },
            { href: "/partner/collections", label: "Collections", icon: <CircleDollarSign className="size-5" /> },
            { href: "/partner/payments", label: "Payments", icon: <BadgeCheck className="size-5" /> },
            { href: ROUTES.partner.commissions, label: "Earnings", icon: <Wallet className="size-5" /> },
            { href: "/partner/product-requests", label: "Product Requests", icon: <FileSearch className="size-5" /> },
            { href: "/partner/kyc-requests", label: "KYC Requests", icon: <UserCheck className="size-5" /> },
            { href: "/partner/catalog", label: "Catalog", icon: <ShieldCheck className="size-5" /> },
            { href: ROUTES.partner.reports, label: "Reports", icon: <TrendingUp className="size-5" /> },
            { href: ROUTES.partner.notifications, label: "Alerts", icon: <Bell className="size-5" /> },
            { href: "/partner/service-desk", label: "Help Desk", icon: <ClipboardList className="size-5" /> },
            { href: "/partner/profile", label: "My Account", icon: <Users className="size-5" /> },
          ].map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background p-3 text-center transition hover:bg-muted active:scale-[0.97]"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {icon}
              </div>
              <span className="text-[11px] font-semibold text-foreground leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
