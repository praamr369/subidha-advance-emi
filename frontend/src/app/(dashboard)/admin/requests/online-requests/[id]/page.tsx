"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { useRequestKeyboardShortcuts } from "@/hooks/useRequestKeyboardShortcuts";
import StepIndicator from "@/domains/product-requests/components/StepIndicator";
import CustomerDetailsCard from "@/domains/product-requests/components/CustomerDetailsCard";
import ApprovalConfirmDialog from "@/domains/product-requests/components/ApprovalConfirmDialog";
import { RequestStatusBadge, RequestWorkflowCard, PricingBreakdownCard, RequestActionHistory } from "@/domains/request-services/components";
import {
  getAdminOnlineRequest,
  adminGenerateQuote,
  adminSendQuote,
  adminApproveRequest,
  adminRejectRequest,
  adminCompleteRequest,
} from "@/services/online-requests";

type Action = {
  id: number;
  action_type: string;
  performed_by_name?: string;
  notes?: string;
  created_at?: string;
};

type RequestDetail = {
  id: number;
  request_number: string;
  customer: number;
  customer_name: string;
  product: number;
  product_name: string;
  request_type: string;
  request_type_display: string;
  quantity: number;
  preferred_tenure?: number | null;
  preferred_lucky_number?: string | null;
  batch?: number | null;
  batch_name?: string | null;
  unit_price: string;
  sub_total: string;
  tax_percentage: string;
  gst_amount: string;
  delivery_cost: string;
  discount_amount: string;
  total_amount: string;
  status: string;
  status_display: string;
  quote_expiry_date?: string | null;
  is_quote_expired?: boolean;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  can_accept_quote?: boolean;
  can_approve?: boolean;
  created_at: string;
  updated_at: string;
  actions: Action[];
};

function parseDetail(raw: Record<string, unknown>): RequestDetail {
  return {
    id: Number(raw.id ?? 0),
    request_number: String(raw.request_number ?? ""),
    customer: Number(raw.customer ?? 0),
    customer_name: String(raw.customer_name ?? ""),
    product: Number(raw.product ?? 0),
    product_name: String(raw.product_name ?? ""),
    request_type: String(raw.request_type ?? ""),
    request_type_display: String(raw.request_type_display ?? raw.request_type ?? ""),
    quantity: Number(raw.quantity ?? 0),
    preferred_tenure: raw.preferred_tenure != null ? Number(raw.preferred_tenure) : null,
    preferred_lucky_number: raw.preferred_lucky_number != null ? String(raw.preferred_lucky_number) : null,
    batch: raw.batch != null ? Number(raw.batch) : null,
    batch_name: raw.batch_name != null ? String(raw.batch_name) : null,
    unit_price: String(raw.unit_price ?? "0"),
    sub_total: String(raw.sub_total ?? "0"),
    tax_percentage: String(raw.tax_percentage ?? "0"),
    gst_amount: String(raw.gst_amount ?? "0"),
    delivery_cost: String(raw.delivery_cost ?? "0"),
    discount_amount: String(raw.discount_amount ?? "0"),
    total_amount: String(raw.total_amount ?? "0"),
    status: String(raw.status ?? ""),
    status_display: String(raw.status_display ?? raw.status ?? ""),
    quote_expiry_date: raw.quote_expiry_date != null ? String(raw.quote_expiry_date) : null,
    is_quote_expired: Boolean(raw.is_quote_expired),
    approved_by: raw.approved_by != null ? Number(raw.approved_by) : null,
    approved_by_name: raw.approved_by_name != null ? String(raw.approved_by_name) : null,
    approved_at: raw.approved_at != null ? String(raw.approved_at) : null,
    approval_notes: raw.approval_notes != null ? String(raw.approval_notes) : null,
    can_accept_quote: Boolean(raw.can_accept_quote),
    can_approve: Boolean(raw.can_approve),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    actions: Array.isArray(raw.actions)
      ? (raw.actions as Record<string, unknown>[]).map((a) => ({
          id: Number(a.id ?? 0),
          action_type: String(a.action_type ?? ""),
          performed_by_name: a.performed_by_name != null ? String(a.performed_by_name) : undefined,
          notes: a.notes != null ? String(a.notes) : undefined,
          created_at: a.created_at != null ? String(a.created_at) : undefined,
        }))
      : [],
  };
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatActionType(t: string): string {
  return t
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export default function AdminOnlineRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quote form
  const [discountAmount, setDiscountAmount] = useState("0");
  const [deliveryCost, setDeliveryCost] = useState("0");

  // Approval form
  const [approvalNotes, setApprovalNotes] = useState("");
  const [createTransaction, setCreateTransaction] = useState(true);

  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  // Complete form
  const [completeNotes, setCompleteNotes] = useState("");

  // Confirmation dialogs
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getAdminOnlineRequest(id);
      setDetail(parseDetail(payload));
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load online request."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keyboard shortcuts
  useRequestKeyboardShortcuts({
    "Ctrl+Enter": () => {
      if (detail?.can_approve) {
        setShowApproveDialog(true);
      }
    },
    "D": () => {
      if (showRejectForm) {
        setShowRejectDialog(true);
      }
    },
    "S": () => {
      if (showSendQuote) {
        void runAction("Quote sent to customer", () => adminSendQuote(id));
      }
    },
    "Q": () => {
      if (showQuoteForm) {
        void runAction("Quote generated", () =>
          adminGenerateQuote(id, {
            discount_amount: Number(discountAmount) || 0,
            delivery_cost: Number(deliveryCost) || 0,
          }),
        );
      }
    },
    "R": refresh,
    "Escape": () => {
      setShowApproveDialog(false);
      setShowRejectDialog(false);
    },
  });

  async function runAction(label: string, action: () => Promise<unknown>) {
    setBanner(null);
    setError(null);
    setBusy(true);
    try {
      await action();
      setBanner(label);
      await refresh();
    } catch (err) {
      setError(accountingErrorMessage(err, `${label} failed.`));
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <ERPPageShell
        eyebrow="Requests"
        title="Invalid request"
        breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }]}
      >
        <div className="text-sm text-destructive">Missing request ID.</div>
      </ERPPageShell>
    );
  }

  const st = detail?.status ?? "";
  const showQuoteForm = st === "DRAFT";
  const showSendQuote = st === "DRAFT" && Number(detail?.total_amount ?? 0) > 0;
  const showApproveForm = detail?.can_approve === true;
  const showRejectForm = ["DRAFT", "QUOTE_SENT", "QUOTE_ACCEPTED"].includes(st);
  const showCompleteForm = st === "APPROVED";

  return (
    <ERPPageShell
      eyebrow="Requests"
      title={detail?.request_number || `Request #${id}`}
      subtitle={detail ? `${detail.request_type_display} request from ${detail.customer_name}` : undefined}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Requests Hub", href: ROUTES.admin.requestsHub },
        { label: "Online Requests", href: ROUTES.admin.requestsOnlineRequests },
        { label: detail?.request_number || `#${id}` },
      ]}
      actions={[
        { href: ROUTES.admin.requestsOnlineRequests, label: "Back to list", variant: "secondary" },
      ]}
      stats={
        detail
          ? [
              { label: "Status", value: detail.status_display, tone: "info" as const },
              { label: "Request Type", value: detail.request_type_display, tone: "info" as const },
              { label: "Total Amount", value: formatRupee(detail.total_amount), tone: "success" as const },
            ]
          : undefined
      }
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {banner ? (
        <div className="mb-4 rounded-xl border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
          {banner}
        </div>
      ) : null}
      {error ? <ERPErrorState title="Error" description={error} /> : null}
      {loading ? <ERPLoadingState label="Loading request..." /> : null}

      {!loading && detail ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Content - Left Column (3/4 width) */}
          <div className="xl:col-span-3 space-y-6">
          {/* Step Indicator */}
          <StepIndicator
            steps={[
              { id: "draft", label: "Draft", description: "Request created" },
              { id: "quote_sent", label: "Quote Sent", description: "Awaiting customer response" },
              { id: "quote_accepted", label: "Quote Accepted", description: "Customer approved" },
              { id: "approved", label: "Approved", description: "Ready for execution" },
              { id: "completed", label: "Completed", description: "Fully fulfilled" },
            ]}
            currentStep={detail.status.toLowerCase()}
            allowBacktrack={false}
          />

          {/* Customer Details Card */}
          {detail.customer > 0 && (
            <CustomerDetailsCard
              customer={{
                id: detail.customer,
                name: detail.customer_name,
                phone: "",
                email: "",
                address: "",
                status: "active",
              }}
            />
          )}

          {/* Request overview */}
          <ERPSectionShell title="Request details">
            <div className="grid gap-4 md:grid-cols-3">
              <InfoRow label="Request Number">{detail.request_number}</InfoRow>
              <InfoRow label="Customer">
                <Link href={`${ROUTES.admin.customers}/${detail.customer}`} className="text-primary hover:underline">
                  {detail.customer_name}
                </Link>
              </InfoRow>
              <InfoRow label="Product">
                <Link href={`${ROUTES.admin.products}/${detail.product}`} className="text-primary hover:underline">
                  {detail.product_name}
                </Link>
              </InfoRow>
              <InfoRow label="Request Type">
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                  {detail.request_type_display}
                </span>
              </InfoRow>
              <InfoRow label="Status">
                <RequestStatusBadge status={detail.status} size="md" />
              </InfoRow>
              <InfoRow label="Quantity">{detail.quantity}</InfoRow>
              {detail.preferred_tenure != null ? (
                <InfoRow label="Preferred Tenure">{detail.preferred_tenure} months</InfoRow>
              ) : null}
              {detail.preferred_lucky_number ? (
                <InfoRow label="Preferred Lucky #">{detail.preferred_lucky_number}</InfoRow>
              ) : null}
              {detail.batch_name ? <InfoRow label="Batch">{detail.batch_name}</InfoRow> : null}
              <InfoRow label="Created">{formatDateTime(detail.created_at)}</InfoRow>
              <InfoRow label="Updated">{formatDateTime(detail.updated_at)}</InfoRow>
            </div>
          </ERPSectionShell>

          {/* Pricing breakdown */}
          <PricingBreakdownCard
            unitPrice={detail.unit_price}
            subTotal={detail.sub_total}
            taxPercentage={detail.tax_percentage}
            gstAmount={detail.gst_amount}
            deliveryCost={detail.delivery_cost}
            discountAmount={detail.discount_amount}
            totalAmount={detail.total_amount}
            quantity={detail.quantity}
            title="Pricing Breakdown"
          />
          {detail.quote_expiry_date ? (
            <div className={`text-xs p-3 rounded-xl border ${detail.is_quote_expired ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-200 bg-amber-50/50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"}`}>
              Quote {detail.is_quote_expired ? "expired" : "expires"}: {formatDateTime(detail.quote_expiry_date)}
            </div>
          ) : null}

          {/* Approval info */}
          {detail.approved_by_name ? (
            <ERPSectionShell title="Approval">
              <div className="grid gap-4 md:grid-cols-3">
                <InfoRow label="Approved By">{detail.approved_by_name}</InfoRow>
                <InfoRow label="Approved At">{formatDateTime(detail.approved_at)}</InfoRow>
                {detail.approval_notes ? <InfoRow label="Notes">{detail.approval_notes}</InfoRow> : null}
              </div>
            </ERPSectionShell>
          ) : null}

          {/* Workflow Actions */}
          {(showQuoteForm || showApproveForm || showRejectForm || showCompleteForm) && (
            <RequestWorkflowCard
              actions={[
                ...(showQuoteForm
                  ? [
                      {
                        id: "generate-quote",
                        label: "Generate Quote",
                        description: "Calculate pricing with discount and delivery cost",
                        color: "primary" as const,
                        onClick: () => {
                          void runAction("Quote generated", () =>
                            adminGenerateQuote(id, {
                              discount_amount: Number(discountAmount) || 0,
                              delivery_cost: Number(deliveryCost) || 0,
                            }),
                          );
                        },
                        disabled: busy,
                      },
                    ]
                  : []),
                ...(showSendQuote
                  ? [
                      {
                        id: "send-quote",
                        label: "Send Quote to Customer",
                        description: "Send generated quote for approval",
                        color: "primary" as const,
                        onClick: () => void runAction("Quote sent to customer", () => adminSendQuote(id)),
                        disabled: busy,
                      },
                    ]
                  : []),
                ...(showApproveForm
                  ? [
                      {
                        id: "approve",
                        label: "Approve Request",
                        description: "Auto-create subscription or direct sale",
                        color: "success" as const,
                        onClick: () => setShowApproveDialog(true),
                        disabled: busy,
                      },
                    ]
                  : []),
                ...(showRejectForm
                  ? [
                      {
                        id: "reject",
                        label: "Reject Request",
                        description: "Decline this request",
                        color: "danger" as const,
                        onClick: () => setShowRejectDialog(true),
                        disabled: busy,
                      },
                    ]
                  : []),
                ...(showCompleteForm
                  ? [
                      {
                        id: "complete",
                        label: "Mark Complete",
                        description: "Mark request as fulfilled",
                        color: "primary" as const,
                        onClick: () =>
                          void runAction("Request completed", () =>
                            adminCompleteRequest(id, { notes: completeNotes }),
                          ),
                        disabled: busy,
                      },
                    ]
                  : []),
              ]}
            />
          )}

          {/* Quote form inputs */}
          {showQuoteForm ? (
            <ERPSectionShell
              title="Quote Parameters"
              description="Optional discount and delivery cost adjustments"
            >
              <div className="grid gap-3 md:grid-cols-2 max-w-md">
                <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Discount amount
                  <input
                    className="mt-1 h-10 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none transition focus:border-ring"
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                  />
                </label>
                <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Delivery cost
                  <input
                    className="mt-1 h-10 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none transition focus:border-ring"
                    type="number"
                    min="0"
                    step="0.01"
                    value={deliveryCost}
                    onChange={(e) => setDeliveryCost(e.target.value)}
                  />
                </label>
              </div>
            </ERPSectionShell>
          ) : null}

          {st === "QUOTE_SENT" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              Quote has been sent to the customer. Waiting for them to accept or the quote to expire.
              {detail.quote_expiry_date ? (
                <span className="ml-1 font-medium">Expires: {formatDateTime(detail.quote_expiry_date)}</span>
              ) : null}
            </div>
          ) : null}

          {/* Approval inputs */}
          {showApproveForm ? (
            <ERPSectionShell
              title="Approval Configuration"
              description="Configure how the approval should be processed"
            >
              <div className="max-w-md space-y-3">
                <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Approval notes (optional)
                  <textarea
                    className="mt-1 min-h-[80px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition focus:border-ring resize-y"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Any notes for this approval..."
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createTransaction}
                    onChange={(e) => setCreateTransaction(e.target.checked)}
                    className="rounded"
                  />
                  Auto-create {detail.request_type === "DIRECT_SALE" ? "direct sale" : "subscription"} on approval
                </label>
              </div>
            </ERPSectionShell>
          ) : null}

          {/* Rejection inputs */}
          {showRejectForm ? (
            <ERPSectionShell title="Rejection Configuration">
              <div className="max-w-md">
                <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Rejection reason (optional)
                  <textarea
                    className="mt-1 min-h-[60px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition focus:border-ring resize-y"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection..."
                  />
                </label>
              </div>
            </ERPSectionShell>
          ) : null}

          {/* Completion inputs */}
          {showCompleteForm ? (
            <ERPSectionShell title="Completion Configuration">
              <div className="max-w-md">
                <label className="flex flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Completion notes (optional)
                  <textarea
                    className="mt-1 min-h-[60px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground outline-none transition focus:border-ring resize-y"
                    value={completeNotes}
                    onChange={(e) => setCompleteNotes(e.target.value)}
                    placeholder="Completion notes..."
                  />
                </label>
              </div>
            </ERPSectionShell>
          ) : null}

          {/* Confirmation Dialogs */}
          <ApprovalConfirmDialog
            isOpen={showApproveDialog}
            onClose={() => setShowApproveDialog(false)}
            onApprove={() => {
              void runAction("Request approved", () =>
                adminApproveRequest(id, {
                  approval_notes: approvalNotes,
                  create_transaction: createTransaction,
                }),
              );
              setShowApproveDialog(false);
            }}
            onReject={() => setShowApproveDialog(false)}
            title="Approve Online Request?"
            description={`Confirm approval of ${detail.request_number}. This will ${detail.request_type === "DIRECT_SALE" ? "create a direct sale transaction" : "create a subscription"}.`}
          />

          <ApprovalConfirmDialog
            isOpen={showRejectDialog}
            onClose={() => setShowRejectDialog(false)}
            onApprove={() => {
              void runAction("Request rejected", () =>
                adminRejectRequest(id, { reason: rejectReason }),
              );
              setShowRejectDialog(false);
            }}
            onReject={() => setShowRejectDialog(false)}
            title="Reject Online Request?"
            description={`Confirm rejection of ${detail.request_number}. This action cannot be undone.`}
          />

          {/* Action History */}
          <RequestActionHistory
            actions={detail.actions.map((a) => ({
              id: a.id,
              actionType: a.action_type,
              performedByName: a.performed_by_name,
              notes: a.notes,
              createdAt: a.created_at,
            }))}
            title="Activity Log"
            isCollapsible={true}
          />
          </div>

          {/* Right Sidebar - Fixed Desktop Sidebar (1/4 width) */}
          <div className="xl:col-span-1">
            <div className="sticky top-20 space-y-4">
              {/* Status Summary Card */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4">Request Status</h3>
                <RequestStatusBadge
                  status={detail?.status || ""}
                  size="lg"
                  animated={["DRAFT", "QUOTE_SENT"].includes(detail?.status || "")}
                />
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-semibold">{detail?.request_type_display}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-semibold">{formatRupee(detail?.total_amount || "0")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-semibold text-xs">{detail?.customer_name}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              {(showQuoteForm || showApproveForm || showRejectForm || showCompleteForm) && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    {showQuoteForm && (
                      <button
                        onClick={() => {
                          void runAction("Quote generated", () =>
                            adminGenerateQuote(id, {
                              discount_amount: Number(discountAmount) || 0,
                              delivery_cost: Number(deliveryCost) || 0,
                            }),
                          );
                        }}
                        className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition"
                      >
                        Generate Quote
                      </button>
                    )}
                    {showSendQuote && (
                      <button
                        onClick={() => void runAction("Quote sent to customer", () => adminSendQuote(id))}
                        className="w-full h-10 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition"
                      >
                        Send Quote
                      </button>
                    )}
                    {showApproveForm && (
                      <button
                        onClick={() => setShowApproveDialog(true)}
                        className="w-full h-10 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition"
                      >
                        Approve (Ctrl+⏎)
                      </button>
                    )}
                    {showRejectForm && (
                      <button
                        onClick={() => setShowRejectDialog(true)}
                        className="w-full h-10 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition"
                      >
                        Reject (D)
                      </button>
                    )}
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
        </div>
      ) : null}
    </ERPPageShell>
  );
}
