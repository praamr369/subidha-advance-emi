"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
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
      className="receipt-print-page"
      title="Billing Credit Notes"
      subtitle="Returns and allowances linked back to original invoices with optional stock effect."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Credit Notes" },
      ]}
    >
      <div className="receipt-print-hide">
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No credit notes found"
          emptyDescription="Create a credit note when you need a controlled return or allowance adjustment."
        />
      </div>
      <PrintActionBanner
        className="mb-4"
        title="Credit Note Print / PDF"
        description="Print this posted credit-note preview for adjustment records or save it as PDF."
      />
      <BillingPrintDocument
        title="Credit Note"
        subtitle="Printable credit-note preview for approved return and allowance adjustments."
        reference={latestPosted?.note_no || "No posted credit note"}
        meta={latestPosted ? `Original invoice ${latestPosted.original_invoice_no || latestPosted.original_invoice}` : "Waiting for a posted credit note"}
        statusLabel={latestPosted?.status}
        statusToneClassName={
          latestPosted?.status === "POSTED"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : latestPosted?.status === "APPROVED"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-300 bg-slate-100 text-slate-800"
        }
        partyFields={[
          {
            label: "Adjusted Invoice",
            value: latestPosted?.original_invoice_no || (latestPosted ? `#${latestPosted.original_invoice}` : "—"),
            emphasize: true,
          },
          {
            label: "Stock Effect",
            value: latestPosted?.stock_effect ? "Yes" : "No",
          },
          {
            label: "Status",
            value: latestPosted?.status || "—",
          },
          {
            label: "Journal Entry",
            value: latestPosted?.posted_journal_entry_no || "Pending",
          },
        ]}
        referenceFields={[
          { label: "Note Date", value: latestPosted?.note_date || "—" },
          { label: "Note Number", value: latestPosted?.note_no || "—" },
          { label: "Note Type", value: "Credit Note" },
          { label: "Posting State", value: latestPosted?.status || "—" },
        ]}
        summaryFields={[
          { label: "Taxable Adjustment", value: accountingMoney(latestPosted?.taxable_adjustment || 0) },
          { label: "Tax Adjustment", value: accountingMoney(latestPosted?.tax_adjustment || 0) },
          { label: "Total Adjustment", value: accountingMoney(latestPosted?.total_adjustment || 0), emphasize: true },
          { label: "Line Count", value: String(latestPosted?.lines?.length || 0) },
        ]}
        detailFields={[
          { label: "Reason", value: latestPosted?.reason || "—" },
          { label: "Original Invoice", value: latestPosted?.original_invoice_no || "—" },
          { label: "Journal Entry", value: latestPosted?.posted_journal_entry_no || "Pending" },
          { label: "Document Status", value: latestPosted?.status || "—" },
        ]}
        lineItems={(latestPosted?.lines || []).slice(0, 8).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: accountingMoney(line.taxable_value),
          lineTotal: accountingMoney(line.line_total),
          note: line.inventory_item_sku || undefined,
        }))}
      />
    </PortalPage>
  );
}
