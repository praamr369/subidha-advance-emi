"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPActionPanel,
  ERPDataToolbar,
  ERPDetailGrid,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import PaymentReceiptDocument from "@/components/receipts/PaymentReceiptDocument";
import ActionButton from "@/components/ui/ActionButton";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import { getCustomerPaymentDetail, type CustomerPayment } from "@/services/customer";

function money(value: string | number | null | undefined): string {
  const parsed = Number(value);
  return `₹${(Number.isFinite(parsed) ? parsed : 0).toFixed(2)}`;
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

  return "Failed to load customer payment receipt.";
}

export default function CustomerPaymentReceiptPage() {
  const params = useParams<{ id: string }>();
  const paymentId = Number(params?.id ?? 0);
  const hasValidPaymentId = Number.isFinite(paymentId) && paymentId > 0;

  const [payment, setPayment] = useState<CustomerPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        setError("Invalid customer payment id.");
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
        const payload = await getCustomerPaymentDetail(paymentId);
        setPayment(payload);
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

  const receiptReference = useMemo(() => {
    if (!payment) return "—";
    return payment.reference_no || `AUTO-${payment.id}`;
  }, [payment]);

  const statusLabel = payment?.is_reversed ? "REVERSED" : "RECORDED";
  const statusToneClassName = payment?.is_reversed
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const subscriptionLabel = payment?.subscription_number
    ? payment.subscription_number
    : payment?.subscription
      ? `SUB-${payment.subscription}`
      : "—";

  const emiContext = payment?.emi_id ? `#${payment.emi_id} · Month ${payment.emi_month_no ?? "—"}` : "Not linked to a single advance EMI row";

  const supportHref = payment
    ? `/customer/support?payment=${payment.id}&subscription=${payment.subscription_id ?? payment.subscription}&category=PAYMENT_ISSUE`
    : "/customer/support";

  function handlePrint() {
    window.print();
  }

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Customer Portal"
      title={
        payment
          ? `Payment Receipt #${payment.id}`
          : hasValidPaymentId
            ? `Payment Receipt #${paymentId}`
            : "Payment Receipt"
      }
      subtitle="Customer-visible proof for a recorded payment within your own account."
      helperNote="This receipt reflects recorded payment truth only. Contract settlement, winner benefit, waiver state, and outstanding posture remain on the related subscription routes."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Payments", href: "/customer/payments" },
        { label: payment ? `Receipt #${payment.id}` : "Receipt" },
      ]}
      actions={[
        {
          href: "/customer/payments",
          label: "Back to Payments",
          variant: "primary",
        },
        payment
          ? {
              href: `/customer/payments?subscription=${payment.subscription_id ?? payment.subscription}`,
              label: "Subscription Payments",
              variant: "secondary",
            }
          : {
              href: "/customer/subscriptions",
              label: "My Subscriptions",
              variant: "secondary",
            },
        {
          href: supportHref,
          label: "Report an Issue",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Payment ID", value: payment ? `#${payment.id}` : hasValidPaymentId ? `#${paymentId}` : "—" },
        { label: "Amount", value: money(payment?.amount), tone: "success" },
        { label: "Method", value: payment?.method || "—" },
        { label: "Status", value: statusLabel, tone: payment?.is_reversed ? "danger" : "success" },
      ]}
      statusBadge={{
        label: "Customer payment proof",
        tone: payment?.is_reversed ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          className="receipt-print-hide"
          title="Receipt actions"
          description="Print or save this receipt as PDF for your records."
        >
          <ERPDataToolbar
            left={
              <p className="text-sm text-muted-foreground">
                Use browser print to keep a paper copy or export as PDF.
              </p>
            }
            right={
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  variant="outline"
                  onClick={() => void loadPage("refresh")}
                  disabled={loading || refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </ActionButton>
                <ActionButton
                  variant="primary"
                  onClick={handlePrint}
                  disabled={loading || Boolean(error) || !payment}
                >
                  Print / Save PDF
                </ActionButton>
              </div>
            }
          />
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading payment receipt..." /> : null}

        {!loading && error ? (
          <ERPErrorState title="Unable to load payment receipt" description={error} onRetry={() => void loadPage("initial")} />
        ) : null}

        {!loading && !error && !payment ? (
          <ERPEmptyState title="Receipt not available" description="The requested customer payment could not be loaded." />
        ) : null}

        {!loading && !error && payment ? (
          <>
            <PaymentReceiptDocument
              audienceLabel="Customer-scoped proof for a recorded payment in your own account."
              documentTitle="Customer Payment Receipt"
              receiptReference={receiptReference}
              paymentId={payment.id}
              statusLabel={statusLabel}
              statusToneClassName={statusToneClassName}
              statusNote={
                payment.is_reversed ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This payment has been reversed. If you need clarification, use support and share the receipt reference.
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
                { label: "Receipt Ref", value: receiptReference, emphasize: true },
                { label: "Payment Date", value: formatDate(payment.payment_date) },
                { label: "Method", value: payment.method || "—" },
                { label: "Advance EMI Context", value: emiContext },
              ]}
              summaryFields={[
                { label: "Recorded At", value: formatDateTime(payment.created_at || payment.payment_date), emphasize: true },
                { label: "Amount", value: money(payment.amount), emphasize: true },
                { label: "Collected By", value: payment.collected_by_username || "—" },
              ]}
              detailFields={[
                { label: "Receipt Status", value: statusLabel },
                { label: "Plan Type", value: formatPlanTypeLabel(payment.subscription_plan_type) },
                { label: "Subscription", value: subscriptionLabel },
                { label: "Advance EMI Context", value: emiContext },
                { label: "Advance EMI Due Date", value: formatDate(payment.emi_due_date) },
                { label: "Advance EMI Amount", value: money(payment.emi_amount) },
                { label: "Batch", value: payment.batch_code || "—" },
                {
                  label: "Lucky Number",
                  value: typeof payment.lucky_number === "number" ? `#${payment.lucky_number}` : "—",
                },
                { label: "Reference Number", value: payment.reference_no || "—" },
              ]}
              footerNote="Use browser print to keep a paper copy or save this receipt as PDF. This view is sourced from your customer-scoped payment record only."
            />

            <ERPSectionShell
              className="receipt-print-hide"
              title="Payment snapshot"
              description="Customer-safe payment context from the same recorded receipt."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Receipt reference", value: receiptReference },
                  {
                    label: "Payment status",
                    value: <ERPStatusBadge status={statusLabel} label={statusLabel} />,
                  },
                  { label: "Recorded at", value: formatDateTime(payment.created_at || payment.payment_date) },
                  { label: "Collected by", value: payment.collected_by_username || "—" },
                  { label: "Subscription", value: subscriptionLabel },
                  { label: "Advance EMI context", value: emiContext },
                  { label: "Advance EMI amount", value: money(payment.emi_amount) },
                  {
                    label: "Batch / lucky",
                    value: `${payment.batch_code || "—"} / ${typeof payment.lucky_number === "number" ? `#${payment.lucky_number}` : "—"}`,
                  },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell className="receipt-print-hide" title="Next step" description="Use the action that matches what you need to check.">
              <ERPActionPanel>
                <div className="flex flex-wrap gap-2">
                  <ActionButton variant="primary" onClick={handlePrint}>
                    Print / Save PDF
                  </ActionButton>
                  <ActionButton href="/customer/payments" variant="outline">
                    Back to payment history
                  </ActionButton>
                  <ActionButton
                    href={`/customer/subscriptions/${payment.subscription_id ?? payment.subscription}`}
                    variant="outline"
                  >
                    Open subscription
                  </ActionButton>
                  <ActionButton href={supportHref} variant="outline">
                    Report an issue
                  </ActionButton>
                </div>
              </ERPActionPanel>
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
