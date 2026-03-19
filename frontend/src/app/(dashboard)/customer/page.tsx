"use client";

import PortalPage from "@/components/ui/PortalPage";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { getCustomerDashboard } from "@/services/customer";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load customer dashboard.";
}

export default function CustomerDashboardPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getCustomerDashboard>
  > | null>(null);
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

  const stats = useMemo(() => {
    if (!data) return undefined;
    const upcoming = data.subscriptions
      .flatMap((sub) => sub.emis || [])
      .filter((emi) => (emi.status || "").toUpperCase() === "PENDING")
      .sort((a, b) => {
        const aDate = a.due_date ? Date.parse(a.due_date) : 0;
        const bDate = b.due_date ? Date.parse(b.due_date) : 0;
        return aDate - bDate;
      })[0];

    return [
      { label: "Active Plans", value: data.summary.active_subscriptions ?? 0 },
      {
        label: "Upcoming EMI",
        value: upcoming?.amount !== undefined ? money(upcoming.amount) : "—",
      },
      { label: "Paid EMI Count", value: data.summary.paid_emis ?? 0 },
      { label: "Pending EMIs", value: data.summary.pending_emis ?? 0 },
    ];
  }, [data]);

  return (
    <PortalPage
      title="Customer Dashboard"
      subtitle="Track your Lucky Plan subscriptions, EMI payments, profile status, and support activity."
      breadcrumbs={[{ label: "Customer" }]}
      stats={stats}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/customer/subscriptions"
            className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
          >
            View Subscriptions
          </Link>
          <Link
            href="/customer/payments"
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            View Payments
          </Link>
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      {loading ? <LoadingBlock label="Loading customer dashboard..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load customer dashboard"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">
              Your Subscriptions
            </h3>
            {data.subscriptions.length === 0 ? (
              <EmptyState
                title="No subscriptions found"
                description="You don’t have any active or completed subscriptions yet."
              />
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                {data.subscriptions.slice(0, 5).map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {sub.subscription_number || `Subscription #${sub.id}`}
                      </div>
                      <div className="truncate">
                        {sub.product_name || "Product"} • {sub.batch_code || "Batch"} • Lucky{" "}
                        {sub.lucky_number ?? "—"}
                      </div>
                    </div>
                    <Link
                      href={`/customer/subscriptions/${sub.id}`}
                      className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      View
                    </Link>
                  </div>
                ))}
                {data.subscriptions.length > 5 ? (
                  <div className="text-xs text-muted-foreground">
                    Showing 5 of {data.subscriptions.length}. Open “View Subscriptions” for full list.
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">
              Payment Summary
            </h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                Total paid:{" "}
                <span className="font-medium text-foreground">
                  {money(data.summary.total_paid_amount ?? 0)}
                </span>
              </div>
              <div>
                Paid EMIs:{" "}
                <span className="font-medium text-foreground">
                  {data.summary.paid_emis ?? 0}
                </span>
              </div>
              <div>
                Pending EMIs:{" "}
                <span className="font-medium text-foreground">
                  {data.summary.pending_emis ?? 0}
                </span>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              For detailed payment history, open the Payments page.
            </p>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}