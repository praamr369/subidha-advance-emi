"use client";

import { useEffect, useState } from "react";
import { FileBadge2, FileText, Receipt, RotateCcw } from "lucide-react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
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
import { toAmountInWordsINR } from "@/lib/print/formatters";

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
  const showMetrics = !loading && !error;

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Control"
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
        { label: "Invoices", value: showMetrics ? String(invoices.length) : "—", tone: showMetrics ? "info" : "default" },
        { label: "Direct Sales", value: showMetrics ? String(directSaleCount) : "—", tone: showMetrics ? "info" : "default" },
        { label: "Contracts", value: showMetrics ? String(contractCount) : "—", tone: showMetrics ? "info" : "default" },
        { label: "Credit Notes", value: showMetrics ? String(creditCount) : "—", tone: showMetrics && creditCount > 0 ? "warning" : "default" },
        { label: "Debit Notes", value: showMetrics ? String(debitCount) : "—", tone: showMetrics && debitCount > 0 ? "info" : "default" },
        { label: "Receipts", value: showMetrics ? String(receiptCount) : "—", tone: showMetrics ? "success" : "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading billing operations..." /> : null}
      {!loading && error ? <ERPErrorState title="Billing load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <ControlLaneGrid
            title="Billing lanes"
            description="Billing documents, direct sales, receipts, and accounting mirrors stay explicit so retail execution does not blur with EMI collection or ledger posting."
            lanes={[
              {
                title: "Document register",
                description: "Open the canonical billing register for invoice, receipt, and note workflows.",
                href: ROUTES.admin.billingRegister,
                icon: <FileText className="h-4 w-4" />,
                badge: "Register",
              },
              {
                title: "Direct sales",
                description: "Retail order and recovery workflows remain separate from subscription EMI collections.",
                href: ROUTES.admin.billingDirectSales,
                icon: <RotateCcw className="h-4 w-4" />,
                badge: "Retail",
              },
              {
                title: "Receipts",
                description: "Receipt documents remain distinct from payment posting and accounting books.",
                href: ROUTES.admin.billingReceipts,
                icon: <Receipt className="h-4 w-4" />,
                badge: "Receipt",
              },
              {
                title: "Accounting mirrors",
                description: "Open accounting control lanes when billing needs controlled posting or compliance follow-up.",
                href: ROUTES.admin.accounting,
                icon: <FileBadge2 className="h-4 w-4" />,
                badge: "Control",
              },
            ]}
          />
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
              value={showMetrics ? String(directSaleCount) : "—"}
              subtext="Separate operational retail orders feeding the billing engine without overloading EMI tables."
              tone={showMetrics && directSaleCount > 0 ? "info" : "default"}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              label="Receipt Register"
              value={showMetrics ? String(receiptCount) : "—"}
              subtext="Retail and EMI payment receipts are tracked separately from payment posting."
              tone={showMetrics ? "success" : "default"}
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Billing Contracts"
              value={showMetrics ? String(contractCount) : "—"}
              subtext="Contract mirrors trace delivery-gated invoice eligibility and next-due EMI context."
              tone={showMetrics && contractCount > 0 ? "info" : "default"}
              icon={<RotateCcw className="h-5 w-5" />}
            />
          </div>

          <WorkspaceDirectory
            title="Billing route directory"
            description="Group billing work by operator intent so staff can move between retail execution, document control, and accounting-adjacent follow-up without confusing the domains."
            className="receipt-print-hide"
            groups={[
              {
                title: "Document control",
                description: "Primary document registers for invoice and receipt handling.",
                items: [
	                  {
	                    title: "Document Register",
	                    description: "Canonical document rail for posted, draft, and approved billing documents.",
	                    href: ROUTES.admin.billingRegister,
	                    icon: <FileText className="h-4 w-4" />,
	                    badge: "Register",
	                    detail: showMetrics ? `${invoices.length} invoices visible` : "— invoices visible",
	                  },
                  {
                    title: "Invoices",
                    description: "Invoice register with draft, approved, and posted posture.",
	                    href: ROUTES.admin.billingInvoices,
	                    icon: <FileBadge2 className="h-4 w-4" />,
	                    badge: "Invoice",
	                    detail: showMetrics ? `${draftInvoices} draft · ${approvedInvoices} approved` : "— draft · — approved",
	                  },
                  {
                    title: "Receipts",
                    description: "Receipt documents kept separate from payment posting truth.",
	                    href: ROUTES.admin.billingReceipts,
	                    icon: <Receipt className="h-4 w-4" />,
	                    badge: "Receipt",
	                    detail: showMetrics ? `${receiptCount} receipt documents` : "— receipt documents",
	                  },
                ],
              },
              {
                title: "Retail execution",
                description: "Operational surfaces for direct retail billing and contract linkage.",
                items: [
                  {
                    title: "Direct Sales",
                    description: "Retail orders, recovery, and billing generation without touching EMI collection rails.",
	                    href: ROUTES.admin.billingDirectSales,
	                    icon: <RotateCcw className="h-4 w-4" />,
	                    badge: "Retail",
	                    detail: showMetrics ? `${directSaleCount} direct-sale rows` : "— direct-sale rows",
	                  },
                  {
                    title: "Contracts",
                    description: "Billing contracts that connect delivery readiness and invoicing posture.",
	                    href: ROUTES.admin.billingContracts,
	                    icon: <FileText className="h-4 w-4" />,
	                    badge: "Contract",
	                    detail: showMetrics ? `${contractCount} billing contracts` : "— billing contracts",
	                  },
                  {
                    title: "Daily Book",
                    description: "Daily billing summary without collapsing into accounting books.",
                    href: ROUTES.admin.billingDailyBook,
                    icon: <FileText className="h-4 w-4" />,
                    badge: "Daily",
                  },
                ],
              },
              {
                title: "Adjustments and control",
                description: "Adjustment notes and adjacent control registers.",
                items: [
                  {
                    title: "Credit Notes",
                    description: "Controlled note register for billing-side reversals and adjustments.",
	                    href: ROUTES.admin.billingCreditNotes,
	                    icon: <RotateCcw className="h-4 w-4" />,
	                    badge: "Credit",
	                    detail: showMetrics ? `${creditCount} note rows` : "— note rows",
	                  },
                  {
                    title: "Debit Notes",
                    description: "Incremental billing adjustments separate from accounting journals.",
	                    href: ROUTES.admin.billingDebitNotes,
	                    icon: <RotateCcw className="h-4 w-4" />,
	                    badge: "Debit",
	                    detail: showMetrics ? `${debitCount} note rows` : "— note rows",
	                  },
                  {
                    title: "Cash Book",
                    description: "Billing-side cashbook view for operational visibility before accounting follow-up.",
                    href: ROUTES.admin.billingCashBook,
                    icon: <Receipt className="h-4 w-4" />,
                    badge: "Close",
                  },
                ],
              },
            ]}
          />

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
                reference={latestPosted.document_no ?? latestPosted.source_reference ?? "Invoice"}
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
                  { label: "Grand Total", value: accountingMoney(latestPosted.grand_total), emphasize: true },
                  { label: "Received", value: accountingMoney(latestPosted.received_total) },
                  { label: "Balance Due", value: accountingMoney(latestPosted.balance_total), emphasize: true },
                ]}
                detailFields={[
                  { label: "Document Status", value: latestPosted.status },
                  {
                    label: "Amount In Words",
                    value: toAmountInWordsINR(latestPosted.grand_total),
                  },
                  {
                    label: "Payment Reference",
                    value:
                      latestPosted.source_reference ||
                      latestPosted.direct_sale_no ||
                      "—",
                  },
                  { label: "Terms", value: latestPosted.terms || "—" },
                  { label: "Notes", value: latestPosted.notes || "—" },
                ]}
                lineItems={(latestPosted.lines || []).map((line) => ({
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: accountingMoney(line.unit_price),
                  lineTotal: accountingMoney(line.line_total),
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
    </ERPPageShell>
  );
}
