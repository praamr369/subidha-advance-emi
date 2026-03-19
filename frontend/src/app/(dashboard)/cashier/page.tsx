"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { getCashierDashboard } from "@/services/cashier";

function money(value: string | number): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load cashier dashboard.";
}

export default function CashierDashboardPage() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getCashierDashboard>
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getCashierDashboard();
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
    return [
      {
        label: "Payments Collected Today",
        value: data.today_transaction_count,
      },
      {
        label: "Collection Amount Today",
        value: money(data.today_total_collected),
      },
      {
        label: "Pending EMI Count",
        value: data.total_pending_emis,
      },
      {
        label: "Pending EMI Amount",
        value: money(data.total_pending_amount),
      },
    ];
  }, [data]);

  return (
    <PortalPage
      title="Cashier Dashboard"
      subtitle="Record EMI collections, monitor daily payment intake, and track pending payment operations."
      breadcrumbs={[{ label: "Cashier" }]}
      stats={stats}
      actions={[{ href: "/cashier/collect", label: "Collect Payment", variant: "primary" }]}
    >
      {loading ? <LoadingBlock label="Loading cashier dashboard..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load cashier dashboard"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-card-foreground">
                Today’s Summary
              </h3>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                Cash: <span className="font-medium text-foreground">{money(data.today_cash_total)}</span>
              </div>
              <div>
                Digital: <span className="font-medium text-foreground">{money(data.today_digital_total)}</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Use the collect flow for posting payments. For audit and reconciliation, use admin payment registers.
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">
              Today’s Transactions
            </h3>
            {Array.isArray(data.today_transactions) &&
            data.today_transactions.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Transaction list is available but not yet rendered in this view.
              </p>
            ) : (
              <EmptyState
                title="No transactions loaded"
                description="No transactions were returned by the dashboard endpoint for today."
              />
            )}
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}