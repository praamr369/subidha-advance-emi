"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import {
  getCustomerSupportRequest,
  type CustomerSupportRequest,
} from "@/services/customer";

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load support request detail.";
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function SectionCard({
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

export default function CustomerSupportRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = Number(params?.id ?? 0);

  const [supportRequest, setSupportRequest] = useState<CustomerSupportRequest | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(requestId) || requestId <= 0) {
        setSupportRequest(null);
        setError("Invalid support request id.");
        setLoading(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getCustomerSupportRequest(requestId);
        setSupportRequest(payload);
        setError(null);
      } catch (err) {
        setSupportRequest(null);
        setError(toErrorMessage(err));
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [requestId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  return (
    <PortalPage
      title={
        supportRequest
          ? `Support Request #${supportRequest.id}`
          : "Support Request Detail"
      }
      subtitle="Track the current status of a support/dispute request submitted from your own account."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Support", href: "/customer/support" },
        {
          label: supportRequest
            ? `Request #${supportRequest.id}`
            : "Request Detail",
        },
      ]}
      actions={[
        {
          href: "/customer/support",
          label: "Back to Support",
          variant: "primary",
        },
        supportRequest?.payment
          ? {
              href: `/customer/payments/${supportRequest.payment}`,
              label: "Receipt",
              variant: "secondary",
            }
          : {
              href: "/customer/payments",
              label: "Payments",
              variant: "secondary",
            },
        supportRequest?.subscription
          ? {
              href: `/customer/subscriptions/${supportRequest.subscription}`,
              label: "Subscription",
              variant: "secondary",
            }
          : {
              href: "/customer/subscriptions",
              label: "Subscriptions",
              variant: "secondary",
            },
      ]}
      stats={[
        {
          label: "Status",
          value: supportRequest?.status || "—",
          tone:
            supportRequest?.status === "CLOSED"
              ? "success"
              : supportRequest?.status === "UNDER_REVIEW"
                ? "info"
                : "warning",
        },
        {
          label: "Category",
          value: formatCategoryLabel(supportRequest?.category),
        },
        {
          label: "Submitted",
          value: formatDateTime(supportRequest?.created_at),
        },
        {
          label: "Updated",
          value: formatDateTime(supportRequest?.updated_at),
        },
      ]}
      statusBadge={{ label: "Customer Support Tracking", tone: "info" }}
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

        {loading ? <LoadingBlock label="Loading support request..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load support request"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !supportRequest ? (
          <EmptyState
            title="Support request not found"
            description="The requested support record could not be loaded from your account."
          />
        ) : null}

        {!loading && !error && supportRequest ? (
          <>
            <SectionCard
              title="Request Status"
              description="This shows the current state of the support/dispute request submitted from your account."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Request Reference" value={`Request #${supportRequest.id}`} />
                <DetailValue
                  label="Status"
                  value={
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        supportStatusTone(supportRequest.status),
                      ].join(" ")}
                    >
                      {supportRequest.status}
                    </span>
                  }
                />
                <DetailValue
                  label="Submitted At"
                  value={formatDateTime(supportRequest.created_at)}
                />
                <DetailValue
                  label="Last Updated"
                  value={formatDateTime(supportRequest.updated_at)}
                />
              </div>
            </SectionCard>

            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Issue Details"
                description="The exact issue information submitted from your side."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailValue
                    label="Category"
                    value={formatCategoryLabel(supportRequest.category)}
                  />
                  <DetailValue
                    label="Linked Payment"
                    value={
                      supportRequest.payment_reference_no
                        ? `Ref ${supportRequest.payment_reference_no}`
                        : supportRequest.payment
                          ? `Payment #${supportRequest.payment}`
                          : "No payment attached"
                    }
                  />
                  <DetailValue
                    label="Linked Subscription"
                    value={
                      supportRequest.subscription_number ||
                      (supportRequest.subscription
                        ? `SUB-${supportRequest.subscription}`
                        : "No subscription attached")
                    }
                  />
                  <DetailValue
                    label="Payment Date"
                    value={formatDateTime(supportRequest.payment_date)}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Submitted Message
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {supportRequest.message || "No message submitted."}
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Resolution"
                description="A resolution summary appears here once the branch closes the request."
              >
                {supportRequest.status === "CLOSED" ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      This support request has been closed.
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailValue
                        label="Resolved At"
                        value={formatDateTime(supportRequest.resolved_at)}
                      />
                      <DetailValue
                        label="Current Status"
                        value={supportRequest.status}
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Resolution Summary
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                        {supportRequest.resolution_summary ||
                          "The request was closed without a customer-visible summary."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Resolution pending"
                    description="The branch has not closed this request yet. Check back here later for the final resolution summary."
                  />
                )}
              </SectionCard>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
