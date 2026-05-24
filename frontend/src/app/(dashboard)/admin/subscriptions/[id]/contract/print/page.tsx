"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
} from "@/components/documents/document-shell";
import PrintToolbar from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";
import { subidhaDocumentTheme } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  joinDocumentLines,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { buildAdminSubscriptionRoute } from "@/lib/route-builders";

type FinancialSummary = {
  total_amount?: string;
  total_emi_amount?: string;
  paid_amount?: string;
  waived_amount?: string;
  pending_amount?: string;
  remaining_amount?: string;
  outstanding_amount?: string;
  emi_count_paid?: number;
  emi_count_waived?: number;
  emi_count_pending?: number;
  winner_status?: string;
  winner_month?: number | null;
  lucky_number?: number | null;
  batch?: {
    batch_code?: string | null;
    status?: string | null;
  };
};

type WinnerSummary = {
  winner_status?: string | null;
  winner_month?: number | null;
  lucky_number?: number | null;
  waived_emi_count?: number;
  waived_amount?: string;
  waiver_scope?: string | null;
};

type SubscriptionContractRecord = {
  id: number;
  subscription_number?: string | null;
  customer?: number | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  product_base_price?: string | null;
  batch_code?: string | null;
  batch_status?: string | null;
  lucky_number?: number | null;
  plan_type?: string | null;
  tenure_months?: number | null;
  start_date?: string | null;
  created_at?: string | null;
  total_amount?: string | null;
  monthly_amount?: string | null;
  status?: string | null;
  winner_month?: number | null;
  winner_status?: string | null;
  waived_amount?: string | null;
  financial_summary?: FinancialSummary | null;
  winner_summary?: WinnerSummary | null;
  fulfillment_status?: string | null;
  delivery_status?: string | null;
};

type CustomerRecord = {
  id: number;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  email?: string | null;
};

function subscriptionReference(subscription: SubscriptionContractRecord): string {
  return (
    safeDocumentText(subscription.subscription_number, "") ||
    `SUB-${subscription.id}`
  );
}

function formatLuckyNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toString().padStart(2, "0");
}

function statusToken(value: string | null | undefined): string {
  return safeDocumentText(value, "UNKNOWN").toUpperCase();
}

function isWinner(subscription: SubscriptionContractRecord): boolean {
  const candidates = [
    subscription.winner_status,
    subscription.financial_summary?.winner_status,
    subscription.winner_summary?.winner_status,
  ];
  return candidates.some((value) => ["WON", "WINNER", "DRAWN"].includes(statusToken(value)));
}

function customerAddress(customer: CustomerRecord | null): string {
  if (!customer) return "—";
  return joinDocumentLines([customer.address, customer.city]);
}

function buildTerms(subscription: SubscriptionContractRecord): string[] {
  const planLabel = statusToken(subscription.plan_type) === "EMI" ? "Lucky Plan / Advance EMI" : safeDocumentText(subscription.plan_type, "Contract");
  return [
    `${planLabel} terms, tenure, price, and monthly installment values are displayed only from backend contract records.`,
    "The customer must pay due installments on time, keep contact details updated, preserve receipts, and follow delivery/service instructions issued by the business.",
    "Subidha Furniture must maintain auditable payment records, receipts, delivery records, and contract lifecycle history for this subscription.",
    "Lucky draw winner benefit, where applicable, waives only future eligible EMI rows as recorded by backend winner and waiver records; no frontend calculation is used here.",
    "Cancellation, return, service, and support requests are handled only through approved operational workflows. This print copy does not change contract status or financial records.",
  ];
}

export default function AdminSubscriptionContractPrintPage() {
  const params = useParams<{ id: string }>();
  const subscriptionId = params?.id;
  const [subscription, setSubscription] = useState<SubscriptionContractRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadContract() {
      if (!subscriptionId) return;
      setLoading(true);
      setError(null);

      try {
        const subscriptionPayload = await apiFetch<SubscriptionContractRecord>(
          `/admin/subscriptions/${subscriptionId}/`,
          { cache: "no-store" }
        );

        let customerPayload: CustomerRecord | null = null;
        const customerId = subscriptionPayload.customer_id ?? subscriptionPayload.customer;
        if (customerId != null) {
          try {
            customerPayload = await apiFetch<CustomerRecord>(
              `/admin/customers/${customerId}/`,
              { cache: "no-store" }
            );
          } catch {
            customerPayload = null;
          }
        }

        if (!mounted) return;
        setSubscription(subscriptionPayload);
        setCustomer(customerPayload);
      } catch (err) {
        if (!mounted) return;
        setSubscription(null);
        setCustomer(null);
        setError(err instanceof Error ? err.message : "Failed to load subscription contract.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadContract();

    return () => {
      mounted = false;
    };
  }, [subscriptionId]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) {
    return <ERPLoadingState label="Loading subscription contract..." />;
  }

  if (error || !subscription) {
    return (
      <ERPErrorState
        title="Unable to load subscription contract"
        description={error || "The requested subscription contract could not be loaded."}
      />
    );
  }

  const financialSummary = subscription.financial_summary;
  const winnerSummary = subscription.winner_summary;
  const reference = subscriptionReference(subscription);
  const status = statusToken(subscription.status);
  const planType = statusToken(subscription.plan_type);
  const winnerRecorded = isWinner(subscription);
  const luckyNumber =
    winnerSummary?.lucky_number ?? financialSummary?.lucky_number ?? subscription.lucky_number;
  const winnerMonth =
    winnerSummary?.winner_month ?? financialSummary?.winner_month ?? subscription.winner_month;
  const outstandingAmount =
    financialSummary?.outstanding_amount ?? financialSummary?.remaining_amount ?? financialSummary?.pending_amount;
  const watermark =
    documentStatusWatermark(status) ||
    (["CLOSED", "COMPLETED", "DEFAULTED", "INACTIVE"].includes(status) ? status : null);
  const productPrice =
    subscription.product_base_price ?? financialSummary?.total_amount ?? subscription.total_amount;

  return (
    <>
      <PrintToolbar
        title="Lucky Plan Agreement"
        backHref={buildAdminSubscriptionRoute(subscription.id)}
      />
      <DocumentPage watermark={watermark}>
        <DocumentHeader
          copyLabel="Original"
          documentNo={reference}
          documentDate={formatDocumentDate(subscription.start_date || subscription.created_at)}
        />

        <DocumentTitleStrip
          title="LUCKY PLAN AGREEMENT / SUBSCRIPTION CONTRACT"
          subtitle="Read-only contract print generated from backend subscription records."
          status={status}
        />

        <DocumentMetadataGrid
          items={[
            { label: "Subscription Ref", value: reference },
            { label: "Plan Type", value: planType },
            { label: "Status", value: status },
            { label: "Start / Activation", value: formatDocumentDate(subscription.start_date) },
            { label: "Batch", value: safeDocumentText(subscription.batch_code || financialSummary?.batch?.batch_code) },
            { label: "Batch Status", value: safeDocumentText(subscription.batch_status || financialSummary?.batch?.status) },
            { label: "Lucky ID", value: formatLuckyNumber(luckyNumber) },
            { label: "Created At", value: formatDocumentDateTime(subscription.created_at) },
          ]}
        />

        <DocumentPartyPanel
          parties={[
            {
              title: "Customer",
              name: subscription.customer_name || customer?.name,
              phone: subscription.customer_phone || customer?.phone,
              email: customer?.email,
              address: customerAddress(customer),
            },
            {
              title: "Business",
              name: subidhaDocumentTheme.businessName,
              phone: subidhaDocumentTheme.phone,
              email: subidhaDocumentTheme.email,
              address: subidhaDocumentTheme.addressLines.join("\n"),
            },
          ]}
        />

        <section className="document-card my-4 rounded-2xl border border-[#e6d6bd] bg-white p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">Product / Contract Item</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Product</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(subscription.product_name)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Model / Code</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(subscription.product_code)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Contract Price</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentMoney(productPrice)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Monthly EMI</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentMoney(subscription.monthly_amount)}</div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="document-card rounded-2xl border border-[#e6d6bd] bg-white p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">Payment Posture</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Tenure</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">
                  {typeof subscription.tenure_months === "number" ? `${subscription.tenure_months} months` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Paid EMI Rows</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{financialSummary?.emi_count_paid ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Pending EMI Rows</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{financialSummary?.emi_count_pending ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Waived EMI Rows</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{winnerSummary?.waived_emi_count ?? financialSummary?.emi_count_waived ?? "—"}</div>
              </div>
            </div>

            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${winnerRecorded ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-[#eadcc6] bg-[#fff6e4] text-[#6f5c46]"}`}>
              {winnerRecorded
                ? `Winner benefit recorded${winnerMonth ? ` for month ${winnerMonth}` : ""}. Future EMI waiver is shown only from backend waiver records.`
                : "No winner benefit is recorded for this subscription in the current backend payload."}
              {winnerSummary?.waiver_scope ? ` Scope: ${winnerSummary.waiver_scope}.` : ""}
            </div>
          </section>

          <DocumentAmountSummary
            rows={[
              { label: "Product Base Price", value: formatDocumentMoney(productPrice) },
              { label: "Contract Price", value: formatDocumentMoney(subscription.total_amount), strong: true },
              { label: "Monthly EMI", value: formatDocumentMoney(subscription.monthly_amount) },
              { label: "Paid Amount", value: formatDocumentMoney(financialSummary?.paid_amount) },
              { label: "Waived Amount", value: formatDocumentMoney(winnerSummary?.waived_amount ?? financialSummary?.waived_amount ?? subscription.waived_amount) },
              { label: "Outstanding / Balance", value: formatDocumentMoney(outstandingAmount), strong: true, danger: Number(outstandingAmount ?? 0) > 0 },
            ]}
          />
        </div>

        <DocumentTermsBlock terms={buildTerms(subscription)} />

        <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Customer Obligations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Pay monthly EMI dues as per the backend contract record and preserve system receipts.</li>
            <li>Report phone, address, delivery, cancellation, return, or service changes through approved shop workflows.</li>
            <li>Understand that this print copy is not a payment receipt and does not settle any outstanding amount.</li>
          </ul>
        </section>

        <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Business Obligations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Maintain posted EMI, payment, waiver, delivery, and audit records in SUBIDHA CORE.</li>
            <li>Apply lucky winner EMI waiver only through backend lucky draw and waiver workflows.</li>
            <li>Keep cancellation, return, service, reconciliation, and accounting actions separate from this read-only document.</li>
          </ul>
        </section>

        <DocumentSignatureBlock
          labels={[
            subidhaDocumentTheme.signatureLabels.customer,
            subidhaDocumentTheme.signatureLabels.authorized,
          ]}
        />

        <div className="mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={buildAdminSubscriptionRoute(subscription.id)} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to subscription record
          </Link>
          <span>Document generated from existing subscription API payload only.</span>
        </div>

        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
