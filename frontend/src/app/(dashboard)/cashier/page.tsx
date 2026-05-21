"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  RefreshCw,
  Wallet,
} from "lucide-react";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardSurfaceExportActions from "@/components/dashboard/DashboardSurfaceExportActions";
import DashboardWidgetBoard from "@/components/dashboard/DashboardWidgetBoard";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import { FormSection, MetricStrip, MobileSafeTable } from "@/components/ui/operations";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import { getCashierDashboard, type CashierTransaction } from "@/services/cashier";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardUpcoming,
  listDashboardWinners,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import type { DashboardWindowPreset } from "@/services/dashboard-types";

type LegacyDashboardPayload = Awaited<ReturnType<typeof getCashierDashboard>>;
type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DashboardDuePayload = Awaited<ReturnType<typeof listDashboardOverdue>>;
type DashboardPaymentsPayload = Awaited<
  ReturnType<typeof listDashboardRecentPayments>
>;
type DashboardWinnersPayload = Awaited<ReturnType<typeof listDashboardWinners>>;

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CashierDashboardPaymentTable({
  rows,
}: {
  rows: CashierTransaction[];
}) {
  return (
    <MobileSafeTable>
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr className="text-left">
            <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Payment
            </th>
            <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Customer
            </th>
            <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Subscription
            </th>
            <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Amount
            </th>
            <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Time
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr
              key={payment.id}
              className={`align-top ${payment.is_reversed ? "opacity-60" : ""}`}
            >
              <td className="border-b border-slate-200 px-4 py-3">
                <Link
                  href={`/cashier/payments/${payment.id}`}
                  className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  #{payment.id}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {payment.method ? (
                    <ERPStatusBadge status={payment.method} hideIcon />
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                  <span className="text-xs text-slate-600">· {payment.reference_no || "No ref"}</span>
                </div>
                {payment.is_reversed ? (
                  <div className="mt-1">
                    <ERPStatusBadge status="REVERSED" hideIcon />
                  </div>
                ) : null}
              </td>
              <td className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-medium text-foreground">
                  {payment.customer_name || "Unknown customer"}
                </div>
                <div className="mt-1 text-xs text-slate-600">{payment.customer_phone || "—"}</div>
              </td>
              <td className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-medium text-foreground">
                  {payment.subscription_number || `SUB-${payment.subscription ?? "—"}`}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Batch {payment.batch_code || "—"} · Lucky {payment.lucky_number ?? "—"}
                </div>
              </td>
              <td className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-semibold text-foreground">{money(payment.amount)}</div>
              </td>
              <td className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm text-foreground">
                  {formatDateTime(payment.created_at)}
                </div>
                <div className="mt-1 text-xs text-slate-600">{formatDate(payment.payment_date)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </MobileSafeTable>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load cashier dashboard.";
}

export default function CashierDashboardPage() {
  const [legacy, setLegacy] = useState<LegacyDashboardPayload | null>(null);
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [upcoming, setUpcoming] = useState<DashboardDuePayload | null>(null);
  const [overdue, setOverdue] = useState<DashboardDuePayload | null>(null);
  const [recentPayments, setRecentPayments] =
    useState<DashboardPaymentsPayload | null>(null);
  const [winnerItems, setWinnerItems] = useState<DashboardWinnersPayload | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("DEFAULT");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const router = useRouter();
  const [receiptLookup, setReceiptLookup] = useState("");
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

  const loadDashboard = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [
          legacyPayload,
          canonicalPayload,
          overduePayload,
          upcomingPayload,
          recentPaymentsPayload,
          winnersPayload,
        ] = await Promise.all([
          getCashierDashboard(),
          getDashboardSummaryV2(dashboardQuery),
          listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
          listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
          listDashboardRecentPayments({ ...dashboardQuery, limit: 12 }),
          listDashboardWinners({ ...dashboardQuery, limit: 4 }),
        ]);

        setLegacy(legacyPayload);
        setCanonical(canonicalPayload);
        setOverdue(overduePayload);
        setUpcoming(upcomingPayload);
        setRecentPayments(recentPaymentsPayload);
        setWinnerItems(winnersPayload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setLegacy(null);
          setCanonical(null);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [dashboardQuery]
  );

  useEffect(() => {
    void loadDashboard("initial");
  }, [loadDashboard]);

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
  const paymentRows = recentPayments?.results ?? [];
  const todayTransactionRows = legacy?.today_transactions ?? [];
  const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
    0,
    8
  );
  const winnerRows = winnerItems?.results ?? [];
  const averageTicketValue =
    legacy && legacy.today_transaction_count > 0
      ? money(Number(legacy.today_total_collected) / legacy.today_transaction_count)
      : "₹0.00";

  return (
    <ERPPageShell
      eyebrow="Counter Operations"
      title="Cashier Dashboard"
      subtitle="Daily counter workspace with canonical financial scope visibility on top, while keeping collection posting and receipt lookup fast for shop operations."
      helperNote="Counter actions here remain branch-safe and traceable; collection posting and receipt generation continue using the existing audited payment flow. Digital totals include UPI, bank, and other non-cash postings returned by the cashier dashboard API."
      helperTone="info"
      breadcrumbs={[{ label: "Cashier" }]}
      actions={[
        {
          href: "/cashier/collect",
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: "/cashier/collect?workflow=direct-sale",
          label: "Collect Direct Sale",
          variant: "secondary",
        },
        {
          href: "/cashier/payments",
          label: "Payment History",
          variant: "secondary",
        },
      ]}
      stats={
        legacy
          ? [
              {
                label: "Collected Today",
                value: money(legacy.today_total_collected),
                tone: "success",
              },
              {
                label: "Receipts Today",
                value: String(legacy.today_transaction_count),
              },
              {
                label: "Cash Today",
                value: money(legacy.today_cash_total),
              },
              {
                label: "Digital Today",
                value: money(legacy.today_digital_total),
                tone: "info",
              },
            ]
          : []
      }
      statusBadge={{ label: "Cashier Operations", tone: "info" }}
    >
      <div className="space-y-6">
        <FormSection
          title="Start at the counter"
          description="Collection-first: post payments from the collect flow. Search receipts when the customer needs proof or a reference lookup."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <ActionButton href="/cashier/collect" variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[200px]">
              Collect payment
            </ActionButton>
            <ActionButton
              href="/cashier/collect?workflow=direct-sale"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              Collect direct sale
            </ActionButton>
            <ActionButton href="/cashier/payments" variant="outline" size="lg" className="w-full sm:w-auto">
              Payment history
            </ActionButton>
          </div>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const q = receiptLookup.trim();
              router.push(q ? `/cashier/payments?q=${encodeURIComponent(q)}` : "/cashier/payments");
            }}
          >
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground">Find a receipt</span>
              <input
                type="search"
                value={receiptLookup}
                onChange={(event) => setReceiptLookup(event.target.value)}
                placeholder="Payment #, reference, phone, SUB-…"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                enterKeyHint="search"
                autoComplete="off"
              />
            </label>
            <div className="flex items-end">
              <ActionButton type="submit" variant="secondary" className="w-full sm:w-auto">
                Search receipts
              </ActionButton>
            </div>
          </form>

          {legacy ? (
            <div className="mt-4">
              <MetricStrip
                items={[
                  {
                    label: "Pending EMIs",
                    value: String(legacy.total_pending_emis),
                    helper: `${money(legacy.total_pending_amount)} outstanding in cashier scope`,
                    href: "/cashier/collect",
                  },
                  {
                    label: "Collected today",
                    value: money(legacy.today_total_collected),
                    helper: `${legacy.today_transaction_count} receipt(s)`,
                  },
                  {
                    label: "Cash today",
                    value: money(legacy.today_cash_total),
                  },
                  {
                    label: "Digital today",
                    value: money(legacy.today_digital_total),
                    helper: "UPI, bank & non-cash (API bucket)",
                  },
                ]}
              />
            </div>
          ) : null}
        </FormSection>

        <div className="flex justify-end">
          <ActionButton
            variant="outline"
            onClick={() => void loadDashboard("refresh")}
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
          title="Counter quick lanes"
          description="Fast route-safe launches for payment posting, direct-sale collection, and receipt lookup."
        >
          <DashboardWidgetBoard
            storageKey="subidha:dashboard-widgets:cashier:v1"
            version={1}
            title="Cashier lane widgets"
            description="Small, role-safe widget lane set for cashier workflows."
            presets={[
              {
                id: "counter-collection",
                label: "Counter collection",
                description: "Keep collection and direct-sale actions at top.",
                order: ["collect-emi", "collect-direct-sale", "history"],
                pinned: ["collect-emi", "collect-direct-sale"],
              },
              {
                id: "payment-history-focus",
                label: "History focus",
                description: "Prioritize payment-history lookup during audit/review windows.",
                order: ["history", "collect-emi", "collect-direct-sale"],
                pinned: ["history"],
              },
            ]}
            widgets={[
              {
                id: "collect-emi",
                title: "Collect EMI payment",
                subtitle: "Open audited cashier collection flow.",
                group: "core",
                fixed: true,
                content: (
                  <ActionButton href="/cashier/collect" variant="outline" className="justify-between">
                    Open collection workspace
                    <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                ),
              },
              {
                id: "collect-direct-sale",
                title: "Collect direct sale",
                subtitle: "Direct-sale posting without mixing EMI ledgers.",
                group: "quick-actions",
                content: (
                  <ActionButton
                    href="/cashier/collect?workflow=direct-sale"
                    variant="outline"
                    className="justify-between"
                  >
                    Open direct-sale flow
                    <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                ),
              },
              {
                id: "history",
                title: "Payment history",
                subtitle: "Lookup customer receipts and prior postings.",
                group: "operational",
                content: (
                  <ActionButton href="/cashier/payments" variant="outline" className="justify-between">
                    Open payment history
                    <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                ),
              },
            ]}
          />
        </WorkspaceSection>

        {loading ? <ERPLoadingState label="Loading cashier dashboard..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load cashier dashboard"
            description={error}
            onRetry={() => void loadDashboard("initial")}
          />
        ) : null}

        {!loading && !error && legacy && summary ? (
          <>
            {(reconciliationSurface?.flagged_count ?? 0) > 0 ? (
              <WorkspaceNotice tone="warning" title="Reconciliation flags in cashier scope">
                {reconciliationSurface?.flagged_count} subscription(s) are flagged for finance review.
                Counter collection rules are unchanged; if a customer disputes balances, coordinate with admin finance
                before promising outcomes.
              </WorkspaceNotice>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Paid"
                value={money(summary.total_paid_amount)}
                subtext={`${summary.paid_emis} EMI already settled across the visible scope`}
                tone="success"
                icon={<Wallet className="h-5 w-5" />}
              />
              <StatCard
                label="Remaining"
                value={money(summary.remaining_amount ?? summary.outstanding_amount)}
                subtext={`${money(summary.total_pending_amount)} still pending in the current scope`}
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
                subtext={`${money(summary.overdue_amount)} currently overdue`}
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
                  <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Next due
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {summary.next_due_subscription_number || "No pending EMI"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {summary.next_due_date
                        ? `${money(summary.next_due_amount)} on ${formatDate(
                            summary.next_due_date
                          )}`
                        : "No pending EMI"}
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Today throughput
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {legacy.today_transaction_count} transactions
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Average ticket {averageTicketValue}
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Winner / waiver
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {winnerSurface?.winner_subscriptions ?? 0} subscriptions
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {money(winnerSurface?.total_waived_amount)}
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
                    />
                  </div>
                  {winnerRows.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {winnerRows.map((row) => (
                        <div
                          key={row.subscription_id}
                          className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
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
                        href="/cashier/payments"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                      >
                        Open history
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
                      subtext="Subscriptions checked in cashier scope"
                      tone="default"
                    />
                    <StatCard
                      label="Flagged"
                      value={String(reconciliationSurface?.flagged_count ?? 0)}
                      subtext="Rows needing admin finance review"
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
              title="Due collection queue"
              description="Next-due contracts ordered by urgency, sourced from the canonical surface endpoints."
              action={
                <>
                  <ActionButton
                    href="/cashier/collect"
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                  >
                    Open collection workspace
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
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {item.subscription_number || `SUB-${String(subscriptionId)}`} ·{" "}
                              {item.product_name || "Linked product"} · Batch{" "}
                              {item.batch_code || "—"} · Lucky {item.lucky_number ?? "—"}
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              Due {formatDate(item.due_date)} · Pending{" "}
                              {money(item.pending_amount)}
                              {item.is_overdue && item.overdue_days
                                ? ` · ${item.overdue_days} day(s) overdue`
                                : ""}
                            </div>
                          </div>
                          <Link
                            href="/cashier/collect"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                          >
                            Open collect
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ERPEmptyState
                  title="No due contracts"
                  description="There are no current next-due rows in the cashier scope."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Posted today"
              description="Same-day counter postings from the cashier dashboard payload (branch/counter scope per API)."
              action={
                <ActionButton href="/cashier/payments" variant="secondary" className="h-9 px-3 text-xs">
                  Open payment history
                </ActionButton>
              }
            >
              {todayTransactionRows.length > 0 ? (
                <CashierDashboardPaymentTable rows={todayTransactionRows} />
              ) : (
                <ERPEmptyState
                  title="No same-day postings in this payload"
                  description="After you collect, refresh the dashboard. The time-window list below may still show earlier receipts."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Recent payments (selected window)"
              description="Rows from the shared recent-payments surface for the dashboard time filter."
              action={
                <>
                  <ActionButton
                    href="/cashier/payments"
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                  >
                    Open payment history
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
                <MobileSafeTable>
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Payment
                        </th>
                        <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Customer
                        </th>
                        <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Subscription
                        </th>
                        <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Amount
                        </th>
                        <th className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((payment) => (
                        <tr
                          key={payment.payment_id}
                          className={`align-top ${payment.is_reversed ? "opacity-60" : ""}`}
                        >
                          <td className="border-b border-slate-200 px-4 py-3">
                            <Link
                              href={`/cashier/payments/${payment.payment_id}`}
                              className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                            >
                              #{payment.payment_id}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {payment.method ? (
                                <ERPStatusBadge status={payment.method} hideIcon />
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                              <span className="text-xs text-slate-600">
                                · {payment.reference_no || "No ref"}
                              </span>
                            </div>
                            {payment.is_reversed ? (
                              <div className="mt-1">
                                <ERPStatusBadge status="REVERSED" hideIcon />
                              </div>
                            ) : null}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-medium text-foreground">
                              {payment.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {payment.customer_phone || "—"}
                            </div>
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-medium text-foreground">
                              {payment.subscription_number ||
                                `SUB-${payment.subscription_id ?? "—"}`}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Batch {payment.batch_code || "—"} · Lucky{" "}
                              {payment.lucky_number ?? "—"}
                            </div>
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3">
                            <div className="text-sm font-semibold text-foreground">
                              {money(payment.amount)}
                            </div>
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3">
                            <div className="text-sm text-foreground">
                              {formatDateTime(payment.created_at)}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              {formatDate(payment.payment_date)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MobileSafeTable>
              ) : (
                <ERPEmptyState
                  title="No transactions in this window"
                  description="Adjust the dashboard time filter or refresh after posting. Use payment history for deeper search."
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
