"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  getCashierPaymentHistory,
  type CashierTransaction,
} from "@/services/cashier";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load cashier payment history.";
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

export default function CashierPaymentsPage() {
  const [rows, setRows] = useState<CashierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial", nextQuery = "") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getCashierPaymentHistory({
          q: nextQuery || undefined,
          limit: 100,
        });
        setRows(payload.results);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleApplySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    setQuery(nextQuery);
    void loadPage("refresh", nextQuery);
  }

  function handleResetSearch() {
    setSearchInput("");
    setQuery("");
    void loadPage("refresh", "");
  }

  const visibleAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rows]
  );

  const reversedCount = useMemo(
    () => rows.filter((row) => Boolean(row.is_reversed)).length,
    [rows]
  );

  return (
    <PortalPage
      title="Payment History"
      subtitle="Cashier-safe transaction lookup for receipt proof, quick dispute resolution, and recent counter activity review."
      breadcrumbs={[
        { label: "Cashier", href: "/cashier" },
        { label: "Payment History" },
      ]}
      actions={[
        {
          href: "/cashier/collect",
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: "/cashier",
          label: "Back to Dashboard",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Payments",
          value: String(rows.length),
        },
        {
          label: "Visible Amount",
          value: money(visibleAmount),
          tone: "success",
        },
        {
          label: "Reversed",
          value: String(reversedCount),
          tone: reversedCount > 0 ? "warning" : undefined,
        },
      ]}
      statusBadge={{
        label: "Cashier Payment Lookup",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Search posted payments"
          description="Search by payment ID, reference number, customer phone, customer name, subscription number, contract reference, EMI ID, or lucky number."
        >
          <form
            onSubmit={handleApplySearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label
                htmlFor="cashier-payment-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search query
              </label>
              <input
                id="cashier-payment-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Payment ID, reference, phone, SUB-123, EMI id"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                disabled={loading || refreshing}
              />
            </div>

            <button
              type="submit"
              disabled={loading || refreshing}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Searching..." : "Search"}
            </button>

            <button
              type="button"
              onClick={handleResetSearch}
              disabled={loading || refreshing}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </form>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading cashier payment history..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payment history"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Posted payments"
            description={
              query
                ? `Showing cashier-visible results for "${query}".`
                : "Showing the most recent cashier-visible payment activity."
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No matching payments"
                description="No cashier-visible payments matched the current search."
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
                        Subscription / EMI
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Method / Reference
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                        Amount
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
                    {rows.map((row) => (
                      <tr key={row.id} className="align-top">
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">#{row.id}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {Boolean(row.is_reversed) ? "Reversed" : "Posted"}
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
                            EMI {row.emi ?? "—"}
                            {typeof row.emi_month_no === "number"
                              ? ` · Month ${row.emi_month_no}`
                              : ""}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.batch_code || "No batch"}
                            {typeof row.lucky_number === "number"
                              ? ` · Lucky #${row.lucky_number}`
                              : ""}
                          </div>
                        </td>

                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">{row.method || "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.reference_no || `AUTO-${row.id}`}
                          </div>
                        </td>

                        <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                          {money(row.amount)}
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
        ) : null}
      </div>
    </PortalPage>
  );
}
