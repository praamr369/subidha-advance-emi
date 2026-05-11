"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import PortalPage from "@/components/ui/PortalPage";
import { OperationsWorkspaceShell } from "@/components/layout/page-shells";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingRegisterRoute,
  buildAdminReconciliationRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  createAdminDelivery,
  getAdminDeliverySourceDirectSalePrefill,
  getAdminDeliverySourceSubscriptionPrefill,
  listAdminDeliveries,
  listAdminDeliverySourceDirectSales,
  listAdminDeliverySourceSubscriptions,
  markDirectSaleDeliveryCaseDelivered,
  type DeliveryBucket,
  type DeliveryListResponse,
  type DeliveryRecord,
  type DeliverySourceDirectSale,
  type DeliveryStatus,
  type DeliverySourceSubscription,
  type SubscriptionPlanType,
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
    // Phase 2: blocked delivery styling — prominent orange-red for visibility
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
  const initialPortfolio = (searchParams.get("portfolio") || "").trim().toUpperCase();
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
  const [createPortfolio, setCreatePortfolio] = useState<
    "ADVANCE_EMI" | "RENT" | "LEASE" | "DIRECT_SALE"
  >(
    initialPortfolio === "RENT" || initialPortfolio === "LEASE" || initialPortfolio === "DIRECT_SALE"
      ? (initialPortfolio as "RENT" | "LEASE" | "DIRECT_SALE")
      : "ADVANCE_EMI"
  );
  const [createStatus, setCreateStatus] = useState<"PENDING" | "SCHEDULED">("PENDING");
  const [createScheduledDate, setCreateScheduledDate] = useState("");
  const [createReceiverName, setCreateReceiverName] = useState("");
  const [createReceiverPhone, setCreateReceiverPhone] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [actingCaseId, setActingCaseId] = useState<number | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceResults, setSourceResults] = useState<DeliverySourceSubscription[]>([]);
  const [selectedSource, setSelectedSource] = useState<DeliverySourceSubscription | null>(null);
  const [sourcePrefillLoading, setSourcePrefillLoading] = useState(false);

  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const [dsSourceQuery, setDsSourceQuery] = useState("");
  const [dsSourceLoading, setDsSourceLoading] = useState(false);
  const [dsSourceError, setDsSourceError] = useState<string | null>(null);
  const [dsSourceResults, setDsSourceResults] = useState<DeliverySourceDirectSale[]>([]);
  const [selectedDsSource, setSelectedDsSource] = useState<DeliverySourceDirectSale | null>(null);
  const [dsPrefillLoading, setDsPrefillLoading] = useState(false);

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
    setCreatePortfolio(
      initialPortfolio === "RENT" || initialPortfolio === "LEASE" || initialPortfolio === "DIRECT_SALE"
        ? (initialPortfolio as "RENT" | "LEASE" | "DIRECT_SALE")
        : "ADVANCE_EMI"
    );
  }, [
    initialBatch,
    initialBucket,
    initialCustomer,
    initialDateFrom,
    initialDateTo,
    initialQ,
    initialStatus,
    initialSubscription,
    initialPortfolio,
  ]);

  function portfolioToPlanType(
    portfolio: "ADVANCE_EMI" | "RENT" | "LEASE" | "DIRECT_SALE"
  ): SubscriptionPlanType | null {
    if (portfolio === "DIRECT_SALE") return null;
    if (portfolio === "ADVANCE_EMI") return "EMI";
    return portfolio;
  }

  const createPlanType = portfolioToPlanType(createPortfolio);

  const activeSelectedDelivery = selectedSource?.delivery_summary?.is_active_delivery
    ? selectedSource.delivery_summary
    : null;

  async function runDsSourceSearch(input: string) {
    const trimmed = input.trim();
    if (!trimmed) {
      setDsSourceResults([]);
      setDsSourceError(null);
      return;
    }

    try {
      setDsSourceLoading(true);
      setDsSourceError(null);
      const payload = await listAdminDeliverySourceDirectSales({ q: trimmed, limit: 20 });
      setDsSourceResults(payload.results);
    } catch (err) {
      setDsSourceResults([]);
      setDsSourceError(toErrorMessage(err, "Unable to search direct sales for delivery tracking."));
    } finally {
      setDsSourceLoading(false);
    }
  }

  async function runSourceSearch(input: string) {
    const trimmed = input.trim();
    if (!trimmed) {
      setSourceResults([]);
      setSourceError(null);
      return;
    }

    try {
      setSourceLoading(true);
      setSourceError(null);
      const payload = await listAdminDeliverySourceSubscriptions({
        q: trimmed,
        plan_type: createPlanType || undefined,
        limit: 20,
      });
      setSourceResults(payload.results);
    } catch (err) {
      setSourceResults([]);
      setSourceError(toErrorMessage(err, "Unable to search subscriptions for delivery creation."));
    } finally {
      setSourceLoading(false);
    }
  }

  const prefillFromSubscriptionId = useCallback(async (subscriptionId: number | string) => {
    const raw = String(subscriptionId).trim();
    if (!raw) return;

    try {
      setSourcePrefillLoading(true);
      setSourceError(null);
      const payload = await getAdminDeliverySourceSubscriptionPrefill(raw);
      setSelectedSource(payload.source);
      setCreateSubscriptionId(String(payload.source.id));
      setCreateReceiverName(payload.defaults.receiver_name || "");
      setCreateReceiverPhone(payload.defaults.receiver_phone || "");
      setCreateAddress(payload.defaults.delivery_address_snapshot || "");
      setCreateNotes(payload.defaults.notes || "");
    } catch (err) {
      setSelectedSource(null);
      setSourceError(toErrorMessage(err, "Unable to load subscription delivery prefill."));
    } finally {
      setSourcePrefillLoading(false);
    }
  }, []);

  const prefillFromDirectSaleId = useCallback(async (saleId: number | string) => {
    const raw = String(saleId).trim();
    if (!raw) return;

    try {
      setDsPrefillLoading(true);
      setDsSourceError(null);
      const payload = await getAdminDeliverySourceDirectSalePrefill(raw);
      setSelectedDsSource(payload.source);
      setCreateReceiverName(payload.defaults.receiver_name || "");
      setCreateReceiverPhone(payload.defaults.receiver_phone || "");
      setCreateAddress(payload.defaults.delivery_address_snapshot || "");
      setCreateNotes(payload.defaults.notes || "");
    } catch (err) {
      setSelectedDsSource(null);
      setDsSourceError(toErrorMessage(err, "Unable to load direct-sale delivery preview."));
    } finally {
      setDsPrefillLoading(false);
    }
  }, []);

  useEffect(() => {
    if ((searchParams.get("mode") || "").trim().toLowerCase() !== "create") return;
    requestAnimationFrame(() => {
      createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [searchParams]);

  useEffect(() => {
    if (!initialSubscription.trim()) return;
    if (createPortfolio === "DIRECT_SALE") return;
    void prefillFromSubscriptionId(initialSubscription.trim());
  }, [createPortfolio, initialSubscription, prefillFromSubscriptionId]);

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
    if (createPortfolio === "DIRECT_SALE") {
      if (!selectedDsSource?.id) {
        setError("Select a direct sale source before syncing delivery desk tracking.");
        return;
      }

      try {
        setCreating(true);
        setMessage(null);
        setError(null);

        const created = await createAdminDelivery({ direct_sale: selectedDsSource.id });
        const deskId = created.service_case_id ?? created.id;
        setMessage(
          `Direct-sale delivery desk row synced (${created.case_no?.trim() ? created.case_no : `CASE-${deskId}`}).`
        );
        setCreateNotes("");
        await loadPage("refresh");
        router.push(`/admin/deliveries/direct-sale-cases/${deskId}${queryString ? `?${queryString}` : ""}`);
      } catch (err) {
        setError(toErrorMessage(err, "Failed to sync direct-sale delivery desk row."));
      } finally {
        setCreating(false);
      }
      return;
    }
    if (!createSubscriptionId.trim()) {
      setError("Subscription id is required to create a delivery.");
      return;
    }
    if (activeSelectedDelivery) {
      setError(
        `An active delivery already exists for this subscription (${activeSelectedDelivery.delivery_reference}). Complete or cancel the active delivery before creating a new one.`
      );
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
        { label: "Fulfillment", href: ROUTES.admin.deliveries },
        { label: "Deliveries" },
      ]}
      actions={[
        {
          href: ROUTES.admin.subscriptions,
          label: "Subscription Register",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.collections,
          label: "Collections Workspace",
          variant: "secondary",
        },
        {
          href: buildAdminReconciliationRoute({ flagged: true }),
          label: "Flagged Reconciliation",
          variant: "ghost",
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
      <OperationsWorkspaceShell>
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
              placeholder="Search reference, customer, phone, sale no., invoice no."
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
              <option value="BLOCKED_STOCK_UNAVAILABLE">Blocked – Stock Unavailable</option>
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
              <option value="READY_DISPATCH">Ready for dispatch</option>
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

        <div ref={createSectionRef} className="scroll-mt-28">
        <SectionCard
          title="Create Delivery"
          description="Subscribe Advance EMI / Rent / Lease deliveries on SubscriptionDelivery, or sync retail desk tracking for direct-sale deliveries that already require fulfillment."
        >
          <form className="grid gap-4" onSubmit={handleCreateDelivery}>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Portfolio
                </span>
                <select
                  value={createPortfolio}
                  onChange={(event) => {
                    const next = event.target.value as typeof createPortfolio;
                    setCreatePortfolio(next);
                    setSelectedSource(null);
                    setSourceResults([]);
                    setSourceQuery("");
                    setSourceError(null);
                    setSelectedDsSource(null);
                    setDsSourceResults([]);
                    setDsSourceQuery("");
                    setDsSourceError(null);
                    setCreateSubscriptionId("");
                    setCreateReceiverName("");
                    setCreateReceiverPhone("");
                    setCreateAddress("");
                    setCreateNotes("");
                  }}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="ADVANCE_EMI">Advance EMI</option>
                  <option value="RENT">Rent</option>
                  <option value="LEASE">Lease</option>
                  <option value="DIRECT_SALE">Direct Sale</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Start status
                </span>
                <select
                  value={createStatus}
                  onChange={(event) => setCreateStatus(event.target.value as "PENDING" | "SCHEDULED")}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  disabled={createPortfolio === "DIRECT_SALE"}
                >
                  <option value="PENDING">Pending</option>
                  <option value="SCHEDULED">Scheduled</option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Scheduled date
                </span>
                <input
                  type="date"
                  value={createScheduledDate}
                  onChange={(event) => setCreateScheduledDate(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  disabled={createPortfolio === "DIRECT_SALE" || createStatus !== "SCHEDULED"}
                />
              </label>
            </div>

            {createPortfolio === "DIRECT_SALE" ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">Search direct-sale sources</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Finds delivery-required retail sales by sale number, invoice document no., customer phone/name, or id.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={dsSourceQuery}
                      onChange={(event) => setDsSourceQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void runDsSourceSearch(dsSourceQuery);
                        }
                      }}
                      placeholder="Search direct sales"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void runDsSourceSearch(dsSourceQuery)}
                      disabled={dsSourceLoading}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {dsSourceLoading ? "Searching..." : "Search"}
                    </button>
                  </div>
                  {dsSourceError ? (
                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {dsSourceError}
                    </div>
                  ) : null}
                  {dsSourceResults.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {dsSourceResults.map((item) => {
                        const preview = item.delivery_preview;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => void prefillFromDirectSaleId(item.id)}
                            className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">
                                  {item.sale_no || `Sale ${item.id}`}
                                  <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Direct Sale
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.customer_name_snapshot || "Customer"} · {item.customer_phone_snapshot || "—"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Invoice {item.invoice_document_no?.trim() ? item.invoice_document_no : "pending"} · Balance{" "}
                                  {item.balance_total ?? "—"}
                                </div>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <div>{item.status}</div>
                                {preview ? (
                                  <div className={preview.phase_code === "READY_FOR_DELIVERY" ? "text-emerald-700" : ""}>
                                    {preview.phase_label}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Results appear after search.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">Preview & sync desk row</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Runs the bridge sync so Operations sees one consolidated DIRECT_SALE_DELIVERY case without duplicating rows.
                  </p>

                  {dsPrefillLoading ? (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Loading direct-sale preview…
                    </div>
                  ) : selectedDsSource ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-border bg-[var(--surface-muted)] p-4">
                        <div className="text-sm font-semibold text-foreground">
                          {selectedDsSource.sale_no || `Sale ${selectedDsSource.id}`}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Invoice{" "}
                          {selectedDsSource.invoice_document_no?.trim()
                            ? selectedDsSource.invoice_document_no
                            : "pending"}{" "}
                          ({selectedDsSource.invoice_status || "—"})
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedDsSource.customer_name_snapshot || "Customer"} ·{" "}
                          {selectedDsSource.customer_phone_snapshot || "—"}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Balance {selectedDsSource.balance_total ?? "—"} · Received {selectedDsSource.received_total ?? "—"}
                        </div>
                        {selectedDsSource.delivery_preview ? (
                          <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                            <div className="font-semibold text-foreground">
                              {selectedDsSource.delivery_preview.phase_label}
                            </div>
                            <div className="mt-1">
                              Payment {selectedDsSource.delivery_preview.payment_state || "—"} · Invoice gate{" "}
                              {selectedDsSource.delivery_preview.invoice_state || "—"}
                              {selectedDsSource.delivery_preview.stock_blocked ? " · Stock gate" : ""}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <textarea
                        value={createNotes}
                        onChange={(event) => setCreateNotes(event.target.value)}
                        placeholder="Operational notes for service desk agents"
                        className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={creating}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {creating ? "Syncing..." : "Sync delivery desk row"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDsSource(null);
                            setDsSourceResults([]);
                          }}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          Clear selection
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={ROUTES.admin.billingDirectSaleWorkspace}>
                          Direct Sale workspace
                        </Link>
                        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={ROUTES.admin.billingDirectSales}>
                          Sales register
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Pick a sale from the search results to preview readiness before syncing.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">Select subscription source</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Search by subscription id, customer phone/name, product, batch, or contract reference. Selecting a
                    subscription autofills receiver and address snapshots.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={sourceQuery}
                      onChange={(event) => setSourceQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void runSourceSearch(sourceQuery);
                        }
                      }}
                      placeholder="Search subscriptions for delivery"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void runSourceSearch(sourceQuery)}
                      disabled={sourceLoading}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sourceLoading ? "Searching..." : "Search"}
                    </button>
                  </div>

                  {sourceError ? (
                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {sourceError}
                    </div>
                  ) : null}

                  {sourceResults.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {sourceResults.map((item) => {
                        const summary = item.delivery_summary;
                        const hasActive = Boolean(summary?.is_active_delivery);
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => void prefillFromSubscriptionId(item.id)}
                            className="w-full rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 text-left transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">
                                  {item.subscription_number || `SUB-${item.id}`}
                                  <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    {item.plan_type === "EMI" ? "Advance EMI" : item.plan_type}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.customer_name || "Customer"} · {item.customer_phone || "—"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.product_name || "Product"} {item.batch_code ? `· ${item.batch_code}` : ""}
                                  {typeof item.lucky_number === "number" ? ` · Lucky ${String(item.lucky_number).padStart(2, "0")}` : ""}
                                </div>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <div>Fulfillment {item.fulfillment_status || "PENDING"}</div>
                                {summary ? (
                                  <div className={hasActive ? "text-amber-700" : ""}>
                                    Delivery {summary.status} · {summary.delivery_reference}
                                  </div>
                                ) : (
                                  <div>No delivery yet</div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Search results show up here.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">Source preview & autofill</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review the source and adjust receiver/address fields before creating the delivery record.
                  </p>

                  {sourcePrefillLoading ? (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Loading subscription prefill…
                    </div>
                  ) : selectedSource ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-border bg-[var(--surface-muted)] p-4">
                        <div className="text-sm font-semibold text-foreground">
                          {selectedSource.subscription_number || `SUB-${selectedSource.id}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedSource.plan_type === "EMI" ? "Advance EMI" : selectedSource.plan_type}
                          {selectedSource.contract_reference ? ` · Contract ${selectedSource.contract_reference}` : ""}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {selectedSource.customer_name || "Customer"} · {selectedSource.customer_phone || "—"}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {selectedSource.product_name || "Product"} {selectedSource.product_code ? `(${selectedSource.product_code})` : ""}
                        </div>
                        {activeSelectedDelivery ? (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            Active delivery exists: {activeSelectedDelivery.delivery_reference} ({activeSelectedDelivery.status}).{" "}
                            <Link
                              href={`/admin/deliveries/${activeSelectedDelivery.id}`}
                              className="font-semibold underline underline-offset-4"
                            >
                              Open delivery
                            </Link>
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
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
                      </div>
                      <textarea
                        value={createAddress}
                        onChange={(event) => setCreateAddress(event.target.value)}
                        placeholder="Delivery address snapshot"
                        className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                      <textarea
                        value={createNotes}
                        onChange={(event) => setCreateNotes(event.target.value)}
                        placeholder="Operational notes"
                        className="min-h-[96px] rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={creating || Boolean(activeSelectedDelivery)}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {creating ? "Creating..." : "Create delivery"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSource(null);
                            setCreateSubscriptionId("");
                          }}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          Clear selection
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Creating a delivery does not post payments or change EMI financial history. It only opens the controlled fulfillment workflow.
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-muted-foreground">
                      Select a subscription from the search results to see a preview and autofill defaults.
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </SectionCard>
        </div>

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No deliveries found"
            description="No subscription deliveries or active direct-sale delivery cases match the current filters. Direct-sale rows appear when delivery is required and a Service Desk delivery case is open."
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
                    {["Reference", "Source", "Customer", "Status", "Schedule", "Delivered", "Receiver", "Actions"].map((label) => (
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
                    <tr
                      key={`${row.record_kind ?? "SUBSCRIPTION_DELIVERY"}-${row.id}`}
                      className="align-top"
                    >
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{row.delivery_reference}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Created {formatDateTime(row.created_at)}
                        </div>
                        {row.record_kind === "DIRECT_SALE_CASE" || row.record_kind === "DIRECT_SALE_DELIVERY" ? (
                          <div className="mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                            Direct Sale
                          </div>
                        ) : null}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        {row.record_kind === "DIRECT_SALE_CASE" || row.record_kind === "DIRECT_SALE_DELIVERY" ? (
                          <>
                            <div className="font-medium text-foreground">
                              {row.sale_no || `Sale #${row.direct_sale_id ?? row.id}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.invoice_document_no ? `Invoice ${row.invoice_document_no}` : "Invoice pending"}
                              {row.product_name ? ` · ${row.product_name}` : ""}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-foreground">
                              {row.subscription_number || `SUB-${row.subscription_id ?? "—"}`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.product_name || "Unknown product"}
                              {row.batch_code ? ` · ${row.batch_code}` : ""}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="border-b border-border px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          <CustomerIntelligenceTrigger
                            customerId={row.customer_id}
                            customerName={row.customer_name || "—"}
                            scope="admin"
                          />
                        </div>
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
                        {row.source_reversed ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-800">
                              Source reversed
                            </span>
                            {row.return_pickup_required ? (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                Return pickup required
                              </span>
                            ) : null}
                            {row.return_pickup_completed ? (
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                                Return completed
                              </span>
                            ) : null}
                            {row.history_only ? (
                              <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground">
                                History only
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-muted-foreground">
                          {row.record_kind === "DIRECT_SALE_CASE"
                            ? row.delivery_display || row.delivery_phase_label || row.payment_state || "—"
                            : `Fulfillment ${row.fulfillment_status || "PENDING"}`}
                        </div>
                        {row.record_kind === "DIRECT_SALE_CASE" || row.record_kind === "DIRECT_SALE_DELIVERY" ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Payment {row.payment_state || "—"} · Invoice {row.invoice_state || "—"}
                          </div>
                        ) : null}
                        {row.record_kind !== "SUBSCRIPTION_DELIVERY" && row.service_desk_status ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Desk {row.service_desk_status}
                          </div>
                        ) : null}
                        {row.record_kind !== "SUBSCRIPTION_DELIVERY" &&
                        (row.payment_state !== "PAID" || row.invoice_state !== "POSTED" || row.stock_state === "STOCK_BLOCKED") ? (
                          <div className="mt-1 text-[11px] font-medium text-amber-700">
                            Blocked: {[
                              row.payment_state !== "PAID" ? "payment due" : null,
                              row.invoice_state !== "POSTED" ? "invoice pending" : null,
                              row.stock_state === "STOCK_BLOCKED" ? "stock outstanding" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
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
                        <div className="flex flex-col gap-2">
                          {row.record_kind !== "SUBSCRIPTION_DELIVERY" ? (
                            <>
                              {row.case_id || row.service_case_id ? (
                                <Link
                                  href={`/admin/deliveries/direct-sale-cases/${row.case_id || row.service_case_id}${
                                    queryString ? `?${queryString}` : ""
                                  }`}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  {row.source_reversed ? "View Delivery (History)" : "Manage Delivery"}
                                </Link>
                              ) : null}
                              {row.source_reversed ? (
                                <div className="text-xs text-muted-foreground">
                                  Original delivery is preserved for history. The source sale has been reversed.
                                </div>
                              ) : null}
                              {row.billing_invoice_id ? (
                                <Link
                                  href={buildAdminBillingDocumentRoute(row.billing_invoice_id)}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  Open Invoice
                                </Link>
                              ) : null}
                              <Link
                                href={
                                  row.direct_sale_id
                                    ? `${ROUTES.admin.billingDirectSaleWorkspace}?highlight_sale=${row.direct_sale_id}`
                                    : ROUTES.admin.billingDirectSaleWorkspace
                                }
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                Open Direct Sale
                              </Link>
                              {row.status === "SCHEDULED" &&
                              row.payment_state === "PAID" &&
                              row.invoice_state === "POSTED" &&
                              row.stock_state !== "STOCK_BLOCKED" &&
                              (row.case_id || row.service_case_id) ? (
                                <button
                                  type="button"
                                  disabled={actingCaseId === (row.case_id || row.service_case_id)}
                                  onClick={async () => {
                                    const caseId = row.case_id || row.service_case_id;
                                    if (!caseId) return;
                                    if (!window.confirm("Mark this direct-sale delivery as delivered?")) return;
                                    try {
                                      setActingCaseId(caseId);
                                      await markDirectSaleDeliveryCaseDelivered(caseId, {
                                        receiver_name: row.receiver_name || row.customer_name || "",
                                        receiver_phone: row.receiver_phone || row.customer_phone || undefined,
                                        delivery_note: "Delivered from delivery register quick action.",
                                      });
                                      await loadPage("refresh");
                                      setMessage("Direct-sale delivery marked delivered.");
                                    } catch (err) {
                                      setError(toErrorMessage(err, "Unable to mark delivery as delivered."));
                                    } finally {
                                      setActingCaseId(null);
                                    }
                                  }}
                                  className="text-emerald-700 underline-offset-4 hover:underline disabled:opacity-60"
                                >
                                  Mark Delivered
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <Link
                                href={`/admin/deliveries/${row.id}${queryString ? `?${queryString}` : ""}`}
                                className="text-primary underline-offset-4 hover:underline"
                              >
                                View Detail
                              </Link>
                              {row.subscription_id ? (
                                <Link
                                  href={buildAdminBillingRegisterRoute({
                                    subscription: row.subscription_id,
                                  })}
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  Billing Docs
                                </Link>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        ) : null}
      </OperationsWorkspaceShell>
    </PortalPage>
  );
}
