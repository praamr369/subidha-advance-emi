"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Layers3,
  Sparkles,
  Wallet,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import { ROUTES } from "@/lib/routes";
import { getCustomerDashboard } from "@/services/customer";

type CustomerDashboardResponse = Awaited<ReturnType<typeof getCustomerDashboard>>;
type CustomerDashboardData = NonNullable<CustomerDashboardResponse>;
type CustomerDashboardSummary = CustomerDashboardData["summary"];
type CustomerSubscription = CustomerDashboardData["subscriptions"][number];

function money(value: string | number | undefined | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customer workspace.";
}

type QuickLink = {
  title: string;
  description: string;
  href: string;
};

function QuickLinkCard({ title, description, href }: QuickLink) {
  return (
    <Link
      href={href}
      className="group rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.58)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.62)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/80 p-2 text-slate-500 transition group-hover:text-slate-900">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function statusPriority(subscription: CustomerSubscription): number {
  switch ((subscription.status || "").toUpperCase()) {
    case "ACTIVE":
      return 0;
    case "WON":
      return 1;
    case "COMPLETED":
      return 2;
    default:
      return 3;
  }
}

function buildSettlementPosture(summary: CustomerDashboardSummary) {
  const remainingAmount = Number(
    summary.remaining_amount ?? summary.outstanding_amount ?? 0
  );
  const overdueEmis = Number(summary.overdue_emis ?? 0);
  const nextDueDate = summary.next_due_date;
  const nextDueAmount = summary.next_due_amount;

  if (remainingAmount <= 0) {
    return {
      title: "All linked contracts are currently settled",
      description:
        "Paid and waived EMI history already closes the current contract exposure visible to you.",
      tone:
        "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(220,252,231,0.84))]",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      badgeLabel: "Settled",
    };
  }

  if (overdueEmis > 0) {
    return {
      title: `${overdueEmis} overdue EMI need attention`,
      description: `Overdue exposure currently stands at ${money(
        summary.overdue_amount
      )}. Your oldest unpaid EMI is already past due.`,
      tone:
        "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.84))]",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
      badgeLabel: "Overdue",
    };
  }

  return {
    title: "Contracts are still settling on schedule",
    description: nextDueDate
      ? `Your next scheduled EMI is ${money(nextDueAmount)} on ${formatDate(
          nextDueDate
        )}.`
      : "There is remaining contract exposure, but no next due row is currently visible.",
    tone:
      "border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(224,242,254,0.84))]",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    badgeLabel: "In progress",
  };
}

function buildWinnerPosture(summary: CustomerDashboardSummary) {
  const winnerSubscriptions = Number(summary.winner_subscriptions ?? 0);
  const waivedAmount = Number(summary.total_waived_amount ?? 0);

  if (winnerSubscriptions > 0 || waivedAmount > 0) {
    return {
      title: "Winner benefit is already reflected in contract totals",
      description: `${winnerSubscriptions} subscription${
        winnerSubscriptions === 1 ? "" : "s"
      } carry winner history, and ${money(
        summary.total_waived_amount
      )} is already recorded as waived EMI value.`,
      badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
      badgeLabel: "Winner benefit",
    };
  }

  return {
    title: "No winner waiver is currently recorded",
    description:
      "If a draw benefit is applied later, it will appear separately from payment settlement and contract status.",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    badgeLabel: "No winner benefit",
  };
}

export default function CustomerDashboardPage() {
  const [data, setData] = useState<CustomerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getCustomerDashboard();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const summaryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "Paid",
        value: money(data.summary.total_paid_amount),
        subtext: `${data.summary.paid_emis} EMI settled through recorded payments`,
        tone: "success" as const,
        icon: <Wallet className="h-5 w-5" />,
      },
      {
        label: "Remaining",
        value: money(data.summary.remaining_amount ?? data.summary.outstanding_amount),
        subtext: `${money(data.summary.total_pending_amount)} still open across current contracts`,
        tone:
          Number(data.summary.remaining_amount ?? data.summary.outstanding_amount ?? 0) > 0
            ? ("info" as const)
            : ("success" as const),
        icon: <CreditCard className="h-5 w-5" />,
      },
      {
        label: "Overdue EMI",
        value: String(data.summary.overdue_emis ?? 0),
        subtext: `${money(data.summary.overdue_amount)} currently past due`,
        tone:
          Number(data.summary.overdue_emis ?? 0) > 0
            ? ("warning" as const)
            : ("default" as const),
        icon: <AlertTriangle className="h-5 w-5" />,
      },
      {
        label: "Upcoming EMI",
        value: String(data.summary.upcoming_emis ?? 0),
        subtext:
          data.summary.next_due_date && data.summary.next_due_amount
            ? `${money(data.summary.next_due_amount)} next on ${formatDate(
                data.summary.next_due_date
              )}`
            : "No upcoming EMI currently visible",
        tone: "default" as const,
        icon: <CalendarClock className="h-5 w-5" />,
      },
    ];
  }, [data]);

  const settlementPosture = useMemo(() => {
    if (!data) return null;
    return buildSettlementPosture(data.summary);
  }, [data]);

  const winnerPosture = useMemo(() => {
    if (!data) return null;
    return buildWinnerPosture(data.summary);
  }, [data]);

  const spotlightSubscriptions = useMemo(() => {
    if (!data) return [];

    return [...data.subscriptions]
      .sort((left, right) => {
        const priorityDelta = statusPriority(left) - statusPriority(right);
        if (priorityDelta !== 0) return priorityDelta;

        const leftOutstanding = Number(
          left.financial_summary?.remaining_amount ??
            left.financial_summary?.outstanding_amount ??
            left.outstanding_amount ??
            0
        );
        const rightOutstanding = Number(
          right.financial_summary?.remaining_amount ??
            right.financial_summary?.outstanding_amount ??
            right.outstanding_amount ??
            0
        );

        return rightOutstanding - leftOutstanding;
      })
      .slice(0, 3);
  }, [data]);

  const quickLinks: QuickLink[] = [
    {
      title: "My Subscriptions",
      description: "Open contract detail, winner posture, and product status by subscription.",
      href: ROUTES.customer.subscriptions,
    },
    {
      title: "My Payments",
      description: "Review recorded payment rows and the current settled total.",
      href: ROUTES.customer.payments,
    },
    {
      title: "Support",
      description: "Raise a support request if a payment or contract detail needs follow-up.",
      href: ROUTES.customer.support,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Workspace"
        description="View subscriptions, payment records, profile information, and support resources."
        actions={
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {loading ? <LoadingBlock label="Loading customer workspace..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load customer workspace"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && data ? (
        <>
          <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94),rgba(239,246,255,0.92))] p-6 shadow-[0_28px_90px_-54px_rgba(15,23,42,0.5)]">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-200/25 blur-3xl" />
            <div className="pointer-events-none absolute left-0 top-0 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  Financial alignment
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {data.customer.name || "Customer"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  Paid, remaining, overdue, and winner-related figures here come
                  from the same subscription financial snapshot used by your
                  contract detail, so settlement and waiver posture stay aligned.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    KYC status
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.customer.kyc_status || "PENDING"}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Phone
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.customer.phone || "—"}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Contracts
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.summary.subscription_count ?? data.subscriptions.length} total
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Winner history
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.summary.winner_subscriptions ?? 0} subscription
                    {(data.summary.winner_subscriptions ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                subtext={card.subtext}
                tone={card.tone}
                icon={card.icon}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section
              className={`rounded-[1.8rem] border p-6 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.52)] ${settlementPosture?.tone}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Settlement posture
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-slate-950">
                    {settlementPosture?.title}
                  </h3>
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
                    Next payment due
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.summary.next_due_date
                      ? `${money(data.summary.next_due_amount)} on ${formatDate(
                          data.summary.next_due_date
                        )}`
                      : "No pending EMI"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {data.summary.next_due_subscription_number || "No contract pending"}
                  </div>
                </div>
                <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Active contracts
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.summary.active_subscriptions}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {data.summary.completed_subscriptions ?? 0} completed
                  </div>
                </div>
                <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Payment adjustments
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {data.summary.has_payment_adjustments ? "Recorded" : "None"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Settled totals already reflect any reversal history.
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[1.8rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-6 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.52)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Winner and waiver posture
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-slate-950">
                    {winnerPosture?.title}
                  </h3>
                </div>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${winnerPosture?.badgeClass}`}
                >
                  {winnerPosture?.badgeLabel}
                </span>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-600">
                {winnerPosture?.description}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Waived by benefit"
                  value={money(data.summary.total_waived_amount)}
                  subtext={`${data.summary.waived_emis ?? 0} EMI rows already marked waived`}
                  tone={
                    Number(data.summary.total_waived_amount ?? 0) > 0
                      ? "info"
                      : "default"
                  }
                  icon={<BadgeCheck className="h-5 w-5" />}
                  className="h-full"
                />
                <StatCard
                  label="Contracts in view"
                  value={String(
                    data.summary.subscription_count ?? data.subscriptions.length
                  )}
                  subtext={`${data.summary.winner_subscriptions ?? 0} with winner history`}
                  tone="default"
                  icon={<Layers3 className="h-5 w-5" />}
                  className="h-full"
                />
              </div>
            </section>
          </div>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Subscription overview
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Priority contracts are surfaced here with their linked product,
                  current remaining amount, and winner posture.
                </p>
              </div>
              <Link
                href={ROUTES.customer.subscriptions}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-900"
              >
                Open all subscriptions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {spotlightSubscriptions.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {spotlightSubscriptions.map((subscription) => (
                  <CustomerProductSummaryCard
                    key={subscription.id}
                    subscription={subscription}
                    href={`${ROUTES.customer.subscriptions}/${subscription.id}`}
                    compact
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No subscriptions yet"
                description="Once your contracts are active, they will appear here with product and settlement context."
              />
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Go next
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the next customer workflow without leaving this financial overview.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {quickLinks.map((item) => (
                <QuickLinkCard key={item.href} {...item} />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {!loading && !error && !data ? (
        <EmptyState
          title="No customer workspace data"
          description="Customer dashboard data is not currently available."
        />
      ) : null}
    </div>
  );
}
