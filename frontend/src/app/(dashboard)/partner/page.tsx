"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Package,
  RefreshCw,
  Tag,
  Users,
} from "lucide-react";
import { listPublicProducts, type PublicProduct } from "@/services/public";
import { resolveApiMediaUrl } from "@/lib/media";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardSurfaceExportActions from "@/components/dashboard/DashboardSurfaceExportActions";
import DashboardWidgetBoard from "@/components/dashboard/DashboardWidgetBoard";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import KycDocumentPanel from "@/components/kyc/KycDocumentPanel";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import { PartnerVendorWorkspaceShell } from "@/components/layout/page-shells";
import { WorkspaceSection } from "@/components/ui/workspace";
import { MetricStrip } from "@/components/ui/operations";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import { ROUTES } from "@/lib/routes";
import { changePartnerUsername, getPartnerDashboard } from "@/services/partner";
import {
  getPartnerNotificationSummary,
  type NotificationSummaryResponse,
} from "@/services/notifications";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardUpcoming,
  listDashboardWinners,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
import { useLogout } from "@/hooks/useLogout";

type LegacyDashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;
type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DashboardDuePayload = Awaited<ReturnType<typeof listDashboardOverdue>>;
type DashboardPaymentsPayload = Awaited<
  ReturnType<typeof listDashboardRecentPayments>
>;
type DashboardWinnersPayload = Awaited<ReturnType<typeof listDashboardWinners>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner dashboard.";
}

export default function PartnerDashboardPage() {
  const { logout, isLoggingOut } = useLogout();
  const [legacy, setLegacy] = useState<LegacyDashboardPayload | null>(null);
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [upcoming, setUpcoming] = useState<DashboardDuePayload | null>(null);
  const [overdue, setOverdue] = useState<DashboardDuePayload | null>(null);
  const [recentPayments, setRecentPayments] =
    useState<DashboardPaymentsPayload | null>(null);
  const [winnerItems, setWinnerItems] = useState<DashboardWinnersPayload | null>(
    null
  );
  const [notificationSummary, setNotificationSummary] =
    useState<NotificationSummaryResponse | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [productCategory, setProductCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("DEFAULT");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const dashboardQuery = useMemo(
    () =>
      windowPreset === "CUSTOM"
        ? {
            window: windowPreset,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          }
        : { window: windowPreset },
    [endDate, startDate, windowPreset]
  );

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        // Promise.allSettled — secondary failures don't block the entire dashboard
        const [
          legacyResult,
          canonicalResult,
          overdueResult,
          upcomingResult,
          recentPaymentsResult,
          winnersResult,
          notificationResult,
        ] = await Promise.allSettled([
          getPartnerDashboard(),
          getDashboardSummaryV2(dashboardQuery),
          listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
          listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
          listDashboardRecentPayments({ ...dashboardQuery, limit: 6 }),
          listDashboardWinners({ ...dashboardQuery, limit: 4 }),
          getPartnerNotificationSummary(),
        ]);

        if (legacyResult.status === "rejected") throw legacyResult.reason;
        setLegacy(legacyResult.value);
        setCanonical(canonicalResult.status === "fulfilled" ? canonicalResult.value : null);
        setOverdue(overdueResult.status === "fulfilled" ? overdueResult.value : null);
        setUpcoming(upcomingResult.status === "fulfilled" ? upcomingResult.value : null);
        setRecentPayments(recentPaymentsResult.status === "fulfilled" ? recentPaymentsResult.value : null);
        setWinnerItems(winnersResult.status === "fulfilled" ? winnersResult.value : null);
        setNotificationSummary(notificationResult.status === "fulfilled" ? notificationResult.value : null);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setLegacy(null);
        setCanonical(null);
        setNotificationSummary(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [dashboardQuery]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  // Load products independently — does not affect main dashboard loading
  useEffect(() => {
    listPublicProducts()
      .then(r => setProducts(r.products))
      .catch(() => null);
  }, []);

  const summary =
    canonical?.summary ??
    (legacy?.summary
      ? normalizeDashboardSummary(
          legacy.summary as unknown as Record<string, unknown>
        )
      : undefined);
  const winnerSurface = canonical?.winner_surface ?? legacy?.winner_surface;
  const reconciliationSurface =
    canonical?.reconciliation ?? legacy?.reconciliation;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const winnerPosture = buildWinnerPosture(winnerSurface, summary);
  const reconciliationPosture = buildReconciliationPosture(
    reconciliationSurface
  );
  const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
    0,
    8
  );
  const paymentRows = recentPayments?.results ?? [];
  const winnerRows = winnerItems?.results ?? [];
  const pendingRequests =
    (legacy?.summary.under_review_collection_requests ?? 0) +
    (legacy?.summary.submitted_collection_requests ?? 0);
  const payoutStatusLabel =
    Number(legacy?.summary.pending_commission ?? 0) > 0
      ? "Pending payout"
      : "No pending payout";
  const commissionEarned = Number(
    legacy?.summary.settled_commission ?? 0
  ) + Number(legacy?.summary.pending_commission ?? 0);
  const partnerAtAGlance = legacy
    ? [
    {
      label: "My customers",
      value: String(legacy.summary.total_customers ?? 0),
      href: ROUTES.partner.customers,
    },
    {
      label: "My subscriptions",
      value: String(legacy.summary.total_subscriptions ?? 0),
      href: ROUTES.partner.subscriptions,
    },
    {
      label: "Pending requests",
      value: String(pendingRequests),
      helper: `${legacy.summary.approved_collection_requests ?? 0} approved`,
      href: ROUTES.partner.collectionRequests,
    },
    {
      label: "Commission earned",
      value: money(commissionEarned),
      href: ROUTES.partner.commissions,
    },
    {
      label: "Pending commission",
      value: money(legacy.summary.pending_commission),
      helper: money(legacy.summary.settled_commission) + " settled",
      href: ROUTES.partner.payouts,
    },
    {
      label: "Payout status",
      value: payoutStatusLabel,
      helper: "Based on current commission ledger visibility",
      href: ROUTES.partner.payouts,
    },
    {
      label: "Unread alerts",
      value: String(notificationSummary?.unread_count ?? 0),
      href: ROUTES.partner.notifications,
    },
  ]
    : [];

  const handleUsernameSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setUsernameSaving(true);
      setUsernameError(null);
      setUsernameSuccess(null);
      try {
        const response = await changePartnerUsername({
          new_username: newUsername.trim(),
          current_password: currentPassword,
        });
        if (response.changed && response.requires_relogin) {
          setUsernameSuccess(
            "Username changed. Please sign in again. Changing username does not affect your partner code, customers, commissions, or payout history."
          );
          setCurrentPassword("");
          setTimeout(() => {
            void logout();
          }, 1200);
          return;
        }
        setUsernameSuccess("Username updated.");
      } catch (err) {
        setUsernameError(toErrorMessage(err));
      } finally {
        setUsernameSaving(false);
      }
    },
    [currentPassword, logout, newUsername]
  );

  return (
    <ERPPageShell
      eyebrow="Partner Operations"
      title="Partner Dashboard"
      subtitle="Partner-scoped collection truth aligned to the canonical subscription rollup, with separate operational visibility for request workflow and commission status."
      helperNote="This workspace is partner-scoped and audit-linked; collection and commission rows here are filtered from live operational records."
      helperTone="info"
      breadcrumbs={[{ label: "Partner" }]}
      actions={[
        {
          href: "/partner/finance",
          label: "Finance Summary",
          variant: "secondary",
        },
        {
          href: "/partner/collections/create",
          label: "Submit Collection",
          variant: "primary",
        },
        {
          href: "/partner/collections",
          label: "Collection Queue",
          variant: "secondary",
        },
        {
          href: "/partner/reports",
          label: "Reports",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Partner Scope", tone: "info" }}
    >
      <PartnerVendorWorkspaceShell
        posture={
          legacy ? (
            <MetricStrip
              className="xl:grid-cols-3 2xl:grid-cols-6"
              items={partnerAtAGlance.map((item) => ({
                label: item.label,
                value: item.value,
                helper: item.helper,
                href: item.href,
              }))}
            />
          ) : null
        }
        queues={
        <>
        <div className="flex justify-end">
          <ActionButton
            variant="outline"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
        </div>

        <DashboardTimeWindowSelector
          value={windowPreset}
          startDate={startDate}
          endDate={endDate}
          loading={loading || refreshing}
          onWindowChange={setWindowPreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        <WorkspaceSection
          title="Partner quick lanes"
          description="Jump directly into collections, reports, and subscription intake without leaving partner scope boundaries."
        >
          <DashboardWidgetBoard
            storageKey="subidha:dashboard-widgets:partner:v1"
            version={1}
            title="Partner lane widgets"
            description="Role-safe partner shortcuts for collections, intake queue, and reports."
            presets={[
              {
                id: "collections-first",
                label: "Collections first",
                description: "Keep partner collection submission and follow-up most prominent.",
                order: ["collections", "requests", "reports"],
                pinned: ["collections", "requests"],
              },
              {
                id: "request-review",
                label: "Request review",
                description: "Prioritize intake request queue and review actions.",
                order: ["requests", "collections", "reports"],
                pinned: ["requests"],
              },
              {
                id: "reports-focus",
                label: "Reports focus",
                description: "Bring reporting shortcut first for review and payout preparation windows.",
                order: ["reports", "collections", "requests"],
                pinned: ["reports"],
              },
            ]}
            widgets={[
              {
                id: "collections",
                title: "Submit collection",
                subtitle: "Create controlled partner collection requests.",
                group: "core",
                fixed: true,
                content: (
                  <div className="flex flex-col gap-2">
                    <ActionButton href="/partner/collections/create" variant="outline" className="justify-between">
                      Open collection form
                      <ArrowRight className="h-4 w-4" />
                    </ActionButton>
                    <ActionButton href={ROUTES.partner.collectionRequests} variant="outline" className="justify-between">
                      Request register
                      <ArrowRight className="h-4 w-4" />
                    </ActionButton>
                  </div>
                ),
              },
              {
                id: "requests",
                title: "Request queue",
                subtitle: "Partner subscription request review trail.",
                group: "quick-actions",
                content: (
                  <ActionButton href="/partner/subscription-requests" variant="outline" className="justify-between">
                    Open request queue
                    <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                ),
              },
              {
                id: "reports",
                title: "Reports",
                subtitle: "Partner-scoped collection/commission reporting.",
                group: "operational",
                content: (
                  <ActionButton href="/partner/reports" variant="outline" className="justify-between">
                    Open reports
                    <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                ),
              },
            ]}
          />
        </WorkspaceSection>

        <KycDocumentPanel mode="self" portal="partner" />

        {/* ── Products showcase ── partners see admin-approved products to market and sell */}
        {products.length > 0 ? (
          <WorkspaceSection
            title="Products you can market"
            description="Admin-approved product catalog — EMI, rent, and subscription plans available. Share these with your customers to grow your portfolio."
            actionHref={ROUTES.partner.subscriptions}
            actionLabel="My subscriptions"
          >
            {/* Category filter pills */}
            {(() => {
              const cats = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
              return cats.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setProductCategory("")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${!productCategory ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
                  >
                    All
                  </button>
                  {cats.slice(0, 8).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setProductCategory(productCategory === cat ? "" : cat)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${productCategory === cat ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products
                .filter(p => !productCategory || p.category === productCategory)
                .slice(0, 8)
                .map(product => {
                  const imgUrl = resolveApiMediaUrl(product.image ?? null);
                  return (
                    <div key={product.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md">
                      {imgUrl ? (
                        <div className="relative h-36 w-full overflow-hidden bg-muted">
                          <Image src={imgUrl} alt={product.name} fill className="object-cover transition group-hover:scale-105" sizes="(max-width: 768px) 50vw, 25vw" />
                        </div>
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-muted/40">
                          <Package className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="p-3">
                        <div className="truncate text-sm font-semibold text-foreground">{product.name}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{product.product_code}</div>
                        {product.category ? (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Tag className="h-3 w-3" /> {product.category}
                          </div>
                        ) : null}
                        <div className="mt-2 text-sm font-bold text-foreground">₹{Number(product.base_price).toLocaleString("en-IN")}</div>
                        <Link
                          href={`${ROUTES.partner.subscriptions}`}
                          className="mt-2 flex items-center justify-between text-xs font-semibold text-primary hover:underline"
                        >
                          View subscription plans <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
            </div>
            {products.length > 8 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Showing 8 of {products.length} products. All are eligible for subscription, EMI, or direct-sale onboarding.
              </p>
            ) : null}
          </WorkspaceSection>
        ) : null}

        {loading ? <ERPLoadingState label="Loading partner dashboard..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load partner dashboard"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && legacy && summary ? (
          <>
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                At a glance
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Partner-safe shortcuts for customers, subscriptions, requests, collections, and commission visibility.
              </p>
              <div className="mt-4">
                <MetricStrip items={partnerAtAGlance} />
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Paid"
                value={money(summary.total_paid_amount)}
                subtext={`${summary.paid_emis} EMI already reflected in partner-visible settlement truth`}
                tone="success"
                icon={<CircleDollarSign className="h-5 w-5" />}
              />
              <StatCard
                label="Remaining"
                value={money(summary.remaining_amount ?? summary.outstanding_amount)}
                subtext={`${money(summary.total_pending_amount)} still open inside this partner scope`}
                tone={
                  Number(summary.remaining_amount ?? summary.outstanding_amount ?? 0) > 0
                    ? "info"
                    : "success"
                }
                icon={<CreditCard className="h-5 w-5" />}
              />
              <StatCard
                label="Overdue EMI"
                value={String(summary.overdue_emis ?? 0)}
                subtext={`${money(summary.overdue_amount)} currently overdue in partner scope`}
                tone={(summary.overdue_emis ?? 0) > 0 ? "warning" : "default"}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <StatCard
                label="Upcoming EMI"
                value={String(summary.upcoming_emis ?? 0)}
                subtext={
                  summary.next_due_date && summary.next_due_amount
                    ? `${money(summary.next_due_amount)} next on ${formatDate(
                        summary.next_due_date
                      )}`
                    : "No next due row is currently visible"
                }
                tone="default"
                icon={<CalendarClock className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <section
                className={`rounded-[1.8rem] border p-6 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.52)] ${settlementPosture?.tone}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Settlement posture
                    </p>
                    <h2 className="mt-3 text-xl font-semibold text-slate-950">
                      {settlementPosture?.title}
                    </h2>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${settlementPosture?.badgeClass}`}
                  >
                    {settlementPosture?.badgeLabel}
                  </span>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700">
                  {settlementPosture?.description}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Next due contract
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {summary.next_due_subscription_number || "No due contract"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {summary.next_due_date
                        ? `${money(summary.next_due_amount)} on ${formatDate(
                            summary.next_due_date
                          )}`
                        : "No pending EMI"}
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Collection pipeline
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {legacy.summary.under_review_collection_requests ?? 0} under review
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.summary.submitted_collection_requests ?? 0} submitted,{" "}
                      {legacy.summary.approved_collection_requests ?? 0} approved
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Commission posture
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {money(legacy.summary.pending_commission)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {money(legacy.summary.settled_commission)} already settled
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-4">
                <WorkspaceSection
                  title={winnerPosture.title}
                  description={winnerPosture.description}
                  className="h-full"
                  action={
                    <DashboardSurfaceExportActions
                      query={dashboardQuery}
                      actions={[{ surface: "winners", label: "Export CSV" }]}
                    />
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Winner subscriptions"
                      value={String(
                        winnerSurface?.winner_subscriptions ??
                          summary.winner_subscriptions ??
                          0
                      )}
                      subtext={`${winnerSurface?.waived_emis ?? summary.waived_emis ?? 0} waived EMI rows`}
                      tone="info"
                      icon={<BadgeCheck className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Waived value"
                      value={money(
                        winnerSurface?.total_waived_amount ??
                          summary.total_waived_amount
                      )}
                      subtext={winnerPosture.badgeLabel}
                      tone="default"
                      icon={<Users className="h-5 w-5" />}
                    />
                  </div>
                  {winnerRows.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {winnerRows.map((row) => (
                        <div
                          key={row.subscription_id}
                          className="rounded-[1.2rem] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700"
                        >
                          <div className="font-semibold text-slate-950">
                            {row.subscription_number}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.customer_name || "Unknown customer"}
                            {row.waived_amount
                              ? ` • Waived ${money(row.waived_amount)}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </WorkspaceSection>

                <WorkspaceSection
                  title={reconciliationPosture.title}
                  description={reconciliationPosture.description}
                  className={reconciliationPosture.tone}
                  action={
                    <>
                      <ActionButton
                        href="/partner/reports"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                      >
                        Open reports
                      </ActionButton>
                      <DashboardSurfaceExportActions
                        query={dashboardQuery}
                        actions={[
                          {
                            surface: "reconciliation-exceptions",
                            label: "Export CSV",
                          },
                        ]}
                      />
                    </>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Checked"
                      value={String(reconciliationSurface?.checked_count ?? 0)}
                      subtext="Subscriptions checked in this partner scope"
                      tone="default"
                    />
                    <StatCard
                      label="Flagged"
                      value={String(reconciliationSurface?.flagged_count ?? 0)}
                      subtext="Rows needing follow-up"
                      tone={
                        (reconciliationSurface?.flagged_count ?? 0) > 0
                          ? "warning"
                          : "success"
                      }
                    />
                  </div>
                </WorkspaceSection>
              </div>
            </div>

            <WorkspaceSection
              title="Required actions"
              description="Subscriptions flagged for follow-up in your partner scope."
              action={
                <ActionButton href={ROUTES.partner.subscriptions} variant="secondary" className="h-9 px-3 text-xs">
                  Browse subscriptions
                </ActionButton>
              }
            >
              {legacy.follow_up_queue && legacy.follow_up_queue.length > 0 ? (
                <div className="grid gap-3">
                  {legacy.follow_up_queue.slice(0, 8).map((item) => (
                    <div
                      key={String(item.id)}
                      className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {item.customer_name || "Customer"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.subscription_number || `SUB-${String(item.subscription_id ?? "")}`} ·{" "}
                            {item.reason || "Follow-up required"}
                          </div>
                          {item.pending_amount ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Pending {money(item.pending_amount)}
                              {item.overdue_days ? ` · ${item.overdue_days} day(s) overdue` : ""}
                            </div>
                          ) : null}
                        </div>
                        <Link
                          href={`/partner/subscriptions/${String(item.subscription_id ?? "")}`}
                          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                        >
                          Open subscription
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ERPEmptyState
                  title="No required actions"
                  description="No follow-up queue items are currently visible for your partner scope."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Due collection queue"
              description="Partner-scoped next-due contracts ordered by urgency, sourced from the canonical surface endpoints."
              action={
                <>
                  <ActionButton
                    href="/partner/subscriptions"
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                  >
                    Open subscriptions
                  </ActionButton>
                  <DashboardSurfaceExportActions
                    query={dashboardQuery}
                    actions={[
                      { surface: "upcoming", label: "Export upcoming" },
                      { surface: "overdue", label: "Export overdue" },
                    ]}
                  />
                </>
              }
            >
              {dueRows.length > 0 ? (
                <div className="grid gap-3">
                  {dueRows.map((item) => {
                    const subscriptionId = item.subscription_id ?? item.id;
                    return (
                      <div
                        key={`${subscriptionId}-${item.emi_id ?? "na"}`}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.subscription_number || `SUB-${String(subscriptionId)}`} ·{" "}
                              {item.product_name || "Linked product"} · Batch{" "}
                              {item.batch_code || "—"} · Lucky {item.lucky_number ?? "—"}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Due {formatDate(item.due_date)} · Pending{" "}
                              {money(item.pending_amount)}
                              {item.is_overdue && item.overdue_days
                                ? ` · ${item.overdue_days} day(s) overdue`
                                : ""}
                            </div>
                          </div>
                          <Link
                            href={`/partner/collections/create?subscription=${String(subscriptionId)}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                          >
                            Collect
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ERPEmptyState
                  title="No due subscriptions"
                  description="There are no current next-due rows inside this partner scope."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Change username"
              description="Changing username does not affect your partner code, customers, commissions, or payout history."
            >
              <h2 className="text-lg font-semibold text-foreground">Change username</h2>
              {usernameError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {usernameError}
                </div>
              ) : null}
              {usernameSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {usernameSuccess}
                </div>
              ) : null}
              <form onSubmit={handleUsernameSubmit} className="grid gap-3 md:grid-cols-2">
                <input
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  placeholder="New username"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  required
                />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Current password"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={usernameSaving || isLoggingOut}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {usernameSaving ? "Updating username..." : "Change Username"}
                </button>
              </form>
            </WorkspaceSection>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Recent collection requests"
                description="Request workflow visibility stays operational only and does not redefine settlement truth."
                actionHref={ROUTES.partner.collectionRequests}
                actionLabel="View register"
              >
                {legacy.recent_collection_requests &&
                legacy.recent_collection_requests.length > 0 ? (
                  <div className="grid gap-3">
                    {legacy.recent_collection_requests.slice(0, 6).map((item) => (
                      <div
                        key={String(item.id)}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.subscription_number || "Subscription pending"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.customer_name || "Unknown customer"} ·{" "}
                              {money(item.amount)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {item.status || "SUBMITTED"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(item.payment_date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ERPEmptyState
                    title="No recent requests"
                    description="No recent partner collection requests are currently visible."
                  />
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title="Recent verified payments"
                description="Verified payment rows now come from the shared canonical recent-payments surface while broader admin finance controls stay out of this dashboard."
                action={
                  <>
                    <ActionButton
                      href="/partner/payments"
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                    >
                      Open payments
                    </ActionButton>
                    <DashboardSurfaceExportActions
                      query={dashboardQuery}
                      actions={[
                        {
                          surface: "recent-payments",
                          label: "Export CSV",
                        },
                      ]}
                    />
                  </>
                }
              >
                {paymentRows.length > 0 ? (
                  <div className="grid gap-3">
                    {paymentRows.map((item) => (
                      <div
                        key={item.payment_id}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.subscription_number || "Subscription pending"} ·{" "}
                              {item.method || "—"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {money(item.amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(item.payment_date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ERPEmptyState
                    title="No verified payments"
                    description="No verified partner-visible payment rows are currently visible."
                  />
                )}
              </WorkspaceSection>
            </div>
          </>
        ) : null}

        {!loading && (error || !legacy || !summary) ? (
          <WorkspaceSection
            title="Change username"
            description="Username changes do not alter partner code, customers, commissions, or payout history."
          >
            <h2 className="text-lg font-semibold text-foreground">Change username</h2>
            {usernameError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {usernameError}
              </div>
            ) : null}
            {usernameSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {usernameSuccess}
              </div>
            ) : null}
            <form onSubmit={handleUsernameSubmit} className="grid gap-3 md:grid-cols-2">
              <input
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="New username"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                required
              />
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                required
              />
              <button
                type="submit"
                disabled={usernameSaving || isLoggingOut}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {usernameSaving ? "Updating username..." : "Change Username"}
              </button>
            </form>
          </WorkspaceSection>
        ) : null}
        </>
        }
      />
    </ERPPageShell>
  );
}
