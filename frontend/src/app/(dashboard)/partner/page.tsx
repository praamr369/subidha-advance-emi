"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { getPartnerDashboard } from "@/services/partner";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner dashboard.";
}

export default function PartnerDashboardPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getPartnerDashboard>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getPartnerDashboard();
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

  const stats = useMemo(() => {
    if (!data) return undefined;
    const summary = data.summary;
    return [
      {
        label: "Active Customers",
        value: summary.total_customers ?? 0,
      },
      {
        label: "Active Subscriptions",
        value: summary.active_subscriptions ?? 0,
      },
      {
        label: "Collections (All Time)",
        value: money(summary.total_revenue_collected ?? 0),
      },
      {
        label: "Pending Commission",
        value: money(summary.pending_commission ?? 0),
      },
    ];
  }, [data]);

  return (
    <PortalPage
      title="Partner Dashboard"
      subtitle="Monitor customer acquisition, collections, commissions, and active subscription progress."
      breadcrumbs={[{ label: "Partner" }]}
      stats={stats}
      actions={[
        { href: "/partner/subscriptions", label: "View Subscriptions", variant: "primary" },
        { href: "/partner/commissions", label: "View Commissions" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading partner dashboard..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner dashboard"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-card-foreground">
                Collection Activity
              </h3>
              <Link
                href="/partner/reports"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Open Reports
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              Use Partner Reports for detailed collection metrics and earnings history.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">
              Customer & Subscription Overview
            </h3>
            <p className="text-sm text-muted-foreground">
              Use the Customers and Subscriptions pages for operational lists and drill-down.
            </p>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}