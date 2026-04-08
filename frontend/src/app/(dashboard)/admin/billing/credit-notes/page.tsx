"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { BillingCreditNote } from "@/services/billing";
import {
  approveBillingCreditNote,
  listBillingCreditNotes,
  postBillingCreditNote,
} from "@/services/billing";

export default function BillingCreditNotesPage() {
  const [rows, setRows] = useState<BillingCreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listBillingCreditNotes();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load billing credit notes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const columns: EnterpriseColumnDef<BillingCreditNote>[] = [
    { key: "note_date", header: "Date", render: (row) => accountingDate(row.note_date) },
    { key: "note_no", header: "Credit Note" },
    { key: "original_invoice_no", header: "Invoice" },
    { key: "status", header: "Status" },
    { key: "stock_effect", header: "Stock", render: (row) => (row.stock_effect ? "Yes" : "No") },
    { key: "total_adjustment", header: "Adjustment", render: (row) => accountingMoney(row.total_adjustment) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.status === "DRAFT" ? (
            <ConfirmActionButton
              label="Approve"
              title={`Approve ${row.note_no || `credit note ${row.id}`}?`}
              description="Approval freezes the credit note before posting."
              onConfirm={async () => {
                await approveBillingCreditNote(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.note_no || `credit note ${row.id}`}?`}
              description="Posting will write the accounting reversal and any stock return movements."
              onConfirm={async () => {
                await postBillingCreditNote(row.id);
                await loadPage();
              }}
              variant="primary"
            />
          ) : null}
        </div>
      ),
    },
  ];

  const latestPosted = rows.find((row) => row.status === "POSTED");

  return (
    <PortalPage
      title="Billing Credit Notes"
      subtitle="Returns and allowances linked back to original invoices with optional stock effect."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Credit Notes" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No credit notes found"
        emptyDescription="Create a credit note when you need a controlled return or allowance adjustment."
      />
      <BillingPrintDocument
        title="Credit Note"
        subtitle="Printable credit note preview"
        reference={latestPosted?.note_no || "No posted credit note"}
        meta={latestPosted ? `Original invoice ${latestPosted.original_invoice_no || latestPosted.original_invoice}` : "Waiting for a posted credit note"}
        summaryFields={[
          { label: "Date", value: latestPosted?.note_date || "—" },
          { label: "Adjustment", value: accountingMoney(latestPosted?.total_adjustment || 0) },
          { label: "Tax Adjustment", value: accountingMoney(latestPosted?.tax_adjustment || 0) },
          { label: "Stock Effect", value: latestPosted?.stock_effect ? "Yes" : "No" },
        ]}
        detailFields={[
          { label: "Reason", value: latestPosted?.reason || "—" },
          { label: "Invoice", value: latestPosted?.original_invoice_no || "—" },
          { label: "Journal", value: latestPosted?.posted_journal_entry_no || "Pending" },
          { label: "Status", value: latestPosted?.status || "—" },
        ]}
      />
    </PortalPage>
  );
}

