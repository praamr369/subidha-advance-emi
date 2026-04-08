"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import { getCashierDashboard } from "@/services/cashier";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardReconciliationExceptions,
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
type DashboardReconciliationPayload = Awaited<
  ReturnType<typeof listDashboardReconciliationExceptions>
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
  const [reconciliationItems, setReconciliationItems] =
    useState<DashboardReconciliationPayload | null>(null);
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
  const dashboardQuery =
    windowPreset === "CUSTOM"
      ? {
          window: windowPreset,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }
      : { window: windowPreset };

  async function loadDashboard(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [
        legacyPayload,
        canonicalPayload,
        overduePayload,
        upcomingPayload,
        recentPaymentsPayload,
        reconciliationPayload,
        winnersPayload,
      ] = await Promise.all([
        getCashierDashboard(),
        getDashboardSummaryV2(dashboardQuery),
        listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
        listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
        listDashboardRecentPayments({ ...dashboardQuery, limit: 12 }),
        listDashboardReconciliationExceptions({ ...dashboardQuery, limit: 4 }),
        listDashboardWinners({ ...dashboardQuery, limit: 4 }),
      ]);

      setLegacy(legacyPayload);
      setCanonical(canonicalPayload);
      setOverdue(overduePayload);
      setUpcoming(upcomingPayload);
      setRecentPayments(recentPaymentsPayload);
      setReconciliationItems(reconciliationPayload);
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
  }

  useEffect(() => {
    void loadDashboard("initial");
  }, [windowPreset, startDate, endDate]);

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
    <PortalPage
      title="Cashier Dashboard"
      subtitle="Daily counter workspace with canonical financial scope visibility on top, while keeping collection posting and receipt lookup fast for shop operations."
      breadcrumbs={[{ label: "Cashier" }]}
      actions={[
        {
          href: "/cashier/collect",
          label: "Collect Payment",
          variant: "primary",
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
                label: "Today Transactions",
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
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadDashboard("refresh")}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
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

        {loading ? <LoadingBlock label="Loading cashier dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load cashier dashboard"
            description={error}
            onRetry={() => void loadDashboard("initial")}
          />
        ) : null}

        {!loading && !error && legacy && summary ? (
          <>
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
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
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
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
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
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
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
                        className="rounded-2xl border border-white/75 bg-white/75 p-4"
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
                            href="/cashier/collect"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
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
                <EmptyState
                  title="No due contracts"
                  description="There are no current next-due rows in the cashier scope."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Today's transactions"
              description="Counter-posted payment rows surfaced through the shared canonical recent-payments endpoint."
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
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Payment
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Amount
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentRows.map((payment) => (
                        <tr key={payment.payment_id} className="align-top">
                          <td className="border-b border-border/70 px-4 py-3">
                            <div className="text-sm font-semibold text-foreground">
                              #{payment.payment_id}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {payment.method || "—"} · {payment.reference_no || "No ref"}
                            </div>
                          </td>
                          <td className="border-b border-border/70 px-4 py-3">
                            <div className="text-sm font-medium text-foreground">
                              {payment.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {payment.customer_phone || "—"}
                            </div>
                          </td>
                          <td className="border-b border-border/70 px-4 py-3">
                            <div className="text-sm font-medium text-foreground">
                              {payment.subscription_number ||
                                `SUB-${payment.subscription_id ?? "—"}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Batch {payment.batch_code || "—"} · Lucky{" "}
                              {payment.lucky_number ?? "—"}
                            </div>
                          </td>
                          <td className="border-b border-border/70 px-4 py-3">
                            <div className="text-sm font-semibold text-foreground">
                              {money(payment.amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {payment.is_reversed ? "Reversed" : "Recorded"}
                            </div>
                          </td>
                          <td className="border-b border-border/70 px-4 py-3">
                            <div className="text-sm text-foreground">
                              {formatDateTime(payment.created_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(payment.payment_date)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No transactions recorded in this window"
                  description="After posting a payment, use Refresh to reload the dashboard totals and transaction list."
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
