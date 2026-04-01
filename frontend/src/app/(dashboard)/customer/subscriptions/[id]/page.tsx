"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import DataTable from "@/components/ui/DataTable";

import {
  getCustomerSubscription,
  type CustomerSubscription,
  type CustomerEmi,
} from "@/services/customer";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function money(value: unknown): string {
  return `₹${toNumber(value).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeClass(status?: string): string {
  switch ((status || "").toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "COMPLETED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "WON":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "DEFAULTED":
      return "border-red-200 bg-red-50 text-red-700";
    case "PAID":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "WAIVED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "DELIVERED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "DISPATCHED":
    case "OUT_FOR_DELIVERY":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "RETURN_REQUESTED":
    case "RETURNED":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "FAILED":
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "OVERDUE":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

type EmiRow = {
  id: number;
  month_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  waived_amount: number;
  outstanding_amount: number;
  status: string;
};

export default function CustomerSubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const subscriptionId = params?.id;

  const [subscription, setSubscription] = useState<CustomerSubscription | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError(null);

        if (!subscriptionId) {
          throw new Error("Missing subscription id.");
        }

        const payload = await getCustomerSubscription(subscriptionId);
        setSubscription(payload);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load subscription details."
        );
        setSubscription(null);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [subscriptionId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const emis = useMemo<CustomerEmi[]>(() => {
    return Array.isArray(subscription?.emis)
      ? (subscription?.emis as CustomerEmi[])
      : [];
  }, [subscription]);

  const emiRows = useMemo<EmiRow[]>(() => {
    return emis.map((emi, index) => {
      const amount = toNumber(emi.amount);
      const paidAmount = toNumber(emi.paid_amount);
      const waivedAmount = toNumber(emi.waived_amount);

      const computedOutstanding = Math.max(
        amount - paidAmount - waivedAmount,
        0
      );

      return {
        id: emi.id ?? index + 1,
        month_no: toNumber(emi.month_no ?? emi.sequence_no ?? index + 1),
        due_date: text(emi.due_date, ""),
        amount,
        paid_amount: paidAmount,
        waived_amount: waivedAmount,
        outstanding_amount:
          emi.outstanding_amount !== undefined &&
          emi.outstanding_amount !== null &&
          String(emi.outstanding_amount) !== ""
            ? toNumber(emi.outstanding_amount)
            : computedOutstanding,
        status: text(emi.status, "—"),
      };
    });
  }, [emis]);

  const derivedFinancialSummary = useMemo(() => {
    const emiTotal = emiRows.reduce((sum, row) => sum + row.amount, 0);
    const paidAmount = emiRows.reduce((sum, row) => sum + row.paid_amount, 0);
    const waivedAmount = emiRows.reduce(
      (sum, row) => sum + row.waived_amount,
      0
    );
    const outstandingAmount = emiRows.reduce(
      (sum, row) => sum + row.outstanding_amount,
      0
    );

    return {
      emi_total: emiTotal,
      paid_amount: paidAmount,
      waived_amount: waivedAmount,
      outstanding_amount: outstandingAmount,
    };
  }, [emiRows]);

  const financialSummary = useMemo(() => {
    const backendSummary = subscription?.financial_summary;

    const hasBackendValues =
      backendSummary &&
      [
        backendSummary.emi_total,
        backendSummary.paid_amount,
        backendSummary.waived_amount,
        backendSummary.outstanding_amount,
      ].some(
        (value) =>
          value !== null && value !== undefined && String(value).trim() !== ""
      );

    if (hasBackendValues) {
      return {
        emi_total:
          backendSummary?.emi_total !== undefined &&
          backendSummary?.emi_total !== null
            ? toNumber(backendSummary.emi_total)
            : derivedFinancialSummary.emi_total,
        paid_amount:
          backendSummary?.paid_amount !== undefined &&
          backendSummary?.paid_amount !== null
            ? toNumber(backendSummary.paid_amount)
            : derivedFinancialSummary.paid_amount,
        waived_amount:
          backendSummary?.waived_amount !== undefined &&
          backendSummary?.waived_amount !== null
            ? toNumber(backendSummary.waived_amount)
            : derivedFinancialSummary.waived_amount,
        outstanding_amount:
          backendSummary?.outstanding_amount !== undefined &&
          backendSummary?.outstanding_amount !== null
            ? toNumber(backendSummary.outstanding_amount)
            : derivedFinancialSummary.outstanding_amount,
      };
    }

    return derivedFinancialSummary;
  }, [subscription, derivedFinancialSummary]);

  const paidEmiCount = useMemo(
    () => emiRows.filter((row) => row.status.toUpperCase() === "PAID").length,
    [emiRows]
  );

  const pendingEmiCount = useMemo(
    () =>
      emiRows.filter((row) => row.status.toUpperCase() === "PENDING").length,
    [emiRows]
  );

  const waivedEmiCount = useMemo(
    () => emiRows.filter((row) => row.status.toUpperCase() === "WAIVED").length,
    [emiRows]
  );

  const winnerRecorded =
    (subscription?.status || "").toUpperCase() === "WON" ||
    (subscription?.winner_month !== null &&
      subscription?.winner_month !== undefined);

  const paymentProgressLabel =
    emiRows.length > 0 ? `${paidEmiCount} of ${emiRows.length} EMI rows paid` : "No EMI schedule";

  const columns = useMemo(
    () => [
      {
        key: "month_no",
        title: "EMI Month",
        render: (row: EmiRow) => `Month ${row.month_no}`,
      },
      {
        key: "due_date",
        title: "Due Date",
        render: (row: EmiRow) => formatDate(row.due_date),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right" as const,
        render: (row: EmiRow) => money(row.amount),
      },
      {
        key: "paid_amount",
        title: "Paid",
        align: "right" as const,
        render: (row: EmiRow) => money(row.paid_amount),
      },
      {
        key: "waived_amount",
        title: "Waived",
        align: "right" as const,
        render: (row: EmiRow) => money(row.waived_amount),
      },
      {
        key: "outstanding_amount",
        title: "Outstanding",
        align: "right" as const,
        render: (row: EmiRow) => money(row.outstanding_amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row: EmiRow) => (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(
              row.status
            )}`}
          >
            {row.status}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      title="Subscription Details"
      subtitle="Track EMI schedule, payment progress, and subscription-level financial position."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Subscriptions", href: "/customer/subscriptions" },
        { label: subscription?.subscription_number || "Details" },
      ]}
      actions={[
        {
          href: `/customer/payments?subscription=${
            subscription?.id ?? subscriptionId ?? ""
          }`,
          label: "View Payments",
          variant: "primary",
        },
        {
          href: `/customer/deliveries?subscription=${
            subscription?.id ?? subscriptionId ?? ""
          }`,
          label: "View Deliveries",
          variant: "secondary",
        },
        {
          href: "/customer/support",
          label: "Support",
          variant: "secondary",
        },
      ]}
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? <LoadingBlock label="Loading subscription details..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load subscription"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && !subscription ? (
        <EmptyState
          title="Subscription not found"
          description="No customer subscription record was returned."
        />
      ) : null}

      {!loading && !error && subscription ? (
        <div className="space-y-6">
          {subscription.delivery_summary ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Delivery Tracking
                  </p>
                  <p className="mt-2 text-lg font-semibold text-card-foreground">
                    {subscription.delivery_summary.delivery_reference}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This delivery record is linked to your subscription and updates only from internal delivery operations.
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(
                    subscription.delivery_summary.status
                  )}`}
                >
                  {subscription.delivery_summary.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled Date</p>
                  <p className="font-medium text-foreground">
                    {formatDate(subscription.delivery_summary.scheduled_date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Out for Delivery</p>
                  <p className="font-medium text-foreground">
                    {formatDateTime(subscription.delivery_summary.out_for_delivery_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivered At</p>
                  <p className="font-medium text-foreground">
                    {formatDateTime(subscription.delivery_summary.delivered_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fulfillment Status</p>
                  <p className="font-medium text-foreground">
                    {text(subscription.fulfillment_status)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receiver</p>
                  <p className="font-medium text-foreground">
                    {text(subscription.delivery_summary.receiver_name)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receiver Phone</p>
                  <p className="font-medium text-foreground">
                    {text(subscription.delivery_summary.receiver_phone)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium text-foreground">
                    {text(subscription.delivery_summary.delivery_address_snapshot)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Delivery Notes</p>
                  <p className="font-medium text-foreground">
                    {text(subscription.delivery_summary.notes)}
                  </p>
                </div>
                {subscription.delivery_summary.failure_reason ? (
                  <div className="md:col-span-2">
                    <p className="text-xs text-muted-foreground">Failure / Return Reason</p>
                    <p className="font-medium text-foreground">
                      {subscription.delivery_summary.failure_reason}
                    </p>
                  </div>
                ) : null}
              </div>

              {Array.isArray(subscription.deliveries) &&
              subscription.deliveries.length > 0 ? (
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        {["Reference", "Status", "Scheduled", "Delivered"].map((label) => (
                          <th
                            key={label}
                            className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subscription.deliveries.map((row) => (
                        <tr key={row.id}>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {row.delivery_reference}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {row.status}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {formatDate(row.scheduled_date)}
                          </td>
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            {formatDateTime(row.delivered_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground shadow-sm">
              Delivery tracking will appear here once the shop creates a delivery record for this subscription.
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Subscription
                  </p>
                  <p className="text-lg font-semibold text-card-foreground">
                    {subscription.subscription_number || `SUB-${subscription.id}`}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Product</p>
                    <p className="font-medium text-foreground">
                      {text(subscription.product_name)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Batch</p>
                    <p className="font-medium text-foreground">
                      {text(subscription.batch_code)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucky Number</p>
                    <p className="font-medium text-foreground">
                      {subscription.lucky_number ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Start Date</p>
                    <p className="font-medium text-foreground">
                      {formatDate(subscription.start_date)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass(
                      subscription.status
                    )}`}
                  >
                    {text(subscription.status)}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Waived Amount</p>
                    <p className="font-medium text-foreground">
                      {money(subscription.waived_amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Winner Month</p>
                    <p className="font-medium text-foreground">
                      {subscription.winner_month ?? "Not recorded"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Delivery Status
                    </p>
                    <p className="font-medium text-foreground">
                      {text(subscription.delivery_status)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Fulfillment Status
                    </p>
                    <p className="font-medium text-foreground">
                      {text(subscription.fulfillment_status)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created At</p>
                    <p className="font-medium text-foreground">
                      {formatDate(subscription.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Lucky Draw Status
              </p>
              <p className="mt-2 text-lg font-semibold text-card-foreground">
                {winnerRecorded ? "Winner benefit recorded" : "No winner benefit recorded"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {subscription?.winner_month
                  ? `Winner month ${subscription.winner_month}`
                  : "This subscription has no recorded winner month yet."}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment Progress
              </p>
              <p className="mt-2 text-lg font-semibold text-card-foreground">
                {paymentProgressLabel}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingEmiCount > 0
                  ? `${pendingEmiCount} EMI rows are still pending.`
                  : "No pending EMI rows remain."}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Waiver Status
              </p>
              <p className="mt-2 text-lg font-semibold text-card-foreground">
                {waivedEmiCount > 0 || financialSummary.waived_amount > 0
                  ? "Waiver recorded"
                  : "No waiver recorded"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {waivedEmiCount > 0 || financialSummary.waived_amount > 0
                  ? `${waivedEmiCount} EMI rows waived · ${money(financialSummary.waived_amount)} total waived`
                  : "A waiver will appear here only after backend waiver entries are recorded."}
              </p>
            </div>
          </section>

          {winnerRecorded || waivedEmiCount > 0 || financialSummary.waived_amount > 0 ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Winner and waiver figures on this page come from recorded
              subscription and EMI data only. Already paid EMI rows remain paid;
              waiver totals reflect only the entries currently stored in the
              backend.
            </div>
          ) : null}

          {!winnerRecorded && pendingEmiCount > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This subscription still has pending EMI rows. Until a payment is
              recorded or a waiver is explicitly applied, those amounts remain
              outstanding.
            </div>
          ) : null}

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                EMIs Total
              </p>
              <p className="mt-2 text-2xl font-semibold text-card-foreground">
                {emiRows.length}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Paid EMIs
              </p>
              <p className="mt-2 text-2xl font-semibold text-card-foreground">
                {paidEmiCount}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pending EMIs
              </p>
              <p className="mt-2 text-2xl font-semibold text-card-foreground">
                {pendingEmiCount}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Waived EMIs
              </p>
              <p className="mt-2 text-2xl font-semibold text-card-foreground">
                {waivedEmiCount}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-card-foreground">
                Financial Summary
              </h3>
              <p className="text-sm text-muted-foreground">
                Current subscription-level financial position.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  EMI Total
                </p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {money(financialSummary.emi_total)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Paid Amount
                </p>
                <p className="mt-2 text-xl font-semibold text-emerald-700">
                  {money(financialSummary.paid_amount)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Waived Amount
                </p>
                <p className="mt-2 text-xl font-semibold text-blue-700">
                  {money(financialSummary.waived_amount)}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Outstanding
                </p>
                <p className="mt-2 text-xl font-semibold text-amber-700">
                  {money(financialSummary.outstanding_amount)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-card-foreground">
                EMI Schedule
              </h3>
              <p className="text-sm text-muted-foreground">
                Verified customer-visible EMI records for this subscription.
              </p>
            </div>

            {emiRows.length === 0 ? (
              <EmptyState
                title="No EMI schedule found"
                description="No EMI rows were returned for this subscription."
              />
            ) : (
              <DataTable<EmiRow> rows={emiRows} columns={columns} />
            )}
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}
