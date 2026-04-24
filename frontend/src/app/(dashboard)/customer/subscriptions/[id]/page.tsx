"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import {
  buildSubscriptionDetailSemantics,
  formatLuckyNumberLabel,
  formatWinnerMonthLabel,
} from "@/domains/subscriptions/detail/view-model";
import {
  DetailHeroSurface,
  DetailMetricTile,
  DetailSectionShell,
} from "@/domains/subscriptions/detail/surfaces";
import { formatPlanTypeLabel } from "@/lib/plan-labels";

import {
  getCustomerSubscription,
  listCustomerSubscriptions,
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

        try {
          const payload = await getCustomerSubscription(subscriptionId);
          setSubscription(payload);
        } catch (primaryError) {
          const listPayload = await listCustomerSubscriptions();
          const fallback = listPayload.results.find(
            (item) => String(item.id) === String(subscriptionId)
          );

          if (!fallback) {
            throw primaryError;
          }

          setSubscription(fallback);
        }
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

  const winnerSummary = subscription?.winner_summary;
  const detailSemantics = useMemo(
    () =>
      buildSubscriptionDetailSemantics({
        contractStatus: subscription?.status,
        winnerStatus: winnerSummary?.winner_status ?? subscription?.winner_status,
        winnerMonth: winnerSummary?.winner_month ?? subscription?.winner_month,
        luckyNumber: winnerSummary?.lucky_number ?? subscription?.lucky_number,
        drawId: winnerSummary?.draw_id,
        drawMonth: winnerSummary?.draw_month,
        drawRevealedAt: winnerSummary?.draw_revealed_at,
        waiverScope: winnerSummary?.waiver_scope,
        waivedEmiCount:
          winnerSummary?.waived_emi_count ??
          subscription?.waived_emi_count ??
          waivedEmiCount,
        waivedAmount:
          winnerSummary?.waived_amount ??
          financialSummary.waived_amount ??
          subscription?.waived_amount,
        outstandingAmount: financialSummary.outstanding_amount,
      }),
    [
      financialSummary.outstanding_amount,
      financialSummary.waived_amount,
      subscription?.lucky_number,
      subscription?.status,
      subscription?.waived_amount,
      subscription?.waived_emi_count,
      subscription?.winner_month,
      subscription?.winner_status,
      waivedEmiCount,
      winnerSummary?.draw_id,
      winnerSummary?.draw_month,
      winnerSummary?.draw_revealed_at,
      winnerSummary?.lucky_number,
      winnerSummary?.waived_amount,
      winnerSummary?.waived_emi_count,
      winnerSummary?.waiver_scope,
      winnerSummary?.winner_month,
      winnerSummary?.winner_status,
    ]
  );

  const paymentProgressLabel =
    emiRows.length > 0
      ? `${paidEmiCount} of ${emiRows.length} Advance EMI rows paid`
      : "No Advance EMI schedule";

  const columns = useMemo(
    () => [
      {
        key: "month_no",
        title: "Advance EMI Month",
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
          <StatusBadge status={row.status} />
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Customer Subscription"
      title="Subscription Details"
      subtitle="Track contract lifecycle, winner benefit history, waiver impact, and advance EMI settlement from your live subscription record."
      helperNote="Winner history, waiver impact, and settlement posture are shown separately so customer-visible contract status never hides payment or waiver truth."
      helperTone="info"
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
      stats={[
        {
          label: "Contract status",
          value: subscription?.status || "—",
          tone: detailSemantics.contractTone,
        },
        {
          label: "Outstanding",
          value: money(financialSummary.outstanding_amount),
          tone: detailSemantics.isSettled ? "success" : "warning",
        },
        {
          label: "Paid EMI rows",
          value: paidEmiCount,
          tone: paidEmiCount > 0 ? "success" : "default",
        },
        {
          label: "Next due",
          value: formatDate(subscription?.next_due_date),
          tone: pendingEmiCount > 0 ? "warning" : "success",
        },
      ]}
      statusBadge={{
        label: detailSemantics.contractStatus,
        tone: detailSemantics.contractTone,
      }}
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Subscription clarity
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                Contract, winner, and waiver state
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Contract lifecycle, winner benefit history, and waiver impact are shown separately so a completed winner remains easy to understand.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
              <DetailHeroSurface
                eyebrow="Contract lifecycle"
                title={detailSemantics.contractHeadline}
                description={detailSemantics.contractDescription}
                tone={detailSemantics.contractTone}
                badge={<StatusBadge status={subscription.status} size="md" />}
                meta={
                  <>
                    <DetailMetricTile
                      label="Lifecycle status"
                      value={detailSemantics.contractStatus}
                      tone={detailSemantics.contractTone}
                    />
                    <DetailMetricTile
                      label="Payment progress"
                      value={paymentProgressLabel}
                      hint={
                        pendingEmiCount > 0
                          ? `${pendingEmiCount} Advance EMI rows still need settlement.`
                          : "No pending Advance EMI rows remain."
                      }
                    />
                    <DetailMetricTile
                      label="Remaining amount"
                      value={money(financialSummary.outstanding_amount)}
                      tone={detailSemantics.isSettled ? "success" : "warning"}
                    />
                  </>
                }
              />

              <DetailHeroSurface
                eyebrow="Winner benefit"
                title={detailSemantics.winnerHeadline}
                description={detailSemantics.winnerDescription}
                tone={detailSemantics.winnerTone}
                badge={
                  <StatusBadge
                    status={detailSemantics.winnerStatus === "WON" ? "WON" : "NOT_WON"}
                    label={
                      detailSemantics.winnerStatus === "WON"
                        ? "Winner recorded"
                        : "Not won"
                    }
                    size="md"
                  />
                }
                meta={
                  <>
                    <DetailMetricTile
                      label="Winner month"
                      value={formatWinnerMonthLabel(detailSemantics.winnerMonth)}
                      tone={detailSemantics.winnerTone}
                    />
                    <DetailMetricTile
                      label="Lucky number"
                      value={formatLuckyNumberLabel(detailSemantics.luckyNumber)}
                      hint={
                        detailSemantics.drawId != null
                          ? `Draw #${detailSemantics.drawId}`
                          : "Lucky number stays linked to this contract"
                      }
                    />
                    <DetailMetricTile
                      label="Draw revealed"
                      value={formatDateTime(detailSemantics.drawRevealedAt)}
                      hint={
                        detailSemantics.drawMonth != null
                          ? `Draw month ${detailSemantics.drawMonth}`
                          : "Winner month stored on the contract"
                      }
                    />
                  </>
                }
              />

              <DetailHeroSurface
                eyebrow="Waiver and settlement impact"
                title={detailSemantics.waiverHeadline}
                description={detailSemantics.waiverDescription}
                tone={detailSemantics.waiverTone}
                badge={
                  <StatusBadge
                    status={detailSemantics.isSettled ? "COMPLETED" : "ACTIVE"}
                    label={detailSemantics.isSettled ? "Fully settled" : "Still settling"}
                    size="md"
                  />
                }
                meta={
                  <>
                    <DetailMetricTile
                      label="Waived Advance EMI rows"
                      value={String(detailSemantics.waivedEmiCount)}
                      tone={detailSemantics.hasWaiver ? detailSemantics.waiverTone : "default"}
                    />
                    <DetailMetricTile
                      label="Waived amount"
                      value={money(detailSemantics.waivedAmount)}
                      tone={detailSemantics.hasWaiver ? detailSemantics.waiverTone : "default"}
                    />
                    <DetailMetricTile
                      label="Waiver scope"
                      value={detailSemantics.waiverScope || "—"}
                      hint="Winner benefits apply only to future Advance EMI rows."
                    />
                  </>
                }
              />
            </div>
          </section>

          {detailSemantics.hasWinnerHistory ? (
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                Winner history stays separate from contract status
              </p>
              <p className="mt-2 text-sm leading-6 text-sky-950">
                A winner subscription may appear as <span className="font-semibold">WON</span> while it still has remaining Advance EMI exposure, and later as <span className="font-semibold">COMPLETED</span> once every Advance EMI row is paid or waived. The winner record stays visible in both cases.
              </p>
            </div>
          ) : pendingEmiCount > 0 ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                Settlement note
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-950">
                Pending Advance EMI rows remain outstanding until a payment is recorded or a waiver is applied in the backend.
              </p>
            </div>
          ) : null}

          <DetailSectionShell
            title="Product module"
            description="Live product media and the exact subscription-linked catalog context for this contract."
          >
            <CustomerProductSummaryCard subscription={subscription} />
          </DetailSectionShell>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <DetailSectionShell
              title="Contract and allocation"
              description="Customer-visible product, batch, lucky number, and lifecycle facts for this subscription."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <DetailMetricTile
                  label="Subscription"
                  value={subscription.subscription_number || `SUB-${subscription.id}`}
                />
                <DetailMetricTile
                  label="Product"
                  value={text(subscription.product_name)}
                  hint={formatPlanTypeLabel(subscription.plan_type)}
                />
                <DetailMetricTile
                  label="Batch"
                  value={text(subscription.batch_code)}
                  hint={`Start ${formatDate(subscription.start_date)}`}
                />
                <DetailMetricTile
                  label="Lucky number"
                  value={formatLuckyNumberLabel(subscription.lucky_number)}
                />
                <DetailMetricTile
                  label="Delivery status"
                  value={text(subscription.delivery_status)}
                  hint={`Fulfillment ${text(subscription.fulfillment_status)}`}
                />
                <DetailMetricTile
                  label="Created"
                  value={formatDate(subscription.created_at)}
                />
              </div>
            </DetailSectionShell>

            <DetailSectionShell
              title="Financial position"
              description="Current contract-level financial posture from advance EMI rows and the canonical backend summary."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailMetricTile
                  label="Advance EMI total"
                  value={money(financialSummary.emi_total)}
                />
                <DetailMetricTile
                  label="Paid amount"
                  value={money(financialSummary.paid_amount)}
                  tone="success"
                />
                <DetailMetricTile
                  label="Waived amount"
                  value={money(financialSummary.waived_amount)}
                  tone={detailSemantics.hasWaiver ? detailSemantics.waiverTone : "default"}
                />
                <DetailMetricTile
                  label="Outstanding"
                  value={money(financialSummary.outstanding_amount)}
                  tone={detailSemantics.isSettled ? "success" : "warning"}
                />
                <DetailMetricTile
                  label="Paid Advance EMI rows"
                  value={paidEmiCount}
                />
                <DetailMetricTile
                  label="Pending Advance EMI rows"
                  value={pendingEmiCount}
                  tone={pendingEmiCount > 0 ? "warning" : "success"}
                />
              </div>
            </DetailSectionShell>
          </div>

          <DetailSectionShell
            title="Delivery tracking"
            description="Delivery events appear here only when the shop creates or updates linked delivery records."
          >
            {subscription.delivery_summary ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Current delivery
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {subscription.delivery_summary.delivery_reference}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Delivery updates come from internal operations only and remain linked to this subscription for audit clarity.
                    </p>
                  </div>
                  <StatusBadge status={subscription.delivery_summary.status} size="md" />
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailMetricTile
                    label="Scheduled date"
                    value={formatDate(subscription.delivery_summary.scheduled_date)}
                  />
                  <DetailMetricTile
                    label="Out for delivery"
                    value={formatDateTime(subscription.delivery_summary.out_for_delivery_at)}
                  />
                  <DetailMetricTile
                    label="Delivered at"
                    value={formatDateTime(subscription.delivery_summary.delivered_at)}
                  />
                  <DetailMetricTile
                    label="Receiver"
                    value={text(subscription.delivery_summary.receiver_name)}
                    hint={text(subscription.delivery_summary.receiver_phone)}
                  />
                  <DetailMetricTile
                    label="Address"
                    value={text(subscription.delivery_summary.delivery_address_snapshot)}
                    className="sm:col-span-2 xl:col-span-2"
                  />
                  <DetailMetricTile
                    label="Notes"
                    value={text(subscription.delivery_summary.notes)}
                    className="sm:col-span-2 xl:col-span-2"
                  />
                </div>

                {Array.isArray(subscription.deliveries) &&
                subscription.deliveries.length > 0 ? (
                  <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-background p-2">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          {["Reference", "Status", "Scheduled", "Delivered"].map((label) => (
                            <th
                              key={label}
                              className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {subscription.deliveries.map((row) => (
                          <tr key={row.id}>
                            <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-900">
                              {row.delivery_reference}
                            </td>
                            <td className="border-b border-slate-200 px-4 py-3 text-sm">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
                              {formatDate(row.scheduled_date)}
                            </td>
                            <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-700">
                              {formatDateTime(row.delivered_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm leading-6 text-muted-foreground">
                Delivery tracking will appear here once the shop creates a delivery record for this subscription.
              </div>
            )}
          </DetailSectionShell>

          <DetailSectionShell
            title="Advance EMI schedule"
            description="Customer-visible advance EMI rows with paid, waived, and outstanding amounts shown separately."
          >
            {emiRows.length === 0 ? (
              <EmptyState
                title="No Advance EMI schedule found"
                description="No advance EMI rows were returned for this subscription."
              />
            ) : (
              <div className="rounded-2xl border border-border bg-background p-2">
                <DataTable<EmiRow> rows={emiRows} columns={columns} />
              </div>
            )}
          </DetailSectionShell>
        </div>
      ) : null}
    </PortalPage>
  );
}
