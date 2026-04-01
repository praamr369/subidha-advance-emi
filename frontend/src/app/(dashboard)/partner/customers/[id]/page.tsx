"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  getPartnerCustomerDetail,
  type PartnerCustomerDetailResponse,
  type PartnerPayment,
  type PartnerSubscription,
} from "@/services/partner";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner customer detail.";
}

type SubscriptionRow = PartnerSubscription;
type PaymentRow = PartnerPayment;

export default function PartnerCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id;

  const [data, setData] = useState<PartnerCustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        if (!customerId) {
          throw new Error("Missing customer id.");
        }

        const payload = await getPartnerCustomerDetail(customerId);
        setData(payload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setData(null);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [customerId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const customer = data?.customer;
  const summary = data?.summary;
  const subscriptions = data?.subscriptions ?? [];
  const recentPayments = data?.recent_payments ?? [];

  const subscriptionColumns = useMemo<Column<SubscriptionRow>[]>(
    () => [
      {
        key: "subscription_number",
        title: "Subscription",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.id}`}
            </div>
            <div className="text-xs text-muted-foreground">
              Lucky #{row.lucky_number ?? "—"}
            </div>
          </div>
        ),
      },
      {
        key: "product_name",
        title: "Product / Batch",
        render: (row) => (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {row.product_name || "—"}
            </div>
            <StatusBadge
              status={row.batch_status || "OPEN"}
              label={row.batch_code || "No batch"}
            />
          </div>
        ),
      },
      {
        key: "monthly_amount",
        title: "Financial",
        align: "right",
        render: (row) => (
          <div className="space-y-1 text-right">
            <div className="font-semibold text-foreground">
              {money(row.monthly_amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total {money(row.total_amount)}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Contract State",
        sortable: true,
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={row.status || "PENDING"} />
            {row.outstanding_amount ? (
              <StatusBadge
                status="PENDING"
                label={`Outstanding ${money(row.outstanding_amount)}`}
              />
            ) : null}
          </div>
        ),
      },
      {
        key: "start_date",
        title: "Timing",
        render: (row) => (
          <div className="space-y-1">
            <div className="text-sm text-foreground">Start {formatDate(row.start_date)}</div>
            <div className="text-xs text-muted-foreground">
              Next due {formatDate(row.next_due_date)}
            </div>
          </div>
        ),
      },
    ],
    []
  );

  const paymentColumns = useMemo<Column<PaymentRow>[]>(
    () => [
      {
        key: "id",
        title: "Payment",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="text-xs text-muted-foreground">
              Ref {row.reference_no || `AUTO-${row.id}`}
            </div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.subscription}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.batch_code || "No batch"}
            </div>
          </div>
        ),
      },
      {
        key: "method",
        title: "Method",
        render: (row) => row.method || "—",
      },
      {
        key: "payment_date",
        title: "Recorded",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.created_at || row.payment_date || "") || 0,
        render: (row) => formatDateTime(row.created_at || row.payment_date),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        sortable: true,
        sortAccessor: (row) => Number(row.amount || 0),
        render: (row) => money(row.amount),
      },
    ],
    []
  );

  return (
    <PortalPage
      title={customer ? customer.name : "Partner Customer Detail"}
      subtitle="Partner-scoped customer detail with linked subscriptions, EMI summary, and verified payment activity only."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Customers", href: "/partner/customers" },
        { label: customer?.name || "Detail" },
      ]}
      actions={[
        {
          href: "/partner/customers",
          label: "Back to Customers",
          variant: "secondary",
        },
        customer
          ? {
              href: `/partner/payments?customer=${customer.id}`,
              label: "Customer Payments",
              variant: "primary",
            }
          : {
              href: "/partner/payments",
              label: "Payments",
              variant: "primary",
            },
        customer
          ? {
              href: `/partner/subscriptions?customer=${customer.id}`,
              label: "Customer Subscriptions",
              variant: "secondary",
            }
          : {
              href: "/partner/subscriptions",
              label: "Subscriptions",
              variant: "secondary",
            },
      ]}
      stats={[
        { label: "Subscriptions", value: summary?.total_subscriptions ?? "—" },
        { label: "Active", value: summary?.active_subscriptions ?? "—", tone: "success" },
        { label: "Pending EMIs", value: summary?.pending_emis ?? "—", tone: "warning" },
        { label: "Collected", value: money(summary?.total_collected), tone: "success" },
      ]}
      statusBadge={{ label: "Partner Scope", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Paid EMIs"
            value={summary?.paid_emis ?? 0}
            icon={<Wallet className="h-4 w-4" />}
            tone="success"
          />
          <StatCard
            label="Waived EMIs"
            value={summary?.waived_emis ?? 0}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="info"
          />
          <StatCard
            label="Won"
            value={summary?.won_subscriptions ?? 0}
            icon={<Users className="h-4 w-4" />}
            tone={(summary?.won_subscriptions ?? 0) > 0 ? "info" : "default"}
          />
          <StatCard
            label="Defaulted"
            value={summary?.defaulted_subscriptions ?? 0}
            icon={<CreditCard className="h-4 w-4" />}
            tone={(summary?.defaulted_subscriptions ?? 0) > 0 ? "warning" : "default"}
          />
        </div>

        <WorkspaceSection
          title="Customer summary"
          description="This page is read-only within partner scope and excludes admin-only customer controls."
          action={
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Name" value={customer?.name || "—"} />
            <DetailItem label="Phone" value={customer?.phone || "—"} />
            <DetailItem
              label="KYC"
              value={<StatusBadge status={customer?.kyc_status || "NOT_PROVIDED"} />}
            />
            <DetailItem label="Linked Since" value={formatDate(customer?.created_at)} />
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading partner customer detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load customer detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !data ? (
          <EmptyState
            title="Customer not found"
            description="The requested customer is not visible within this partner scope."
          />
        ) : null}

        {!loading && !error && data ? (
          <>
            <WorkspaceSection
              title="Partner-linked subscriptions"
              description="Only subscriptions attributed to this partner are visible here."
              action={
                customer ? (
                  <Link
                    href={`/partner/subscriptions?customer=${customer.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    View All
                  </Link>
                ) : undefined
              }
            >
              {subscriptions.length === 0 ? (
                <EmptyState
                  title="No subscriptions"
                  description="No partner-linked subscriptions were returned for this customer."
                />
              ) : (
                <DataTable<SubscriptionRow>
                  rows={subscriptions}
                  columns={subscriptionColumns}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/partner/subscriptions/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View Detail
                      </Link>
                      <Link
                        href={`/partner/collections/create?subscription=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Collect
                      </Link>
                      <Link
                        href={`/partner/payments?subscription=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payments
                      </Link>
                    </div>
                  )}
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Recent verified payments"
              description="Partner-visible payment activity excludes reversed rows and stays inside this customer scope."
              action={
                customer ? (
                  <Link
                    href={`/partner/payments?customer=${customer.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    View All Payments
                  </Link>
                ) : undefined
              }
            >
              {recentPayments.length === 0 ? (
                <EmptyState
                  title="No verified payments"
                  description="No partner-visible payment rows have been recorded for this customer yet."
                />
              ) : (
                <DataTable<PaymentRow>
                  rows={recentPayments}
                  columns={paymentColumns}
                  rowActions={(row) => (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/partner/payments/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View Detail
                      </Link>
                      <Link
                        href={`/partner/subscriptions/${row.subscription}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Subscription
                      </Link>
                    </div>
                  )}
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
