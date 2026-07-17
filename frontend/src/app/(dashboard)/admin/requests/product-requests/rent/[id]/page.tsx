"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailPanel, FormSection } from "@/components/ui/operations";
import ProductRequestCard from "@/domains/product-requests/components/ProductRequestCard";
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

export default function RentRequestDetailPage() {
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
  const [monthlyRent, setMonthlyRent] = useState("");
  const [tenure, setTenure] = useState("12");
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [step, setStep] = useState<"customer" | "pricing" | "review">("customer");

  const loadRequest = useCallback(async () => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await getProductRequest("admin", requestId);
      if (payload.request_type !== "RENT") {
        setError("This page is for RENT requests only. Wrong type loaded.");
        setRequest(null);
        setLoading(false);
        return;
      }
      setRequest(payload);
      const defaultRent = payload.product?.base_price ? Number(payload.product.base_price) / 12 : 0;
      setMonthlyRent(defaultRent.toFixed(2));
      setReviewNote(payload.review_note || "");
      setError(null);

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
      try {
        const payload = await getProductRequestOptions("admin", {
          customerQ: query || undefined,
        });
        setOptions(payload);
      } catch (err) {
        setActionError(toErrorMessage(err));
      }
    },
    [customerQuery]
  );

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    if (!request || request.status !== "SUBMITTED") return;
    void loadOptions();
  }, [loadOptions, request]);

  const selectedCustomer = useMemo<ProductRequestCustomerOption | null>(
    () => (options?.customers?.find((item) => String(item.id) === selectedCustomerId) ?? null),
    [options, selectedCustomerId]
  );

  const totalRentalCost = useMemo(() => {
    const monthly = Number(monthlyRent) || 0;
    const months = Number(tenure) || 12;
    return monthly * months;
  }, [monthlyRent, tenure]);

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
        pricing_override: monthlyRent ? { monthly_rent_amount: Number(monthlyRent) } : undefined,
      };
      if (!request.customer_id && selectedCustomerId) {
        payload.customer_id = Number(selectedCustomerId);
      }
      await decideAdminProductRequest(requestId, payload);
      setSuccessMessage("Rent request approved. Rental subscription created.");
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
      setSuccessMessage("Rent request rejected.");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Subscriptions"
      title={`Rent Request #${request?.id ?? ""}`}
      subtitle={`Rental workflow • Submitted ${formatDateTime(request?.created_at)}`}
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Requests", href: "/admin/requests/product-requests" },
        { label: "Rent", href: "/admin/requests/product-requests" },
        { label: request ? `REQ-${request.id}` : "Detail" },
      ]}
      actions={[
        { href: "/admin/requests/product-requests", label: "Back", variant: "secondary" },
      ]}
      statusBadge={{
        label: request?.status || "Loading",
        tone: request?.status === "APPROVED" ? "success" : request?.status === "REJECTED" ? "danger" : "info",
      }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading rent request..." /> : null}

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
                  <FormSection title="Step 1: Link Customer" description="Select an existing customer for this rental.">
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
                    </div>
                  </FormSection>
                ) : null}

                {/* Step 2: Pricing & Tenure */}
                {(step === "pricing" || (step !== "customer" && request.customer_id)) ? (
                  <FormSection
                    title="Step 2: Set Monthly Rent & Tenure"
                    description="Configure the rental terms. Review proposed pricing and adjust if needed."
                  >
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                        <div className="text-xs uppercase font-semibold text-muted-foreground">Product</div>
                        <div className="mt-1 text-sm font-medium">{request.product_name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Base price: {formatRupee(request.product?.base_price || 0)}</div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">Monthly rent amount</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={monthlyRent}
                            onChange={(e) => setMonthlyRent(e.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-background px-3"
                          />
                        </label>

                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">Tenure (months)</span>
                          <input
                            type="number"
                            min="1"
                            value={tenure}
                            onChange={(e) => setTenure(e.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-background px-3"
                          />
                        </label>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Monthly:</span>
                            <span className="font-medium">{formatRupee(monthlyRent || 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Duration:</span>
                            <span className="font-medium">{tenure} months</span>
                          </div>
                          <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                            <span>Total Rental Cost:</span>
                            <span className="text-lg">{formatRupee(totalRentalCost)}</span>
                          </div>
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
                    title="Step 3: Review & Approve"
                    description="Final review before creating the rental subscription."
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
                          <div className="text-xs uppercase font-semibold text-muted-foreground">Total Cost</div>
                          <div className="mt-1 text-sm font-bold">{formatRupee(totalRentalCost)}</div>
                        </div>
                      </div>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Review note (optional)</span>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={3}
                          placeholder="Any notes for this approval..."
                          className="w-full rounded-xl border border-border bg-background px-3 py-2"
                        />
                      </label>

                      <label className="block space-y-2 text-sm">
                        <span className="font-medium">Reject reason (if rejecting)</span>
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
                          {actionLoading ? "Processing..." : "Approve Rental"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReject()}
                          disabled={actionLoading}
                          className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading ? "Processing..." : "Reject Rental"}
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
                        View Rental Subscription →
                      </Link>
                    </div>
                  )}
                </div>
              </DetailPanel>
            )}
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
