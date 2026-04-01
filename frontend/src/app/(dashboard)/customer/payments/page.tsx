"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import {
  listCustomerPayments,
  type CustomerPayment,
} from "@/services/customer";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
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

function formatDate(value: string | null | undefined): string {
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

  return "Failed to load customer payment history.";
}

function paymentStatus(payment: CustomerPayment): "RECORDED" | "REVERSED" {
  return payment.is_reversed ? "REVERSED" : "RECORDED";
}

function statusBadgeClass(status: "RECORDED" | "REVERSED"): string {
  if (status === "REVERSED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function CustomerPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const subscriptionFilter = (searchParams.get("subscription") || "").trim();
  const methodFilter = (searchParams.get("method") || "").trim();

  const [subscriptionInput, setSubscriptionInput] = useState(subscriptionFilter);
  const [methodInput, setMethodInput] = useState(methodFilter);
  const [rows, setRows] = useState<CustomerPayment[]>([]);
  const [count, setCount] = useState(0);
  const [totalPaidAmount, setTotalPaidAmount] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubscriptionInput(subscriptionFilter);
    setMethodInput(methodFilter);
  }, [subscriptionFilter, methodFilter]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await listCustomerPayments({
          subscription: subscriptionFilter || undefined,
          method: methodFilter || undefined,
        });

        setRows(payload.results);
        setCount(payload.count);
        setTotalPaidAmount(String(payload.total_paid_amount || "0.00"));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setTotalPaidAmount("0.00");
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [methodFilter, subscriptionFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const uniqueSubscriptionCount = useMemo(() => {
    return new Set(rows.map((row) => row.subscription_id ?? row.subscription)).size;
  }, [rows]);

  const reversedCount = useMemo(() => {
    return rows.filter((row) => row.is_reversed).length;
  }, [rows]);

  const latestPayment = useMemo(() => {
    return rows[0] ?? null;
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        key: "id",
        title: "Payment",
        render: (row: CustomerPayment) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ref {row.reference_no || `AUTO-${row.id}`}
            </div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row: CustomerPayment) => (
          <div>
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.subscription}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.product_name || row.subscription_plan_type || "Lucky Plan"}
            </div>
          </div>
        ),
      },
      {
        key: "emi_id",
        title: "EMI",
        render: (row: CustomerPayment) => (
          <div>
            <div className="font-medium text-foreground">
              {row.emi_id
                ? `Month ${row.emi_month_no ?? "—"}`
                : "Subscription-level payment"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.emi_id
                ? `EMI #${row.emi_id} · Due ${formatDate(row.emi_due_date)}`
                : row.batch_code || "No EMI row linked"}
            </div>
          </div>
        ),
      },
      {
        key: "method",
        title: "Method",
        render: (row: CustomerPayment) => row.method || "—",
      },
      {
        key: "payment_date",
        title: "Recorded",
        render: (row: CustomerPayment) =>
          formatDateTime(row.created_at || row.payment_date),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right" as const,
        render: (row: CustomerPayment) => money(row.amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row: CustomerPayment) => {
          const status = paymentStatus(row);
          return (
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                status
              )}`}
            >
              {status}
            </span>
          );
        },
      },
    ],
    []
  );

  const applyFilters = () => {
    const next = new URLSearchParams();

    if (subscriptionInput.trim()) {
      next.set("subscription", subscriptionInput.trim());
    }

    if (methodInput.trim()) {
      next.set("method", methodInput.trim());
    }

    const query = next.toString();
    router.replace(query ? `/customer/payments?${query}` : "/customer/payments");
  };

  const clearFilters = () => {
    setSubscriptionInput("");
    setMethodInput("");
    router.replace("/customer/payments");
  };

  return (
    <PortalPage
      title="My Payments"
      subtitle="Customer-scoped payment history backed by your recorded payment rows."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Payments" },
      ]}
      actions={[
        {
          href: "/customer/subscriptions",
          label: "My Subscriptions",
          variant: "secondary",
        },
        {
          href: "/customer/support",
          label: "Support",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Payment Records", value: count },
        { label: "Total Paid", value: money(totalPaidAmount), tone: "success" },
        { label: "Subscriptions", value: uniqueSubscriptionCount },
        { label: "Reversed", value: reversedCount, tone: reversedCount > 0 ? "warning" : undefined },
        {
          label: "Latest Payment",
          value: latestPayment
            ? formatDateTime(latestPayment.created_at || latestPayment.payment_date)
            : "—",
        },
      ]}
      statusBadge={{ label: "Customer Payment Truth", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label
                htmlFor="customer-payment-subscription"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Subscription
              </label>
              <input
                id="customer-payment-subscription"
                type="text"
                value={subscriptionInput}
                onChange={(event) => setSubscriptionInput(event.target.value)}
                placeholder="Filter by subscription id"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div className="w-full lg:w-56">
              <label
                htmlFor="customer-payment-method"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Method
              </label>
              <select
                id="customer-payment-method"
                value={methodInput}
                onChange={(event) => setMethodInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All methods</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank</option>
                <option value="CARD">Card</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {(subscriptionFilter || methodFilter) && !loading ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Showing payment history with filters:
              {subscriptionFilter ? ` subscription ${subscriptionFilter}` : ""}
              {subscriptionFilter && methodFilter ? " · " : ""}
              {methodFilter ? ` method ${methodFilter}` : ""}
            </div>
          ) : null}
        </section>

        {loading ? <LoadingBlock label="Loading payment history..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payments"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No payment records"
            description={
              subscriptionFilter || methodFilter
                ? "No recorded customer payments matched the current filters."
                : "No recorded customer payments are currently available."
            }
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Payment history
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This page shows only your recorded payments. Use View Receipt
                  for transaction proof.
                </p>
              </div>

              <DataTable<CustomerPayment>
                rows={rows}
                columns={columns}
                onRowClick={(row) => router.push(`/customer/payments/${row.id}`)}
                rowActions={(row) => (
                  <Link
                    href={`/customer/payments/${row.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    View Receipt
                  </Link>
                )}
              />
            </section>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Payment rows on this page come directly from the customer payments
              API. Subscription outstanding or waiver figures are shown on the
              related subscription detail page.
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
