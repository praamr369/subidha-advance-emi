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
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";
import {
  subidhaDocumentTheme,
  type DocumentCopyLabel,
} from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  joinDocumentLines,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { buildAdminSubscriptionRoute } from "@/lib/route-builders";
import { openWhatsAppDirectModal } from "@/components/whatsapp/WhatsAppDirectSenderModal";

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

type ContractItemRecord = {
  id: number;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  quantity?: number;
  unit_base_price?: string | null;
  total_base_price?: string | null;
  monthly_yield_percent?: string | null;
  monthly_amount?: string | null;
  security_deposit_percent?: string | null;
  security_deposit_amount?: string | null;
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
  contract_items?: ContractItemRecord[] | null;
  documents?: Array<{
    id: number;
    document_type: string;
    verification_status?: string | null;
    file_url?: string | null;
    notes?: string | null;
    created_at?: string | null;
  }> | null;
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
  return safeDocumentText(subscription.subscription_number, "") || `SUB-${subscription.id}`;
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
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
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

        if (!subscriptionPayload.documents || subscriptionPayload.documents.length === 0) {
          try {
            const docsRes = await apiFetch<{ results?: SubscriptionContractRecord["documents"] }>(
              `/admin/subscriptions/${subscriptionId}/documents/`,
              { cache: "no-store" }
            );
            if (docsRes?.results?.length) {
              subscriptionPayload.documents = docsRes.results;
            }
          } catch {
            // Secondary document fetch failed; proceed with payload documents
          }
        }

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

  const customerSignatureDoc = useMemo(() => {
    if (!subscription?.documents?.length) return null;
    return (
      subscription.documents.find(
        (doc) => doc.document_type === "CUSTOMER_SIGNATURE" && doc.file_url
      ) || null
    );
  }, [subscription?.documents]);

  const customerPhotoDoc = useMemo(() => {
    if (!subscription?.documents?.length) return null;
    return (
      subscription.documents.find(
        (doc) => doc.document_type === "CUSTOMER_PHOTO" && doc.file_url
      ) || null
    );
  }, [subscription?.documents]);

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
  const watermark = documentStatusWatermark(status);
  const productPrice =
    subscription.product_base_price ?? financialSummary?.total_amount ?? subscription.total_amount;
  const customerDisplayName = subscription.customer_name || customer?.name || "";
  const customerDisplayPhone = subscription.customer_phone || customer?.phone || "";

  const customerSignatureUrl = customerSignatureDoc?.file_url ?? null;
  const customerPhotoUrl = customerPhotoDoc?.file_url ?? null;
  const customerSignatureTimestamp = customerSignatureDoc?.created_at
    ? formatDocumentDateTime(customerSignatureDoc.created_at)
    : null;

  return (
    <>
      <PrintToolbar
        copyLabel={copyLabel}
        onCopyLabelChange={setCopyLabel}
        backHref={buildAdminSubscriptionRoute(subscription.id)}
        onWhatsAppShare={() => {
          openWhatsAppDirectModal({
            phone: customerDisplayPhone,
            name: customerDisplayName,
            customerId: subscription.customer || null,
            eventType: "CUSTOM",
            text: `Dear ${customerDisplayName || "Customer"},\nHere is your Lucky Plan Subscription Agreement (${reference}) from Subidha Furniture:\n📄 View Agreement: ${typeof window !== "undefined" ? window.location.href : ""}\n\nThank you for choosing Subidha Furniture!`,
            ref: reference,
            amount: subscription.monthly_amount ?? undefined,
            docUrl: typeof window !== "undefined" ? window.location.href : "",
            sourceModel: "Subscription",
            sourceId: String(subscription.id),
          });
        }}
      />
      <DocumentPage watermark={watermark}>
        <DocumentHeader
          copyLabel={copyLabel}
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
              photoUrl: customerPhotoUrl,
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

        {subscription.contract_items && subscription.contract_items.length > 0 ? (
          <section className="document-card my-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">
                Attached Furniture Products ({subscription.contract_items.length} items)
              </div>
              <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Multi-Product Furniture Package
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e6dbc9] text-[10px] uppercase tracking-wider text-[#8a7255]">
                    <th className="py-1.5 pr-2 font-bold">#</th>
                    <th className="py-1.5 px-2 font-bold">Product Item</th>
                    <th className="py-1.5 px-2 font-bold text-center">Qty</th>
                    <th className="py-1.5 px-2 font-bold text-right">Unit Price</th>
                    <th className="py-1.5 px-2 font-bold text-right">Total Base</th>
                    <th className="py-1.5 px-2 font-bold text-right">Monthly Dues</th>
                    <th className="py-1.5 pl-2 font-bold text-right">Deposit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2ebd9]">
                  {subscription.contract_items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-2 pr-2 font-semibold text-[#8a7255]">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="font-semibold text-[#2f2418]">{safeDocumentText(item.product_name)}</div>
                        <div className="text-[10px] text-[#8a7255] font-mono">{safeDocumentText(item.product_code)}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-medium text-[#2f2418]">{item.quantity || 1}</td>
                      <td className="py-2 px-2 text-right font-medium text-[#2f2418]">{formatDocumentMoney(item.unit_base_price)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-[#2f2418]">{formatDocumentMoney(item.total_base_price)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-[#2f2418]">
                        {formatDocumentMoney(item.monthly_amount)}
                        {item.monthly_yield_percent ? <span className="ml-1 text-[10px] text-[#8a7255]">({item.monthly_yield_percent}%)</span> : null}
                      </td>
                      <td className="py-2 pl-2 text-right font-semibold text-[#2f2418]">
                        {formatDocumentMoney(item.security_deposit_amount)}
                        {item.security_deposit_percent ? <span className="ml-1 text-[10px] text-[#8a7255]">({item.security_deposit_percent}%)</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="document-card my-4 rounded-xl border border-border bg-card p-4">
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
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="document-card rounded-xl border border-border bg-card p-4">
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
                : "No winner benefit is recorded for this subscription in the current backend payload. Future EMI waiver is shown only from backend waiver records."}
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

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Customer Obligations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Pay monthly EMI dues as per the backend contract record and preserve system receipts.</li>
            <li>Report phone, address, delivery, cancellation, return, or service changes through approved shop workflows.</li>
            <li>Understand that this print copy is not a payment receipt and does not settle any outstanding amount.</li>
          </ul>
        </section>

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
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
          customerSignatureUrl={customerSignatureUrl}
          customerSignatureTimestamp={customerSignatureTimestamp}
        />

        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
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
