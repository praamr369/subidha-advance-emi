"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  buildSubscriptionDetailSemantics,
  formatLuckyNumberLabel,
  formatWinnerMonthLabel,
} from "@/domains/subscriptions/detail/view-model";
import {
  getPartnerSubscriptionDetail,
  type PartnerSubscriptionDetail,
  type PartnerSubscriptionEmi,
} from "@/services/partner";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function money(value: unknown): string {
  return `₹${toNumber(value).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isPastDue(value?: string | null): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed.getTime() < today.getTime();
}

function diffInDays(value?: string | null): number {
  if (!value) return 0;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(parsed);
  dueDate.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
  );
}

type EmiRow = {
  id: number;
  month_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  waived_amount: number;
  outstanding_amount: number;
  status: string;
  is_overdue: boolean;
  overdue_days: number;
};

export default function PartnerSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const subscriptionId = params?.id;

  const [subscription, setSubscription] = useState<PartnerSubscriptionDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backQuery = searchParams.toString();
  const backHref = backQuery
    ? `/partner/subscriptions?${backQuery}`
    : "/partner/subscriptions";

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!subscriptionId) {
        setError("Missing subscription id.");
        setSubscription(null);
        setLoading(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getPartnerSubscriptionDetail(subscriptionId);
        setSubscription(payload);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load subscription details."
        );
        setSubscription(null);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [subscriptionId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const emis = useMemo<PartnerSubscriptionEmi[]>(() => {
    return Array.isArray(subscription?.emis)
      ? (subscription.emis as PartnerSubscriptionEmi[])
      : [];
  }, [subscription]);

  const emiRows = useMemo<EmiRow[]>(() => {
    return emis.map((emi, index) => {
      const amount = toNumber(emi.amount);
      const paidAmount = toNumber(emi.paid_amount);
      const waivedAmount = toNumber(emi.waived_amount);
      const computedOutstanding = Math.max(amount - paidAmount - waivedAmount, 0);
      const status = text(emi.status, "PENDING");
      const overdue =
        computedOutstanding > 0 &&
        !["PAID", "WAIVED", "COMPLETED"].includes(status.toUpperCase()) &&
        isPastDue(emi.due_date);

      return {
        id: emi.id ?? index + 1,
        month_no: toNumber(emi.month_no ?? index + 1),
        due_date: text(emi.due_date, ""),
        amount,
        paid_amount: paidAmount,
        waived_amount: waivedAmount,
        outstanding_amount:
          emi.outstanding_amount !== undefined &&
          emi.outstanding_amount !== null &&
          String(emi.outstanding_amount) !== ""
            ? toNumber(emi.outstanding_amount)
            : computedOutstanding,
        status,
        is_overdue: overdue,
        overdue_days: overdue ? diffInDays(emi.due_date) : 0,
      };
    });
  }, [emis]);

  const derivedSummary = useMemo(() => {
    const emiTotal = emiRows.reduce((sum, row) => sum + row.amount, 0);
    const paidAmount = emiRows.reduce((sum, row) => sum + row.paid_amount, 0);
    const waivedAmount = emiRows.reduce((sum, row) => sum + row.waived_amount, 0);
    const outstandingAmount = emiRows.reduce(
      (sum, row) => sum + row.outstanding_amount,
      0
    );

    return {
      emi_total: emiTotal,
      paid_amount: paidAmount,
      waived_amount: waivedAmount,
      outstanding_amount: outstandingAmount,
    };
  }, [emiRows]);

  const summary = useMemo(() => {
    const backend = subscription?.financial_summary;
    if (
      backend &&
      [
        backend.emi_total,
        backend.paid_amount,
        backend.waived_amount,
        backend.outstanding_amount,
      ].some(
        (value) =>
          value !== null && value !== undefined && String(value).trim() !== ""
      )
    ) {
      return {
        emi_total: toNumber(backend.emi_total),
        paid_amount: toNumber(backend.paid_amount),
        waived_amount: toNumber(backend.waived_amount),
        outstanding_amount: toNumber(backend.outstanding_amount),
      };
    }
    return derivedSummary;
  }, [derivedSummary, subscription]);

  const winnerSummary = subscription?.winner_summary;
  const detailSemantics = useMemo(
    () =>
      buildSubscriptionDetailSemantics({
        contractStatus: subscription?.status,
        winnerStatus: winnerSummary?.winner_status ?? subscription?.winner_status,
        winnerMonth: winnerSummary?.winner_month ?? subscription?.winner_month,
        luckyNumber: winnerSummary?.lucky_number ?? subscription?.lucky_number,
        drawId: winnerSummary?.draw_id,
        drawMonth: winnerSummary?.draw_month,
        drawRevealedAt: winnerSummary?.draw_revealed_at,
        waiverScope: winnerSummary?.waiver_scope,
        waivedEmiCount:
          winnerSummary?.waived_emi_count ??
          subscription?.waived_emi_count ??
          emiRows.filter((row) => row.status?.toUpperCase() === "WAIVED").length,
        waivedAmount:
          winnerSummary?.waived_amount ??
          summary.waived_amount ??
          subscription?.waived_amount,
        outstandingAmount: summary.outstanding_amount,
      }),
    [
      emiRows,
      subscription?.lucky_number,
      subscription?.status,
      subscription?.waived_amount,
      subscription?.waived_emi_count,
      subscription?.winner_month,
      subscription?.winner_status,
      summary.outstanding_amount,
      summary.waived_amount,
      winnerSummary?.draw_id,
      winnerSummary?.draw_month,
      winnerSummary?.draw_revealed_at,
      winnerSummary?.lucky_number,
      winnerSummary?.waived_amount,
      winnerSummary?.waived_emi_count,
      winnerSummary?.waiver_scope,
      winnerSummary?.winner_month,
      winnerSummary?.winner_status,
    ]
  );

  const nextDueDate = subscription?.next_due_date || null;
  const nextDueOverdue = isPastDue(nextDueDate);
  const nextDueAge = nextDueOverdue ? diffInDays(nextDueDate) : 0;
  const pendingEmiCount =
    subscription?.pending_emi_count ?? emiRows.filter((row) => row.outstanding_amount > 0).length;

  const emiColumns = useMemo<Column<EmiRow>[]>(
    () => [
      {
        key: "month_no",
        title: "Month",
        sortable: true,
        render: (row) => `#${row.month_no}`,
      },
      {
        key: "due_date",
        title: "Due",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.due_date || "") || 0,
        render: (row) => (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {formatDate(row.due_date)}
            </div>
            {row.is_overdue ? (
              <StatusBadge
                status="OVERDUE"
                label={`${row.overdue_days} day${row.overdue_days === 1 ? "" : "s"} overdue`}
              />
            ) : null}
          </div>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        sortable: true,
        sortAccessor: (row) => row.amount,
        render: (row) => money(row.amount),
      },
      {
        key: "paid_amount",
        title: "Paid",
        align: "right",
        render: (row) => money(row.paid_amount),
      },
      {
        key: "waived_amount",
        title: "Waived",
        align: "right",
        render: (row) => money(row.waived_amount),
      },
      {
        key: "outstanding_amount",
        title: "Outstanding",
        align: "right",
        render: (row) => money(row.outstanding_amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => (
          <StatusBadge status={row.status || "PENDING"} isOverdue={row.is_overdue} />
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title={
        subscription
          ? subscription.subscription_number || `Subscription #${subscription.id}`
          : "Partner Subscription Detail"
      }
      subtitle="Partner-scoped subscription detail with contract, due-position, and EMI schedule visibility only."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscriptions", href: backHref },
        {
          label: subscription
            ? subscription.subscription_number || `Subscription #${subscription.id}`
            : "Detail",
        },
      ]}
      actions={[
        { href: backHref, label: "Back to Subscriptions", variant: "secondary" },
        ...(subscription?.customer
          ? [
              {
                href: `/partner/customers/${subscription.customer}`,
                label: "Customer",
                variant: "secondary" as const,
              },
            ]
          : [
              {
                href: "/partner/customers",
                label: "Customers",
                variant: "secondary" as const,
              },
            ]),
        ...(subscription?.id
          ? [
              {
                href: `/partner/payments?subscription=${subscription.id}`,
                label: "Payments",
                variant: "secondary" as const,
              },
              {
                href: `/partner/collections/create?subscription=${subscription.id}`,
                label: "Collect",
                variant: "primary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: subscription?.status || "—" },
        { label: "Total Paid", value: money(summary.paid_amount), tone: "success" },
        {
          label: "Outstanding",
          value: money(summary.outstanding_amount),
          tone: summary.outstanding_amount > 0 ? "warning" : "success",
        },
        {
          label: "Next Due",
          value: nextDueDate ? formatDate(nextDueDate) : "—",
          tone: nextDueOverdue ? "danger" : "default",
        },
      ]}
      statusBadge={{
        label: nextDueOverdue ? "Partner Follow-up Needed" : "Partner Subscription",
        tone: nextDueOverdue ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Contract, winner, and waiver posture"
          description="Partner detail keeps contract lifecycle, winner history, and waiver settlement separate so follow-up stays operationally clear."
          action={
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem
              label="Contract Lifecycle"
              value={
                <div className="space-y-2">
                  <StatusBadge
                    status={subscription?.status || "PENDING"}
                    size="md"
                  />
                  <div className="text-xs text-muted-foreground">
                    {detailSemantics.contractHeadline}
                  </div>
                </div>
              }
            />
            <DetailItem
              label="Winner History"
              value={
                <div className="space-y-2">
                  <StatusBadge
                    status={
                      detailSemantics.winnerStatus === "WON" ? "WON" : "NOT_WON"
                    }
                    label={
                      detailSemantics.winnerStatus === "WON"
                        ? "Winner recorded"
                        : "Not won"
                    }
                    size="md"
                  />
                  <div className="text-xs text-muted-foreground">
                    {formatWinnerMonthLabel(detailSemantics.winnerMonth)} ·{" "}
                    {formatLuckyNumberLabel(detailSemantics.luckyNumber)}
                  </div>
                </div>
              }
            />
            <DetailItem
              label="Waiver Posture"
              value={
                <div className="space-y-2">
                  <StatusBadge
                    status={detailSemantics.isSettled ? "COMPLETED" : "ACTIVE"}
                    label={
                      detailSemantics.isSettled ? "Fully settled" : "Still settling"
                    }
                    size="md"
                  />
                  <div className="text-xs text-muted-foreground">
                    {detailSemantics.waivedEmiCount} waived EMI rows ·{" "}
                    {money(detailSemantics.waivedAmount)}
                  </div>
                </div>
              }
            />
            <DetailItem
              label="Next Due Position"
              value={
                nextDueDate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{formatDate(nextDueDate)}</span>
                    <StatusBadge
                      status={nextDueOverdue ? "OVERDUE" : "PENDING"}
                      label={
                        nextDueOverdue
                          ? `${nextDueAge} day${nextDueAge === 1 ? "" : "s"} overdue`
                          : "Upcoming due"
                      }
                    />
                  </div>
                ) : (
                  "No next due EMI"
                )
              }
            />
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading subscription detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscription"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !subscription ? (
          <EmptyState
            title="Subscription not found"
            description="The requested subscription was not found for this partner account."
          />
        ) : null}

        {!loading && !error && subscription ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="EMI Total"
                value={money(summary.emi_total)}
                subtext={`${subscription.emi_count ?? emiRows.length} scheduled rows`}
                icon={<CreditCard className="h-4 w-4" />}
              />
              <StatCard
                label="Collected"
                value={money(summary.paid_amount)}
                subtext={`${subscription.paid_emi_count ?? 0} paid EMIs`}
                tone="success"
                icon={<ShieldCheck className="h-4 w-4" />}
              />
              <StatCard
                label="Waived"
                value={money(summary.waived_amount)}
                subtext={`${subscription.waived_emi_count ?? 0} waived EMIs`}
                tone={summary.waived_amount > 0 ? "info" : "default"}
                icon={<Trophy className="h-4 w-4" />}
              />
              <StatCard
                label="Pending"
                value={String(pendingEmiCount)}
                subtext={money(summary.outstanding_amount)}
                tone={pendingEmiCount > 0 ? "warning" : "success"}
                icon={<CalendarClock className="h-4 w-4" />}
              />
            </div>

            <WorkspaceSection
              title="Contract summary"
              description="Core customer, product, batch, and contract fields linked to this partner-visible subscription."
              action={
                <div className="flex flex-wrap gap-2">
                  {subscription.customer ? (
                    <Link
                      href={`/partner/customers/${subscription.customer}`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      View customer
                    </Link>
                  ) : null}
                  <Link
                    href={`/partner/payments?subscription=${subscription.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Payment history
                  </Link>
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Customer"
                  value={
                    <div>
                      <div className="font-medium text-foreground">
                        {subscription.customer_name || "—"}
                      </div>
                      <div className="text-muted-foreground">
                        {subscription.customer_phone || "—"}
                      </div>
                    </div>
                  }
                />
                <DetailItem
                  label="Product"
                  value={
                    <div>
                      <div className="font-medium text-foreground">
                        {subscription.product_name || "—"}
                      </div>
                      <div className="text-muted-foreground">
                        {subscription.product_code || "—"}
                      </div>
                    </div>
                  }
                />
                <DetailItem
                  label="Batch / Lucky"
                  value={
                    <div>
                      <div className="font-medium text-foreground">
                        {subscription.batch_code || "—"}
                      </div>
                      <div className="text-muted-foreground">
                        Lucky {formatLuckyNumberLabel(detailSemantics.luckyNumber)}
                      </div>
                    </div>
                  }
                />
                <DetailItem
                  label="Plan / Tenure"
                  value={
                    <div>
                      <div className="font-medium text-foreground">
                        {subscription.plan_type || "Lucky EMI"}
                      </div>
                      <div className="text-muted-foreground">
                        {subscription.tenure_months
                          ? `${subscription.tenure_months} months`
                          : "Tenure not available"}
                      </div>
                    </div>
                  }
                />
                <DetailItem label="Start Date" value={formatDate(subscription.start_date)} />
                <DetailItem
                  label="Total Contract Price"
                  value={money(subscription.total_amount)}
                  tone="success"
                />
                <DetailItem
                  label="Monthly EMI"
                  value={money(subscription.monthly_amount)}
                  tone="success"
                />
                <DetailItem
                  label="Created"
                  value={formatDate(subscription.created_at)}
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Collection position"
              description="Use this summary before a partner collection request or payment-history check."
              footer={
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/partner/collections/create?subscription=${subscription.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    Collect payment
                  </Link>
                  <Link
                    href={backHref}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Back to subscriptions
                  </Link>
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Last Payment"
                  value={
                    subscription.last_payment_date
                      ? formatDate(subscription.last_payment_date)
                      : "No payment recorded"
                  }
                />
                <DetailItem
                  label="Next Due"
                  value={nextDueDate ? formatDate(nextDueDate) : "No pending due date"}
                  tone={nextDueOverdue ? "danger" : "default"}
                />
                <DetailItem
                  label="Pending EMI Rows"
                  value={String(pendingEmiCount)}
                  tone={pendingEmiCount > 0 ? "warning" : "success"}
                />
                <DetailItem
                  label="Outstanding"
                  value={money(summary.outstanding_amount)}
                  tone={summary.outstanding_amount > 0 ? "warning" : "success"}
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="EMI schedule"
              description="Installment rows visible to this partner subscription scope."
              footer={
                <p className="text-sm text-muted-foreground">
                  Statuses stay read-only here. Collection posting and finance-wide reconciliation remain in their own protected workflows.
                </p>
              }
            >
              {emiRows.length === 0 ? (
                <EmptyState
                  title="No EMI schedule"
                  description="No EMI rows are available for this subscription yet."
                />
              ) : (
                <DataTable<EmiRow> rows={emiRows} columns={emiColumns} />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
