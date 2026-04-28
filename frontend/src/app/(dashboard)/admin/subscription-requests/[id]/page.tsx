"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import SubscriptionRequestCard from "@/domains/subscription-requests/components/SubscriptionRequestCard";
import {
  approveAdminSubscriptionRequest,
  getSubscriptionRequest,
  getSubscriptionRequestOptions,
  rejectAdminSubscriptionRequest,
  type SubscriptionRequestCustomerOption,
  type SubscriptionRequestOptions,
  type SubscriptionRequestRecord,
} from "@/services/subscription-requests";

type ResolutionMode = "existing" | "create";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
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

function text(value?: string | null, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-900">{value}</div>
    </div>
  );
}

export default function AdminSubscriptionRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const [request, setRequest] = useState<SubscriptionRequestRecord | null>(null);
  const [options, setOptions] = useState<SubscriptionRequestOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [luckyOverride, setLuckyOverride] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await getSubscriptionRequest("admin", requestId);
      setRequest(payload);
      setReviewNote(payload.review_note || "");
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  const loadOptions = useCallback(
    async (payloadRequest: SubscriptionRequestRecord, query = customerQuery) => {
      const payload = await getSubscriptionRequestOptions("admin", {
        batchId: payloadRequest.batch_id || undefined,
        customerQ: query || undefined,
      });
      setOptions(payload);
    },
    [customerQuery]
  );

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    if (!request || request.status !== "SUBMITTED") return;
    void loadOptions(request);
  }, [loadOptions, request]);

  const selectedCustomer = useMemo<SubscriptionRequestCustomerOption | null>(
    () =>
      options?.customers?.find((item) => String(item.id) === selectedCustomerId) ??
      null,
    [options, selectedCustomerId]
  );

  async function handleCustomerSearch() {
    if (!request) return;
    try {
      await loadOptions(request, customerQuery);
      setActionError(null);
    } catch (err) {
      setActionError(toErrorMessage(err));
    }
  }

  async function handleApprove() {
    if (!request) return;
    setActionLoading(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await approveAdminSubscriptionRequest(request.id, {
        review_note: reviewNote.trim() || undefined,
        customer_id:
          !request.customer_id && resolutionMode === "existing" && selectedCustomerId
            ? Number(selectedCustomerId)
            : undefined,
        create_customer:
          !request.customer_id && resolutionMode === "create" ? true : undefined,
        lucky_number_override: luckyOverride ? Number(luckyOverride) : undefined,
      });
      if (response.result) {
        setRequest(response.result);
      }
      setSuccessMessage(response.detail || "Subscription request approved.");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!request) return;
    setActionLoading(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const response = await rejectAdminSubscriptionRequest(request.id, {
        reason: rejectReason.trim() || reviewNote.trim() || undefined,
      });
      if (response.result) {
        setRequest(response.result);
      }
      setSuccessMessage(response.detail || "Subscription request rejected.");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <PortalPage
      title={request ? `Request #${request.id}` : "Subscription Request Review"}
      subtitle="Approve or reject customer and partner subscription intake without bypassing the canonical EMI subscription creation path."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Subscription Requests", href: "/admin/subscription-requests" },
        { label: request ? `Request #${request.id}` : "Detail" },
      ]}
      actions={[
        {
          href: "/admin/subscription-requests",
          label: "Back to Queue",
          variant: "secondary",
        },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Direct Create",
          variant: "ghost",
        },
      ]}
      statusBadge={{
        label: request?.status || "Loading",
        tone:
          request?.status === "APPROVED"
            ? "success"
            : request?.status === "REJECTED"
              ? "danger"
              : request?.status === "CANCELLED"
                ? "warning"
                : "info",
      }}
      stats={[
        { label: "Requester Role", value: request?.requester_role_snapshot || "—" },
        { label: "Requester", value: request?.requester_username || "—" },
        { label: "Lucky Number", value: request?.preferred_lucky_number ?? "—" },
        { label: "Approved Subscription", value: request?.approved_subscription_number || "—" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading subscription request review..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscription request"
            description={error}
            onRetry={() => void loadRequest()}
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? (
              <ErrorState title="Action failed" description={actionError} />
            ) : null}

            {successMessage ? (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-sm">
                <p className="font-semibold">{successMessage}</p>
              </section>
            ) : null}

            <SubscriptionRequestCard request={request} showRequester />

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                  Audit and review context
                </h2>
                <p className="text-sm text-muted-foreground">
                  Approval must either link an existing customer or create one from the captured request snapshot. Lucky-number overrides remain explicit and auditable.
                </p>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Submitted At" value={formatDateTime(request.created_at)} />
                <DetailItem label="Updated At" value={formatDateTime(request.updated_at)} />
                <DetailItem label="Reviewed By" value={text(request.reviewed_by_username)} />
                <DetailItem label="Reviewed At" value={formatDateTime(request.reviewed_at)} />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Review note
                </div>
                <div className="mt-2 text-sm text-slate-900">
                  {text(request.review_note, "No review note recorded yet.")}
                </div>
              </div>

              {request.approved_subscription_id ? (
                <div className="mt-4">
                  <Link
                    href={`/admin/subscriptions/${request.approved_subscription_id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Open Approved Subscription
                  </Link>
                </div>
              ) : null}
            </section>

            {request.status === "SUBMITTED" ? (
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    Review action
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    This action is the only point where a real subscription may be created. No EMI rows, lucky assignment, or payments exist before approval.
                  </p>
                </div>

                {!request.customer_id ? (
                  <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setResolutionMode("existing")}
                        className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
                          resolutionMode === "existing"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        Link Existing Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolutionMode("create")}
                        className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition ${
                          resolutionMode === "create"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        Create Customer From Snapshot
                      </button>
                    </div>

                    {resolutionMode === "existing" ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                          <label className="space-y-2 text-sm text-foreground">
                            <span className="font-medium">Search customers</span>
                            <input
                              value={customerQuery}
                              onChange={(event) => setCustomerQuery(event.target.value)}
                              placeholder="Search by customer name, phone, email, or username"
                              className="h-11 w-full rounded-xl border border-border bg-background px-3"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleCustomerSearch()}
                            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Search
                          </button>
                        </div>

                        <label className="block space-y-2 text-sm text-foreground">
                          <span className="font-medium">Customer</span>
                          <select
                            value={selectedCustomerId}
                            onChange={(event) => setSelectedCustomerId(event.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-background px-3"
                          >
                            <option value="">Select customer</option>
                            {(options?.customers ?? []).map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.name} · {customer.phone}
                                {customer.email ? ` · ${customer.email}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-700">
                          Selected customer:{" "}
                          <span className="font-medium text-slate-900">
                            {selectedCustomer?.name || "No customer selected"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-700">
                        Approving with create mode will create a new customer account using the request snapshot:{" "}
                        <span className="font-medium text-slate-900">
                          {text(request.requested_customer_name)}
                        </span>
                        , {text(request.requested_customer_phone)},{" "}
                        {text(request.requested_customer_email)}.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4 text-sm text-slate-700">
                    This request already links customer #{request.customer_id}. Approval will use that existing customer.
                  </div>
                )}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Lucky number override</span>
                    <select
                      value={luckyOverride}
                      onChange={(event) => setLuckyOverride(event.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3"
                    >
                      <option value="">Use preferred lucky number</option>
                      {(options?.lucky_numbers ?? []).map((value) => (
                        <option key={value} value={value}>
                          #{String(value).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Review note</span>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3"
                    />
                  </label>

                  <label className="space-y-2 text-sm text-foreground md:col-span-2">
                    <span className="font-medium">Reject reason</span>
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-3 py-3"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={actionLoading}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-foreground bg-foreground px-5 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading ? "Processing..." : "Approve Request"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReject()}
                    disabled={actionLoading}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-red-300 bg-red-50 px-5 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading ? "Processing..." : "Reject Request"}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
