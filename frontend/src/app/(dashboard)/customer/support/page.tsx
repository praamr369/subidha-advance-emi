"use client";

import Link from "next/link";
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
import PortalPage from "@/components/ui/PortalPage";
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

function supportStatusTone(status: string | null | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "CLOSED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "UNDER_REVIEW":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function isCategory(value: string | null): value is (typeof CATEGORY_OPTIONS)[number]["value"] {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

function SupportSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
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
  const [submitSuccess, setSubmitSuccess] = useState<CustomerSupportRequest | null>(null);

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
          paymentParam ? getCustomerPaymentDetail(paymentParam) : Promise.resolve(null),
        ]);

        if (requestsResult.status === "fulfilled") {
          setRequests(requestsResult.value.results);
          setRequestsError(null);
        } else {
          setRequests([]);
          setRequestsError(
            toErrorMessage(requestsResult.reason, "Failed to load your support requests.")
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
      title="Support"
      subtitle="Submit a payment or subscription issue from your own account with optional receipt context."
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
          label: "My Subscriptions",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Customer Support Intake", tone: "info" }}
      stats={[
        { label: "Submitted Requests", value: String(requests.length) },
        {
          label: "Receipt Context",
          value: receiptReference || "General request",
        },
        {
          label: "Subscription",
          value: resolvedSubscriptionId ? `SUB-${resolvedSubscriptionId}` : "—",
        },
      ]}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading support workspace..." /> : null}

        {!loading ? (
          <>
            {requestsError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {requestsError}
              </div>
            ) : null}

            {contextError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {contextError}
              </div>
            ) : null}

            <SupportSection
              title="Submit an issue"
              description="Use this form when a payment, receipt, EMI, or subscription detail needs branch follow-up."
            >
              {paymentContext ? (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Receipt context loaded:
                  {" "}
                  {receiptReference ? `Ref ${receiptReference}` : `Payment #${paymentContext.id}`}
                  {" · "}
                  {money(paymentContext.amount)}
                  {" · "}
                  {paymentContext.method || "—"}
                  {resolvedSubscriptionId ? ` · SUB-${resolvedSubscriptionId}` : ""}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="support-category"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Issue category
                    </label>
                    <select
                      id="support-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Attached context
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      {receiptReference || "No payment receipt attached"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {resolvedSubscriptionId ? `SUB-${resolvedSubscriptionId}` : "General account query"}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="support-message"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
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

                {submitError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {submitError}
                  </div>
                ) : null}

                {submitSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <div>Support request #{submitSuccess.id} submitted successfully.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/customer/support/${submitSuccess.id}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                      >
                        Open Request
                      </Link>
                      {paymentContext ? (
                        <Link
                          href={`/customer/payments/${paymentContext.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                        >
                          Back to Receipt
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Submit Support Request"}
                  </button>

                  {paymentContext ? (
                    <Link
                      href={`/customer/payments/${paymentContext.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Return to Receipt
                    </Link>
                  ) : null}
                </div>
              </form>
            </SupportSection>

            <SupportSection
              title="Recent support requests"
              description="These are the support/dispute requests already submitted from your account."
            >
              {requests.length === 0 ? (
                <EmptyState
                  title="No support requests yet"
                  description="Your submitted issues will appear here after you send them."
                />
              ) : (
                <div className="space-y-3">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-xl border border-border bg-background px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-foreground">
                          Request #{request.id}
                        </div>
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                            supportStatusTone(request.status),
                          ].join(" ")}
                        >
                          {request.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-foreground">
                        {request.message}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/customer/support/${request.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          View Detail
                        </Link>
                        {request.payment ? (
                          <Link
                            href={`/customer/payments/${request.payment}`}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Receipt
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SupportSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
