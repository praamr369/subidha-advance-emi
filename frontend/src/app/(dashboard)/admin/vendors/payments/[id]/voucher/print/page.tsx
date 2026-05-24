"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentLineItemsTable,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
  type DocumentLineItem,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";
import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  documentUnsafeStatusMessage,
  formatDocumentDate,
  formatDocumentMoney,
  joinDocumentLines,
  normalizeDocumentStatus,
  safeDocumentText,
  unsafeDocumentStatusLabel,
} from "@/lib/documents/formatters";
import { ROUTES } from "@/lib/routes";

type VendorAddressRecord = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  is_primary?: boolean | null;
};

type VendorRecord = {
  id: number;
  name?: string | null;
  display_name?: string | null;
  legal_name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  addresses?: VendorAddressRecord[];
};

type VendorPaymentRecord = {
  id: number;
  payment_no?: string | null;
  payment_date?: string | null;
  vendor?: number | null;
  vendor_name?: string | null;
  vendor_bill?: number | null;
  vendor_bill_no?: string | null;
  amount?: string | null;
  finance_account?: number | null;
  finance_account_name?: string | null;
  status?: string | null;
  posted_journal_entry_no?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type VendorOutstandingRecord = {
  outstanding?: string | null;
  vendor_payments?: string | null;
  purchase_bills?: string | null;
};

type VendorBillRecord = {
  id: number;
  bill_no?: string | null;
  bill_date?: string | null;
  status?: string | null;
  grand_total?: string | null;
};

function displayStatus(status: string | null | undefined): string {
  return unsafeDocumentStatusLabel(status) || normalizeDocumentStatus(status) || "—";
}

function buildVendorAddress(vendor: VendorRecord | null): string {
  const primary = vendor?.addresses?.find((address) => address.is_primary) ?? vendor?.addresses?.[0];
  if (!primary) return "—";
  return joinDocumentLines([
    primary.address_line1,
    primary.address_line2,
    [primary.city, primary.district, primary.state, primary.pincode]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join(", "),
  ]);
}

function buildAllocationItems(payment: VendorPaymentRecord, bill: VendorBillRecord | null): DocumentLineItem[] {
  const billNo = payment.vendor_bill_no || bill?.bill_no;
  if (!billNo && !payment.vendor_bill) return [];
  return [
    {
      key: payment.vendor_bill || bill?.id || payment.id,
      description: billNo || `Vendor Bill ${payment.vendor_bill}`,
      code: bill?.status ? `Status: ${bill.status}` : undefined,
      quantity: "1",
      rate: formatDocumentMoney(payment.amount),
      discount: "—",
      tax: "—",
      total: formatDocumentMoney(payment.amount),
    },
  ];
}

export default function AdminVendorPaymentVoucherPrintPage() {
  const params = useParams<{ id: string }>();
  const paymentId = params?.id;
  const [payment, setPayment] = useState<VendorPaymentRecord | null>(null);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [outstanding, setOutstanding] = useState<VendorOutstandingRecord | null>(null);
  const [vendorBill, setVendorBill] = useState<VendorBillRecord | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadVoucher() {
      if (!paymentId) return;
      setLoading(true);
      setError(null);
      try {
        const paymentPayload = await apiFetch<VendorPaymentRecord>(`/inventory/vendor-payments/${paymentId}/`, { cache: "no-store" });
        let vendorPayload: VendorRecord | null = null;
        let outstandingPayload: VendorOutstandingRecord | null = null;
        let billPayload: VendorBillRecord | null = null;

        if (paymentPayload.vendor != null) {
          try {
            vendorPayload = await apiFetch<VendorRecord>(`/admin/vendors/${paymentPayload.vendor}/`, { cache: "no-store" });
          } catch {
            vendorPayload = null;
          }
          try {
            outstandingPayload = await apiFetch<VendorOutstandingRecord>(`/admin/vendors/${paymentPayload.vendor}/outstanding/`, { cache: "no-store" });
          } catch {
            outstandingPayload = null;
          }
        }

        if (paymentPayload.vendor_bill != null) {
          try {
            billPayload = await apiFetch<VendorBillRecord>(`/inventory/vendor-bills/${paymentPayload.vendor_bill}/`, { cache: "no-store" });
          } catch {
            billPayload = null;
          }
        }

        if (!mounted) return;
        setPayment(paymentPayload);
        setVendor(vendorPayload);
        setOutstanding(outstandingPayload);
        setVendorBill(billPayload);
      } catch (err) {
        if (!mounted) return;
        setPayment(null);
        setVendor(null);
        setOutstanding(null);
        setVendorBill(null);
        setError(err instanceof Error ? err.message : "Failed to load vendor payment voucher.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadVoucher();
    return () => {
      mounted = false;
    };
  }, [paymentId]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading vendor payment voucher..." />;
  if (error || !payment) {
    return <ERPErrorState title="Unable to load vendor payment voucher" description={error || "The requested vendor payment voucher could not be loaded."} />;
  }

  const status = displayStatus(payment.status);
  const unsafeMessage = documentUnsafeStatusMessage(payment.status, "vendor payment voucher");
  const watermark = documentStatusWatermark(payment.status);
  const vendorName = vendor?.display_name || vendor?.name || payment.vendor_name;
  const allocationItems = buildAllocationItems(payment, vendorBill);

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.purchaseVendorPayments} />
      <DocumentPage watermark={watermark}>
        <DocumentHeader copyLabel={copyLabel} documentNo={payment.payment_no || `Vendor Payment ${payment.id}`} documentDate={formatDocumentDate(payment.payment_date)} />
        <DocumentTitleStrip title="VENDOR PAYMENT VOUCHER" subtitle="Read-only payment voucher generated from existing vendor payment records." status={status} />
        {unsafeMessage ? (
          <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {unsafeMessage}
          </div>
        ) : null}
        <DocumentMetadataGrid
          items={[
            { label: "Voucher Ref", value: safeDocumentText(payment.payment_no, `#${payment.id}`) },
            { label: "Payment Date", value: formatDocumentDate(payment.payment_date) },
            { label: "Status", value: status },
            { label: "Payment Method", value: safeDocumentText(payment.finance_account_name) },
            { label: "Finance Account", value: safeDocumentText(payment.finance_account_name) },
            { label: "Transaction Ref", value: safeDocumentText(payment.reference_no) },
            { label: "Vendor Bill", value: safeDocumentText(payment.vendor_bill_no || vendorBill?.bill_no) },
            { label: "Journal", value: safeDocumentText(payment.posted_journal_entry_no) },
          ]}
        />
        <DocumentPartyPanel
          parties={[
            {
              title: "Paid To",
              name: vendorName,
              phone: vendor?.phone,
              email: vendor?.email,
              address: buildVendorAddress(vendor),
              gstin: vendor?.gstin || undefined,
            },
            {
              title: "Paid By",
              name: subidhaDocumentTheme.businessName,
              phone: subidhaDocumentTheme.phone,
              email: subidhaDocumentTheme.email,
              address: subidhaDocumentTheme.addressLines.join("\n"),
            },
          ]}
        />
        {allocationItems.length ? <DocumentLineItemsTable items={allocationItems} /> : null}
        <DocumentAmountSummary
          rows={[
            { label: "Paid Amount", value: formatDocumentMoney(payment.amount), strong: true },
            { label: "Allocated Bill Total", value: formatDocumentMoney(vendorBill?.grand_total) },
            { label: "Vendor Payments Total", value: formatDocumentMoney(outstanding?.vendor_payments) },
            { label: "Payable Balance After Payment", value: formatDocumentMoney(outstanding?.outstanding), strong: true, danger: Number(outstanding?.outstanding ?? 0) > 0 },
          ]}
        />
        <DocumentTermsBlock
          terms={[
            "This voucher confirms only the vendor payment amount shown in the backend payment record.",
            "Payment allocation, payable balance, accounting posting, and reconciliation state are not recalculated in this print page.",
            "Cancelled, reversed, or voided vendor payment vouchers are retained for audit and are not proof of active settlement.",
          ]}
        />
        {payment.notes ? (
          <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Notes</div>
            <div className="mt-2 whitespace-pre-line text-xs leading-5 text-[#6f5c46]">{payment.notes}</div>
          </section>
        ) : null}
        <DocumentSignatureBlock labels={[subidhaDocumentTheme.signatureLabels.authorized, "Vendor Receiver Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={ROUTES.admin.purchaseVendorPayments} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to vendor payments
          </Link>
          <span>Read-only vendor payment voucher generated from existing backend payloads.</span>
        </div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
