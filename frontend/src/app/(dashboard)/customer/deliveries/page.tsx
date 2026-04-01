"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  listCustomerDeliveries,
  type DeliveryRecord,
  type DeliveryStatus,
} from "@/services/deliveries";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load delivery tracking.";
}

function tone(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "DELIVERED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "FAILED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    case "RETURN_REQUESTED":
    case "RETURNED":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "DISPATCHED":
    case "OUT_FOR_DELIVERY":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

export default function CustomerDeliveriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get("status") || "").trim().toUpperCase() as DeliveryStatus | "";
  const subscriptionFilter = (searchParams.get("subscription") || "").trim();

  const [statusInput, setStatusInput] = useState(statusFilter);
  const [subscriptionInput, setSubscriptionInput] = useState(subscriptionFilter);
  const [rows, setRows] = useState<DeliveryRecord[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    scheduled: 0,
    in_transit: 0,
    dispatched: 0,
    out_for_delivery: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    return_requested: 0,
    returned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatusInput(statusFilter);
    setSubscriptionInput(subscriptionFilter);
  }, [statusFilter, subscriptionFilter]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await listCustomerDeliveries({
          status: statusFilter || undefined,
          subscription: subscriptionFilter || undefined,
        });
        setRows(payload.results);
        setCount(payload.count);
        setSummary(payload.summary);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [statusFilter, subscriptionFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const nextDueLike = useMemo(
    () =>
      rows
        .map((row) => row.scheduled_date)
        .filter((value): value is string => Boolean(value))
        .sort()[0] || "—",
    [rows]
  );

  function applyFilters() {
    const next = new URLSearchParams();
    if (statusInput) next.set("status", statusInput);
    if (subscriptionInput.trim()) next.set("subscription", subscriptionInput.trim());
    const query = next.toString();
    router.replace(query ? `/customer/deliveries?${query}` : "/customer/deliveries");
  }

  function clearFilters() {
    setStatusInput("");
    setSubscriptionInput("");
    router.replace("/customer/deliveries");
  }

  return (
    <PortalPage
      title="Deliveries"
      subtitle="Track product delivery progress for your own subscriptions only."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Deliveries" },
      ]}
      actions={[
        {
          href: "/customer/subscriptions",
          label: "Subscriptions",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible", value: String(count) },
        { label: "In Transit", value: String(summary.in_transit), tone: "info" },
        { label: "Delivered", value: String(summary.delivered), tone: "success" },
        { label: "Returns", value: String(summary.return_requested + summary.returned) },
        { label: "Next Scheduled", value: formatDate(nextDueLike) },
      ]}
      statusBadge={{ label: "Read-only Delivery Tracking", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="min-w-[220px]">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              value={statusInput}
              onChange={(event) => setStatusInput(event.target.value as DeliveryStatus | "")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="OUT_FOR_DELIVERY">Out for delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RETURN_REQUESTED">Return requested</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>
          <div className="min-w-[220px]">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subscription ID
            </label>
            <input
              value={subscriptionInput}
              onChange={(event) => setSubscriptionInput(event.target.value)}
              placeholder="Subscription ID"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading deliveries..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load deliveries"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No delivery records"
            description="Your subscriptions do not have delivery records for the current filter set."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left">
                    {["Reference", "Subscription", "Status", "Scheduled", "Latest Update", "Actions"].map((label) => (
                      <th
                        key={label}
                        className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{row.delivery_reference}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.product_name || "Subscription delivery"}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {row.subscription_number || `SUB-${row.subscription_id ?? "—"}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.batch_code || "No batch"}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        {formatDate(row.scheduled_date)}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        {formatDateTime(
                          row.delivered_at ||
                            row.out_for_delivery_at ||
                            row.dispatched_at ||
                            row.updated_at
                        )}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <Link
                          href={`/customer/deliveries/${row.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          View Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </PortalPage>
  );
}
