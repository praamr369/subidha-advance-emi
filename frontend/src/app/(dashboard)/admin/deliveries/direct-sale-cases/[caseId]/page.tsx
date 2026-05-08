"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch } from "@/lib/api";
import {
  addDirectSaleDeliveryCaseNote,
  cancelDirectSaleDeliveryCase,
  dispatchDirectSaleDeliveryCase,
  getAdminDirectSaleDeliveryCase,
  markDirectSaleDeliveryCaseDelivered,
  scheduleDirectSaleDeliveryCase,
  updateDirectSaleDeliveryCaseMetadata,
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
    case "FAILED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    case "OUT_FOR_DELIVERY":
    case "DISPATCHED":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function actionLabel(key: string): string {
  if (key === "SCHEDULE") return "Assign Delivery / Reschedule Delivery";
  if (key === "DISPATCH") return "Create Delivery Action";
  if (key === "MARK_DELIVERED") return "Mark Delivered";
  if (key === "CANCEL") return "Cancel Delivery";
  if (key === "ADD_NOTE") return "Add Note";
  return key;
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminDirectSaleDeliveryDetailPage() {
  const params = useParams<{ caseId: string }>();
  const searchParams = useSearchParams();
  const caseId = params?.caseId;

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
  const [failureReason, setFailureReason] = useState("");
  const [operationalNotes, setOperationalNotes] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const backHref = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/admin/deliveries?${qs}` : "/admin/deliveries";
  }, [searchParams]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!caseId) {
        setError("Direct-sale case id is missing.");
        setLoading(false);
        return;
      }
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [payload, auditPayload] = await Promise.all([
          getAdminDirectSaleDeliveryCase(caseId),
          apiFetch<{ results?: AuditEntry[] }>(
            `/admin/audit-logs/timeline/ServiceDeskCase/${caseId}/`
          ),
        ]);
        setDelivery(payload);
        setTimeline(auditPayload.results || []);
        setScheduledDate(payload.scheduled_date || "");
        setReceiverName(payload.receiver_name || "");
        setReceiverPhone(payload.receiver_phone || "");
        setAddress(payload.delivery_address_snapshot || "");
        setFailureReason(payload.failure_or_cancellation_reason || "");
        setOperationalNotes(payload.operational_notes || payload.notes || "");
        setError(null);
      } catch (err) {
        setDelivery(null);
        setTimeline([]);
        setError(toErrorMessage(err, "Failed to load direct-sale delivery detail."));
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [caseId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  async function handleSaveMetadata() {
    if (!caseId) return;
    if (isHistoryOnly) {
      setError("This direct-sale delivery is history-only. Active delivery edits are disabled.");
      return;
    }
    try {
      setActionLoading("metadata");
      setMessage(null);
      const updated = await updateDirectSaleDeliveryCaseMetadata(caseId, {
        scheduled_date: scheduledDate || null,
        receiver_name: receiverName,
        receiver_phone: receiverPhone,
        delivery_address_snapshot: address,
        failure_or_cancellation_reason: failureReason,
        operational_notes: operationalNotes,
      });
      setDelivery(updated);
      setMessage("Delivery metadata saved.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err, "Failed to save metadata."));
    } finally {
      setActionLoading(null);
    }
  }

  async function runAction(action: "SCHEDULE" | "DISPATCH" | "MARK_DELIVERED" | "CANCEL" | "ADD_NOTE") {
    if (!caseId || !delivery) return;
    if (isHistoryOnly) {
      setError("This direct-sale delivery is history-only. Active delivery actions are disabled.");
      return;
    }
    try {
      setActionLoading(action);
      setMessage(null);

      let updated: DeliveryRecord;
      if (action === "SCHEDULE") {
        updated = await scheduleDirectSaleDeliveryCase(caseId, {
          scheduled_date: scheduledDate || null,
          receiver_name: receiverName,
          receiver_phone: receiverPhone,
          delivery_address_snapshot: address,
          notes: operationalNotes,
        });
      } else if (action === "DISPATCH") {
        updated = await dispatchDirectSaleDeliveryCase(caseId, {
          notes: operationalNotes,
        });
      } else if (action === "MARK_DELIVERED") {
        if (!window.confirm("Confirm mark delivered?")) return;
        updated = await markDirectSaleDeliveryCaseDelivered(caseId, {
          receiver_name: receiverName || delivery.customer_name || "",
          receiver_phone: receiverPhone || delivery.customer_phone || undefined,
          delivery_note: operationalNotes || "Delivered to receiver.",
        });
      } else if (action === "CANCEL") {
        if (!failureReason.trim()) {
          setError("Cancellation reason is required.");
          return;
        }
        updated = await cancelDirectSaleDeliveryCase(caseId, {
          reason: failureReason.trim(),
          notes: operationalNotes || undefined,
        });
      } else {
        if (!noteDraft.trim()) {
          setError("Note is required.");
          return;
        }
        updated = await addDirectSaleDeliveryCaseNote(caseId, { note: noteDraft.trim() });
        setNoteDraft("");
      }

      setDelivery(updated);
      setMessage(`${actionLabel(action)} completed.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err, `${actionLabel(action)} failed.`));
    } finally {
      setActionLoading(null);
    }
  }

  const blockingReasons = delivery?.blocking_reasons || [];
  const nextActions = delivery?.next_actions || [];
  const historyOnlyStatusSet = useMemo(
    () =>
      new Set([
        "REVERSED_POST_INVOICE",
        "RETURNED",
        "ARCHIVED",
        "CANCELLED_AFTER_DELIVERY",
        "CANCELLED_PRE_INVOICE",
      ]),
    []
  );
  const stockReturnPosted = String(delivery?.stock_return_status || "").toUpperCase().includes("SALE_RETURN_IN");
  const isHistoryOnly = Boolean(
    (delivery?.history_only || delivery?.source_reversed) &&
      historyOnlyStatusSet.has(String(delivery?.source_status || "").toUpperCase()) &&
      (delivery?.source_archived || delivery?.source_reversed) &&
      (delivery?.return_pickup_completed || stockReturnPosted)
  );

  const actionDisabledReason = isHistoryOnly
    ? "History-only: the source sale has been reversed/returned and archived from active delivery operations."
    : blockingReasons.length
      ? blockingReasons.join(" ")
      : "";

  const showSchedule = !isHistoryOnly && (nextActions.includes("SCHEDULE_DELIVERY") || delivery?.status === "PENDING");
  const showDispatch =
    !isHistoryOnly &&
    (delivery?.status === "SCHEDULED" || delivery?.status === "PENDING" || nextActions.includes("SCHEDULE_DELIVERY"));
  const showMarkDelivered =
    !isHistoryOnly &&
    (nextActions.includes("MARK_DELIVERED") || delivery?.status === "OUT_FOR_DELIVERY" || delivery?.status === "SCHEDULED");
  const showCancel = !isHistoryOnly && delivery?.status !== "DELIVERED" && delivery?.status !== "CANCELLED";

  return (
    <PortalPage
      title={delivery?.sale_number || delivery?.sale_no || "Direct-Sale Delivery"}
      subtitle="Operational delivery workspace for direct-sale service cases."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Deliveries", href: "/admin/deliveries" },
        { label: delivery?.sale_number || "Direct-sale case" },
      ]}
      actions={[
        { href: backHref, label: "Back to Deliveries", variant: "secondary" },
        ...(delivery?.links?.open_direct_sale
          ? [{ href: delivery.links.open_direct_sale, label: "Open Direct Sale", variant: "secondary" as const }]
          : []),
        ...(delivery?.links?.open_invoice
          ? [{ href: delivery.links.open_invoice, label: "Open Invoice", variant: "secondary" as const }]
          : []),
        ...(delivery?.direct_sale_id
          ? [
              {
                href: `/admin/billing/reversals?direct_sale=${delivery.direct_sale_id}`,
                label: "View Reversal",
                variant: "secondary" as const,
              },
              {
                href: `/admin/inventory/ledger?direct_sale=${delivery.direct_sale_id}`,
                label: "View Stock Ledger",
                variant: "secondary" as const,
              },
              {
                href: `/admin/billing/documents?direct_sale=${delivery.direct_sale_id}`,
                label: "View Documents",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Status", value: delivery?.status || "—" },
        { label: "Payment", value: delivery?.payment_state || "—" },
        { label: "Invoice", value: delivery?.invoice_state || "—" },
        { label: "Stock", value: delivery?.stock_state || "—" },
      ]}
      statusBadge={{
        label: delivery?.status_label || delivery?.status || "Direct Sale Delivery",
        tone:
          delivery?.status === "DELIVERED"
            ? "success"
            : delivery?.status === "FAILED" || delivery?.status === "CANCELLED"
            ? "danger"
            : "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading direct-sale delivery detail..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load direct-sale delivery detail"
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
          <EmptyState title="Direct-sale delivery not found" description="No case detail was returned for this route." />
        ) : null}

        {!loading && !error && delivery ? (
          <>
            <SectionCard
              title="Source Summary"
              description="Direct-sale, invoice, and customer source facts for delivery operations."
            >
              {delivery.source_reversed ? (
                <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  <div className="font-semibold">Source reversed</div>
                  <div className="mt-1 text-violet-900/80">
                    Original delivery is preserved for history. The source sale has been reversed.
                  </div>
                  {stockReturnPosted || delivery.return_pickup_completed ? (
                    <div className="mt-1 text-violet-900/80">Product return is already posted to stock.</div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-800">
                      {delivery.source_status || "HISTORY"}
                    </span>
                    {delivery.return_pickup_required ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                        Return pickup required
                      </span>
                    ) : null}
                    {delivery.return_pickup_completed ? (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                        Returned to stock
                      </span>
                    ) : null}
                    {delivery.history_only ? (
                      <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground">
                        History only
                      </span>
                    ) : null}
                    {isHistoryOnly ? (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                        No action required
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {delivery.direct_sale_id ? (
                      <Link
                        href={`/admin/billing/reversals?direct_sale=${delivery.direct_sale_id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        View Reversal Case
                      </Link>
                    ) : null}
                    {delivery.direct_sale_id ? (
                      <Link
                        href={`/admin/inventory/ledger?direct_sale=${delivery.direct_sale_id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        View Stock Ledger
                      </Link>
                    ) : null}
                    {delivery.direct_sale_id ? (
                      <Link
                        href={`/admin/billing/documents?direct_sale=${delivery.direct_sale_id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        View Documents
                      </Link>
                    ) : null}
                    {delivery.direct_sale_id ? (
                      <Link
                        href={`/admin/billing/direct-sale?highlight_sale=${delivery.direct_sale_id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        View Direct Sale
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-600">Sale</div>
                  <div className="mt-1 font-medium">{delivery.sale_number || delivery.sale_no || "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-600">Invoice</div>
                  <div className="mt-1 font-medium">{delivery.invoice_number || delivery.invoice_document_no || "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-600">Customer</div>
                  <div className="mt-1 font-medium">{delivery.customer_name || "—"}</div>
                  <div className="text-xs text-slate-600">{delivery.customer_phone || "—"}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-600">Status</div>
                  <div className="mt-1">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(delivery.status)}`}>
                      {delivery.status_label || delivery.status}
                    </span>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Readiness"
              description="Payment, invoice, stock, and delivery gates from backend operational state."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">Payment: {delivery.payment_state || "—"}</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">Invoice: {delivery.invoice_state || "—"}</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">Stock: {delivery.stock_state || "—"}</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">Delivery: {delivery.delivery_state || "—"}</div>
              </div>
              {blockingReasons.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {blockingReasons.join(" | ")}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Metadata"
              description="Operational metadata for scheduled date, receiver, address, reason, and notes."
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  disabled={isHistoryOnly}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <input
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  placeholder="Receiver name"
                  disabled={isHistoryOnly}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <input
                  value={receiverPhone}
                  onChange={(event) => setReceiverPhone(event.target.value)}
                  placeholder="Receiver phone"
                  disabled={isHistoryOnly}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <input
                  value={failureReason}
                  onChange={(event) => setFailureReason(event.target.value)}
                  placeholder="Failure/cancellation reason"
                  disabled={isHistoryOnly}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <textarea
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Delivery address snapshot"
                  disabled={isHistoryOnly}
                  className="min-h-[96px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-2"
                />
                <textarea
                  value={operationalNotes}
                  onChange={(event) => setOperationalNotes(event.target.value)}
                  placeholder="Operational notes"
                  disabled={isHistoryOnly}
                  className="min-h-[96px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 lg:col-span-2"
                />
                <div className="lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveMetadata()}
                    disabled={isHistoryOnly || actionLoading === "metadata"}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isHistoryOnly ? "History only" : actionLoading === "metadata" ? "Saving..." : "Save Metadata"}
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Transition Actions"
              description="Only operationally valid actions are shown; blocked actions stay disabled with reasons."
            >
              {isHistoryOnly ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <div className="font-semibold">No action required</div>
                  <div className="mt-1">
                    This is a history-only delivery record. Active actions such as assign/reschedule, delivery processing, and
                    mutation workflows are disabled.
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {showSchedule ? (
                  <button
                    type="button"
                    onClick={() => void runAction("SCHEDULE")}
                    disabled={Boolean(actionDisabledReason) || actionLoading === "SCHEDULE"}
                    title={actionDisabledReason || "Schedule this delivery"}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "SCHEDULE" ? "Working..." : "Assign / Reschedule Delivery"}
                  </button>
                ) : null}
                {showDispatch ? (
                  <button
                    type="button"
                    onClick={() => void runAction("DISPATCH")}
                    disabled={Boolean(actionDisabledReason) || actionLoading === "DISPATCH"}
                    title={actionDisabledReason || "Dispatch this delivery"}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "DISPATCH" ? "Working..." : "Create Delivery Action"}
                  </button>
                ) : null}
                {showMarkDelivered ? (
                  <button
                    type="button"
                    onClick={() => void runAction("MARK_DELIVERED")}
                    disabled={Boolean(actionDisabledReason) || actionLoading === "MARK_DELIVERED"}
                    title={actionDisabledReason || "Mark this delivery as delivered"}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "MARK_DELIVERED" ? "Working..." : "Mark Delivered"}
                  </button>
                ) : null}
                {showCancel ? (
                  <button
                    type="button"
                    onClick={() => void runAction("CANCEL")}
                    disabled={actionLoading === "CANCEL"}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "CANCEL" ? "Working..." : "Cancel Delivery"}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Add operation note"
                  disabled={isHistoryOnly}
                  className="h-10 min-w-[260px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void runAction("ADD_NOTE")}
                  disabled={isHistoryOnly || actionLoading === "ADD_NOTE"}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading === "ADD_NOTE" ? "Working..." : "Create Delivery Action Note"}
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Links & Documents" description="Operational links for billing, customer, and service case review.">
              <div className="flex flex-wrap gap-3 text-sm">
                {delivery.links?.open_invoice ? <Link href={delivery.links.open_invoice} className="text-primary underline-offset-4 hover:underline">Open Invoice</Link> : null}
                {delivery.links?.open_direct_sale ? <Link href={delivery.links.open_direct_sale} className="text-primary underline-offset-4 hover:underline">Open Direct Sale</Link> : null}
                {delivery.links?.open_customer ? <Link href={delivery.links.open_customer} className="text-primary underline-offset-4 hover:underline">Open Customer</Link> : null}
                {delivery.links?.open_service_case ? <Link href={delivery.links.open_service_case} className="text-primary underline-offset-4 hover:underline">Open Service Case</Link> : null}
              </div>
            </SectionCard>

            <SectionCard title="Recent Audit Activity" description="Timeline entries from audit logs for this direct-sale delivery case.">
              {timeline.length === 0 ? (
                <EmptyState title="No audit entries yet" description="No direct-sale delivery audit events are recorded for this case yet." />
              ) : (
                <div className="space-y-3">
                  {timeline.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase text-slate-600">{entry.action_type}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        {formatDateTime(entry.created_at)} · {entry.performed_by_username || "System"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
