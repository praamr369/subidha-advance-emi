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
import ProductRequestCard from "@/domains/product-requests/components/ProductRequestCard";
import {
  decideAdminProductRequest,
  getProductRequest,
  getProductRequestOptions,
  type ProductRequestCustomerOption,
  type ProductRequestOptions,
  type ProductRequestRecord,
} from "@/services/product-requests";

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

export default function AdminProductRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const [request, setRequest] = useState<ProductRequestRecord | null>(null);
  const [options, setOptions] = useState<ProductRequestOptions | null>(null);
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
      const payload = await getProductRequest("admin", requestId);
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
    async (payloadRequest: ProductRequestRecord, query = customerQuery) => {
      const payload = await getProductRequestOptions("admin", {
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

  const selectedCustomer = useMemo<ProductRequestCustomerOption | null>(
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
      const payload: Record<string, unknown> = {
        decision: "APPROVE",
        resolution_mode: resolutionMode,
        lucky_number_override: luckyOverride ? Number(luckyOverride) : undefined,
        review_note: reviewNote.trim() || undefined,
      };
      if (resolutionMode === "existing") {
        if (!selectedCustomerId) {
          setActionError("Must select an existing customer.");
          setActionLoading(false);
          return;
        }
        payload.customer_id = Number(selectedCustomerId);
      }
      await decideAdminProductRequest(requestId, payload);
      setSuccessMessage("Product request approved successfully.");
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
      const payload: Record<string, unknown> = {
        decision: "REJECT",
        reject_reason: rejectReason.trim() || undefined,
        review_note: reviewNote.trim() || undefined,
      };
      await decideAdminProductRequest(requestId, payload);
      setSuccessMessage("Product request rejected.");
      setRejectReason("");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Sales"
      title={`Product Request #${request?.id ?? ""}`}
      subtitle={`Submitted by ${
        request?.requester_role_snapshot === "PARTNER" ? "Partner" : "Customer"
      } • ${formatDateTime(request?.created_at)}`}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Sales & Onboarding", href: "/admin/requests/product-requests" },
        { label: "Product Requests", href: "/admin/requests/product-requests" },
        { label: request ? `REQ-${request.id}` : "Detail" },
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
        {loading ? <ERPLoadingState label="Loading product request review..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load product request"
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

            <ProductRequestCard request={request} showRequester />

            <DetailPanel
              title="Audit and review context"
              description="Approval must either link an existing customer or create one from the captured request snapshot. Lucky-number overrides remain explicit and auditable."
            >
              <MobileSafeTable className="border-none bg-transparent">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailItem label="Product" value={request.product_name || "—"} />
                  <DetailItem label="Request Type" value={request.request_type || "—"} />
                  <DetailItem
                    label="Batch"
                    value={request.batch_code ? request.batch_code : "—"}
                  />
                  <DetailItem label="Submitted At" value={formatDateTime(request.created_at)} />
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

                <FormActions
                  submitLabel="Approve Request"
                  submitLoadingLabel="Processing..."
                  onSubmitClick={() => void handleApprove()}
                  submitting={actionLoading}
                  danger={{
                    label: actionLoading ? "Processing..." : "Reject Request",
                    onClick: () => void handleReject(),
                    disabled: actionLoading,
                  }}
                  align="left"
                />
              </FormSection>
            ) : (
              <DetailPanel
                title="Request resolution"
                description="This request is finalized and remains visible for audit history."
              >
                <ERPStatusBadge status={request.status} />
              </DetailPanel>
            )}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
