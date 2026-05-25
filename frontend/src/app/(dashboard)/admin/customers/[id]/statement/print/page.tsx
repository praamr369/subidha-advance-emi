"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTitleStrip,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";
import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  joinDocumentLines,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { buildAdminCustomerRoute } from "@/lib/route-builders";

type CustomerRecord = {
  id: number;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  customer_code?: string | null;
  status?: string | null;
  kyc_status?: string | null;
  created_at?: string | null;
};

type FinancialSummary = Record<string, string | number | boolean | null | undefined | Record<string, unknown>>;

type SubscriptionRecord = {
  id: number;
  subscription_number?: string | null;
  plan_type?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  batch_code?: string | null;
  lucky_number?: number | string | null;
  lucky_id?: number | string | null;
  status?: string | null;
  tenure_months?: number | null;
  monthly_amount?: string | number | null;
  total_amount?: string | number | null;
  customer?: number | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  financial_summary?: FinancialSummary | null;
};

type PaymentRecord = {
  id: number;
  amount?: string | number | null;
  method?: string | null;
  reference_no?: string | null;
  payment_date?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  status?: string | null;
  subscription?: number | null;
  subscription_number?: string | null;
  emi?: number | null;
  emi_month_no?: number | null;
  customer?: number | null;
  customer_name?: string | null;
  source_type?: string | null;
  source_module?: string | null;
  source_reference?: string | null;
  receipt_no?: string | null;
  receipt_reference?: string | null;
  receipt_document_no?: string | null;
  is_reversed?: boolean;
};

type PaginatedResponse<T> = {
  count?: number;
  results?: T[];
  total_paid_amount?: string | number | null;
};

type StatementPayload = {
  customer: CustomerRecord | null;
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  totalPaidAmount?: string | number | null;
  totalPaidAmountExposed: boolean;
  subscriptionSourceNote?: string;
};

function toArray<T>(payload: T[] | PaginatedResponse<T> | null | undefined): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function hasOwn(payload: unknown, key: string): boolean {
  return Boolean(payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, key));
}

function statusToken(value: string | null | undefined): string {
  return safeDocumentText(value, "UNKNOWN").toUpperCase();
}

function addressFor(customer: CustomerRecord | null): string {
  if (!customer) return "—";
  return joinDocumentLines([customer.address, customer.city]);
}

function subscriptionReference(subscription: SubscriptionRecord): string {
  return safeDocumentText(subscription.subscription_number, "") || `SUB-${subscription.id}`;
}

function paymentReference(payment: PaymentRecord): string {
  return safeDocumentText(payment.reference_no, "") || `PAY-${payment.id}`;
}

function receiptReference(payment: PaymentRecord): string {
  return safeDocumentText(payment.receipt_no || payment.receipt_reference || payment.receipt_document_no);
}

function sourceReference(payment: PaymentRecord): string {
  const parts = [payment.source_module || payment.source_type, payment.source_reference].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (payment.subscription_number) return payment.subscription_number;
  if (typeof payment.subscription === "number") return `SUB-${payment.subscription}`;
  return "—";
}

function belongsToCustomer(subscription: SubscriptionRecord, customer: CustomerRecord): boolean {
  if (subscription.customer === customer.id || subscription.customer_id === customer.id) return true;
  const phoneMatches = Boolean(subscription.customer_phone && customer.phone && subscription.customer_phone === customer.phone);
  const nameMatches = Boolean(subscription.customer_name && customer.name && subscription.customer_name === customer.name);
  return phoneMatches && nameMatches;
}

function displayFinancialSummary(summary: FinancialSummary | null | undefined): Array<[string, string]> {
  if (!summary || typeof summary !== "object") return [];
  const allowedKeys = [
    "total_amount",
    "total_emi_amount",
    "paid_amount",
    "pending_amount",
    "remaining_amount",
    "outstanding_amount",
    "waived_amount",
    "reversed_amount",
    "emi_count_total",
    "emi_count_paid",
    "emi_count_pending",
    "emi_count_waived",
    "winner_status",
    "winner_month",
  ];

  return allowedKeys
    .filter((key) => summary[key] !== undefined && summary[key] !== null && summary[key] !== "")
    .map((key) => [key.replaceAll("_", " ").toUpperCase(), String(summary[key])]);
}

async function loadStatement(customerId: string): Promise<StatementPayload> {
  const customer = await apiFetch<CustomerRecord>(`/admin/customers/${customerId}/`, { cache: "no-store" });
  const [subscriptionResult, paymentResult] = await Promise.allSettled([
    apiFetch<SubscriptionRecord[] | PaginatedResponse<SubscriptionRecord>>(`/admin/subscriptions/?customer=${customerId}`, { cache: "no-store" }),
    apiFetch<PaginatedResponse<PaymentRecord>>(`/admin/payments/?customer=${customerId}`, { cache: "no-store" }),
  ]);

  let subscriptions: SubscriptionRecord[] = [];
  let subscriptionSourceNote: string | undefined;
  if (subscriptionResult.status === "fulfilled") {
    subscriptions = toArray(subscriptionResult.value).filter((row) => belongsToCustomer(row, customer));
    subscriptionSourceNote = "Subscription rows were requested with the existing customer filter and displayed only when the row clearly belongs to this customer.";
  } else {
    const fallback = await apiFetch<SubscriptionRecord[] | PaginatedResponse<SubscriptionRecord>>(`/admin/subscriptions/?q=${encodeURIComponent(customer.phone || customer.name || customerId)}`, { cache: "no-store" }).catch(() => null);
    subscriptions = toArray(fallback).filter((row) => belongsToCustomer(row, customer));
    subscriptionSourceNote = "Subscription customer filter was unavailable, so search results were used only as candidates and rows were displayed only when customer identity matched.";
  }

  const paymentPayload = paymentResult.status === "fulfilled" ? paymentResult.value : null;

  return {
    customer,
    subscriptions,
    payments: toArray(paymentPayload),
    totalPaidAmount: paymentPayload?.total_paid_amount,
    totalPaidAmountExposed: hasOwn(paymentPayload, "total_paid_amount"),
    subscriptionSourceNote,
  };
}

export default function AdminCustomerAccountStatementPrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const customerId = params?.id;
  const startDate = searchParams.get("start_date") || searchParams.get("date_from");
  const endDate = searchParams.get("end_date") || searchParams.get("date_to");

  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [payload, setPayload] = useState<StatementPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!customerId) return;
      setLoading(true);
      setError(null);
      try {
        const nextPayload = await loadStatement(customerId);
        if (!mounted) return;
        setPayload(nextPayload);
      } catch (err) {
        if (!mounted) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Failed to load customer account statement.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void run();
    return () => {
      mounted = false;
    };
  }, [customerId]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading customer account statement..." />;
  if (error || !payload?.customer) {
    return (
      <ERPErrorState
        title="Unable to load customer account statement"
        description={error || "The requested customer account statement could not be loaded."}
      />
    );
  }

  const customer = payload.customer;
  const status = statusToken(customer.status);
  const unsafeCustomer = ["INACTIVE", "BLOCKED", "SUSPENDED", "DEFAULTED", "CLOSED"].includes(status);
  const periodLabel = startDate || endDate ? `${formatDocumentDate(startDate)} to ${formatDocumentDate(endDate)}` : "All available records";

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={buildAdminCustomerRoute(customer.id)} />
      <DocumentPage watermark={unsafeCustomer ? documentStatusWatermark(status) : null}>
        <DocumentHeader copyLabel={copyLabel} documentNo={`CUST-STMT-${customer.id}`} documentDate={formatDocumentDate(generatedAt)} />

        <DocumentTitleStrip
          title="CUSTOMER ACCOUNT STATEMENT"
          subtitle="Read-only customer account summary generated from existing backend records."
          status={status}
        />

        <DocumentMetadataGrid
          items={[
            { label: "Customer ID", value: `#${customer.id}` },
            { label: "Customer Code", value: safeDocumentText(customer.customer_code) },
            { label: "Statement Period", value: periodLabel },
            { label: "Generated At", value: formatDocumentDateTime(generatedAt) },
            { label: "Customer Status", value: status },
            { label: "KYC Status", value: statusToken(customer.kyc_status) },
            { label: "Subscription Rows", value: String(payload.subscriptions.length) },
            { label: "Payment Rows", value: String(payload.payments.length) },
          ]}
        />

        <DocumentPartyPanel
          parties={[
            {
              title: "Customer",
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              address: addressFor(customer),
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

        {unsafeCustomer ? (
          <section className="document-card my-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            Backend customer payload exposes unsafe or inactive status: {status}. This statement does not override that state.
          </section>
        ) : null}

        <section className="document-card my-4 rounded-2xl border border-[#e6d6bd] bg-white p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Statement Safety Notes</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>This document does not calculate running balance.</li>
            <li>Outstanding values are shown only where backend APIs expose them.</li>
            <li>Direct-sale/rent-lease totals are not inferred.</li>
            <li>This statement is not a settlement receipt, ledger engine, reconciliation report, or accounting voucher.</li>
            {payload.subscriptionSourceNote ? <li>{payload.subscriptionSourceNote}</li> : null}
          </ul>
        </section>

        {payload.totalPaidAmountExposed ? (
          <section className="document-card my-4 rounded-2xl border border-[#d9c39c] bg-[#fff6e4] p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">Backend-Reported Total Paid</div>
            <div className="mt-2 text-2xl font-black text-[#2f2418]">{formatDocumentMoney(payload.totalPaidAmount)}</div>
            <div className="mt-1 text-xs text-[#6f5c46]">Displayed only because the payments API exposed `total_paid_amount`.</div>
          </section>
        ) : null}

        <section className="document-card my-4 overflow-hidden rounded-2xl border border-[#d9c39c] bg-white">
          <div className="border-b border-[#eadcc6] bg-[#f5ead8] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">
            Subscription / Contract Section
          </div>
          {payload.subscriptions.length === 0 ? (
            <div className="p-4 text-sm text-[#6f5c46]">No clearly customer-matched subscription rows were exposed by the current backend contracts.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f0dfbd] text-left uppercase tracking-[0.1em] text-[#5e3818]">
                    <th className="px-3 py-3">Subscription</th>
                    <th className="px-3 py-3">Plan</th>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Batch / Lucky ID</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Tenure</th>
                    <th className="px-3 py-3 text-right">Monthly</th>
                    <th className="px-3 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.subscriptions.map((subscription) => (
                    <tr key={subscription.id} className="border-t border-[#eadcc6] align-top">
                      <td className="px-3 py-3 font-semibold text-[#2f2418]">{subscriptionReference(subscription)}</td>
                      <td className="px-3 py-3">{safeDocumentText(subscription.plan_type)}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{safeDocumentText(subscription.product_name)}</div>
                        <div className="text-[#7c6a56]">{safeDocumentText(subscription.product_code)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{safeDocumentText(subscription.batch_code)}</div>
                        <div className="text-[#7c6a56]">Lucky {safeDocumentText(subscription.lucky_number ?? subscription.lucky_id)}</div>
                      </td>
                      <td className="px-3 py-3">{statusToken(subscription.status)}</td>
                      <td className="px-3 py-3 text-right">{typeof subscription.tenure_months === "number" ? `${subscription.tenure_months} mo` : "—"}</td>
                      <td className="px-3 py-3 text-right">{formatDocumentMoney(subscription.monthly_amount)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatDocumentMoney(subscription.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {payload.subscriptions.map((subscription) => {
          const rows = displayFinancialSummary(subscription.financial_summary);
          if (rows.length === 0) return null;
          return (
            <section key={`fs-${subscription.id}`} className="document-card my-4 rounded-2xl border border-[#e6d6bd] bg-white p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">
                Backend Financial Summary · {subscriptionReference(subscription)}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {rows.map(([label, value]) => (
                  <div key={`${subscription.id}-${label}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-[#2f2418]">{value}</div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <section className="document-card my-4 overflow-hidden rounded-2xl border border-[#d9c39c] bg-white">
          <div className="border-b border-[#eadcc6] bg-[#f5ead8] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">
            Payment / Receipt Section
          </div>
          {payload.payments.length === 0 ? (
            <div className="p-4 text-sm text-[#6f5c46]">No customer-filtered payment rows were exposed by the current backend contract.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f0dfbd] text-left uppercase tracking-[0.1em] text-[#5e3818]">
                    <th className="px-3 py-3">Payment Ref</th>
                    <th className="px-3 py-3">Receipt Ref</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Method</th>
                    <th className="px-3 py-3 text-right">Backend Amount</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-[#eadcc6] align-top">
                      <td className="px-3 py-3 font-semibold text-[#2f2418]">{paymentReference(payment)}</td>
                      <td className="px-3 py-3">{receiptReference(payment)}</td>
                      <td className="px-3 py-3">{formatDocumentDate(payment.payment_date || payment.paid_at || payment.created_at)}</td>
                      <td className="px-3 py-3">{sourceReference(payment)}</td>
                      <td className="px-3 py-3">{safeDocumentText(payment.method)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatDocumentMoney(payment.amount)}</td>
                      <td className="px-3 py-3">{payment.is_reversed ? "REVERSED" : statusToken(payment.status || "POSTED")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-[#fff6e4] p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Deferred Until Backend Statement Ledger Exists</div>
          <div className="mt-2 grid gap-2 text-xs leading-5 text-[#6f5c46] sm:grid-cols-2">
            <div>Customer ledger rows: not exposed by current backend contract.</div>
            <div>Backend total outstanding: not exposed by current backend contract.</div>
            <div>Backend direct-sale receivable rows: not inferred in this document.</div>
            <div>Backend rent/lease due rows: not inferred in this document.</div>
            <div>Backend running balance: not exposed by current backend contract.</div>
            <div>Customer account health/risk: not calculated in this print route.</div>
          </div>
        </section>

        <DocumentSignatureBlock labels={["Prepared By", "Customer Acknowledgement"]} />

        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={buildAdminCustomerRoute(customer.id)} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to customer record
          </Link>
          <span>Generated from customer detail, customer-filtered payments, and customer-matched subscription rows only.</span>
        </div>

        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
