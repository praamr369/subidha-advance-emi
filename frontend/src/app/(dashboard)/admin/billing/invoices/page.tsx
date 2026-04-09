"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { BillingInvoice } from "@/services/billing";
import {
  approveBillingInvoice,
  listBillingInvoices,
  postBillingInvoice,
} from "@/services/billing";
import { buildAdminBillingDocumentRoute } from "@/lib/route-builders";

export default function BillingInvoicesPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listBillingInvoices({
        subscription: searchParams.get("subscription") || undefined,
        customer: searchParams.get("customer") || undefined,
        direct_sale: searchParams.get("direct_sale") || undefined,
        source_type: searchParams.get("source_type") || undefined,
        status: searchParams.get("status") || undefined,
      });
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load billing invoices."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [searchParams]);

  const columns: EnterpriseColumnDef<BillingInvoice>[] = [
    { key: "invoice_date", header: "Date", render: (row) => accountingDate(row.invoice_date) },
    { key: "document_no", header: "Invoice" },
    { key: "customer_name_snapshot", header: "Customer" },
    { key: "billing_channel", header: "Channel" },
    { key: "status", header: "Status" },
    { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.document_no || `invoice ${row.id}`}?`}
              description="Approval freezes the document content and issues the document number if missing."
              onConfirm={async () => {
                await approveBillingInvoice(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.document_no || `invoice ${row.id}`}?`}
              description="Posting will write the sales journal and any linked stock deductions."
              onConfirm={async () => {
                await postBillingInvoice(row.id);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
          <Link
            href={buildAdminBillingDocumentRoute(row.id)}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Detail
          </Link>
        </div>
      ),
    },
  ];

  const latestPosted = rows.find((row) => row.status === "POSTED");

  return (
    <PortalPage
      title="Billing Invoices"
      subtitle="Retail and EMI billing documents with controlled approve/post flows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Invoices" },
      ]}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No billing invoices found"
        emptyDescription="Create a billing invoice to start the retail or EMI-linked billing flow."
      />

      <BillingPrintDocument
        title={latestPosted?.tax_mode === "GST" ? "GST Tax Invoice" : "Retail Invoice"}
        subtitle="Printable invoice preview"
        reference={latestPosted?.document_no || "No posted invoice"}
        meta={latestPosted ? `Customer ${latestPosted.customer_name_snapshot || "Walk-in"}` : "Waiting for a posted invoice"}
        summaryFields={[
          { label: "Date", value: latestPosted?.invoice_date || "—" },
          { label: "Grand Total", value: accountingMoney(latestPosted?.grand_total || 0) },
          { label: "Received", value: accountingMoney(latestPosted?.received_total || 0) },
          { label: "Balance", value: accountingMoney(latestPosted?.balance_total || 0) },
        ]}
        detailFields={[
          { label: "Tax Mode", value: latestPosted?.tax_mode || "—" },
          { label: "Billing Channel", value: latestPosted?.billing_channel || "—" },
          { label: "Phone", value: latestPosted?.customer_phone_snapshot || "—" },
          { label: "Journal", value: latestPosted?.posted_journal_entry_no || "Pending" },
        ]}
      />
    </PortalPage>
  );
}
