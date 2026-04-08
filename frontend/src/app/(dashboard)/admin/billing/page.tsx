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
  listReceiptDocuments,
  type BillingInvoice,
} from "@/services/billing";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";

export default function BillingOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [creditCount, setCreditCount] = useState(0);
  const [debitCount, setDebitCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const [invoicePayload, creditPayload, debitPayload, receiptPayload] = await Promise.all([
          listBillingInvoices(),
          listBillingCreditNotes(),
          listBillingDebitNotes(),
          listReceiptDocuments(),
        ]);
        if (cancelled) return;
        setInvoices(invoicePayload.results);
        setCreditCount(creditPayload.count);
        setDebitCount(debitPayload.count);
        setReceiptCount(receiptPayload.count);
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
      title="Billing Operations"
      subtitle="Unified retail and EMI-facing billing registers with GST-ready structure, receipts, and controlled accounting posting."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing" },
      ]}
      statusBadge={{ label: "Admin Controlled", tone: "info" }}
      actions={[
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "primary" },
        { href: ROUTES.admin.billingCreditNotes, label: "Credit Notes", variant: "secondary" },
        { href: ROUTES.admin.billingDebitNotes, label: "Debit Notes", variant: "secondary" },
        { href: ROUTES.admin.billingReceipts, label: "Receipts", variant: "secondary" },
        { href: ROUTES.admin.billingDailyBook, label: "Daily Book", variant: "secondary" },
        { href: ROUTES.admin.billingCashBook, label: "Cash Book", variant: "secondary" },
      ]}
      stats={[
        { label: "Invoices", value: String(invoices.length), tone: "info" },
        { label: "Credit Notes", value: String(creditCount), tone: creditCount > 0 ? "warning" : "default" },
        { label: "Debit Notes", value: String(debitCount), tone: debitCount > 0 ? "info" : "default" },
        { label: "Receipts", value: String(receiptCount), tone: "success" },
      ]}
    >
      {loading ? <LoadingBlock label="Loading billing operations..." /> : null}
      {!loading && error ? <ErrorState title="Billing load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              label="Receipt Register"
              value={String(receiptCount)}
              subtext="Retail and EMI payment receipts are tracked separately from payment posting."
              tone="success"
              icon={<Receipt className="h-5 w-5" />}
            />
            <StatCard
              label="Credit Adjustments"
              value={String(creditCount)}
              subtext="Returns and allowances flow through controlled credit note posting."
              tone={creditCount > 0 ? "info" : "default"}
              icon={<RotateCcw className="h-5 w-5" />}
            />
          </div>

          <WorkspaceSection
            title="Latest Posted Invoice"
            description="Printable preview from the live billing document register."
          >
            {latestPosted ? (
              <BillingPrintDocument
                title={latestPosted.tax_mode === "GST" ? "GST Tax Invoice" : "Retail Invoice"}
                subtitle={`${latestPosted.billing_channel} billing document`}
                reference={latestPosted.document_no ?? `Invoice ${latestPosted.id}`}
                meta={`Customer ${latestPosted.customer_name_snapshot || latestPosted.customer_name || "Walk-in"}`}
                summaryFields={[
                  { label: "Invoice Date", value: latestPosted.invoice_date },
                  { label: "Grand Total", value: accountingMoney(latestPosted.grand_total) },
                  { label: "Received", value: accountingMoney(latestPosted.received_total) },
                  { label: "Balance", value: accountingMoney(latestPosted.balance_total) },
                ]}
                detailFields={[
                  { label: "Billing Channel", value: latestPosted.billing_channel },
                  { label: "Tax Mode", value: latestPosted.tax_mode },
                  { label: "Phone", value: latestPosted.customer_phone_snapshot || "—" },
                  { label: "Journal", value: latestPosted.posted_journal_entry_no || "Pending" },
                ]}
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
