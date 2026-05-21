"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { MobileSafeTable } from "@/components/ui/operations";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import {
  listCustomerDeliveries,
  type DeliveryRecord,
  type DeliveryStatus,
} from "@/services/deliveries";

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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load delivery tracking.";
}

function resolveLatestEvent(row: DeliveryRecord): {
  label: string;
  value: string | null | undefined;
} {
  if (row.returned_at) {
    return { label: "Returned", value: row.returned_at };
  }
  if (row.return_requested_at) {
    return { label: "Return requested", value: row.return_requested_at };
  }
  if (row.delivered_at) {
    return { label: "Delivered", value: row.delivered_at };
  }
  if (row.failed_at) {
    return { label: "Delivery failed", value: row.failed_at };
  }
  if (row.cancelled_at) {
    return { label: "Cancelled", value: row.cancelled_at };
  }
  if (row.out_for_delivery_at) {
    return { label: "Out for delivery", value: row.out_for_delivery_at };
  }
  if (row.dispatched_at) {
    return { label: "Dispatched", value: row.dispatched_at };
  }
  if (row.scheduled_date) {
    return { label: "Scheduled", value: row.scheduled_date };
  }
  return { label: "Last updated", value: row.updated_at || row.created_at };
}

export default function CustomerDeliveriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (
    (searchParams.get("status") || "").trim().toUpperCase() as DeliveryStatus | ""
  );
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
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

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
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [statusFilter, subscriptionFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const nextScheduled = useMemo(
    () =>
      rows
        .map((row) => row.scheduled_date)
        .filter((value): value is string => Boolean(value))
        .sort()[0] || "—",
    [rows]
  );

  const latestVisibleEvent = useMemo(() => {
    const candidates = rows
      .map((row) => resolveLatestEvent(row).value)
      .filter((value): value is string => Boolean(value))
      .sort()
      .reverse();
    return candidates[0] || null;
  }, [rows]);

  const columns = useMemo<Column<DeliveryRecord>[]>(
    () => [
      {
        key: "delivery_reference",
        title: "Delivery",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">{row.delivery_reference}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.product_name || "Subscription delivery"}
            </div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.subscription_id ?? "—"}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.batch_code || "No batch"} · Lucky #{String(row.lucky_number ?? "—")}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Shipment status",
        render: (row) => (
          <div className="space-y-2">
            <ERPStatusBadge status={row.status} />
            <div className="text-xs text-muted-foreground">
              {row.fulfillment_status || "Delivery workflow record"}
            </div>
          </div>
        ),
      },
      {
        key: "scheduled_date",
        title: "Scheduled",
        render: (row) => formatDate(row.scheduled_date),
      },
      {
        key: "latest_update",
        title: "Latest update",
        render: (row) => {
          const latest = resolveLatestEvent(row);
          return (
            <div>
              <div className="font-medium text-foreground">
                {formatDateTime(latest.value)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{latest.label}</div>
            </div>
          );
        },
      },
    ],
    []
  );

  function applyFilters() {
    const next = new URLSearchParams();
    if (statusInput) next.set("status", statusInput);
    if (subscriptionInput.trim()) {
      next.set("subscription", subscriptionInput.trim());
    }

    const query = next.toString();
    router.replace(query ? `/customer/deliveries?${query}` : "/customer/deliveries");
  }

  function clearFilters() {
    setStatusInput("");
    setSubscriptionInput("");
    router.replace("/customer/deliveries");
  }

  return (
    <ERPPageShell
      eyebrow="Customer Deliveries"
      title="Delivery Tracking"
      subtitle="Track delivery history and current shipment posture for your own subscriptions without mixing delivery status into payment or contract-state screens."
      helperNote="Delivery rows on this route reflect fulfillment events only. Payment receipts, outstanding EMI posture, and subscription lifecycle remain on their own customer workspaces."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Deliveries" },
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
          variant: "ghost",
        },
      ]}
      stats={[
        { label: "Visible", value: count },
        { label: "Scheduled", value: summary.scheduled, tone: "info" },
        { label: "In transit", value: summary.in_transit, tone: "warning" },
        { label: "Delivered", value: summary.delivered, tone: "success" },
        {
          label: "Next scheduled",
          value: formatDate(nextScheduled),
        },
      ]}
      statusBadge={{ label: "Read-only delivery scope", tone: "info" }}
      headerMode="erp"
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Delivery register controls"
          description="Filter shipment records by status or subscription, then open a detail view for timeline and receiver context."
          actions={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <TableToolbar
            footer={
              statusFilter || subscriptionFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">
                    Active filters
                  </span>
                  {statusFilter ? <ERPStatusBadge status={statusFilter} hideIcon /> : null}
                  {subscriptionFilter ? (
                    <ERPStatusBadge
                      status="ACTIVE"
                      label={`Subscription ${subscriptionFilter}`}
                      hideIcon
                    />
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Delivery detail stays operationally separate from receipts and contract status. Open a delivery row when you need shipment-specific updates, receiver context, or return posture.
                </div>
              )
            }
          >
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
              <select
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(event.target.value as DeliveryStatus | "")
                }
                className="h-11 rounded-xl border border-border bg-background px-4 text-sm"
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

              <input
                value={subscriptionInput}
                onChange={(event) => setSubscriptionInput(event.target.value)}
                placeholder="Filter by subscription id"
                className="h-11 rounded-xl border border-border bg-background px-4 text-sm"
              />

              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" onClick={applyFilters}>
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={clearFilters}>
                  Clear
                </ActionButton>
              </div>
            </div>
          </TableToolbar>
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading deliveries..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load deliveries"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <ERPSectionShell
            title="Delivery history"
            description="Shipment rows sourced from the customer delivery API, with direct drill-in to the delivery detail surface."
          >
            {rows.length === 0 ? (
              <ERPEmptyState
                title="No delivery records"
                description={
                  statusFilter || subscriptionFilter
                    ? "No delivery records matched the current filters."
                    : "No delivery records are currently available for your customer scope."
                }
              />
            ) : (
              <MobileSafeTable className="border-none bg-transparent">
                <DataTable<DeliveryRecord>
                  rows={rows}
                  columns={columns}
                  pageSize={20}
                  onRowClick={(row) => router.push(`/customer/deliveries/${row.id}`)}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        href={`/customer/deliveries/${row.id}`}
                        variant="outline"
                        className="min-h-11"
                      >
                        View detail
                      </ActionButton>
                      {row.subscription_id ? (
                        <ActionButton
                          href={`/customer/subscriptions/${row.subscription_id}`}
                          variant="ghost"
                          className="min-h-11"
                        >
                          Subscription
                        </ActionButton>
                      ) : null}
                    </div>
                  )}
                />
              </MobileSafeTable>
            )}

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <WorkspaceNotice tone="info" title="Delivery-only context">
                Delivery status helps you understand shipment posture, receiver information, and return handling. It does not change payment history, winner posture, or outstanding EMI totals.
              </WorkspaceNotice>
              <WorkspaceNotice tone="default" title="Latest visible event">
                {latestVisibleEvent
                  ? `Most recent delivery activity on this screen was recorded at ${formatDateTime(
                      latestVisibleEvent
                    )}.`
                  : "No delivery activity has been recorded yet."}
              </WorkspaceNotice>
            </div>
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
