"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { ROUTES } from "@/lib/routes";
import { getCustomerDashboard } from "@/services/customer";

type CustomerDashboardResponse = Awaited<ReturnType<typeof getCustomerDashboard>>;
type CustomerDashboardData = NonNullable<CustomerDashboardResponse>;
type CustomerSubscription = CustomerDashboardData["subscriptions"][number];
type CustomerSubscriptionEmi = NonNullable<CustomerSubscription["emis"]>[number];

function money(value: string | number | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
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
      className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="pt-1 text-sm font-medium text-foreground">Open →</div>
      </div>
    </Link>
  );
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

    const allEmis: CustomerSubscriptionEmi[] = data.subscriptions.flatMap(
      (sub: CustomerSubscription): CustomerSubscriptionEmi[] =>
        (sub.emis ?? []) as CustomerSubscriptionEmi[]
    );

    const upcoming = allEmis
      .filter((emi: CustomerSubscriptionEmi) => (emi.status || "").toUpperCase() === "PENDING")
      .sort((a: CustomerSubscriptionEmi, b: CustomerSubscriptionEmi) => {
        const aDate = a.due_date ? Date.parse(a.due_date) : 0;
        const bDate = b.due_date ? Date.parse(b.due_date) : 0;
        return aDate - bDate;
      });

    const paidCount = allEmis.filter(
      (emi: CustomerSubscriptionEmi) => (emi.status || "").toUpperCase() === "PAID"
    ).length;

    const upcomingEmi = upcoming[0];

    return [
      {
        label: "Subscriptions",
        value: String(data.subscriptions?.length ?? 0),
        subtext: "All linked contracts",
      },
      {
        label: "Upcoming EMI",
        value: upcomingEmi ? money(upcomingEmi.amount) : "—",
        subtext: upcomingEmi?.due_date
          ? `Due ${new Date(upcomingEmi.due_date).toLocaleDateString()}`
          : "No pending EMI",
      },
      {
        label: "Paid EMIs",
        value: String(paidCount),
        subtext: "Completed installments",
      },
      {
        label: "Outstanding",
        value: money(
          allEmis
            .filter((emi: CustomerSubscriptionEmi) => (emi.status || "").toUpperCase() === "PENDING")
            .reduce((sum: number, emi: CustomerSubscriptionEmi) => sum + Number(emi.amount || 0), 0)
        ),
        subtext: "Current pending amount",
      },
    ];
  }, [data]);

  const trustCards = useMemo(() => {
    if (!data) return [];

    const wonSubscriptionsCount = data.subscriptions.filter(
      (subscription: CustomerSubscription) =>
        (subscription.status || "").toUpperCase() === "WON" ||
        (subscription.winner_month !== null &&
          subscription.winner_month !== undefined)
    ).length;

    return [
      {
        label: "Won Subscriptions",
        value: String(wonSubscriptionsCount),
        subtext:
          wonSubscriptionsCount > 0
            ? "Winner benefit recorded on one or more subscriptions"
            : "No winner benefit recorded",
      },
      {
        label: "Waived EMIs",
        value: String(data.summary.waived_emis ?? 0),
        subtext:
          Number(data.summary.waived_emis ?? 0) > 0
            ? "Waiver entries already recorded"
            : "No waiver entries recorded",
      },
      {
        label: "Total Paid",
        value: money(data.summary.total_paid_amount),
        subtext: "Recorded payment total across all subscriptions",
      },
    ];
  }, [data]);

  const quickLinks: QuickLink[] = [
    {
      title: "My Subscriptions",
      description: "Review active and completed subscription contracts.",
      href: ROUTES.customer.subscriptions,
    },
    {
      title: "My Payments",
      description: "Inspect payment history and EMI-related collection records.",
      href: ROUTES.customer.payments,
    },
    {
      title: "Profile",
      description: "Review your customer profile and account information.",
      href: ROUTES.customer.profile,
    },
    {
      title: "Support",
      description: "Open support-related help and issue guidance.",
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                subtext={card.subtext}
              />
            ))}
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Payment and Waiver Status
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These values come from your current customer-scoped dashboard
                summary and recorded subscription states.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {trustCards.map((card) => (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  subtext={card.subtext}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Quick Access
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the main customer workflows from one place.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
