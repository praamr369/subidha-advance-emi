"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { BillingDebitNote } from "@/services/billing";
import {
  approveBillingDebitNote,
  listBillingDebitNotes,
  postBillingDebitNote,
} from "@/services/billing";

export default function BillingDebitNotesPage() {
  const [rows, setRows] = useState<BillingDebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listBillingDebitNotes();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load billing debit notes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const columns: EnterpriseColumnDef<BillingDebitNote>[] = [
    { key: "note_date", header: "Date", render: (row) => accountingDate(row.note_date) },
    { key: "note_no", header: "Debit Note" },
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
              title={`Approve ${row.note_no || `debit note ${row.id}`}?`}
              description="Approval freezes the debit note before posting."
              onConfirm={async () => {
                await approveBillingDebitNote(row.id);
                await loadPage();
              }}
              variant="secondary"
            />
          ) : null}
          {row.status === "APPROVED" ? (
            <ConfirmActionButton
              label="Post"
              title={`Post ${row.note_no || `debit note ${row.id}`}?`}
              description="Posting will write the accounting increase and any linked stock-out adjustment."
              onConfirm={async () => {
                await postBillingDebitNote(row.id);
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
      title="Billing Debit Notes"
      subtitle="Controlled upward invoice adjustments linked to original billing documents."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Debit Notes" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No debit notes found"
        emptyDescription="Create a debit note when you need a controlled additional billing adjustment."
      />
      <BillingPrintDocument
        title="Debit Note"
        subtitle="Printable debit note preview"
        reference={latestPosted?.note_no || "No posted debit note"}
        meta={latestPosted ? `Original invoice ${latestPosted.original_invoice_no || latestPosted.original_invoice}` : "Waiting for a posted debit note"}
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

