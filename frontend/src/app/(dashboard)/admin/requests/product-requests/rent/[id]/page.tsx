"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DetailPanel, FormSection } from "@/components/ui/operations";
import ProductRequestCard from "@/domains/product-requests/components/ProductRequestCard";
import StepIndicator from "@/domains/product-requests/components/StepIndicator";
import CustomerLinkSection from "@/domains/product-requests/components/CustomerLinkSection";
import PricingSection from "@/domains/product-requests/components/PricingSection";
import ApprovalConfirmDialog from "@/domains/product-requests/components/ApprovalConfirmDialog";
import CustomerDetailsCard from "@/domains/product-requests/components/CustomerDetailsCard";
import { useRequestKeyboardShortcuts } from "@/hooks/useRequestKeyboardShortcuts";
import {
  decideAdminProductRequest,
  getProductRequest,
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
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"approve" | "reject">("approve");

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
      setMonthlyRent("");
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

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  // Keyboard shortcuts
  useRequestKeyboardShortcuts({
    "Ctrl+Enter": () => {
      if (request?.status === "SUBMITTED" && step === "review") {
        setDialogMode("approve");
        setShowApprovalDialog(true);
      }
    },
    "D": () => {
      if (request?.status === "SUBMITTED" && step === "review") {
        setDialogMode("reject");
        setShowApprovalDialog(true);
      }
    },
    "R": () => void loadRequest(),
    "Escape": () => {
      setShowApprovalDialog(false);
      setActionError(null);
    },
  });

  const totalRentalCost = useMemo(() => {
    const monthly = Number(monthlyRent) || 0;
    const months = Number(tenure) || 12;
    return monthly * months;
  }, [monthlyRent, tenure]);

  async function submitApproval() {
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
      setShowApprovalDialog(false);
      setSuccessMessage("✓ Rent request approved. Rental subscription created.");
      setTimeout(() => setStep("review"), 300);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  }

  async function submitRejection() {
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
      setShowApprovalDialog(false);
      setSuccessMessage("✓ Rent request rejected.");
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
      stats={
        request
          ? [
              { label: "Request Type", value: "Rent", tone: "info" as const },
              { label: "Status", value: request.status || "Unknown", tone: request.status === "APPROVED" ? ("success" as const) : request.status === "REJECTED" ? ("danger" as const) : ("info" as const) },
              { label: "Monthly Rent", value: formatRupee(monthlyRent || "0"), tone: "success" as const },
              { label: "Total Cost", value: formatRupee(String(totalRentalCost)), tone: "success" as const },
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
          {loading ? <ERPLoadingState label="Loading rent request..." /> : null}

        {!loading && error ? (
          <ERPErrorState title="Unable to load request" description={error} onRetry={() => void loadRequest()} />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? <ERPErrorState title="Action failed" description={actionError} /> : null}
            {successMessage ? (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 animate-in fade-in">
                {successMessage}
              </section>
            ) : null}

            <ProductRequestCard request={request} />

            {request.status === "SUBMITTED" ? (
              <>
                {/* Step Progress Indicator */}
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <StepIndicator
                    steps={[
                      { id: "customer", label: "Link Customer", description: "Select existing customer" },
                      { id: "pricing", label: "Set Rent & Tenure", description: "Configure terms" },
                      { id: "review", label: "Review & Approve", description: "Final decision" },
                    ]}
                    currentStep={step}
                    allowBacktrack={true}
                    onStepClick={(stepId) => {
                      if (stepId === "customer") setStep("customer");
                      else if (stepId === "pricing" && (request.customer_id || selectedCustomerId)) setStep("pricing");
                      else if (stepId === "review" && (request.customer_id || selectedCustomerId)) setStep("review");
                    }}
                  />
                </div>

                {/* Step 1: Link Customer */}
                {step === "customer" && !request.customer_id ? (
                  <FormSection title="Step 1: Link Customer" description="Select an existing customer for this rental.">
                    <CustomerLinkSection
                      onCustomerSelect={(customerId) => {
                        setSelectedCustomerId(customerId);
                        if (customerId) setStep("pricing");
                      }}
                      selectedCustomerId={selectedCustomerId}
                      snapshotName={request.requested_customer_name}
                      snapshotPhone={request.requested_customer_phone}
                    />
                  </FormSection>
                ) : null}

                {/* Step 2: Pricing & Tenure */}
                {(step === "pricing" || (step !== "customer" && request.customer_id)) ? (
                  <FormSection
                    title="Step 2: Set Monthly Rent & Tenure"
                    description="Configure the rental terms. Review proposed pricing and adjust if needed."
                  >
                    <PricingSection
                      productName={request.product_name || ""}
                      basePrice={0}
                      monthlyAmount={Number(monthlyRent)}
                      onMonthlyAmountChange={setMonthlyRent}
                      tenure={Number(tenure)}
                      onTenureChange={setTenure}
                      type="RENT"
                    />

                    <button
                      type="button"
                      onClick={() => setStep("review")}
                      className="mt-6 h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
                    >
                      Review & Approve →
                    </button>
                  </FormSection>
                ) : null}

                {/* Step 3: Final Review & Approval */}
                {step === "review" || request.customer_id ? (
                  <FormSection
                    title="Step 3: Review & Approve"
                    description="Final review before creating the rental subscription."
                  >
                    <div className="space-y-4">
                      {/* Customer Details Card */}
                      {(request.customer_id || selectedCustomerId) && (
                        <div className="mb-4">
                          <CustomerDetailsCard
                            customer={{
                              id: Number(request.customer_id || selectedCustomerId),
                              name: request.customer_name || request.requested_customer_name || "",
                              phone: request.customer_phone || request.requested_customer_phone || "",
                              email: request.customer_email || undefined,
                              address: request.requested_customer_address || undefined,
                              city: request.requested_customer_city || undefined,
                              state: undefined,
                              pincode: undefined,
                              customerSince: undefined,
                              verificationStatus: "verified",
                              status: "active",
                            }}
                          />
                        </div>
                      )}

                      {/* Summary Cards */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="text-xs font-semibold uppercase text-emerald-600">Customer</div>
                          <div className="mt-2 text-sm font-bold text-emerald-900">
                            {request.customer_name || request.requested_customer_name}
                          </div>
                        </div>
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                          <div className="text-xs font-semibold uppercase text-blue-600">Total Cost</div>
                          <div className="mt-2 text-lg font-bold text-blue-900">{formatRupee(totalRentalCost)}</div>
                        </div>
                      </div>

                      {/* Notes Section */}
                      <div className="space-y-3">
                        <label className="block space-y-2 text-sm">
                          <span className="font-semibold text-foreground">Review note (optional)</span>
                          <textarea
                            value={reviewNote}
                            onChange={(e) => setReviewNote(e.target.value)}
                            rows={3}
                            placeholder="Any notes for this approval..."
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-medium focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </label>

                        <label className="block space-y-2 text-sm">
                          <span className="font-semibold text-foreground">Reject reason (if rejecting)</span>
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            placeholder="Why is this being rejected?"
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 font-medium focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDialogMode("approve");
                            setShowApprovalDialog(true);
                          }}
                          disabled={actionLoading}
                          className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          {actionLoading ? "Processing..." : "Approve Rental"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDialogMode("reject");
                            setShowApprovalDialog(true);
                          }}
                          disabled={actionLoading}
                          className="h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          {actionLoading ? "Processing..." : "Reject Rental"}
                        </button>
                      </div>
                    </div>

                    {/* Approval Confirmation Dialog */}
                    <ApprovalConfirmDialog
                      isOpen={showApprovalDialog}
                      onClose={() => setShowApprovalDialog(false)}
                      onApprove={submitApproval}
                      onReject={submitRejection}
                      isLoading={actionLoading}
                      title={dialogMode === "approve" ? "Approve Rental Request?" : "Reject Rental Request?"}
                      description={
                        dialogMode === "approve"
                          ? `Confirm approval for ${request.product_name} rental. A rental subscription will be created for ${formatRupee(totalRentalCost)}.`
                          : `Confirm rejection of ${request.product_name} rental request.${rejectReason ? " " + rejectReason : ""}`
                      }
                      approveLabel="Approve"
                      rejectLabel="Reject"
                    />
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

        {/* Right Sidebar - Fixed Desktop Sidebar (1/4 width) */}
        {request && (
          <div className="xl:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Status Overview Card */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Request Status</h3>
                <div className="inline-block rounded-full px-3 py-1.5 bg-orange-100 text-orange-800 font-semibold text-sm">
                  {request.status}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">Rent</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly:</span>
                    <span className="font-semibold">${monthlyRent || "0"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold">${totalRentalCost || "0"}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              {request.status === "SUBMITTED" && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => {setDialogMode("approve"); setShowApprovalDialog(true);}}
                      disabled={actionLoading}
                      className="w-full h-10 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      Approve (Ctrl+⏎)
                    </button>
                    <button
                      onClick={() => {setDialogMode("reject"); setShowApprovalDialog(true);}}
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
