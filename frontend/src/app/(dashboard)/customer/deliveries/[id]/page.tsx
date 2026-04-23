"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import {
  WorkspaceNotice,
  WorkspaceTimeline,
  type WorkspaceTimelineItem,
} from "@/components/ui/role-workspace";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import { getCustomerDelivery, type DeliveryRecord } from "@/services/deliveries";

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
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load delivery detail.";
}

function deliveryTone(
  status?: string | null
): "default" | "info" | "success" | "warning" | "danger" {
  switch ((status || "").toUpperCase()) {
    case "DELIVERED":
      return "success";
    case "FAILED":
    case "CANCELLED":
      return "danger";
    case "RETURN_REQUESTED":
    case "RETURNED":
      return "warning";
    case "DISPATCHED":
    case "OUT_FOR_DELIVERY":
    case "SCHEDULED":
      return "info";
    default:
      return "default";
  }
}

function deliverySummary(status?: string | null): string {
  switch ((status || "").toUpperCase()) {
    case "DELIVERED":
      return "This shipment has been marked delivered. Use this page for receiver and delivery-record context only; contract and payment truth remain on their dedicated workspaces.";
    case "OUT_FOR_DELIVERY":
      return "The shipment is currently marked out for delivery. Keep this page focused on delivery status and receiver context rather than payment or subscription-state interpretation.";
    case "DISPATCHED":
      return "The shipment has been dispatched and is in active delivery workflow. Delivery updates remain separate from customer payment history and EMI posture.";
    case "FAILED":
      return "The delivery record shows a failed fulfillment attempt. Review the operational notes here, then use support or subscription workspaces separately if follow-up is required.";
    case "RETURN_REQUESTED":
      return "A return has been requested for this delivery record. Return posture stays auditable as part of delivery history and does not rewrite contract or payment history.";
    case "RETURNED":
      return "This delivery record shows a completed return path. Use the delivery timeline here for fulfillment context only.";
    case "CANCELLED":
      return "This delivery record was cancelled before completion. The cancellation stays part of delivery history and does not imply any payment or contract mutation.";
    case "SCHEDULED":
      return "The delivery has been scheduled but is not yet out for delivery. Use this screen for shipment timing and receiver details only.";
    default:
      return "This delivery record remains read-only in the customer workspace. Delivery updates stay separate from subscription, EMI, and receipt detail.";
  }
}

function buildTimeline(delivery: DeliveryRecord): WorkspaceTimelineItem[] {
  const items: WorkspaceTimelineItem[] = [];

  const pushItem = (
    id: string,
    title: string,
    value: string | null | undefined,
    description?: string,
    badgeStatus?: string
  ) => {
    if (!value) return;
    items.push({
      id,
      title,
      description,
      timestamp: formatDateTime(value),
      badge: badgeStatus ? <StatusBadge status={badgeStatus} hideIcon /> : undefined,
    });
  };

  pushItem(
    "created",
    "Delivery record created",
    delivery.created_at,
    delivery.created_by_username
      ? `Created by ${delivery.created_by_username}.`
      : "The delivery workflow record was created."
  );
  pushItem(
    "scheduled",
    "Delivery scheduled",
    delivery.scheduled_date,
    "A shipment date was recorded for this subscription delivery.",
    "SCHEDULED"
  );
  pushItem(
    "dispatched",
    "Shipment dispatched",
    delivery.dispatched_at,
    "The item left the fulfillment workflow and entered transit.",
    "DISPATCHED"
  );
  pushItem(
    "out-for-delivery",
    "Out for delivery",
    delivery.out_for_delivery_at,
    "The shipment is in its last-mile delivery stage.",
    "OUT_FOR_DELIVERY"
  );
  pushItem(
    "delivered",
    "Delivered",
    delivery.delivered_at,
    delivery.receiver_name
      ? `Recorded receiver: ${delivery.receiver_name}.`
      : "The shipment was marked delivered.",
    "DELIVERED"
  );
  pushItem(
    "failed",
    "Delivery failed",
    delivery.failed_at,
    delivery.failure_reason || "The delivery attempt failed.",
    "FAILED"
  );
  pushItem(
    "cancelled",
    "Delivery cancelled",
    delivery.cancelled_at,
    delivery.failure_reason || "The delivery record was cancelled.",
    "CANCELLED"
  );
  pushItem(
    "return-requested",
    "Return requested",
    delivery.return_requested_at,
    "A return request was recorded against this delivery history.",
    "RETURN_REQUESTED"
  );
  pushItem(
    "returned",
    "Returned",
    delivery.returned_at,
    "The return workflow was completed for this delivery.",
    "RETURNED"
  );

  return items;
}

export default function CustomerDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const deliveryId = params?.id;

  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!deliveryId) {
      setError("Delivery id is missing.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      const payload = await getCustomerDelivery(deliveryId);
      setDelivery(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setDelivery(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const timelineItems = useMemo(
    () => (delivery ? buildTimeline(delivery) : []),
    [delivery]
  );

  const latestTimestamp = useMemo(() => {
    if (!delivery) return null;
    return (
      delivery.returned_at ||
      delivery.return_requested_at ||
      delivery.delivered_at ||
      delivery.failed_at ||
      delivery.cancelled_at ||
      delivery.out_for_delivery_at ||
      delivery.dispatched_at ||
      delivery.updated_at ||
      delivery.created_at ||
      null
    );
  }, [delivery]);

  return (
    <PortalPage
      eyebrow="Customer Deliveries"
      title={delivery ? delivery.delivery_reference : "Delivery Detail"}
      subtitle="Read-only shipment detail for your own subscription delivery, with fulfillment context, receiver information, and event history framed separately from payment and contract views."
      helperNote="This page shows delivery-record truth only. Subscription balances, receipts, and EMI state remain on the subscription and payment workspaces."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Deliveries", href: "/customer/deliveries" },
        { label: delivery?.delivery_reference || "Detail" },
      ]}
      actions={[
        {
          href: "/customer/deliveries",
          label: "Back to Deliveries",
          variant: "secondary",
        },
        ...(delivery?.subscription_id
          ? [
              {
                href: `/customer/subscriptions/${delivery.subscription_id}`,
                label: "Open Subscription",
                variant: "ghost" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: delivery?.status || "—" },
        { label: "Scheduled", value: formatDate(delivery?.scheduled_date) },
        {
          label: "Latest update",
          value: formatDateTime(latestTimestamp),
        },
        {
          label: "History count",
          value: delivery?.history_count ?? "—",
        },
      ]}
      statusBadge={{
        label: delivery?.status || "Delivery tracking",
        tone: deliveryTone(delivery?.status),
      }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading delivery detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load delivery detail"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && !delivery ? (
          <EmptyState
            title="Delivery not found"
            description="The requested delivery record is not available for your account."
          />
        ) : null}

        {!loading && !error && delivery ? (
          <>
            <WorkspaceSection
              title="Delivery posture"
              description="Current shipment state and the operational boundary for this delivery record."
              action={
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
              <WorkspaceNotice
                tone={deliveryTone(delivery.status)}
                title={`Current status: ${delivery.status}`}
              >
                {deliverySummary(delivery.status)}
              </WorkspaceNotice>
            </WorkspaceSection>

            <WorkspaceSection
              title="Shipment summary"
              description="Core delivery identifiers and subscription linkage kept separate from payment or EMI detail."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Subscription"
                  value={
                    delivery.subscription_number ||
                    `SUB-${delivery.subscription_id ?? "—"}`
                  }
                />
                <DetailItem label="Product" value={delivery.product_name || "—"} />
                <DetailItem label="Batch" value={delivery.batch_code || "—"} />
                <DetailItem
                  label="Lucky Number"
                  value={
                    delivery.lucky_number !== null &&
                    delivery.lucky_number !== undefined
                      ? `#${String(delivery.lucky_number).padStart(2, "0")}`
                      : "—"
                  }
                />
                <DetailItem
                  label="Fulfillment status"
                  value={delivery.fulfillment_status || "—"}
                />
                <DetailItem
                  label="Scheduled"
                  value={formatDate(delivery.scheduled_date)}
                />
                <DetailItem
                  label="Delivered"
                  value={formatDateTime(delivery.delivered_at)}
                  tone={delivery.delivered_at ? "success" : "default"}
                />
                <DetailItem
                  label="Reference"
                  value={delivery.delivery_reference || "—"}
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Receiver and destination"
              description="Receiver information and address snapshot captured against this delivery record."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Receiver"
                  value={delivery.receiver_name || "Pending confirmation"}
                />
                <DetailItem
                  label="Receiver phone"
                  value={delivery.receiver_phone || "Pending confirmation"}
                />
                <DetailItem
                  label="Address snapshot"
                  value={delivery.delivery_address_snapshot || "No address snapshot recorded."}
                  className="md:col-span-2 xl:col-span-2"
                />
                <DetailItem
                  label="Operational notes"
                  value={delivery.notes || "No delivery notes recorded."}
                  className="md:col-span-2 xl:col-span-2"
                />
                <DetailItem
                  label="Failure or return reason"
                  value={delivery.failure_reason || "No failure or return reason recorded."}
                  className="md:col-span-2 xl:col-span-2"
                  tone={
                    delivery.failure_reason ? deliveryTone(delivery.status) : "default"
                  }
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Delivery event timeline"
              description="Fulfillment events recorded for this delivery history."
            >
              {timelineItems.length === 0 ? (
                <EmptyState
                  title="No delivery events recorded"
                  description="This delivery does not yet have a visible shipment timeline."
                />
              ) : (
                <WorkspaceTimeline items={timelineItems} />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Operational record"
              description="Created/updated metadata and audit-adjacent context visible to the customer role."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Created by"
                  value={delivery.created_by_username || "—"}
                />
                <DetailItem
                  label="Created at"
                  value={formatDateTime(delivery.created_at)}
                />
                <DetailItem
                  label="Updated by"
                  value={delivery.updated_by_username || "—"}
                />
                <DetailItem
                  label="Updated at"
                  value={formatDateTime(delivery.updated_at)}
                />
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
