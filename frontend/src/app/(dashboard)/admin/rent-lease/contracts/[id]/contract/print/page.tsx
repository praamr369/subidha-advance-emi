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
import QRCode from "react-qr-code";
import DynamicUpiQrModal from "@/components/payments/DynamicUpiQrModal";

type PlanType = "RENT" | "LEASE";

type RentLeaseProfile = {
  security_deposit_percent?: string | null;
  security_deposit_amount?: string | null;
  refundable_security_deposit?: string | null;
  return_condition_status?: string | null;
  deduction_amount?: string | null;
  refund_amount?: string | null;
  refund_status?: string | null;
  return_inspection_notes?: string | null;
  handover_notes?: string | null;
  contract_terms_snapshot?: string | null;
  buyout_amount?: string | null;
  ownership_transfer_allowed?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type FinancialSummary = {
  paid_amount?: string | null;
  pending_amount?: string | null;
  remaining_amount?: string | null;
  outstanding_amount?: string | null;
};

type ContractItemRecord = {
  id: number;
  product_id: number;
  product_name: string;
  product_code?: string;
  sku?: string;
  category?: string;
  quantity: number;
  unit_base_price: string;
  total_base_price: string;
  monthly_yield_percent: string;
  monthly_amount: string;
  security_deposit_amount: string;
};

type SubscriptionContractRecord = {
  id: number;
  subscription_number?: string | null;
  contract_reference?: string | null;
  contract_items?: ContractItemRecord[] | null;
  customer?: number | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  product_name?: string | null;
  product_code?: string | null;
  plan_type?: string | null;
  tenure_months?: number | null;
  start_date?: string | null;
  created_at?: string | null;
  total_amount?: string | null;
  monthly_amount?: string | null;
  status?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  delivery_status?: string | null;
  fulfillment_status?: string | null;
  financial_summary?: FinancialSummary | null;
  rent_profile?: RentLeaseProfile | null;
  lease_profile?: RentLeaseProfile | null;
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

type ProductPossessionRecord = {
  id?: number | null;
  status?: string | null;
  handover_date?: string | null;
  expected_return_date?: string | null;
  actual_return_date?: string | null;
  handover_condition_notes?: string | null;
  return_condition_notes?: string | null;
  serial_number?: string | null;
};

function statusToken(value: string | null | undefined): string {
  return safeDocumentText(value, "UNKNOWN").toUpperCase();
}

function isRentLeasePlan(value: string | null | undefined): value is PlanType {
  const token = statusToken(value);
  return token === "RENT" || token === "LEASE";
}

function contractReference(subscription: SubscriptionContractRecord): string {
  return (
    safeDocumentText(subscription.contract_reference, "") ||
    safeDocumentText(subscription.subscription_number, "") ||
    `SUB-${subscription.id}`
  );
}

function customerAddress(customer: CustomerRecord | null): string {
  if (!customer) return "—";
  return joinDocumentLines([customer.address, customer.city]);
}

function profileFor(subscription: SubscriptionContractRecord): RentLeaseProfile | null {
  const planType = statusToken(subscription.plan_type);
  if (planType === "RENT") return subscription.rent_profile ?? null;
  if (planType === "LEASE") return subscription.lease_profile ?? null;
  return null;
}

function buildContractTerms(subscription: SubscriptionContractRecord, profile: RentLeaseProfile | null): string[] {
  const planType = statusToken(subscription.plan_type) === "LEASE" ? "Lease" : "Rent";
  const snapshot = safeDocumentText(profile?.contract_terms_snapshot, "");
  const terms = [
    `${planType} contract amount, monthly amount, tenure, deposit, refund, and deduction values are displayed only from backend contract records.`,
    "The customer must pay monthly dues on time, preserve receipts, maintain the asset in reasonable condition, and return or hand over the asset as recorded by shop workflow.",
    "Refundable security deposit remains subject to backend deposit liability, return inspection, damage, deduction, and refund controls.",
    "Subidha Furniture must maintain auditable contract, billing, receipt, delivery, possession, return inspection, deposit, and reconciliation records.",
    "This print copy is not a receipt, refund approval, possession handover, stock movement, or accounting posting.",
  ];
  return snapshot ? [snapshot, ...terms] : terms;
}

export default function AdminRentLeaseContractPrintPage() {
  const params = useParams<{ id: string }>();
  const contractId = params?.id;
  const [subscription, setSubscription] = useState<SubscriptionContractRecord | null>(null);
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [possession, setPossession] = useState<ProductPossessionRecord | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upiQrModalOpen, setUpiQrModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadContract() {
      if (!contractId) return;
      setLoading(true);
      setError(null);

      try {
        const subscriptionPayload = await apiFetch<SubscriptionContractRecord>(
          `/admin/subscriptions/${contractId}/`,
          { cache: "no-store" }
        );

        if (!subscriptionPayload.documents || subscriptionPayload.documents.length === 0) {
          try {
            const docsRes = await apiFetch<{ results?: SubscriptionContractRecord["documents"] }>(
              `/admin/subscriptions/${contractId}/documents/`,
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
        let possessionPayload: ProductPossessionRecord | null = null;
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

        try {
          possessionPayload = await apiFetch<ProductPossessionRecord>(
            `/admin/contracts/${contractId}/possession/`,
            { cache: "no-store" }
          );
        } catch {
          possessionPayload = null;
        }

        if (!mounted) return;
        setSubscription(subscriptionPayload);
        setCustomer(customerPayload);
        setPossession(possessionPayload);
      } catch (err) {
        if (!mounted) return;
        setSubscription(null);
        setCustomer(null);
        setPossession(null);
        setError(err instanceof Error ? err.message : "Failed to load rent/lease contract.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadContract();

    return () => {
      mounted = false;
    };
  }, [contractId]);

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
    return <ERPLoadingState label="Loading rent/lease contract..." />;
  }

  if (error || !subscription) {
    return (
      <ERPErrorState
        title="Unable to load rent/lease contract"
        description={error || "The requested rent/lease contract could not be loaded."}
      />
    );
  }

  if (!isRentLeasePlan(subscription.plan_type)) {
    return (
      <ERPErrorState
        title="Not a rent/lease contract"
        description="This print route is only for RENT or LEASE subscription-backed contracts."
      />
    );
  }

  const planType = statusToken(subscription.plan_type) as PlanType;
  const profile = profileFor(subscription);
  const reference = contractReference(subscription);
  const status = statusToken(subscription.status);
  const outstanding =
    subscription.financial_summary?.outstanding_amount ??
    subscription.financial_summary?.remaining_amount ??
    subscription.financial_summary?.pending_amount;
  const watermark = documentStatusWatermark(status);

  const customerSignatureUrl = customerSignatureDoc?.file_url ?? null;
  const customerPhotoUrl = customerPhotoDoc?.file_url ?? null;
  const customerSignatureTimestamp = customerSignatureDoc?.created_at
    ? formatDocumentDateTime(customerSignatureDoc.created_at)
    : null;

  const resolvedUpiId = (subidhaDocumentTheme.upiId || "").trim() || "subidha@upi";
  const resolvedMerchantName = (subidhaDocumentTheme.businessName || "").trim() || "Subidha Furniture";
  const monthlyAmt = Number(subscription?.monthly_amount || 0);
  const depositAmt = Number(profile?.security_deposit_amount || 0);

  const rentUpiUri = (() => {
    if (!subscription || monthlyAmt <= 0) return "";
    const params = new URLSearchParams();
    params.set("pa", resolvedUpiId);
    params.set("pn", resolvedMerchantName);
    params.set("am", monthlyAmt.toFixed(2));
    params.set("cu", "INR");
    params.set("tn", `Monthly Rent ${reference}`);
    return `upi://pay?${params.toString()}`;
  })();

  const depositUpiUri = (() => {
    if (!subscription || depositAmt <= 0) return "";
    const params = new URLSearchParams();
    params.set("pa", resolvedUpiId);
    params.set("pn", resolvedMerchantName);
    params.set("am", depositAmt.toFixed(2));
    params.set("cu", "INR");
    params.set("tn", `Security Deposit ${reference}`);
    return `upi://pay?${params.toString()}`;
  })();

  return (
    <>
      <PrintToolbar
        copyLabel={copyLabel}
        onCopyLabelChange={setCopyLabel}
        backHref={buildAdminSubscriptionRoute(subscription.id)}
        onUpiQrClick={() => setUpiQrModalOpen(true)}
      />
      <DocumentPage watermark={watermark}>
        <DocumentHeader
          copyLabel={copyLabel}
          documentNo={reference}
          documentDate={formatDocumentDate(subscription.start_date || subscription.created_at)}
        />

        <DocumentTitleStrip
          title="RENT / LEASE AGREEMENT"
          subtitle="Read-only agreement generated from backend rent/lease subscription records."
          status={`${planType} · ${status}`}
        />

        <DocumentMetadataGrid
          items={[
            { label: "Contract Ref", value: reference },
            { label: "Contract Type", value: planType === "RENT" ? "Rent" : "Lease" },
            { label: "Status", value: status },
            { label: "Branch", value: safeDocumentText(subscription.branch_name || subscription.branch_code) },
            { label: "Start Date", value: formatDocumentDate(subscription.start_date) },
            { label: "Tenure", value: typeof subscription.tenure_months === "number" ? `${subscription.tenure_months} months` : "—" },
            { label: "Delivery / Handover", value: safeDocumentText(possession?.status || subscription.delivery_status || subscription.fulfillment_status) },
            { label: "Generated At", value: formatDocumentDateTime(generatedAt) },
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

        <section className="document-card my-4 rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">
            {subscription.contract_items && subscription.contract_items.length > 1
              ? `Attached Furniture Items (${subscription.contract_items.length})`
              : "Asset / Product"}
          </div>
          {subscription.contract_items && subscription.contract_items.length > 1 ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] font-black uppercase tracking-[0.1em] text-[#8a7255]">
                    <th className="py-1.5 px-2">Item</th>
                    <th className="py-1.5 px-2">Code</th>
                    <th className="py-1.5 px-2 text-center">Qty</th>
                    <th className="py-1.5 px-2 text-right">Unit Price</th>
                    <th className="py-1.5 px-2 text-right">Line Total</th>
                    <th className="py-1.5 px-2 text-right">Monthly {planType === "RENT" ? "Rent" : "Lease"}</th>
                    <th className="py-1.5 px-2 text-right">Deposit Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscription.contract_items.map((itm) => (
                    <tr key={itm.id} className="text-[#2f2418]">
                      <td className="py-2 px-2 font-semibold">{itm.product_name}</td>
                      <td className="py-2 px-2 font-mono text-[11px]">{itm.product_code || "—"}</td>
                      <td className="py-2 px-2 text-center font-semibold">{itm.quantity}</td>
                      <td className="py-2 px-2 text-right font-mono">{formatDocumentMoney(itm.unit_base_price)}</td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">{formatDocumentMoney(itm.total_base_price)}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-[#8a5a22]">
                        {formatDocumentMoney(itm.monthly_amount)}
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">({itm.monthly_yield_percent}%)</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold text-[#8a5a22]">
                        {formatDocumentMoney(itm.security_deposit_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Asset / Product</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(subscription.product_name)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Code</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(subscription.product_code)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Serial / Identifier</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(possession?.serial_number)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Expected Return</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentDate(possession?.expected_return_date)}</div>
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="document-card rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8a5a22]">Commercial Terms</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Monthly {planType === "RENT" ? "Rent" : "Lease"}</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentMoney(subscription.monthly_amount)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Payment Cycle</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">Monthly</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Handover Date</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentDate(possession?.handover_date)}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Actual Return</div>
                <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentDate(possession?.actual_return_date)}</div>
              </div>
              {planType === "LEASE" ? (
                <>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Buyout Amount</div>
                    <div className="mt-1 text-sm font-semibold text-[#2f2418]">{profile?.buyout_amount ? formatDocumentMoney(profile.buyout_amount) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Ownership Transfer</div>
                    <div className="mt-1 text-sm font-semibold text-[#2f2418]">{profile?.ownership_transfer_allowed ? "Allowed" : "Not allowed"}</div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-[#eadcc6] bg-[#fff6e4] px-4 py-3 text-sm text-[#6f5c46]">
              Due date rule is shown only when backend exposes a specific due-date policy. This contract print does not generate a billing schedule or demand rows.
            </div>
          </section>

          <DocumentAmountSummary
            rows={[
              { label: "Contract Value", value: formatDocumentMoney(subscription.total_amount), strong: true },
              { label: `Monthly ${planType === "RENT" ? "Rent" : "Lease"}`, value: formatDocumentMoney(subscription.monthly_amount) },
              { label: "Security Deposit", value: formatDocumentMoney(profile?.security_deposit_amount), strong: true },
              { label: "Refundable Deposit", value: formatDocumentMoney(profile?.refundable_security_deposit) },
              { label: "Deduction Amount", value: formatDocumentMoney(profile?.deduction_amount) },
              { label: "Refund Amount", value: formatDocumentMoney(profile?.refund_amount) },
              { label: "Outstanding / Balance", value: formatDocumentMoney(outstanding), strong: true, danger: Number(outstanding ?? 0) > 0 },
            ]}
          />
          <div className="my-3 grid gap-3 sm:grid-cols-2">
            {monthlyAmt > 0 && rentUpiUri ? (
              <div className="document-card flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-900">
                    Monthly {planType === "RENT" ? "Rent" : "Lease"} · UPI Scan
                  </div>
                  <div className="mt-0.5 text-xs text-indigo-950 font-bold font-mono">
                    {formatDocumentMoney(subscription.monthly_amount)}
                  </div>
                  <div className="text-[9px] text-stone-500 font-mono">
                    UPI: {resolvedUpiId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUpiQrModalOpen(true)}
                  className="shrink-0 bg-white p-1 rounded-lg border border-indigo-200 shadow-2xs hover:border-indigo-400 transition cursor-pointer print:cursor-default"
                  title="Click to open dynamic price-written QR pay dialog"
                >
                  <QRCode value={rentUpiUri} size={54} />
                </button>
              </div>
            ) : null}
            {depositAmt > 0 && depositUpiUri ? (
              <div className="document-card flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                    Security Deposit · UPI Scan
                  </div>
                  <div className="mt-0.5 text-xs text-amber-950 font-bold font-mono">
                    {formatDocumentMoney(profile?.security_deposit_amount)}
                  </div>
                  <div className="text-[9px] text-stone-500 font-mono">
                    UPI: {resolvedUpiId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUpiQrModalOpen(true)}
                  className="shrink-0 bg-white p-1 rounded-lg border border-amber-200 shadow-2xs hover:border-amber-400 transition cursor-pointer print:cursor-default"
                  title="Click to open dynamic price-written QR pay dialog"
                >
                  <QRCode value={depositUpiUri} size={54} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Deposit Liability / Refund Note</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Deposit %</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(profile?.security_deposit_percent)}%</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Refund Status</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(profile?.refund_status)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Return Condition</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{safeDocumentText(profile?.return_condition_status)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Profile Updated</div>
              <div className="mt-1 text-sm font-semibold text-[#2f2418]">{formatDocumentDateTime(profile?.updated_at)}</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#6f5c46]">
            Security deposit refund, deduction, withholding, and final refund status must be processed only through backend deposit/refund and return-inspection controls.
          </p>
        </section>

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Return / Handover Condition</div>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Handover Notes</div>
              <div className="mt-1 whitespace-pre-line text-sm leading-5 text-[#6f5c46]">{safeDocumentText(profile?.handover_notes || possession?.handover_condition_notes)}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a7255]">Return / Damage Notes</div>
              <div className="mt-1 whitespace-pre-line text-sm leading-5 text-[#6f5c46]">{safeDocumentText(profile?.return_inspection_notes || possession?.return_condition_notes)}</div>
            </div>
          </div>
        </section>

        <DocumentTermsBlock terms={buildContractTerms(subscription, profile)} />

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Customer Obligations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Pay monthly rent/lease dues and preserve system receipts.</li>
            <li>Use the asset responsibly and report damage, service issues, address changes, or return requests through approved workflows.</li>
            <li>Return or hand over the asset with accessories and condition details as recorded by shop staff.</li>
          </ul>
        </section>

        <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Business Obligations</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#6f5c46]">
            <li>Maintain auditable contract, billing, receipt, deposit liability, delivery, possession, and return-inspection records.</li>
            <li>Process deposit deduction and refund only from approved backend workflows and recorded return condition evidence.</li>
            <li>Keep accounting, reconciliation, stock, and delivery state changes separate from this read-only print document.</li>
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
          <span>Read-only contract print generated from existing backend payloads.</span>
        </div>

        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>

      {upiQrModalOpen && subscription && (
        <DynamicUpiQrModal
          isOpen={upiQrModalOpen}
          onClose={() => setUpiQrModalOpen(false)}
          title={`${planType === "RENT" ? "Rent" : "Lease"} Agreement Payment QR`}
          subtitle={`${reference} · ${subscription.customer_name || ""}`}
          referenceNo={reference}
          customerName={subscription.customer_name || customer?.name || ""}
          customerPhone={subscription.customer_phone || customer?.phone || ""}
          customerId={subscription.customer_id ?? subscription.customer ?? null}
          defaultAmount={depositAmt > 0 ? depositAmt : monthlyAmt > 0 ? monthlyAmt : Number(outstanding || 0)}
          sourceType="SUBSCRIPTION"
          sourceId={subscription.id}
          presets={[
            ...(depositAmt > 0 ? [{
              label: "Security Deposit",
              amount: depositAmt,
              description: "Security deposit amount",
              defaultNote: `Security Deposit for ${reference}`,
            }] : []),
            ...(monthlyAmt > 0 ? [{
              label: `Monthly ${planType === "RENT" ? "Rent" : "Lease"}`,
              amount: monthlyAmt,
              description: `Monthly installment`,
              defaultNote: `Monthly Rent for ${reference}`,
            }] : []),
            ...(depositAmt > 0 && monthlyAmt > 0 ? [{
              label: "Rent + Security Deposit",
              amount: monthlyAmt + depositAmt,
              description: "Combined monthly rent and security deposit",
              defaultNote: `Rent & Security Deposit for ${reference}`,
            }] : []),
            ...(Number(outstanding || 0) > 0 ? [{
              label: "Total Outstanding",
              amount: Number(outstanding),
              description: "Total contract dues",
              defaultNote: `Contract Outstanding for ${reference}`,
            }] : []),
          ]}
        />
      )}
    </>
  );
}
