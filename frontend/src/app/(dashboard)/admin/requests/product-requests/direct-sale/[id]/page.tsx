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
import {
  decideAdminProductRequest,
  getProductRequest,
  getProductRequestOptions,
  type ProductRequestCustomerOption,
  type ProductRequestOptions,
  type ProductRequestRecord,
} from "@/services/product-requests";
import { formatRupee } from "@/lib/utils/currency";

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

export default function DirectSaleRequestDetailPage() {
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
  const [unitPrice, setUnitPrice] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [step, setStep] = useState<"customer" | "pricing" | "review">(
    "customer",
  );

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await getProductRequest("admin", requestId);
      if (payload.request_type !== "DIRECT_SALE") {
        setError(
          "This page is for DIRECT_SALE requests only. Wrong type loaded.",
        );
        setRequest(null);
        setLoading(false);
        return;
      }
      setRequest(payload);
      setUnitPrice("");
      setReviewNote(payload.review_note || "");
      setError(null);

      // Auto-progress to pricing step if customer already linked
      if (payload.customer_id) {
        setSelectedCustomerId(String(payload.customer_id));
        setStep("pricing");
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
      const payload = await getProductRequestOptions("admin", {
        customerQ: query || undefined,
      });
      setOptions(payload);
    },
    [customerQuery],
  );

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  // Keyboard shortcuts
  useRequestKeyboardShortcuts({
    "Ctrl+Enter": () => {
      if (request?.status === "SUBMITTED") {
        void handleApprove();
      }
    },
    D: () => {
      if (request?.status === "SUBMITTED") {
        void handleReject();
      }
    },
    R: () => void loadRequest(),
    Escape: () => {
      setActionError(null);
      setSuccessMessage(null);
    },
  });

  const selectedCustomer = useMemo<ProductRequestCustomerOption | null>(
    () =>
      options?.customers?.find(
        (item) => String(item.id) === selectedCustomerId,
      ) ?? null,
    [options, selectedCustomerId],
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
    setActionLoading(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const payload: Record<string, unknown> = {
        decision: "APPROVE",
        resolution_mode: request.customer_id ? "existing" : "existing",
        review_note: reviewNote.trim() || undefined,
        pricing_override: unitPrice
          ? { unit_price: Number(unitPrice) }
          : undefined,
      };
      if (!request.customer_id && selectedCustomerId) {
        payload.customer_id = Number(selectedCustomerId);
      }
      await decideAdminProductRequest(requestId, payload);
      setSuccessMessage("Direct sale request approved. Draft invoice created.");
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
      setSuccessMessage("Direct sale request rejected.");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Sales"
      title={`Direct Sale Request #${request?.id ?? ""}`}
      subtitle={`Simple invoice workflow • Submitted ${formatDateTime(request?.created_at)}`}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Requests", href: "/admin/requests/product-requests" },
        { label: "Direct Sale", href: "/admin/requests/product-requests" },
        { label: request ? `REQ-${request.id}` : "Detail" },
      ]}
      actions={[
        {
          href: "/admin/requests/product-requests",
          label: "Back",
          variant: "secondary",
        },
      ]}
      stats={
        request
          ? [
              {
                label: "Request Type",
                value: "Direct Sale",
                tone: "info" as const,
              },
              {
                label: "Status",
                value: request.status || "Unknown",
                tone:
                  request.status === "APPROVED"
                    ? ("success" as const)
                    : request.status === "REJECTED"
                      ? ("danger" as const)
                      : ("info" as const),
              },
              {
                label: "Unit Price",
                value: formatRupee(unitPrice || "0"),
                tone: "success" as const,
              },
            ]
          : undefined
      }
      statusBadge={{
        label: request?.status || "Loading",
        tone:
          request?.status === "APPROVED"
            ? "success"
            : request?.status === "REJECTED"
              ? "danger"
              : "info",
      }}
    >
      {/* Desktop two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Content - Left Column (3/4 width) */}
        <div className="xl:col-span-3 space-y-6">
          {loading ? (
            <ERPLoadingState label="Loading direct sale request..." />
          ) : null}

          {!loading && error ? (
            <ERPErrorState
              title="Unable to load request"
              description={error}
              onRetry={() => void loadRequest()}
            />
          ) : null}

          {!loading && !error && request ? (
            <>
              {actionError ? (
                <ERPErrorState
                  title="Action failed"
                  description={actionError}
                />
              ) : null}
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
                    <FormSection
                      title="Step 1: Link Customer"
                      description="Select an existing customer or create a new one."
                    >
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <label className="space-y-2 text-sm">
                            <span className="font-medium">
                              Search customers
                            </span>
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
                              if (e.target.value) setStep("pricing");
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

                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Or use request snapshot:{" "}
                          <strong>{request.requested_customer_name}</strong> (
                          {request.requested_customer_phone})
                        </div>
                      </div>
                    </FormSection>
                  ) : null}

                  {/* Step 2: Pricing Review */}
                  {step === "pricing" ||
                  (step !== "customer" && request.customer_id) ? (
                    <FormSection
                      title="Step 2: Review Pricing"
                      description="Confirm or adjust the unit price. Invoice will be created in DRAFT status."
                    >
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="text-xs uppercase font-semibold text-muted-foreground">
                            Product
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {request.product_name}
                          </div>
                        </div>

                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">
                            Unit price (override if needed)
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={unitPrice}
                            onChange={(e) => setUnitPrice(e.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-background px-3"
                          />
                        </label>

                        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Invoice total:
                            </span>
                            <span className="font-bold">
                              {formatRupee(unitPrice || 0)}
                            </span>
                          </div>
                        </div>

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
                      title="Step 3: Approve or Reject"
                      description="Final review before creating the draft invoice."
                    >
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                            <div className="text-xs uppercase font-semibold text-muted-foreground">
                              Customer
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedCustomer?.name ||
                                request.customer_name ||
                                request.requested_customer_name}
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                            <div className="text-xs uppercase font-semibold text-muted-foreground">
                              Invoice Total
                            </div>
                            <div className="mt-1 text-sm font-bold">
                              {formatRupee(unitPrice || 0)}
                            </div>
                          </div>
                        </div>

                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">
                            Review note (optional)
                          </span>
                          <textarea
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            rows={3}
                            placeholder="Any notes for this approval..."
                            className="w-full rounded-xl border border-border bg-background px-3 py-2"
                          />
                        </label>

                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">
                            Reject reason (if rejecting)
                          </span>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            placeholder="Why is this being rejected?"
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
                            {actionLoading ? "Processing..." : "Approve Sale"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReject()}
                            disabled={actionLoading}
                            className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {actionLoading ? "Processing..." : "Reject Sale"}
                          </button>
                        </div>
                      </div>
                    </FormSection>
                  ) : null}
                </>
              ) : (
                <DetailPanel
                  title="Request Finalized"
                  description="This request has been resolved."
                >
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className="ml-2 font-medium">{request.status}</span>
                    </div>
                    {request.approved_direct_sale_id && (
                      <div>
                        <Link
                          href={`/admin/billing/invoices/${request.approved_direct_sale_id}`}
                          className="text-primary hover:underline"
                        >
                          View Draft Invoice →
                        </Link>
                      </div>
                    )}
                  </div>
                </DetailPanel>
              )}
            </>
          ) : null}
        </div>
      </div>
    </ERPPageShell>
  );
}
