"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PaymentReceiptDocument from "@/components/receipts/PaymentReceiptDocument";
import PortalPage from "@/components/ui/PortalPage";
import {
  getCashierPaymentDetail,
  type CashierTransaction,
} from "@/services/cashier";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load cashier payment receipt.";
}

function SectionCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      ].join(" ")}
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function CashierPaymentReceiptPage() {
  const params = useParams<{ id: string }>();
  const paymentId = Number(params?.id ?? 0);

  const [payment, setPayment] = useState<CashierTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(paymentId) || paymentId <= 0) {
        setError("Invalid cashier payment id.");
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
        const payload = await getCashierPaymentDetail(paymentId);
        setPayment(payload.payment);
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

  const statusLabel = payment?.status_label || "POSTED";
  const statusTone =
    statusLabel === "REVERSED"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const subscriptionLabel = payment?.subscription_number
    ? payment.subscription_number
    : payment?.subscription
      ? `SUB-${payment.subscription}`
      : "—";
  const emiContext = payment?.emi
    ? `#${payment.emi}${typeof payment.emi_month_no === "number" ? ` · Month ${payment.emi_month_no}` : ""}`
    : "Not linked to a single EMI row";

  function handlePrint() {
    window.print();
  }

  return (
    <PortalPage
      className="receipt-print-page"
      title={payment ? `Receipt #${payment.id}` : "Payment Receipt"}
      subtitle="Counter-safe payment proof for recent cashier-posted transactions."
      breadcrumbs={[
        { label: "Cashier", href: "/cashier" },
        { label: "Payment History", href: "/cashier/payments" },
        { label: payment ? `Receipt #${payment.id}` : "Receipt" },
      ]}
      actions={[
        {
          href: "/cashier/collect",
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: "/cashier/payments",
          label: "Back to History",
          variant: "secondary",
        },
        {
          href: "/cashier",
          label: "Dashboard",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Payment ID", value: payment ? `#${payment.id}` : "—" },
        {
          label: "Amount",
          value: money(payment?.amount),
          tone: "success",
        },
        { label: "Method", value: payment?.method || "—" },
        {
          label: "Status",
          value: statusLabel,
          tone: statusLabel === "REVERSED" ? "danger" : "success",
        },
      ]}
      statusBadge={{
        label: "Cashier Payment Proof",
        tone: statusLabel === "REVERSED" ? "warning" : "success",
      }}
    >
      <div className="space-y-6">
        <section className="receipt-print-hide flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Use Print / Save PDF for a paper-safe counter copy without dashboard chrome.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || Boolean(error) || !payment}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-950 bg-slate-950 px-4 text-sm font-medium text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.82)] transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-100 disabled:opacity-70"
            >
              Print / Save PDF
            </button>
          </div>
        </section>

        {loading ? <LoadingBlock label="Loading cashier receipt..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payment receipt"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !payment ? (
          <EmptyState
            title="Receipt not available"
            description="The requested cashier-visible payment could not be loaded."
          />
        ) : null}

        {!loading && !error && payment ? (
          <>
            <PaymentReceiptDocument
              audienceLabel="Operational payment proof for a cashier-visible recorded transaction."
              documentTitle="Cashier Collection Receipt"
              receiptReference={receiptReference}
              paymentId={payment.id}
              statusLabel={statusLabel}
              statusToneClassName={statusTone}
              statusNote={
                statusLabel === "REVERSED" ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This payment has been reversed. Do not use it as proof of active collection without checking updated payment history.
                  </div>
                ) : undefined
              }
              partyFields={[
                { label: "Customer", value: payment.customer_name || "—", emphasize: true },
                { label: "Phone", value: payment.customer_phone || "—" },
                { label: "Subscription", value: subscriptionLabel, emphasize: true },
                { label: "Plan Type", value: payment.subscription_plan_type || "—" },
              ]}
              referenceFields={[
                { label: "Receipt Ref", value: receiptReference, emphasize: true },
                { label: "Payment Date", value: formatDate(payment.payment_date) },
                { label: "Method", value: payment.method || "—" },
                { label: "EMI Context", value: emiContext },
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
                  label: "Counter Operator",
                  value: payment.collected_by_username || "—",
                },
              ]}
              detailFields={[
                { label: "Receipt Status", value: statusLabel },
                {
                  label: "Subscription Status",
                  value: payment.subscription_status || "—",
                },
                { label: "EMI Context", value: emiContext },
                { label: "EMI Status", value: payment.emi_status || "—" },
                { label: "EMI Due Date", value: formatDate(payment.emi_due_date) },
                { label: "EMI Amount", value: money(payment.emi_amount) },
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
              footerNote="Use browser print to keep a paper counter copy or save this receipt as PDF. This view is sourced from the cashier-scoped payment record."
            />

            <SectionCard
              className="receipt-print-hide"
              title="Next step"
              description="Use the next action that matches the customer conversation at the counter."
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center rounded-md border border-slate-950 bg-slate-950 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-900"
                >
                  Print / Save PDF
                </button>

                <Link
                  href="/cashier/payments"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Open Payment History
                </Link>

                <Link
                  href="/cashier/collect"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Collect Another Payment
                </Link>

                <Link
                  href="/cashier"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Return to Dashboard
                </Link>
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
