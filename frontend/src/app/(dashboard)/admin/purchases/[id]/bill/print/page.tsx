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
  address_type?: string | null;
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

type VendorBillLineRecord = {
  id: number;
  inventory_item?: number | null;
  inventory_item_sku?: string | null;
  inventory_item_product_name?: string | null;
  description?: string | null;
  quantity?: string | null;
  unit_cost?: string | null;
  taxable_value?: string | null;
  tax_amount?: string | null;
  line_total?: string | null;
};

type VendorBillRecord = {
  id: number;
  bill_no?: string | null;
  bill_date?: string | null;
  vendor?: number | null;
  vendor_name?: string | null;
  purchase_order?: number | null;
  purchase_order_no?: string | null;
  goods_receipt?: number | null;
  goods_receipt_no?: string | null;
  finance_account?: number | null;
  finance_account_name?: string | null;
  status?: string | null;
  subtotal?: string | null;
  tax_total?: string | null;
  grand_total?: string | null;
  posted_journal_entry_no?: string | null;
  notes?: string | null;
  lines?: VendorBillLineRecord[];
  created_at?: string | null;
  updated_at?: string | null;
};

type VendorOutstandingRecord = {
  outstanding?: string | null;
  vendor_payments?: string | null;
  purchase_bills?: string | null;
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

function buildLineItems(bill: VendorBillRecord): DocumentLineItem[] {
  return (bill.lines || []).map((line, index) => ({
    key: line.id || `${index}-${line.description}`,
    description: safeDocumentText(line.description || line.inventory_item_product_name, `Item ${index + 1}`),
    code: [line.inventory_item_sku, line.inventory_item_product_name]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join(" · "),
    quantity: safeDocumentText(line.quantity),
    rate: formatDocumentMoney(line.unit_cost),
    discount: "—",
    tax: formatDocumentMoney(line.tax_amount),
    total: formatDocumentMoney(line.line_total),
  }));
}

export default function AdminPurchaseBillPrintPage() {
  const params = useParams<{ id: string }>();
  const billId = params?.id;
  const [bill, setBill] = useState<VendorBillRecord | null>(null);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [outstanding, setOutstanding] = useState<VendorOutstandingRecord | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadBill() {
      if (!billId) return;
      setLoading(true);
      setError(null);
      try {
        const billPayload = await apiFetch<VendorBillRecord>(`/inventory/vendor-bills/${billId}/`, { cache: "no-store" });
        let vendorPayload: VendorRecord | null = null;
        let outstandingPayload: VendorOutstandingRecord | null = null;
        if (billPayload.vendor != null) {
          try {
            vendorPayload = await apiFetch<VendorRecord>(`/admin/vendors/${billPayload.vendor}/`, { cache: "no-store" });
          } catch {
            vendorPayload = null;
          }
          try {
            outstandingPayload = await apiFetch<VendorOutstandingRecord>(`/admin/vendors/${billPayload.vendor}/outstanding/`, { cache: "no-store" });
          } catch {
            outstandingPayload = null;
          }
        }
        if (!mounted) return;
        setBill(billPayload);
        setVendor(vendorPayload);
        setOutstanding(outstandingPayload);
      } catch (err) {
        if (!mounted) return;
        setBill(null);
        setVendor(null);
        setOutstanding(null);
        setError(err instanceof Error ? err.message : "Failed to load purchase bill.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadBill();
    return () => {
      mounted = false;
    };
  }, [billId]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading purchase bill..." />;
  if (error || !bill) {
    return <ERPErrorState title="Unable to load purchase bill" description={error || "The requested purchase bill could not be loaded."} />;
  }

  const status = displayStatus(bill.status);
  const unsafeMessage = documentUnsafeStatusMessage(bill.status, "purchase bill");
  const watermark = documentStatusWatermark(bill.status);
  const lineItems = buildLineItems(bill);
  const vendorName = vendor?.display_name || vendor?.name || bill.vendor_name;

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.purchaseBills} />
      <DocumentPage watermark={watermark}>
        <DocumentHeader copyLabel={copyLabel} documentNo={bill.bill_no || `Vendor Bill ${bill.id}`} documentDate={formatDocumentDate(bill.bill_date)} />
        <DocumentTitleStrip title="PURCHASE BILL / VENDOR BILL" subtitle="Read-only vendor bill generated from existing purchase records." status={status} />
        {unsafeMessage ? (
          <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {unsafeMessage}
          </div>
        ) : null}
        <DocumentMetadataGrid
          items={[
            { label: "Purchase Ref", value: safeDocumentText(bill.bill_no, `#${bill.id}`) },
            { label: "Vendor Invoice", value: safeDocumentText(bill.bill_no) },
            { label: "Purchase Date", value: formatDocumentDate(bill.bill_date) },
            { label: "Status", value: status },
            { label: "Purchase Order", value: safeDocumentText(bill.purchase_order_no) },
            { label: "Goods Receipt", value: safeDocumentText(bill.goods_receipt_no) },
            { label: "Finance Account", value: safeDocumentText(bill.finance_account_name) },
            { label: "Journal", value: safeDocumentText(bill.posted_journal_entry_no) },
          ]}
        />
        <DocumentPartyPanel
          parties={[
            {
              title: "Vendor",
              name: vendorName,
              phone: vendor?.phone,
              email: vendor?.email,
              address: buildVendorAddress(vendor),
              gstin: vendor?.gstin || undefined,
            },
            {
              title: "Billed To",
              name: subidhaDocumentTheme.businessName,
              phone: subidhaDocumentTheme.phone,
              email: subidhaDocumentTheme.email,
              address: subidhaDocumentTheme.addressLines.join("\n"),
            },
          ]}
        />
        <DocumentLineItemsTable items={lineItems} />
        <DocumentAmountSummary
          rows={[
            { label: "Subtotal", value: formatDocumentMoney(bill.subtotal) },
            { label: "Tax Total", value: formatDocumentMoney(bill.tax_total) },
            { label: "Grand Total", value: formatDocumentMoney(bill.grand_total), strong: true },
            { label: "Paid Amount", value: formatDocumentMoney(outstanding?.vendor_payments) },
            { label: "Vendor Outstanding", value: formatDocumentMoney(outstanding?.outstanding), strong: true, danger: Number(outstanding?.outstanding ?? 0) > 0 },
          ]}
        />
        {Number(outstanding?.outstanding ?? 0) > 0 ? (
          <div className="document-card mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Vendor payable remains outstanding as reported by backend vendor ledger. This print view does not settle payment.
          </div>
        ) : null}
        <DocumentTermsBlock
          terms={[
            "This purchase bill is printed from backend vendor bill records only.",
            "Tax, payable, inventory valuation, and accounting state are not recalculated in this print page.",
            "Cancelled, reversed, returned, draft, or voided purchase documents are retained for audit and are not normal payable documents.",
          ]}
        />
        {bill.notes ? (
          <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Notes</div>
            <div className="mt-2 whitespace-pre-line text-xs leading-5 text-[#6f5c46]">{bill.notes}</div>
          </section>
        ) : null}
        <DocumentSignatureBlock labels={[subidhaDocumentTheme.signatureLabels.authorized, "Vendor Acknowledgement Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={ROUTES.admin.purchaseBills} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to vendor bills
          </Link>
          <span>Read-only purchase bill print generated from existing backend payloads.</span>
        </div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
