"use client";

import { RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import FormActions from "@/components/ui/FormActions";
import FormSection from "@/components/ui/FormSection";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  createCustomerSupportRequest,
  getCustomerPaymentDetail,
  listCustomerSupportRequests,
  type CustomerPayment,
  type CustomerSupportRequest,
} from "@/services/customer";

const CATEGORY_OPTIONS = [
  { value: "PAYMENT_ISSUE", label: "Payment issue" },
  { value: "RECEIPT_ISSUE", label: "Receipt issue" },
  { value: "EMI_ISSUE", label: "EMI issue" },
  { value: "SUBSCRIPTION_QUERY", label: "Subscription query" },
  { value: "DRAW_QUERY", label: "Lucky draw query" },
  { value: "OTHER", label: "Other" },
] as const;

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
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

function formatCategoryLabel(value: string | null | undefined): string {
  return (value || "OTHER").replaceAll("_", " ");
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isCategory(
  value: string | null
): value is (typeof CATEGORY_OPTIONS)[number]["value"] {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

export default function CustomerSupportPage() {
  const searchParams = useSearchParams();

  const paymentParam = (searchParams.get("payment") || "").trim();
  const subscriptionParam = (searchParams.get("subscription") || "").trim();
  const categoryParam = searchParams.get("category");

  const defaultCategory = isCategory(categoryParam) ? categoryParam : "OTHER";

  const [paymentContext, setPaymentContext] = useState<CustomerPayment | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [requests, setRequests] = useState<CustomerSupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(defaultCategory);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] =
    useState<CustomerSupportRequest | null>(null);

  useEffect(() => {
    setCategory(defaultCategory);
  }, [defaultCategory]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [requestsResult, paymentResult] = await Promise.allSettled([
          listCustomerSupportRequests(),
          paymentParam
            ? getCustomerPaymentDetail(paymentParam)
            : Promise.resolve(null),
        ]);

        if (requestsResult.status === "fulfilled") {
          setRequests(requestsResult.value.results);
          setRequestsError(null);
        } else {
          setRequests([]);
          setRequestsError(
            toErrorMessage(
              requestsResult.reason,
              "Failed to load your support requests."
            )
          );
        }

        if (paymentResult.status === "fulfilled") {
          setPaymentContext(paymentResult.value);
          setContextError(null);
        } else if (paymentParam) {
          setPaymentContext(null);
          setContextError(
            "The payment context from the receipt could not be loaded. You can still submit a general support request."
          );
        } else {
          setPaymentContext(null);
          setContextError(null);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [paymentParam]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const resolvedSubscriptionId = useMemo(() => {
    if (paymentContext?.subscription_id) return paymentContext.subscription_id;
    if (paymentContext?.subscription) return paymentContext.subscription;

    const parsed = Number(subscriptionParam);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [paymentContext, subscriptionParam]);

  const receiptReference = useMemo(() => {
    if (!paymentContext) return null;
    return paymentContext.reference_no || `AUTO-${paymentContext.id}`;
  }, [paymentContext]);

  const openRequests = useMemo(
    () => requests.filter((request) => String(request.status).toUpperCase() !== "CLOSED").length,
    [requests]
  );

  const closedRequests = useMemo(
    () => requests.filter((request) => String(request.status).toUpperCase() === "CLOSED").length,
    [requests]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) {
      setSubmitError("Issue details are required.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await createCustomerSupportRequest({
        payment: paymentContext?.id,
        subscription: resolvedSubscriptionId ?? undefined,
        category,
        message: message.trim(),
      });

      setSubmitSuccess(response.request);
      setRequests((current) => [response.request, ...current]);
      setMessage("");
    } catch (err) {
      setSubmitError(toErrorMessage(err, "Failed to submit support request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Customer Support"
      title="Support Workspace"
      subtitle="Submit payment or subscription issues from your own account, with receipt context when available, and track current branch follow-up."
      helperNote="Support requests stay separate from payment truth. Receipts and subscriptions remain the source records while support tracks investigation and resolution."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Support" },
      ]}
      actions={[
        paymentContext
          ? {
              href: `/customer/payments/${paymentContext.id}`,
              label: "Back to Receipt",
              variant: "primary",
            }
          : {
              href: "/customer/payments",
              label: "My Payments",
              variant: "primary",
            },
        {
          href: "/customer/subscriptions",
          label: "Subscriptions",
          variant: "secondary",
        },
        {
          href: "/customer/subscription-requests",
          label: "Requests",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Customer support scope", tone: "info" }}
      stats={[
        { label: "Total requests", value: String(requests.length) },
        {
          label: "Open requests",
          value: String(openRequests),
          tone: openRequests > 0 ? "warning" : "default",
        },
        {
          label: "Closed requests",
          value: String(closedRequests),
          tone: closedRequests > 0 ? "success" : "default",
        },
        {
          label: "Receipt context",
          value: receiptReference || "General request",
          tone: receiptReference ? "info" : "default",
        },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Context in scope"
          description="Support is limited to customer-visible receipts and subscriptions inside your own account."
          action={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          {requestsError ? (
            <WorkspaceNotice tone="warning" title="Support register unavailable">
              {requestsError}
            </WorkspaceNotice>
          ) : null}

          {contextError ? (
            <WorkspaceNotice tone="warning" title="Receipt context unavailable">
              {contextError}
            </WorkspaceNotice>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem
              label="Receipt"
              value={receiptReference ? `Ref ${receiptReference}` : "No receipt attached"}
            />
            <DetailItem
              label="Subscription"
              value={resolvedSubscriptionId ? `SUB-${resolvedSubscriptionId}` : "General account query"}
            />
            <DetailItem
              label="Payment amount"
              value={paymentContext ? money(paymentContext.amount) : "—"}
            />
            <DetailItem
              label="Payment method"
              value={paymentContext?.method || "—"}
            />
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading support workspace..." /> : null}

        {!loading ? (
          <>
            <WorkspaceSection
              title="Submit a support request"
              description="Use the shared intake form to flag payment, receipt, EMI, or subscription issues for branch review."
            >
              {submitError ? (
                <WorkspaceNotice tone="danger" title="Unable to submit request">
                  {submitError}
                </WorkspaceNotice>
              ) : null}

              {submitSuccess ? (
                <WorkspaceNotice
                  tone="success"
                  title={`Support request #${submitSuccess.id} submitted`}
                  action={
                    <ActionButton href={`/customer/support/${submitSuccess.id}`} variant="outline">
                      Open request
                    </ActionButton>
                  }
                >
                  The request is now visible in your customer support register and stays linked to the selected receipt or subscription context.
                </WorkspaceNotice>
              ) : null}

              <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                  <FormSection
                    title="Request scope"
                    description="Issue category and linked receipt context are stored with the support request."
                    columns={2}
                  >
                    <div className="space-y-2">
                      <label htmlFor="support-category" className="text-sm font-medium text-foreground">
                        Issue category
                      </label>
                      <select
                        id="support-category"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                      >
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                      <div className="enterprise-eyebrow">Attached context</div>
                      <div className="mt-2 text-sm font-medium text-foreground">
                        {receiptReference || "No payment receipt attached"}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {resolvedSubscriptionId
                          ? `Subscription SUB-${resolvedSubscriptionId}`
                          : "General account query"}
                      </div>
                    </div>
                  </FormSection>

                  <FormSection
                    title="Issue details"
                    description="Describe what looks incorrect and include any timing or expected outcome that helps branch review."
                    columns={1}
                  >
                    <div className="space-y-2">
                      <label htmlFor="support-message" className="text-sm font-medium text-foreground">
                        What needs to be checked?
                      </label>
                      <textarea
                        id="support-message"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={6}
                        placeholder="Describe the issue clearly. Include what you expected, what looks incorrect, and any timing detail that may help branch review."
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                      />
                    </div>
                  </FormSection>

                  <FormActions
                    submitLabel="Submit support request"
                    submitLoadingLabel="Submitting..."
                    submitting={submitting}
                    align="between"
                    extraActions={
                      <ActionButton href="/customer/support" variant="outline">
                        Support register
                      </ActionButton>
                    }
                    cancel={
                      paymentContext
                        ? {
                            label: "Return to receipt",
                            href: `/customer/payments/${paymentContext.id}`,
                          }
                        : null
                    }
                  />
                </div>
              </form>
            </WorkspaceSection>

            <WorkspaceSection
              title="Recent support requests"
              description="Latest customer-submitted requests with direct links back to receipt and subscription detail."
            >
              {requests.length === 0 ? (
                <EmptyState
                  title="No support requests yet"
                  description="Your submitted issues will appear here after you send them."
                />
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <article
                      key={request.id}
                      className="rounded-[1.45rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_82%,white_18%)] bg-[linear-gradient(180deg,color-mix(in_oklab,white_98%,var(--surface-muted)_2%),color-mix(in_oklab,var(--surface-card-soft)_82%,var(--surface-muted)_18%))] p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.28)]"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">
                              Request #{request.id}
                            </p>
                            <StatusBadge status={request.status} />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            {request.message}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{formatCategoryLabel(request.category)}</span>
                            <span>{formatDateTime(request.created_at)}</span>
                            <span>
                              {request.payment_reference_no
                                ? `Ref ${request.payment_reference_no}`
                                : request.payment
                                  ? `Payment #${request.payment}`
                                  : "No payment attached"}
                            </span>
                            <span>
                              {request.subscription_number ||
                                (request.subscription
                                  ? `SUB-${request.subscription}`
                                  : "No subscription attached")}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton href={`/customer/support/${request.id}`} variant="outline">
                            View detail
                          </ActionButton>
                          {request.payment ? (
                            <ActionButton
                              href={`/customer/payments/${request.payment}`}
                              variant="outline"
                            >
                              Receipt
                            </ActionButton>
                          ) : null}
                          {request.subscription ? (
                            <ActionButton
                              href={`/customer/subscriptions/${request.subscription}`}
                              variant="outline"
                            >
                              Subscription
                            </ActionButton>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
