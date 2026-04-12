"use client";

import { useEffect, useState } from "react";
import { FileBadge2, FileText, Receipt, RotateCcw } from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import {
  listBillingCreditNotes,
  listBillingDebitNotes,
  listBillingInvoices,
  listBillingProfiles,
  listDirectSales,
  listReceiptDocuments,
  type BillingInvoice,
} from "@/services/billing";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";

export default function BillingOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [creditCount, setCreditCount] = useState(0);
  const [debitCount, setDebitCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [contractCount, setContractCount] = useState(0);
  const [directSaleCount, setDirectSaleCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const [invoicePayload, creditPayload, debitPayload, receiptPayload, contractPayload, directSalePayload] = await Promise.all([
          listBillingInvoices(),
          listBillingCreditNotes(),
          listBillingDebitNotes(),
          listReceiptDocuments(),
          listBillingProfiles(),
          listDirectSales(),
        ]);
        if (cancelled) return;
        setInvoices(invoicePayload.results);
        setCreditCount(creditPayload.count);
        setDebitCount(debitPayload.count);
        setReceiptCount(receiptPayload.count);
        setContractCount(contractPayload.count);
        setDirectSaleCount(directSalePayload.count);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load billing operations."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  const postedInvoices = invoices.filter((row) => row.status === "POSTED");
  const draftInvoices = invoices.filter((row) => row.status === "DRAFT").length;
  const approvedInvoices = invoices.filter((row) => row.status === "APPROVED").length;
  const latestPosted = postedInvoices[0];

  return (
    <PortalPage
      className="receipt-print-page"
      title="Billing Operations"
      subtitle="Unified retail and EMI-facing billing registers with GST-ready structure, receipts, and controlled accounting posting."
      helperNote="Billing mirrors and extends source records without replacing subscription, payment, stock, or accounting truth."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing" },
      ]}
      statusBadge={{ label: "Admin Controlled", tone: "info" }}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "primary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
        { href: ROUTES.admin.billingContracts, label: "Contracts", variant: "secondary" },
        { href: ROUTES.admin.billingCreditNotes, label: "Credit Notes", variant: "secondary" },
        { href: ROUTES.admin.billingDebitNotes, label: "Debit Notes", variant: "secondary" },
        { href: ROUTES.admin.billingReceipts, label: "Receipts", variant: "secondary" },
        { href: ROUTES.admin.billingDailyBook, label: "Daily Book", variant: "secondary" },
        { href: ROUTES.admin.billingCashBook, label: "Cash Book", variant: "secondary" },
      ]}
      stats={[
        { label: "Invoices", value: String(invoices.length), tone: "info" },
        { label: "Direct Sales", value: String(directSaleCount), tone: "info" },
        { label: "Contracts", value: String(contractCount), tone: "info" },
        { label: "Credit Notes", value: String(creditCount), tone: creditCount > 0 ? "warning" : "default" },
        { label: "Debit Notes", value: String(debitCount), tone: debitCount > 0 ? "info" : "default" },
        { label: "Receipts", value: String(receiptCount), tone: "success" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading billing operations..." /> : null}
      {!loading && error ? <ErrorState title="Billing load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <div className="receipt-print-hide grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Draft Invoices"
              value={String(draftInvoices)}
              subtext="Draft documents can still be edited before approval."
              tone={draftInvoices > 0 ? "warning" : "default"}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              label="Approved Invoices"
              value={String(approvedInvoices)}
              subtext="Approved invoices are ready for posting into billing and stock."
              tone={approvedInvoices > 0 ? "warning" : "success"}
              icon={<FileBadge2 className="h-5 w-5" />}
            />
            <StatCard
              label="Direct Sales"
              value={String(directSaleCount)}
              subtext="Separate operational retail orders feeding the billing engine without overloading EMI tables."
              tone={directSaleCount > 0 ? "info" : "default"}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              label="Receipt Register"
              value={String(receiptCount)}
              subtext="Retail and EMI payment receipts are tracked separately from payment posting."
              tone="success"
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Billing Contracts"
              value={String(contractCount)}
              subtext="Contract mirrors trace delivery-gated invoice eligibility and next-due EMI context."
              tone={contractCount > 0 ? "info" : "default"}
              icon={<RotateCcw className="h-5 w-5" />}
            />
          </div>

          <WorkspaceSection
            title="Latest Posted Invoice"
            description="Printable preview from the live billing document register."
          >
            <PrintActionBanner
              className="mb-3"
              title="Invoice Print / PDF"
              description="Use this action to print the posted invoice preview or save an operator-safe PDF."
            />
            {latestPosted ? (
              <BillingPrintDocument
                title={latestPosted.tax_mode === "GST" ? "GST Tax Invoice" : "Retail Invoice"}
                subtitle={`${latestPosted.billing_channel} billing document preview for operator review`}
                reference={latestPosted.document_no ?? `Invoice ${latestPosted.id}`}
                meta={`Customer ${latestPosted.customer_name_snapshot || latestPosted.customer_name || "Walk-in"}`}
                statusLabel={latestPosted.status}
                statusToneClassName={
                  latestPosted.status === "POSTED"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : latestPosted.status === "APPROVED"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-slate-100 text-slate-800"
                }
                partyFields={[
                  {
                    label: "Customer",
                    value: latestPosted.customer_name_snapshot || latestPosted.customer_name || "Walk-in",
                    emphasize: true,
                  },
                  {
                    label: "Contact",
                    value: latestPosted.customer_phone_snapshot || "—",
                  },
                  {
                    label: "GSTIN",
                    value: latestPosted.customer_gstin || "—",
                  },
                  {
                    label: "Branch",
                    value: latestPosted.branch_name || latestPosted.branch_code || "Primary",
                  },
                ]}
                referenceFields={[
                  { label: "Invoice Date", value: latestPosted.invoice_date },
                  { label: "Channel", value: latestPosted.billing_channel },
                  { label: "Tax Mode", value: latestPosted.tax_mode },
                  {
                    label: "Source Reference",
                    value:
                      latestPosted.direct_sale_no ||
                      latestPosted.source_reference ||
                      latestPosted.source_type ||
                      "Manual",
                  },
                ]}
                summaryFields={[
                  { label: "Sub Total", value: accountingMoney(latestPosted.subtotal) },
                  { label: "Tax Total", value: accountingMoney(latestPosted.tax_total) },
                  { label: "Grand Total", value: accountingMoney(latestPosted.grand_total) },
                  { label: "Received", value: accountingMoney(latestPosted.received_total) },
                  { label: "Balance Due", value: accountingMoney(latestPosted.balance_total) },
                ]}
                detailFields={[
                  { label: "Document Status", value: latestPosted.status },
                  { label: "Finance Account", value: latestPosted.finance_account_name || "—" },
                  { label: "Journal Entry", value: latestPosted.posted_journal_entry_no || "Pending" },
                  { label: "Remarks", value: latestPosted.notes || "—" },
                ]}
                lineItems={(latestPosted.lines || []).slice(0, 6).map((line) => ({
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: accountingMoney(line.unit_price),
                  lineTotal: accountingMoney(line.line_total),
                  note: [line.product_code, line.inventory_item_sku].filter(Boolean).join(" • "),
                }))}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Post a billing invoice to preview the branded print layout here.
              </div>
            )}
          </WorkspaceSection>
        </>
      ) : null}
    </PortalPage>
  );
}
