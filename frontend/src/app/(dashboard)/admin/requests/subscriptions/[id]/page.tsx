"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import FormActions from "@/components/ui/FormActions";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailPanel, FormSection, MobileSafeTable } from "@/components/ui/operations";
import SubscriptionRequestCard from "@/domains/subscription-requests/components/SubscriptionRequestCard";
import ApprovalConfirmDialog from "@/domains/product-requests/components/ApprovalConfirmDialog";
import { useRequestKeyboardShortcuts } from "@/hooks/useRequestKeyboardShortcuts";
import { RequestStatusBadge, RequestWorkflowCard, RequestActionHistory } from "@/domains/request-services/components";
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
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-sm text-foreground">{value}</div>
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
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

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

  // Keyboard shortcuts
  useRequestKeyboardShortcuts({
    "Ctrl+Enter": () => {
      if (request?.status === "SUBMITTED") {
        setShowApproveDialog(true);
      }
    },
    "D": () => {
      if (request?.status === "SUBMITTED") {
        setShowRejectDialog(true);
      }
    },
    "R": () => void loadRequest(),
    "Escape": () => {
      setShowApproveDialog(false);
      setShowRejectDialog(false);
      setActionError(null);
    },
  });

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
    <ERPPageShell
      eyebrow="Sales"
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
      {/* Desktop two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Content - Left Column (3/4 width) */}
        <div className="xl:col-span-3 space-y-6">
          {loading ? <ERPLoadingState label="Loading subscription request review..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load subscription request"
            description={error}
            onRetry={() => void loadRequest()}
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? <ERPErrorState title="Action failed" description={actionError} /> : null}

            {successMessage ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 shadow-sm">
                <p className="font-semibold">{successMessage}</p>
              </section>
            ) : null}

            <SubscriptionRequestCard request={request} showRequester />

            <DetailPanel
              title="Audit and review context"
              description="Approval must either link an existing customer or create one from the captured request snapshot. Lucky-number overrides remain explicit and auditable."
            >
              <MobileSafeTable className="border-none bg-transparent">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailItem label="Submitted At" value={formatDateTime(request.created_at)} />
                  <DetailItem label="Updated At" value={formatDateTime(request.updated_at)} />
                  <DetailItem label="Reviewed By" value={text(request.reviewed_by_username)} />
                  <DetailItem label="Reviewed At" value={formatDateTime(request.reviewed_at)} />
                </div>
              </MobileSafeTable>

              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Review note
                </div>
                <div className="mt-2 text-sm text-foreground">
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
            </DetailPanel>

            {request.status === "SUBMITTED" ? (
              <FormSection
                title="Review action"
                description="This action is the only point where a real subscription may be created. No EMI rows, lucky assignment, or payments exist before approval."
              >

                {!request.customer_id ? (
                  <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
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

                        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                          Selected customer:{" "}
                          <span className="font-medium text-foreground">
                            {selectedCustomer?.name || "No customer selected"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Approving with create mode will create a new customer account using the request snapshot:{" "}
                        <span className="font-medium text-foreground">
                          {text(request.requested_customer_name)}
                        </span>
                        , {text(request.requested_customer_phone)},{" "}
                        {text(request.requested_customer_email)}.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
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

                <RequestWorkflowCard
                  actions={[
                    {
                      id: "approve",
                      label: "Approve Request",
                      description: "Create subscription and approve this request",
                      color: "success" as const,
                      onClick: () => setShowApproveDialog(true),
                      disabled: actionLoading,
                    },
                    {
                      id: "reject",
                      label: "Reject Request",
                      description: "Decline this request",
                      color: "danger" as const,
                      onClick: () => setShowRejectDialog(true),
                      disabled: actionLoading,
                    },
                  ]}
                />
              </FormSection>
            ) : (
              <DetailPanel
                title="Request resolution"
                description="This request is finalized and remains visible for audit history."
              >
                <RequestStatusBadge status={request.status} size="lg" />
              </DetailPanel>
            )}

            {/* Confirmation Dialogs */}
            <ApprovalConfirmDialog
              isOpen={showApproveDialog}
              onClose={() => setShowApproveDialog(false)}
              onApprove={() => {
                void handleApprove();
                setShowApproveDialog(false);
              }}
              onReject={() => setShowApproveDialog(false)}
              title="Approve Subscription Request?"
              description={`Confirm approval of request #${request?.id}. This will create a new EMI subscription${request?.customer_id ? "" : " and link to a customer"}.`}
            />

            <ApprovalConfirmDialog
              isOpen={showRejectDialog}
              onClose={() => setShowRejectDialog(false)}
              onApprove={() => {
                void handleReject();
                setShowRejectDialog(false);
              }}
              onReject={() => setShowRejectDialog(false)}
              title="Reject Subscription Request?"
              description={`Confirm rejection of request #${request?.id}. This action cannot be undone.`}
            />
          </>
        ) : null}
        </div>

        {/* Right Sidebar - Fixed Desktop Sidebar (1/4 width) */}
        {request && (
          <div className="xl:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Status Overview Card */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Request Status</h3>
                <div className="inline-block rounded-full px-3 py-1.5 bg-blue-100 text-blue-800 font-semibold text-sm">
                  {request.status}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">Subscription</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requester:</span>
                    <span className="font-semibold text-xs">{request.requester_username || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lucky #:</span>
                    <span className="font-semibold">{request.preferred_lucky_number || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              {request.status === "SUBMITTED" && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowApproveDialog(true)}
                      disabled={actionLoading}
                      className="w-full h-10 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      Approve (Ctrl+⏎)
                    </button>
                    <button
                      onClick={() => setShowRejectDialog(true)}
                      disabled={actionLoading}
                      className="w-full h-10 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Reject (D)
                    </button>
                  </div>
                </div>
              )}

              {/* Keyboard Shortcuts Card */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-xs font-semibold text-foreground mb-3 uppercase">Keyboard Shortcuts</h3>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Approve</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Ctrl+⏎</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Reject</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">D</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Refresh</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">R</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Close</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">Esc</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
