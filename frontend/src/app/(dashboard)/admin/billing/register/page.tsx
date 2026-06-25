"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ActionButton from "@/components/ui/ActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import { WorkspaceSection } from "@/components/ui/workspace";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import {
  listBillingCreditNotes,
  listBillingDebitNotes,
  listBillingInvoices,
  listReceiptDocuments,
  type BillingCreditNote,
  type BillingDebitNote,
  type BillingInvoice,
  type ReceiptDocument,
} from "@/services/billing";
import {
  buildAdminBillingDocumentRoute,
  buildAdminBillingInvoicesRoute,
  buildAdminBillingReceiptsRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";

type RegisterRow = {
  key: string;
  document_kind: "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "DEBIT_NOTE";
  document_date: string;
  document_no: string;
  status: string;
  party: string;
  source: string;
  amount: string;
  href?: string | null;
};

function buildRegisterRows({
  invoices,
  receipts,
  creditNotes,
  debitNotes,
}: {
  invoices: BillingInvoice[];
  receipts: ReceiptDocument[];
  creditNotes: BillingCreditNote[];
  debitNotes: BillingDebitNote[];
}): RegisterRow[] {
  const rows: RegisterRow[] = [];

  for (const invoice of invoices) {
    rows.push({
      key: `invoice-${invoice.id}`,
      document_kind: "INVOICE",
      document_date: invoice.invoice_date,
      document_no: invoice.document_no || `Invoice ${invoice.id}`,
      status: invoice.status,
      party: invoice.customer_name_snapshot || invoice.customer_name || "Walk-in",
      source:
        invoice.direct_sale_no ||
        invoice.source_reference ||
        invoice.subscription?.toString() ||
        invoice.source_type ||
        "Manual",
      amount: invoice.grand_total,
      href: buildAdminBillingDocumentRoute(invoice.id),
    });
  }

  for (const receipt of receipts) {
    rows.push({
      key: `receipt-${receipt.id}`,
      document_kind: "RECEIPT",
      document_date: receipt.receipt_date,
      document_no: receipt.receipt_no || `Receipt ${receipt.id}`,
      status: receipt.status,
      party: receipt.customer_name_snapshot || "Counter party",
      source:
        receipt.direct_sale_no ||
        receipt.source_reference ||
        receipt.billing_invoice?.toString() ||
        receipt.payment?.toString() ||
        "Manual",
      amount: receipt.amount,
      href: receipt.billing_invoice ? buildAdminBillingDocumentRoute(receipt.billing_invoice) : null,
    });
  }

  for (const note of creditNotes) {
    rows.push({
      key: `credit-${note.id}`,
      document_kind: "CREDIT_NOTE",
      document_date: note.note_date,
      document_no: note.note_no || `Credit Note ${note.id}`,
      status: note.status,
      party: "Original invoice adjustment",
      source: note.original_invoice_no || `Invoice ${note.original_invoice}`,
      amount: note.total_adjustment,
      href: buildAdminBillingDocumentRoute(note.original_invoice),
    });
  }

  for (const note of debitNotes) {
    rows.push({
      key: `debit-${note.id}`,
      document_kind: "DEBIT_NOTE",
      document_date: note.note_date,
      document_no: note.note_no || `Debit Note ${note.id}`,
      status: note.status,
      party: "Original invoice adjustment",
      source: note.original_invoice_no || `Invoice ${note.original_invoice}`,
      amount: note.total_adjustment,
      href: buildAdminBillingDocumentRoute(note.original_invoice),
    });
  }

  return rows.sort((left, right) => {
    const leftDate = Date.parse(left.document_date);
    const rightDate = Date.parse(right.document_date);
    return rightDate - leftDate;
  });
}

export default function BillingDocumentRegisterPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      subscription: searchParams.get("subscription") || undefined,
      customer: searchParams.get("customer") || undefined,
      direct_sale: searchParams.get("direct_sale") || undefined,
      payment: searchParams.get("payment") || undefined,
      billing_invoice: searchParams.get("billing_invoice") || undefined,
      source_type: searchParams.get("source_type") || undefined,
      status: searchParams.get("status") || undefined,
    }),
    [searchParams]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const [invoicePayload, receiptPayload, creditPayload, debitPayload] = await Promise.all([
          listBillingInvoices({
            subscription: filters.subscription,
            customer: filters.customer,
            direct_sale: filters.direct_sale,
            source_type: filters.source_type,
            status: filters.status,
          }),
          listReceiptDocuments({
            subscription: filters.subscription,
            customer: filters.customer,
            direct_sale: filters.direct_sale,
            payment: filters.payment,
            billing_invoice: filters.billing_invoice,
            source_type: filters.source_type,
          }),
          listBillingCreditNotes({
            original_invoice: filters.billing_invoice,
            direct_sale: filters.direct_sale,
          }),
          listBillingDebitNotes({
            original_invoice: filters.billing_invoice,
            direct_sale: filters.direct_sale,
          }),
        ]);
        if (cancelled) return;
        setRows(
          buildRegisterRows({
            invoices: invoicePayload.results,
            receipts: receiptPayload.results,
            creditNotes: creditPayload.results,
            debitNotes: debitPayload.results,
          })
        );
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load the billing document register."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const columns: EnterpriseColumnDef<RegisterRow>[] = [
    { key: "document_date", header: "Date", render: (row) => accountingDate(row.document_date) },
    { key: "document_kind", header: "Document" },
    { key: "document_no", header: "Reference" },
    { key: "party", header: "Party" },
    { key: "source", header: "Source" },
    { key: "status", header: "Status" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.href ? (
          <>
            <ActionButton href={row.href} variant="outline" className="receipt-print-hide">
              Open Detail
            </ActionButton>
            <span className="hidden print:inline">—</span>
          </>
        ) : (
          "—"
        ),
    },
  ];

  const filterBadges = Object.entries(filters).filter(([, value]) => Boolean(value));

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Document Control"
      title="Billing Document Register"
      subtitle="Unified invoice, receipt, credit-note, and debit-note register for staff drill-down without turning billing into a second EMI truth source."
      helperNote="This register is billing-document-first. It stays separate from accounting posting lanes and from cashier collection execution."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Document Register" },
      ]}
      actions={[
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
        { href: buildAdminBillingReceiptsRoute(filters), label: "Receipts", variant: "secondary" },
        { href: buildAdminBillingInvoicesRoute(filters), label: "Invoice Register", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceDirectory
        className="receipt-print-hide"
        title="Billing route map"
        description="Move between billing documents, adjustment notes, contract mirrors, and retail execution routes from one billing directory."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      {loading ? <ERPLoadingState label="Loading billing document register..." /> : null}
      {!loading && error ? <ERPErrorState title="Billing register load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <WorkspaceSection
            title="Applied Filters"
            description="This register accepts subscription, customer, direct-sale, invoice, payment, status, and source filters from linked operational pages."
          >
            {filterBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {filterBadges.map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No drill-down filter is applied. The register shows the latest billing documents across direct sale and subscription-linked flows.
              </div>
            )}
          </WorkspaceSection>

          <PrintActionBanner
            className="mb-4"
            title="Register Print / PDF"
            description="Print this filtered register for filing. Use filters to keep each printout concise and readable."
          />

          <EnterpriseDataTable
            data={rows}
            columns={columns}
            emptyTitle="No billing documents found"
            emptyDescription="Post invoices, receipts, or notes to populate the document register."
          />
        </>
      ) : null}
    </ERPPageShell>
  );
}
