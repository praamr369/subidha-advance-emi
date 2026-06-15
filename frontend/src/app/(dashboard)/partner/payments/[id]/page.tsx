"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

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
import { getPartnerPaymentDetail, type PartnerPayment } from "@/services/partner";


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
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Partner Portal"
      title={payment ? `Payment #${payment.id}` : "Payment Detail"}
      subtitle="Partner-scoped payment detail for subscriptions attributed to this partner only."
      helperNote="This receipt is visibility-only for partner scope. Admin-side payout, reversal, and reconciliation controls remain separate and are not exposed here."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Payments", href: backHref },
        { label: payment ? `Payment #${payment.id}` : "Payment detail" },
      ]}
      actions={[
        {
          href: backHref,
          label: "Back to Payments",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Payment ID", value: payment ? `#${payment.id}` : Number.isFinite(paymentId) && paymentId > 0 ? `#${paymentId}` : "—" },
        { label: "Amount", value: formatRupee(payment?.amount), tone: "success" },
        { label: "Method", value: payment?.method || "—" },
        { label: "Status", value: statusLabel, tone: statusLabel === "REVERSED" ? "danger" : "success" },
      ]}
      statusBadge={{
        label: "Partner payment proof",
        tone: statusLabel === "REVERSED" ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          className="receipt-print-hide"
          title="Receipt actions"
          description="Print or save this partner-visible receipt as PDF for operational proof."
        >
          <ERPDataToolbar
            left={<p className="text-sm text-muted-foreground">Use browser print to keep a paper copy or export as PDF.</p>}
            right={
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  variant="outline"
                  onClick={() => void loadPage("refresh")}
                  disabled={loading || refreshing}
                  leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
                >
                  {refreshing ? "Refreshing..." : "Refresh"}
                </ActionButton>
                <ActionButton variant="primary" onClick={handlePrint} disabled={loading || Boolean(error) || !payment}>
                  Print / Save PDF
                </ActionButton>
              </div>
            }
          />
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading partner payment detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState title="Unable to load partner payment detail" description={error} onRetry={() => void loadPage("initial")} />
        ) : null}

        {!loading && !error && !payment ? (
          <ERPEmptyState title="Payment detail not available" description="The requested partner-visible payment could not be loaded." />
        ) : null}

        {!loading && !error && payment ? (
          <>
            <ERPSectionShell
              className="receipt-print-hide"
              title="Payment snapshot"
              description="Core payment proof for partner-side operational lookup."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Receipt reference", value: paymentReference },
                  { label: "Payment status", value: <ERPStatusBadge status={statusLabel} label={statusLabel} /> },
                  {
                    label: "Subscription status",
                    value: payment.subscription_status ? <ERPStatusBadge status={payment.subscription_status} /> : "—",
                  },
                  { label: "Advance EMI status", value: payment.emi_status ? <ERPStatusBadge status={payment.emi_status} /> : "—" },
                ]}
              />
            </ERPSectionShell>

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
                { label: "Recorded At", value: formatDateTime(payment.created_at || payment.payment_date), emphasize: true },
                { label: "Amount", value: formatRupee(payment.amount), emphasize: true },
                { label: "Collected By", value: payment.collected_by_username || "—" },
              ]}
              detailFields={[
                { label: "Receipt Status", value: statusLabel },
                { label: "Plan Type", value: formatPlanTypeLabel(payment.subscription_plan_type) },
                { label: "Subscription", value: subscriptionLabel },
                { label: "Advance EMI Context", value: emiContext },
                { label: "Advance EMI Due Date", value: formatDate(payment.emi_due_date) },
                {
                  label: "Advance EMI Amount",
                  value: payment.emi_amount === null || payment.emi_amount === undefined ? "—" : formatRupee(payment.emi_amount),
                },
                { label: "Batch", value: payment.batch_code || "—" },
                { label: "Lucky Number", value: typeof payment.lucky_number === "number" ? `#${payment.lucky_number}` : "—" },
                { label: "Reference Number", value: payment.reference_no || "—" },
              ]}
              footerNote="Use browser print to keep a paper copy or save this receipt as PDF. This view is sourced only from the partner-scoped payment record."
            />

            <ERPSectionShell
              className="receipt-print-hide"
              title="Payment facts"
              description="The key receipt facts shown in the same partner scope."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Payment ID", value: `#${payment.id}` },
                  { label: "Receipt reference", value: paymentReference },
                  { label: "Recorded at", value: formatDateTime(payment.created_at || payment.payment_date) },
                  { label: "Payment date", value: formatDate(payment.payment_date) },
                  { label: "Method", value: payment.method || "—" },
                  { label: "Status", value: <ERPStatusBadge status={statusLabel} label={statusLabel} /> },
                  { label: "Amount", value: formatRupee(payment.amount) },
                  { label: "Verified by", value: payment.verified_by_username || "—" },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell
              className="receipt-print-hide"
              title="Customer and contract"
              description="The partner-attributed customer and subscription context for this payment."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Customer", value: payment.customer_name || "—" },
                  { label: "Customer phone", value: payment.customer_phone || "—" },
                  { label: "Subscription", value: subscriptionLabel },
                  {
                    label: "Subscription status",
                    value: payment.subscription_status ? <ERPStatusBadge status={payment.subscription_status} /> : "—",
                  },
                  { label: "Plan type", value: formatPlanTypeLabel(payment.subscription_plan_type) },
                  { label: "Product", value: payment.product_name || "—" },
                  { label: "Product code", value: payment.product_code || "—" },
                  {
                    label: "Batch / lucky",
                    value: (
                      <div>
                        <div>{payment.batch_code || "—"}</div>
                        <div className="text-muted-foreground">
                          {typeof payment.lucky_number === "number" ? `Lucky #${payment.lucky_number}` : "No lucky number"}
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell
              className="receipt-print-hide"
              title="Advance EMI context"
              description="Installment-level linkage shown only when this payment is tied to a specific advance EMI row."
              footer={
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  This detail view stays inside partner scope. Commission settlement, reversals, and broader reconciliation remain in admin-only workflows.
                </div>
              }
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Advance EMI", value: emiContext },
                  { label: "Due date", value: formatDate(payment.emi_due_date ?? null) },
                  {
                    label: "Advance EMI amount",
                    value: payment.emi_amount === null || payment.emi_amount === undefined ? "—" : formatRupee(payment.emi_amount),
                  },
                  { label: "Advance EMI status", value: payment.emi_status ? <ERPStatusBadge status={payment.emi_status} /> : "—" },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell className="receipt-print-hide" title="Next step" description="Use the action that matches the partner conversation or proof need.">
              <ERPActionPanel>
                <div className="flex flex-wrap gap-2">
                  <ActionButton variant="primary" onClick={handlePrint}>
                    Print / Save PDF
                  </ActionButton>
                  <ActionButton href={backHref} variant="outline">
                    Back to payments
                  </ActionButton>
                  {payment.customer ? (
                    <ActionButton href={`/partner/customers/${payment.customer}`} variant="outline">
                      Open customer
                    </ActionButton>
                  ) : null}
                  {payment.subscription ? (
                    <ActionButton href={`/partner/subscriptions/${payment.subscription}`} variant="outline">
                      Open subscription
                    </ActionButton>
                  ) : null}
                </div>
              </ERPActionPanel>
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
