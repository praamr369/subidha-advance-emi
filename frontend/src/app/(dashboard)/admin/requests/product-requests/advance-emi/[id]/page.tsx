"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailPanel, FormSection } from "@/components/ui/operations";
import ProductRequestCard from "@/domains/product-requests/components/ProductRequestCard";
import { useRequestKeyboardShortcuts } from "@/hooks/useRequestKeyboardShortcuts";
import { formatRupee } from "@/lib/utils/currency";
import {
  decideAdminProductRequest,
  getProductRequest,
  getProductRequestOptions,
  type ProductRequestCustomerOption,
  type ProductRequestOptions,
  type ProductRequestRecord,
} from "@/services/product-requests";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed.";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function AdvanceEMIRequestDetailPage() {
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [luckyOverride, setLuckyOverride] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [step, setStep] = useState<"customer" | "batch" | "review">("customer");

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await getProductRequest("admin", requestId);
      if (payload.request_type !== "ADVANCE_EMI") {
        setError("This page is for ADVANCE_EMI requests only. Wrong type loaded.");
        setRequest(null);
        setLoading(false);
        return;
      }
      setRequest(payload);
      setReviewNote(payload.review_note || "");
      setError(null);

      if (payload.customer_id) {
        setSelectedCustomerId(String(payload.customer_id));
        setStep("batch");
      }
    } catch (err) {
      setError(toErrorMessage(err));
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  const loadOptions = useCallback(
    async (query = customerQuery) => {
      try {
        const payload = await getProductRequestOptions("admin", {
          batchId: request?.batch_id || undefined,
          customerQ: query || undefined,
        });
        setOptions(payload);
      } catch (err) {
        setActionError(toErrorMessage(err));
      }
    },
    [customerQuery, request?.batch_id]
  );

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    if (!request || request.status !== "SUBMITTED") return;
    void loadOptions();
  }, [loadOptions, request]);

  // Keyboard shortcuts
  useRequestKeyboardShortcuts({
    "Ctrl+Enter": () => {
      if (request?.status === "SUBMITTED") {
        void handleApprove();
      }
    },
    "D": () => {
      if (request?.status === "SUBMITTED") {
        void handleReject();
      }
    },
    "R": () => void loadRequest(),
    "Escape": () => {
      setActionError(null);
      setSuccessMessage(null);
    },
  });

  const selectedCustomer = useMemo<ProductRequestCustomerOption | null>(
    () => (options?.customers?.find((item) => String(item.id) === selectedCustomerId) ?? null),
    [options, selectedCustomerId]
  );

  async function handleCustomerSearch() {
    try {
      await loadOptions(customerQuery);
      setActionError(null);
    } catch (err) {
      setActionError(toErrorMessage(err));
    }
  }

  async function handleApprove() {
    if (!request) return;
    if (!selectedCustomerId && !request.customer_id) {
      setActionError("Must select or have a linked customer.");
      return;
    }
    if (!luckyOverride && !request.preferred_lucky_number) {
      setActionError("Must select a lucky number.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const payload: Record<string, unknown> = {
        decision: "APPROVE",
        resolution_mode: request.customer_id ? "existing" : "existing",
        lucky_number_override: luckyOverride ? Number(luckyOverride) : undefined,
        review_note: reviewNote.trim() || undefined,
      };
      if (!request.customer_id && selectedCustomerId) {
        payload.customer_id = Number(selectedCustomerId);
      }
      await decideAdminProductRequest(requestId, payload);
      setSuccessMessage("EMI request approved. Subscription created with lucky number assignment.");
      setStep("review");
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
      setSuccessMessage("EMI request rejected.");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Subscriptions"
      title={`Advance EMI Request #${request?.id ?? ""}`}
      subtitle={`EMI with lucky draw • Submitted ${formatDateTime(request?.created_at)}`}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Requests", href: "/admin/requests/product-requests" },
        { label: "Advance EMI", href: "/admin/requests/product-requests" },
        { label: request ? `REQ-${request.id}` : "Detail" },
      ]}
      actions={[
        { href: "/admin/requests/product-requests", label: "Back", variant: "secondary" },
      ]}
      stats={
        request
          ? [
              { label: "Request Type", value: "Advance EMI", tone: "info" as const },
              { label: "Status", value: request.status || "Unknown", tone: request.status === "APPROVED" ? ("success" as const) : request.status === "REJECTED" ? ("danger" as const) : ("info" as const) },
            ]
          : undefined
      }
      statusBadge={{
        label: request?.status || "Loading",
        tone: request?.status === "APPROVED" ? "success" : request?.status === "REJECTED" ? "danger" : "info",
      }}
    >
      {/* Desktop two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Content - Left Column (3/4 width) */}
        <div className="xl:col-span-3 space-y-6">
          {loading ? <ERPLoadingState label="Loading EMI request..." /> : null}

        {!loading && error ? (
          <ERPErrorState title="Unable to load request" description={error} onRetry={() => void loadRequest()} />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? <ERPErrorState title="Action failed" description={actionError} /> : null}
            {successMessage ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <p className="font-semibold">{successMessage}</p>
              </section>
            ) : null}

            <ProductRequestCard request={request} />

            {request.status === "SUBMITTED" ? (
              <>
                {/* Step 1: Link Customer */}
                {step === "customer" && !request.customer_id ? (
                  <FormSection title="Step 1: Link Customer" description="Select or create a customer for this EMI subscription.">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <label className="space-y-2 text-sm">
                          <span className="font-medium">Search customers</span>
                          <input
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            placeholder="Name, phone, email, or username"
                            className="h-11 w-full rounded-xl border border-border bg-background px-3"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleCustomerSearch()}
                          className="mt-6 h-11 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
                        >
                          Search
                        </button>
                      </div>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Select customer</span>
                        <select
                          value={selectedCustomerId}
                          onChange={(e) => {
                            setSelectedCustomerId(e.target.value);
                            if (e.target.value) setStep("batch");
                          }}
                          className="h-11 w-full rounded-xl border border-border bg-background px-3"
                        >
                          <option value="">Choose customer...</option>
                          {(options?.customers ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.phone}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </FormSection>
                ) : null}

                {/* Step 2: Batch & Lucky Number */}
                {(step === "batch" || (step !== "customer" && request.customer_id)) && request.batch_id ? (
                  <FormSection
                    title="Step 2: Confirm Batch & Lucky Number"
                    description="The batch and preferred lucky number are already selected. You can override the lucky number if needed."
                  >
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="text-xs uppercase font-semibold text-muted-foreground">Batch</div>
                          <div className="mt-1 text-sm font-medium">{request.batch_code}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {request.batch_id ? `Batch #${request.batch_id}` : "—"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="text-xs uppercase font-semibold text-muted-foreground">Preferred Lucky Number</div>
                          <div className="mt-1 text-sm font-bold">#{String(request.preferred_lucky_number).padStart(2, "0")}</div>
                        </div>
                      </div>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Override lucky number (optional)</span>
                        <select
                          value={luckyOverride}
                          onChange={(e) => setLuckyOverride(e.target.value)}
                          className="h-11 w-full rounded-xl border border-border bg-background px-3"
                        >
                          <option value="">Use preferred</option>
                          {(options?.lucky_numbers ?? []).map((num) => (
                            <option key={num} value={num}>
                              #{String(num).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => setStep("review")}
                        className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Review & Approve →
                      </button>
                    </div>
                  </FormSection>
                ) : null}

                {/* Step 3: Final Review & Approval */}
                {step === "review" || request.customer_id ? (
                  <FormSection
                    title="Step 3: Review & Approve"
                    description="Final review before creating the EMI subscription."
                  >
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="text-xs uppercase font-semibold text-muted-foreground">Customer</div>
                          <div className="mt-1 text-sm font-medium">
                            {selectedCustomer?.name || request.customer_name || request.requested_customer_name}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="text-xs uppercase font-semibold text-muted-foreground">Lucky Number</div>
                          <div className="mt-1 text-sm font-bold">
                            #{String(luckyOverride || request.preferred_lucky_number).padStart(2, "0")}
                          </div>
                        </div>
                      </div>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Review note (optional)</span>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={3}
                          placeholder="Approval notes..."
                          className="w-full rounded-xl border border-border bg-background px-3 py-2"
                        />
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Reject reason (if rejecting)</span>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={3}
                          placeholder="Why reject this EMI request?"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApprove()}
                          disabled={actionLoading}
                          className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {actionLoading ? "Processing..." : "Approve EMI"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReject()}
                          disabled={actionLoading}
                          className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading ? "Processing..." : "Reject EMI"}
                        </button>
                      </div>
                    </div>
                  </FormSection>
                ) : null}
              </>
            ) : (
              <DetailPanel title="Request Finalized" description="This request has been resolved.">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <span className="ml-2 font-medium">{request.status}</span>
                  </div>
                  {request.approved_subscription_id && (
                    <div>
                      <Link
                        href={`/admin/subscriptions/${request.approved_subscription_id}`}
                        className="text-primary hover:underline"
                      >
                        View Subscription →
                      </Link>
                    </div>
                  )}
                </div>
              </DetailPanel>
            )}
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
                <div className="inline-block rounded-full px-3 py-1.5 bg-purple-100 text-purple-800 font-semibold text-sm">
                  {request.status}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">EMI</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product:</span>
                    <span className="font-semibold text-xs">{request.product_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Batch:</span>
                    <span className="font-semibold text-xs">{request.batch_code || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              {request.status === "SUBMITTED" && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => void handleApprove()}
                      disabled={actionLoading}
                      className="w-full h-10 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      Approve (Ctrl+⏎)
                    </button>
                    <button
                      onClick={() => void handleReject()}
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
