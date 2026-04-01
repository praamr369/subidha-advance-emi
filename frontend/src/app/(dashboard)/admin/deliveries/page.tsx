"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  createAdminDelivery,
  listAdminDeliveries,
  type DeliveryBucket,
  type DeliveryListResponse,
  type DeliveryRecord,
  type DeliveryStatus,
} from "@/services/deliveries";

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
    case "DISPATCHED":
    case "OUT_FOR_DELIVERY":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
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
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminDeliveriesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const initialQ = (searchParams.get("q") || "").trim();
  const initialStatus = (searchParams.get("status") || "").trim().toUpperCase() as
    | DeliveryStatus
    | "";
  const initialBucket = (searchParams.get("bucket") || "").trim().toUpperCase() as DeliveryBucket;
  const initialCustomer = (searchParams.get("customer") || "").trim();
  const initialSubscription = (searchParams.get("subscription") || "").trim();
  const initialBatch = (searchParams.get("batch") || "").trim();
  const initialDateFrom = (searchParams.get("date_from") || "").trim();
  const initialDateTo = (searchParams.get("date_to") || "").trim();

  const [rows, setRows] = useState<DeliveryRecord[]>([]);
  const [summary, setSummary] = useState<DeliveryListResponse["summary"]>({
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
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [qInput, setQInput] = useState(initialQ);
  const [statusInput, setStatusInput] = useState<DeliveryStatus | "">(initialStatus);
  const [bucketInput, setBucketInput] = useState<DeliveryBucket>(initialBucket || "");
  const [customerInput, setCustomerInput] = useState(initialCustomer);
  const [subscriptionInput, setSubscriptionInput] = useState(initialSubscription);
  const [batchInput, setBatchInput] = useState(initialBatch);
  const [dateFromInput, setDateFromInput] = useState(initialDateFrom);
  const [dateToInput, setDateToInput] = useState(initialDateTo);

  const [createSubscriptionId, setCreateSubscriptionId] = useState(initialSubscription);
  const [createStatus, setCreateStatus] = useState<"PENDING" | "SCHEDULED">("PENDING");
  const [createScheduledDate, setCreateScheduledDate] = useState("");
  const [createReceiverName, setCreateReceiverName] = useState("");
  const [createReceiverPhone, setCreateReceiverPhone] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setQInput(initialQ);
    setStatusInput(initialStatus);
    setBucketInput(initialBucket || "");
    setCustomerInput(initialCustomer);
    setSubscriptionInput(initialSubscription);
    setBatchInput(initialBatch);
    setDateFromInput(initialDateFrom);
    setDateToInput(initialDateTo);
    setCreateSubscriptionId(initialSubscription);
  }, [
    initialBatch,
    initialBucket,
    initialCustomer,
    initialDateFrom,
    initialDateTo,
    initialQ,
    initialStatus,
    initialSubscription,
  ]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await listAdminDeliveries({
          q: initialQ || undefined,
          status: initialStatus || undefined,
          bucket: initialBucket || undefined,
          customer: initialCustomer || undefined,
          subscription: initialSubscription || undefined,
          batch: initialBatch || undefined,
          date_from: initialDateFrom || undefined,
          date_to: initialDateTo || undefined,
        });

        setRows(payload.results);
        setSummary(payload.summary);
        setCount(payload.count);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err, "Failed to load deliveries."));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [
      initialBatch,
      initialBucket,
      initialCustomer,
      initialDateFrom,
      initialDateTo,
      initialQ,
      initialStatus,
      initialSubscription,
    ]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (qInput.trim()) next.set("q", qInput.trim());
    if (statusInput) next.set("status", statusInput);
    if (bucketInput) next.set("bucket", bucketInput);
    if (customerInput.trim()) next.set("customer", customerInput.trim());
    if (subscriptionInput.trim()) next.set("subscription", subscriptionInput.trim());
    if (batchInput.trim()) next.set("batch", batchInput.trim());
    if (dateFromInput) next.set("date_from", dateFromInput);
    if (dateToInput) next.set("date_to", dateToInput);
    const nextQuery = next.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  function clearFilters() {
    setQInput("");
    setStatusInput("");
    setBucketInput("");
    setCustomerInput("");
    setSubscriptionInput("");
    setBatchInput("");
    setDateFromInput("");
    setDateToInput("");
    router.replace(pathname);
  }

  async function handleCreateDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createSubscriptionId.trim()) {
      setError("Subscription id is required to create a delivery.");
      return;
    }

    try {
      setCreating(true);
      setMessage(null);
      setError(null);

      const created = await createAdminDelivery({
        subscription: Number(createSubscriptionId),
        status: createStatus,
        scheduled_date: createScheduledDate || null,
        receiver_name: createReceiverName.trim() || undefined,
        receiver_phone: createReceiverPhone.trim() || undefined,
        delivery_address_snapshot: createAddress.trim() || undefined,
        notes: createNotes.trim() || undefined,
      });

      setMessage(`Delivery ${created.delivery_reference} created successfully.`);
      setCreateNotes("");
      if (createStatus === "PENDING") setCreateScheduledDate("");
      await loadPage("refresh");
      router.push(`/admin/deliveries/${created.id}${queryString ? `?${queryString}` : ""}`);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to create delivery."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PortalPage
      title="Deliveries"
      subtitle="Create, track, and transition subscription-linked delivery records while keeping fulfillment summary and audit history consistent."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Deliveries" },
      ]}
      actions={[
        {
          href: "/admin/subscriptions",
          label: "Subscriptions",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible", value: String(count) },
        { label: "Pending", value: String(summary.pending + summary.scheduled), tone: "warning" },
        { label: "In Transit", value: String(summary.in_transit), tone: "info" },
        { label: "Delivered", value: String(summary.delivered), tone: "success" },
        { label: "Returns", value: String(summary.return_requested + summary.returned) },
      ]}
      statusBadge={{ label: "Internal Delivery Control", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading delivery workspace..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load deliveries"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}

        <SectionCard
          title="Filters"
          description="Keep the list shareable and reload-safe for handoff from subscriptions, customers, or batch operations."
        >
          <form className="grid gap-4 lg:grid-cols-4" onSubmit={applyFilters}>
            <input
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Search reference, customer, phone, note"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={statusInput}
              onChange={(event) => setStatusInput(event.target.value as DeliveryStatus | "")}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
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
            <select
              value={bucketInput}
              onChange={(event) => setBucketInput(event.target.value as DeliveryBucket)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All delivery buckets</option>
              <option value="PENDING">Open / pending</option>
              <option value="DELIVERED">Delivered only</option>
            </select>
            <input
              value={customerInput}
              onChange={(event) => setCustomerInput(event.target.value)}
              placeholder="Customer ID"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={subscriptionInput}
              onChange={(event) => setSubscriptionInput(event.target.value)}
              placeholder="Subscription ID"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
              placeholder="Batch ID"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateFromInput}
              onChange={(event) => setDateFromInput(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateToInput}
              onChange={(event) => setDateToInput(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="lg:col-span-4 flex flex-wrap gap-3">
              <button
                type="submit"
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
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Create Delivery"
          description="Open a delivery record for a subscription. Status starts in PENDING or SCHEDULED only, and active delivery paths stay one-at-a-time."
        >
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleCreateDelivery}>
            <input
              value={createSubscriptionId}
              onChange={(event) => setCreateSubscriptionId(event.target.value)}
              placeholder="Subscription ID"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={createStatus}
              onChange={(event) => setCreateStatus(event.target.value as "PENDING" | "SCHEDULED")}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="PENDING">Pending</option>
              <option value="SCHEDULED">Scheduled</option>
            </select>
            <input
              type="date"
              value={createScheduledDate}
              onChange={(event) => setCreateScheduledDate(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={createReceiverName}
              onChange={(event) => setCreateReceiverName(event.target.value)}
              placeholder="Receiver name"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={createReceiverPhone}
              onChange={(event) => setCreateReceiverPhone(event.target.value)}
              placeholder="Receiver phone"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={createAddress}
              onChange={(event) => setCreateAddress(event.target.value)}
              placeholder="Delivery address snapshot"
              className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
            />
            <textarea
              value={createNotes}
              onChange={(event) => setCreateNotes(event.target.value)}
              placeholder="Operational notes"
              className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm lg:col-span-2"
            />
            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Delivery"}
              </button>
            </div>
          </form>
        </SectionCard>

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No deliveries found"
            description="No delivery records match the current filter set."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <SectionCard
            title="Delivery Register"
            description="Open a delivery detail page for safe metadata edits and explicit status transitions."
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left">
                    {["Reference", "Subscription", "Customer", "Status", "Schedule", "Delivered", "Receiver", "Actions"].map((label) => (
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
                    <tr key={row.id} className="align-top">
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{row.delivery_reference}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Created {formatDateTime(row.created_at)}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {row.subscription_number || `SUB-${row.subscription_id ?? "—"}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.product_name || "Unknown product"}
                          {row.batch_code ? ` · ${row.batch_code}` : ""}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{row.customer_name || "—"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.customer_phone || "—"}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(
                            row.status
                          )}`}
                        >
                          {row.status}
                        </span>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Fulfillment {row.fulfillment_status || "PENDING"}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        {formatDate(row.scheduled_date)}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        {formatDateTime(row.delivered_at)}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{row.receiver_name || "—"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.receiver_phone || "—"}
                        </div>
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <Link
                          href={`/admin/deliveries/${row.id}${queryString ? `?${queryString}` : ""}`}
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
          </SectionCard>
        ) : null}
      </div>
    </PortalPage>
  );
}
