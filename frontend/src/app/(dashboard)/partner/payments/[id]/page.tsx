"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Receipt, ShieldCheck } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PaymentReceiptDocument from "@/components/receipts/PaymentReceiptDocument";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import {
  getPartnerPaymentDetail,
  type PartnerPayment,
} from "@/services/partner";

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Failed to load partner payment detail.";
}

export default function PartnerPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paymentId = Number(params?.id ?? 0);

  const [payment, setPayment] = useState<PartnerPayment | null>(null);
  const [statusLabel, setStatusLabel] = useState("RECORDED");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backQuery = searchParams.toString();
  const backHref = backQuery ? `/partner/payments?${backQuery}` : "/partner/payments";

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        setError("Invalid partner payment id.");
        setPayment(null);
        setLoading(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getPartnerPaymentDetail(paymentId);
        setPayment(payload.payment);
        setStatusLabel(payload.status_label || "RECORDED");
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setPayment(null);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [paymentId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const subscriptionLabel = payment?.subscription_number
    ? payment.subscription_number
    : payment?.subscription
      ? `SUB-${payment.subscription}`
      : "—";

  const emiContext =
    payment?.emi_id || payment?.emi
      ? `#${payment.emi_id ?? payment.emi}${typeof payment?.emi_month_no === "number" ? ` · Month ${payment.emi_month_no}` : ""}`
      : "Not linked to a single advance EMI row";

  const paymentReference = useMemo(() => {
    if (!payment) return "—";
    return payment.reference_no || `AUTO-${payment.id}`;
  }, [payment]);

  const statusToneClassName =
    statusLabel === "REVERSED"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  function handlePrint() {
    window.print();
  }

  return (
    <PortalPage
      className="receipt-print-page"
      title={payment ? `Payment #${payment.id}` : "Partner Payment Detail"}
      subtitle="Partner-scoped payment detail for subscriptions attributed to this partner only."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Payments", href: backHref },
        { label: payment ? `Payment #${payment.id}` : "Payment Detail" },
      ]}
      actions={[
        {
          href: backHref,
          label: "Back to Payments",
          variant: "secondary",
        },
        ...(payment?.customer
          ? [
              {
                href: `/partner/customers/${payment.customer}`,
                label: "Customer",
                variant: "secondary" as const,
              },
            ]
          : [
              {
                href: "/partner/customers",
                label: "Customers",
                variant: "secondary" as const,
              },
            ]),
        ...(payment?.subscription
          ? [
              {
                href: `/partner/subscriptions/${payment.subscription}`,
                label: "Subscription",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        { label: "Payment ID", value: payment ? `#${payment.id}` : "—" },
        { label: "Amount", value: money(payment?.amount), tone: "success" },
        { label: "Method", value: payment?.method || "—" },
        {
          label: "Status",
          value: statusLabel,
          tone: statusLabel === "REVERSED" ? "danger" : "success",
        },
      ]}
      statusBadge={{
        label: statusLabel === "REVERSED" ? "Partner Historical Record" : "Partner Payment Detail",
        tone: statusLabel === "REVERSED" ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          className="receipt-print-hide"
          title="Payment controls"
          description="This page is limited to partner-visible payment activity and does not expose admin-wide finance or reconciliation data."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70"
              >
                <RefreshCw className="h-4 w-4" />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || Boolean(error) || !payment}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem
              label="Receipt Reference"
              value={paymentReference}
            />
            <DetailItem
              label="Payment Status"
              value={<StatusBadge status={statusLabel} size="md" />}
            />
            <DetailItem
              label="Subscription Status"
              value={
                payment?.subscription_status ? (
                  <StatusBadge status={payment.subscription_status} />
                ) : (
                  "—"
                )
              }
            />
            <DetailItem
              label="Advance EMI Status"
              value={
                payment?.emi_status ? <StatusBadge status={payment.emi_status} /> : "—"
              }
            />
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading partner payment detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner payment detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !payment ? (
          <EmptyState
            title="Payment detail not available"
            description="The requested partner-visible payment could not be loaded."
          />
        ) : null}

        {!loading && !error && payment ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 receipt-print-hide">
              <StatCard
                label="Recorded"
                value={formatDateTime(payment.created_at || payment.payment_date)}
                icon={<Receipt className="h-4 w-4" />}
              />
              <StatCard
                label="Amount"
                value={money(payment.amount)}
                tone="success"
                icon={<ShieldCheck className="h-4 w-4" />}
              />
              <StatCard
                label="Method"
                value={payment.method || "—"}
                subtext={`Reference ${paymentReference}`}
              />
              <StatCard
                label="Subscription"
                value={subscriptionLabel}
                subtext={payment.customer_name || "Customer not linked"}
              />
            </div>

            <PaymentReceiptDocument
              audienceLabel="Partner-scoped payment proof for a recorded transaction on subscriptions attributed to this partner."
              documentTitle="Partner Payment Receipt"
              receiptReference={paymentReference}
              paymentId={payment.id}
              statusLabel={statusLabel}
              statusToneClassName={statusToneClassName}
              statusNote={
                statusLabel === "REVERSED" ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This payment has been reversed. Use it only as historical proof and confirm the current status in partner payment history.
                  </div>
                ) : undefined
              }
              partyFields={[
                { label: "Customer", value: payment.customer_name || "—", emphasize: true },
                { label: "Phone", value: payment.customer_phone || "—" },
                { label: "Subscription", value: subscriptionLabel, emphasize: true },
                { label: "Product", value: payment.product_name || "—" },
              ]}
              referenceFields={[
                { label: "Receipt Ref", value: paymentReference, emphasize: true },
                { label: "Payment Date", value: formatDate(payment.payment_date) },
                { label: "Method", value: payment.method || "—" },
                { label: "Advance EMI Context", value: emiContext },
              ]}
              summaryFields={[
                {
                  label: "Recorded At",
                  value: formatDateTime(payment.created_at || payment.payment_date),
                  emphasize: true,
                },
                {
                  label: "Amount",
                  value: money(payment.amount),
                  emphasize: true,
                },
                {
                  label: "Collected By",
                  value: payment.collected_by_username || "—",
                },
              ]}
              detailFields={[
                { label: "Receipt Status", value: statusLabel },
                { label: "Plan Type", value: formatPlanTypeLabel(payment.subscription_plan_type) },
                { label: "Subscription", value: subscriptionLabel },
                { label: "Advance EMI Context", value: emiContext },
                { label: "Advance EMI Due Date", value: formatDate(payment.emi_due_date) },
                {
                  label: "Advance EMI Amount",
                  value:
                    payment.emi_amount === null || payment.emi_amount === undefined
                      ? "—"
                      : money(payment.emi_amount),
                },
                { label: "Batch", value: payment.batch_code || "—" },
                {
                  label: "Lucky Number",
                  value:
                    typeof payment.lucky_number === "number"
                      ? `#${payment.lucky_number}`
                      : "—",
                },
                { label: "Reference Number", value: payment.reference_no || "—" },
              ]}
              footerNote="Use browser print to keep a paper copy or save this receipt as PDF. This view is sourced only from the partner-scoped payment record."
            />

            <WorkspaceSection
              className="receipt-print-hide"
              title="Payment facts"
              description="Core payment proof for partner-side operational lookup."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Payment ID" value={`#${payment.id}`} />
                <DetailItem label="Receipt Reference" value={paymentReference} />
                <DetailItem
                  label="Recorded At"
                  value={formatDateTime(payment.created_at || payment.payment_date)}
                />
                <DetailItem label="Payment Date" value={formatDate(payment.payment_date)} />
                <DetailItem label="Method" value={payment.method || "—"} />
                <DetailItem
                  label="Status"
                  value={<StatusBadge status={statusLabel} />}
                />
                <DetailItem label="Amount" value={money(payment.amount)} tone="success" />
                <DetailItem
                  label="Verified By"
                  value={payment.verified_by_username || "—"}
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              className="receipt-print-hide"
              title="Customer and contract"
              description="The partner-attributed customer and subscription context for this payment."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Customer" value={payment.customer_name || "—"} />
                <DetailItem label="Customer Phone" value={payment.customer_phone || "—"} />
                <DetailItem label="Subscription" value={subscriptionLabel} />
                <DetailItem
                  label="Subscription Status"
                  value={
                    payment.subscription_status ? (
                      <StatusBadge status={payment.subscription_status} />
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem label="Plan Type" value={formatPlanTypeLabel(payment.subscription_plan_type)} />
                <DetailItem label="Product" value={payment.product_name || "—"} />
                <DetailItem label="Product Code" value={payment.product_code || "—"} />
                <DetailItem
                  label="Batch / Lucky"
                  value={
                    <div>
                      <div>{payment.batch_code || "—"}</div>
                      <div className="text-slate-600">
                        {typeof payment.lucky_number === "number"
                          ? `Lucky #${payment.lucky_number}`
                          : "No lucky number"}
                      </div>
                    </div>
                  }
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              className="receipt-print-hide"
              title="Advance EMI context"
              description="Installment-level linkage shown only when this payment is tied to a specific advance EMI row."
              footer={
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  This detail view stays inside partner scope. Commission settlement, reversals, and broader reconciliation remain in admin-only workflows.
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Advance EMI" value={emiContext} />
                <DetailItem label="Due Date" value={formatDate(payment.emi_due_date ?? null)} />
                <DetailItem
                  label="Advance EMI Amount"
                  value={
                    payment.emi_amount === null || payment.emi_amount === undefined
                      ? "—"
                      : money(payment.emi_amount)
                  }
                />
                <DetailItem
                  label="Advance EMI Status"
                  value={
                    payment.emi_status ? <StatusBadge status={payment.emi_status} /> : "—"
                  }
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              className="receipt-print-hide"
              title="Next step"
              description="Use the action that matches the partner conversation or proof need."
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                >
                  Print / Save PDF
                </button>

                <Link
                  href={backHref}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Back to payments
                </Link>

                {payment.customer ? (
                  <Link
                    href={`/partner/customers/${payment.customer}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Open customer
                  </Link>
                ) : null}

                {payment.subscription ? (
                  <Link
                    href={`/partner/subscriptions/${payment.subscription}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Open subscription
                  </Link>
                ) : null}
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
