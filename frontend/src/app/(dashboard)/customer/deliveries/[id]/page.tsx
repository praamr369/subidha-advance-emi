"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { getCustomerDelivery, type DeliveryRecord } from "@/services/deliveries";

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
  return "Failed to load delivery detail.";
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

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function CustomerDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const deliveryId = params?.id;

  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!deliveryId) {
      setError("Delivery id is missing.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const payload = await getCustomerDelivery(deliveryId);
      setDelivery(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setDelivery(null);
    } finally {
      setLoading(false);
    }
  }, [deliveryId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  return (
    <PortalPage
      title={delivery ? delivery.delivery_reference : "Delivery Detail"}
      subtitle="Read-only delivery tracking for your subscription."
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
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: delivery?.status || "—" },
        { label: "Scheduled", value: formatDate(delivery?.scheduled_date) },
        { label: "Delivered", value: formatDateTime(delivery?.delivered_at) },
        { label: "Fulfillment", value: delivery?.fulfillment_status || "—" },
      ]}
      statusBadge={{
        label: delivery?.status || "Delivery Tracking",
        tone:
          delivery?.status === "DELIVERED"
            ? "success"
            : delivery?.status === "FAILED" || delivery?.status === "CANCELLED"
            ? "danger"
            : "info",
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
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone(
                    delivery.status
                  )}`}
                >
                  {delivery.status}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue
                  label="Subscription"
                  value={delivery.subscription_number || `SUB-${delivery.subscription_id ?? "—"}`}
                />
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
                <DetailValue label="Receiver" value={delivery.receiver_name || "—"} />
                <DetailValue label="Receiver Phone" value={delivery.receiver_phone || "—"} />
                <DetailValue
                  label="Address"
                  value={delivery.delivery_address_snapshot || "—"}
                />
                <DetailValue label="Notes" value={delivery.notes || "—"} />
                <DetailValue
                  label="Failure / Return Reason"
                  value={delivery.failure_reason || "—"}
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
