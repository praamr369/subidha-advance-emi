"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  getCashierDashboard,
  type CashierDashboardResponse,
  type CashierTransaction,
} from "@/services/cashier";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load cashier dashboard.";
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function CashierDashboardPage() {
  const [data, setData] = useState<CashierDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await getCashierDashboard();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setData(null);
      }
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadDashboard("initial");
  }, []);

  const transactions = useMemo<CashierTransaction[]>(
    () => data?.today_transactions ?? [],
    [data]
  );

  const averageTicketValue = useMemo(() => {
    const total = Number(data?.today_total_collected ?? 0);
    const count = Number(data?.today_transaction_count ?? 0);
    if (!count) return "₹0.00";
    return money(total / count);
  }, [data]);

  return (
    <PortalPage
      title="Cashier Dashboard"
      subtitle="Daily cashier workspace for collections, pending EMI visibility, and today’s posted transaction activity."
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
        {
          href: "/logout",
          label: "Logout",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Pending EMI Count",
          value: String(data?.total_pending_emis ?? 0),
          tone: "warning",
        },
        {
          label: "Pending Amount",
          value: money(data?.total_pending_amount),
          tone: "warning",
        },
        {
          label: "Collected Today",
          value: money(data?.today_total_collected),
          tone: "success",
        },
        {
          label: "Today Transactions",
          value: String(data?.today_transaction_count ?? 0),
        },
      ]}
      statusBadge={{
        label: "Cashier Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadDashboard("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading cashier dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load cashier dashboard"
            description={error}
            onRetry={() => void loadDashboard("initial")}
          />
        ) : null}

        {!loading && !error && data ? (
          <>
            <section className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cash collections today
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {money(data.today_cash_total)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Collections posted with cash method during the current business day.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Digital collections today
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {money(data.today_digital_total)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  UPI and bank collections posted by cashier operations today.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Average ticket value
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {averageTicketValue}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Average amount per posted cashier transaction today.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Workflow guidance
                </div>
                <div className="mt-2 text-sm text-foreground">
                  Search collectible EMI rows, post the collection, open the receipt, and use history when a customer needs quick payment proof at the counter.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/cashier/collect"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Open Collection Workspace
                  </Link>

                  <Link
                    href="/cashier/payments"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Open Payment History
                  </Link>

                  <Link
                    href="/logout"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Logout
                  </Link>
                </div>
              </div>
            </section>

            <SectionCard
              title="Today’s Transactions"
              description="This list reflects cashier collections posted today. Open any row to view receipt-safe proof details."
            >
              {transactions.length === 0 ? (
                <EmptyState
                  title="No transactions recorded today"
                  description="No cashier collection entries were returned for today. After posting a payment, use Refresh to reload the dashboard totals and transaction list."
                />
              ) : (
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
                          Method
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Amount
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Reference
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Posted
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {transactions.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">#{row.id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              EMI {row.emi ?? "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.customer_phone || "No phone"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.subscription_number || "—"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.batch_code || "No batch"}
                              {typeof row.lucky_number === "number"
                                ? ` · Lucky #${row.lucky_number}`
                                : ""}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                              {row.method || "—"}
                            </span>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.amount)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {row.reference_no || "—"}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {formatDateTime(row.created_at || row.payment_date)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <Link
                              href={`/cashier/payments/${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              View Receipt
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
