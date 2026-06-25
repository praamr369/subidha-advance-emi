"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { DetailPageShell } from "@/components/layout/page-shells";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import { buildAdminBillingRegisterRoute } from "@/lib/route-builders";
import {
  cancelAdminDelivery,
  getAdminDelivery,
  markAdminDeliveryDelivered,
  markAdminDeliveryFailed,
  markAdminDeliveryReturned,
  requestAdminDeliveryReturn,
  transitionAdminDelivery,
  updateAdminDelivery,
  type DeliveryRecord,
} from "@/services/deliveries";

type AuditEntry = {
  id: number;
  action_type: string;
  performed_by_username?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

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

function statusTone(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "DELIVERED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "RETURN_REQUESTED":
    case "RETURNED":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "FAILED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    // Phase 2: blocked delivery
    case "BLOCKED_STOCK_UNAVAILABLE":
      return "border-orange-400 bg-orange-50 text-orange-800 font-semibold";
    case "DISPATCHED":
    case "OUT_FOR_DELIVERY":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function summarizeAudit(entry: AuditEntry): string {
  const metadata = entry.metadata || {};
  switch (entry.action_type) {
    case "DELIVERY_CREATED":
      return `Delivery created in ${String(metadata.status || "PENDING")} state.`;
    case "DELIVERY_UPDATED":
      return `Metadata updated: ${Object.keys((metadata.changed_fields as Record<string, unknown>) || {}).join(", ") || "details changed"}.`;
    case "DELIVERY_DISPATCHED":
    case "DELIVERY_COMPLETED":
    case "DELIVERY_FAILED":
    case "DELIVERY_CANCELLED":
    case "DELIVERY_RETURN_REQUESTED":
    case "DELIVERY_RETURNED":
    case "DELIVERY_STATUS_CHANGED":
      return `Status changed from ${String(metadata.old_status || "—")} to ${String(metadata.new_status || "—")}.`;
    default:
      return "Delivery activity recorded.";
  }
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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function AdminDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const deliveryId = params?.id;

  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [timeline, setTimeline] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [scheduledDate, setScheduledDate] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  const backHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/admin/deliveries?${qs}` : "/admin/deliveries";
  }, [searchParams]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!deliveryId) {
        setError("Delivery id is missing.");
        setLoading(false);
        return;
      }

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [deliveryPayload, timelinePayload] = await Promise.all([
          getAdminDelivery(deliveryId),
          apiFetch<{ results?: AuditEntry[] }>(
            `/admin/audit-logs/timeline/SubscriptionDelivery/${deliveryId}/`
          ),
        ]);

        setDelivery(deliveryPayload);
        setTimeline(timelinePayload.results || []);
        setScheduledDate(deliveryPayload.scheduled_date || "");
        setReceiverName(deliveryPayload.receiver_name || "");
        setReceiverPhone(deliveryPayload.receiver_phone || "");
        setAddress(deliveryPayload.delivery_address_snapshot || "");
        setNotes(deliveryPayload.notes || "");
        setReason(deliveryPayload.failure_reason || "");
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err, "Failed to load delivery detail."));
        setDelivery(null);
        setTimeline([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [deliveryId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  async function handleMetadataSave() {
    if (!delivery) return;

    try {
      setActionLoading("metadata");
      setMessage(null);
      const updated = await updateAdminDelivery(delivery.id, {
        scheduled_date: scheduledDate || null,
        receiver_name: receiverName,
        receiver_phone: receiverPhone,
        delivery_address_snapshot: address,
        notes,
        failure_reason: reason,
      });
      setDelivery(updated);
      setMessage("Delivery metadata updated.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err, "Failed to update delivery metadata."));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTransition(
    action:
      | "SCHEDULED"
      | "DISPATCHED"
      | "OUT_FOR_DELIVERY"
      | "DELIVERED"
      | "FAILED"
      | "CANCELLED"
      | "RETURN_REQUESTED"
      | "RETURNED"
  ) {
    if (!delivery) return;

    try {
      setActionLoading(action);
      setMessage(null);
      let updated: DeliveryRecord;

      if (action === "DELIVERED") {
        updated = await markAdminDeliveryDelivered(delivery.id, {
          receiver_name: receiverName,
          receiver_phone: receiverPhone,
          notes,
        });
      } else if (action === "FAILED") {
        updated = await markAdminDeliveryFailed(delivery.id, {
          reason,
          notes,
        });
      } else if (action === "CANCELLED") {
        updated = await cancelAdminDelivery(delivery.id, {
          reason,
          notes,
        });
      } else if (action === "RETURN_REQUESTED") {
        updated = await requestAdminDeliveryReturn(delivery.id, { notes });
      } else if (action === "RETURNED") {
        updated = await markAdminDeliveryReturned(delivery.id, { notes });
      } else {
        updated = await transitionAdminDelivery(delivery.id, {
          status: action,
          scheduled_date: scheduledDate || null,
          notes,
        });
      }

      setDelivery(updated);
      setMessage(`Delivery moved to ${updated.status}.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err, `Failed to update delivery status to ${action}.`));
    } finally {
      setActionLoading(null);
    }
  }

  const availableActions = useMemo(() => {
    switch (delivery?.status) {
      case "PENDING":
        return ["SCHEDULED", "CANCELLED"] as const;
      case "SCHEDULED":
        return ["DISPATCHED", "FAILED", "CANCELLED"] as const;
      case "DISPATCHED":
        return ["OUT_FOR_DELIVERY", "FAILED", "CANCELLED"] as const;
      case "OUT_FOR_DELIVERY":
        return ["DELIVERED", "FAILED"] as const;
      case "DELIVERED":
        return ["RETURN_REQUESTED"] as const;
      case "RETURN_REQUESTED":
        return ["RETURNED"] as const;
      default:
        return [] as const;
    }
  }, [delivery?.status]);

  return (
    <ERPPageShell
      eyebrow="Delivery"
      title={delivery ? delivery.delivery_reference : "Delivery Detail"}
      subtitle="Inspect delivery facts, update operational metadata, and perform explicit lifecycle transitions with audit history."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Deliveries", href: "/admin/deliveries" },
        { label: delivery?.delivery_reference || "Detail" },
      ]}
      actions={[
        { href: backHref, label: "Back to Deliveries", variant: "secondary" },
        ...(delivery?.subscription_id
          ? [
              {
                href: `/admin/subscriptions/${delivery.subscription_id}`,
                label: "Open Subscription",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(delivery?.customer_id
          ? [
              {
                href: `/admin/customers/${delivery.customer_id}`,
                label: "Open Customer",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(delivery?.subscription_id
          ? [
              {
                href: buildAdminBillingRegisterRoute({
                  subscription: delivery.subscription_id,
                }),
                label: "Billing Docs",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: delivery?.status || "—" },
        { label: "Fulfillment", value: delivery?.fulfillment_status || "—" },
        { label: "Scheduled", value: formatDate(delivery?.scheduled_date) },
        { label: "Delivered", value: formatDateTime(delivery?.delivered_at) },
      ]}
      statusBadge={{
        label: delivery?.status || "Delivery Detail",
        tone:
          delivery?.status === "DELIVERED"
            ? "success"
            : delivery?.status === "FAILED" || delivery?.status === "CANCELLED"
            ? "danger"
            : "info",
      }}
    >
      <DetailPageShell
        objectHeader={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted/30 hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
        statusActions={
          message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          ) : null
        }
        sections={
          <div className="space-y-6">

        {loading ? <LoadingBlock label="Loading delivery detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load delivery detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        {!loading && !error && !delivery ? (
          <EmptyState
            title="Delivery not found"
            description="No delivery record was returned for this route."
          />
        ) : null}

        {!loading && !error && delivery ? (
          <>
            <SectionCard
              title="Delivery snapshot"
              description="Current status, contract context, and receiver information."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Reference" value={delivery.delivery_reference} />
                <DetailValue
                  label="Status"
                  value={
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(
                        delivery.status
                      )}`}
                    >
                      {delivery.status}
                    </span>
                  }
                />
                <DetailValue
                  label="Subscription"
                  value={
                    delivery.subscription_number || `SUB-${delivery.subscription_id ?? "—"}`
                  }
                />
                <DetailValue label="Customer" value={delivery.customer_name || "—"} />
                <DetailValue label="Phone" value={delivery.customer_phone || "—"} />
                <DetailValue label="Product" value={delivery.product_name || "—"} />
                <DetailValue label="Batch" value={delivery.batch_code || "—"} />
                <DetailValue label="Lucky Number" value={delivery.lucky_number ?? "—"} />
                <DetailValue label="Scheduled" value={formatDate(delivery.scheduled_date)} />
                <DetailValue label="Dispatched" value={formatDateTime(delivery.dispatched_at)} />
                <DetailValue
                  label="Out for Delivery"
                  value={formatDateTime(delivery.out_for_delivery_at)}
                />
                <DetailValue label="Delivered" value={formatDateTime(delivery.delivered_at)} />
                <DetailValue label="Failed" value={formatDateTime(delivery.failed_at)} />
                <DetailValue label="Cancelled" value={formatDateTime(delivery.cancelled_at)} />
                <DetailValue
                  label="Inventory Stock Status"
                  value={`${delivery.inventory_stock_status || "not available"}${
                    delivery.inventory_available_qty ? ` (${delivery.inventory_available_qty} available)` : ""
                  }`}
                />
                {/* Phase 2: show block reason when BLOCKED_STOCK_UNAVAILABLE */}
                {delivery.status === "BLOCKED_STOCK_UNAVAILABLE" && delivery.stock_blocked_reason && (
                  <div className="col-span-full rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <p className="text-xs font-semibold">Blocked – Stock Unavailable</p>
                    <p className="mt-1 text-xs text-amber-800">{delivery.stock_blocked_reason}</p>
                  </div>
                )}
                <DetailValue
                  label="Return Requested"
                  value={formatDateTime(delivery.return_requested_at)}
                />
                <DetailValue label="Returned" value={formatDateTime(delivery.returned_at)} />
              </div>
            </SectionCard>

            <SectionCard
              title="Metadata"
              description="Receiver and address fields stay editable here. Status transitions remain explicit actions below."
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  placeholder="Receiver name"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  value={receiverPhone}
                  onChange={(event) => setReceiverPhone(event.target.value)}
                  placeholder="Receiver phone"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Failure / cancellation reason"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                />
                <textarea
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Delivery address snapshot"
                  className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring lg:col-span-2"
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Operational notes"
                  className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring lg:col-span-2"
                />
                <div className="lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => void handleMetadataSave()}
                    disabled={actionLoading === "metadata"}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "metadata" ? "Saving..." : "Save Metadata"}
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Transition actions"
              description="Only valid next actions are shown. Failed and cancelled actions require a reason."
            >
              {availableActions.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  This delivery is in a terminal state. No further lifecycle transition is available from here.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {availableActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void handleTransition(action)}
                      disabled={actionLoading === action}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted/30 hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading === action
                        ? "Working..."
                        : action
                            .replaceAll("_", " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
          </div>
        }
        timelineAside={
          !loading && !error && delivery ? (
            <SectionCard
              title="Action history"
              description="Delivery lifecycle changes are recorded from the backend service layer."
            >
              {timeline.length === 0 ? (
                <EmptyState
                  title="No delivery audit events"
                  description="This record does not have any timeline entries yet."
                />
              ) : (
                <div className="space-y-3">
                  {timeline.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-border bg-muted/50 px-4 py-3"
                    >
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {entry.action_type}
                      </div>
                      <div className="mt-1 text-sm text-foreground">
                        {summarizeAudit(entry)}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(entry.created_at)} · {entry.performed_by_username || "System"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          ) : null
        }
      />
    </ERPPageShell>
  );
}
