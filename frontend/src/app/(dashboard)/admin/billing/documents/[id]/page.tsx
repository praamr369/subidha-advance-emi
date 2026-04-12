"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import {
  getBillingInvoice,
  listBillingCreditNotes,
  listBillingDebitNotes,
  listReceiptDocuments,
  type BillingCreditNote,
  type BillingDebitNote,
  type BillingInvoice,
  type BillingInvoiceLine,
  type ReceiptDocument,
} from "@/services/billing";
import {
  buildAdminBillingInvoicesRoute,
  buildAdminBillingReceiptsRoute,
  buildAdminBillingRegisterRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function BillingDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params?.id;
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [receipts, setReceipts] = useState<ReceiptDocument[]>([]);
  const [creditNotes, setCreditNotes] = useState<BillingCreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<BillingDebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setLoading(false);
      setError("Billing document id is missing.");
      return;
    }

    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const invoicePayload = await getBillingInvoice(documentId);
        const [receiptPayload, creditPayload, debitPayload] = await Promise.all([
          listReceiptDocuments({ billing_invoice: documentId }),
          listBillingCreditNotes({ original_invoice: documentId }),
          listBillingDebitNotes({ original_invoice: documentId }),
        ]);
        if (cancelled) return;
        setInvoice(invoicePayload);
        setReceipts(receiptPayload.results);
        setCreditNotes(creditPayload.results);
        setDebitNotes(debitPayload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setInvoice(null);
        setReceipts([]);
        setCreditNotes([]);
        setDebitNotes([]);
        setError(accountingErrorMessage(err, "Failed to load the billing document detail."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const lineColumns: EnterpriseColumnDef<BillingInvoiceLine>[] = [
    { key: "product_code", header: "Product" },
    {
      key: "inventory_item_sku",
      header: "SKU",
      render: (row) => row.inventory_item_sku || "Untracked",
    },
    { key: "description", header: "Description" },
    { key: "quantity", header: "Qty" },
    { key: "unit_price", header: "Unit Price", render: (row) => accountingMoney(row.unit_price) },
    { key: "taxable_value", header: "Taxable", render: (row) => accountingMoney(row.taxable_value) },
    { key: "line_total", header: "Line Total", render: (row) => accountingMoney(row.line_total) },
  ];

  const relatedRows = useMemo(() => {
    const rows: Array<{
      key: string;
      document: string;
      date: string;
      status: string;
      amount: string;
      href?: string | null;
    }> = [];

    for (const receipt of receipts) {
      rows.push({
        key: `receipt-${receipt.id}`,
        document: receipt.receipt_no || `Receipt ${receipt.id}`,
        date: receipt.receipt_date,
        status: receipt.status,
        amount: receipt.amount,
        href: null,
      });
    }

    for (const note of creditNotes) {
      rows.push({
        key: `credit-${note.id}`,
        document: note.note_no || `Credit Note ${note.id}`,
        date: note.note_date,
        status: note.status,
        amount: note.total_adjustment,
        href: null,
      });
    }

    for (const note of debitNotes) {
      rows.push({
        key: `debit-${note.id}`,
        document: note.note_no || `Debit Note ${note.id}`,
        date: note.note_date,
        status: note.status,
        amount: note.total_adjustment,
        href: null,
      });
    }

    return rows.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  }, [creditNotes, debitNotes, receipts]);

  const relatedColumns: EnterpriseColumnDef<(typeof relatedRows)[number]>[] = [
    { key: "date", header: "Date", render: (row) => accountingDate(row.date) },
    { key: "document", header: "Document" },
    { key: "status", header: "Status" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
  ];

  return (
    <PortalPage
      className="receipt-print-page"
      title={invoice?.document_no || (documentId ? `Billing Document ${documentId}` : "Billing Document")}
      subtitle="Billing detail stays document-first: the invoice mirrors retail or subscription source state, while receipts and notes remain separate additive documents."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Document Register", href: ROUTES.admin.billingRegister },
        { label: invoice?.document_no || `Document ${documentId || "—"}` },
      ]}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Back to Register", variant: "secondary" },
        ...(invoice?.subscription
          ? [
              {
                href: buildAdminSubscriptionRoute(invoice.subscription),
                label: "Open Subscription",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(invoice?.direct_sale
          ? [
              {
                href: ROUTES.admin.billingDirectSales,
                label: "Direct Sales",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(invoice
          ? [
              {
                href: buildAdminBillingReceiptsRoute({ billing_invoice: invoice.id }),
                label: "Receipts",
                variant: "secondary" as const,
              },
              {
                href: buildAdminBillingInvoicesRoute({
                  subscription: invoice.subscription,
                  direct_sale: invoice.direct_sale,
                  source_type: invoice.source_type,
                }),
                label: "Invoice Register",
                variant: "secondary" as const,
              },
            ]
          : []),
      ]}
    >
      {loading ? <LoadingBlock label="Loading billing document detail..." /> : null}
      {!loading && error ? <ErrorState title="Billing detail load failed" description={error} /> : null}

      {!loading && !error && invoice ? (
        <>
          <div className="receipt-print-hide space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailValue label="Invoice Date" value={accountingDate(invoice.invoice_date)} />
              <DetailValue label="Billing Channel" value={invoice.billing_channel} />
              <DetailValue label="Source" value={invoice.direct_sale_no || invoice.source_reference || invoice.source_type || "Manual"} />
              <DetailValue label="Status" value={invoice.status} />
              <DetailValue label="Customer" value={invoice.customer_name_snapshot || invoice.customer_name || "Walk-in"} />
              <DetailValue label="Phone" value={invoice.customer_phone_snapshot || "—"} />
              <DetailValue label="Grand Total" value={accountingMoney(invoice.grand_total)} />
              <DetailValue label="Balance" value={accountingMoney(invoice.balance_total)} />
            </div>

            <WorkspaceSection
              title="Document Trace"
              description="The document keeps explicit source references so direct-sale, subscription, and receipt drill-downs remain auditable."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Document Type" value={invoice.document_type || "INVOICE"} />
                <DetailValue label="Source Type" value={invoice.source_type || "MANUAL"} />
                <DetailValue label="Source Reference" value={invoice.source_reference || "—"} />
                <DetailValue
                  label="Linked Direct Sale"
                  value={
                    invoice.direct_sale ? (
                      <ActionButton
                        href={buildAdminBillingRegisterRoute({
                          direct_sale: invoice.direct_sale,
                        })}
                        variant="outline"
                        className="h-8 px-3 text-xs"
                      >
                        {invoice.direct_sale_no || `Direct Sale ${invoice.direct_sale}`}
                      </ActionButton>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Invoice Lines"
              description="Product, SKU, and inventory references are reused from the shared product and stock masters."
            >
              <EnterpriseDataTable
                data={invoice.lines}
                columns={lineColumns}
                emptyTitle="No invoice lines"
                emptyDescription="This document does not have any line items."
              />
            </WorkspaceSection>

            <WorkspaceSection
              title="Related Documents"
              description="Receipts and note adjustments remain separate additive documents linked back to this billing record."
            >
              <EnterpriseDataTable
                data={relatedRows}
                columns={relatedColumns}
                emptyTitle="No related documents"
                emptyDescription="No receipts, credit notes, or debit notes are linked to this billing invoice yet."
              />
            </WorkspaceSection>
          </div>

          <PrintActionBanner
            className="mb-4"
            title="Document Print / PDF"
            description="Print this billing document preview for handover or archive-safe PDF filing."
          />

          <BillingPrintDocument
            title={invoice.tax_mode === "GST" ? "GST Tax Invoice" : "Retail Invoice"}
            subtitle={`${invoice.billing_channel} document detail with source trace and linked documents.`}
            reference={invoice.document_no || `Invoice ${invoice.id}`}
            meta={`Customer ${invoice.customer_name_snapshot || invoice.customer_name || "Walk-in"}`}
            statusLabel={invoice.status}
            statusToneClassName={
              invoice.status === "POSTED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : invoice.status === "APPROVED"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-300 bg-slate-100 text-slate-800"
            }
            partyFields={[
              {
                label: "Customer",
                value: invoice.customer_name_snapshot || invoice.customer_name || "Walk-in",
                emphasize: true,
              },
              { label: "Phone", value: invoice.customer_phone_snapshot || "—" },
              { label: "GSTIN", value: invoice.customer_gstin || "—" },
              {
                label: "Branch",
                value: invoice.branch_name || invoice.branch_code || "Primary",
              },
            ]}
            referenceFields={[
              { label: "Invoice Date", value: invoice.invoice_date },
              { label: "Billing Channel", value: invoice.billing_channel },
              { label: "Tax Mode", value: invoice.tax_mode },
              {
                label: "Source Reference",
                value:
                  invoice.direct_sale_no ||
                  invoice.source_reference ||
                  invoice.source_type ||
                  "Manual",
              },
            ]}
            summaryFields={[
              { label: "Sub Total", value: accountingMoney(invoice.subtotal) },
              { label: "Tax Total", value: accountingMoney(invoice.tax_total) },
              { label: "Grand Total", value: accountingMoney(invoice.grand_total) },
              { label: "Received", value: accountingMoney(invoice.received_total) },
              { label: "Balance Due", value: accountingMoney(invoice.balance_total), emphasize: true },
            ]}
            detailFields={[
              { label: "Document Type", value: invoice.document_type || "INVOICE" },
              { label: "Finance Account", value: invoice.finance_account_name || "—" },
              { label: "Journal Entry", value: invoice.posted_journal_entry_no || "Pending" },
              { label: "Document Status", value: invoice.status },
              { label: "Terms", value: invoice.terms || "—" },
              { label: "Remarks", value: invoice.notes || "—" },
            ]}
            lineItems={invoice.lines.slice(0, 12).map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unitPrice: accountingMoney(line.unit_price),
              lineTotal: accountingMoney(line.line_total),
              note: [line.product_code, line.inventory_item_sku].filter(Boolean).join(" • "),
            }))}
          />
        </>
      ) : null}
    </PortalPage>
  );
}
