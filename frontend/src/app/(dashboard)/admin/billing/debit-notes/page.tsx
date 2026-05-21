"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
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
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Adjustment Control"
      title="Billing Debit Notes"
      subtitle="Controlled upward invoice adjustments linked to original billing documents."
      helperNote="Debit notes remain explicit billing-side increases with controlled posting. They stay separate from source invoices, receipts, and accounting reports."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Debit Notes" },
      ]}
    >
      <WorkspaceDirectory
        className="receipt-print-hide"
        title="Billing route map"
        description="Move between debit-note review, invoices, contract mirrors, receipt registers, and posted billing books from one billing workspace."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      <div className="receipt-print-hide">
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No debit notes found"
          emptyDescription="Create a debit note when you need a controlled additional billing adjustment."
        />
      </div>
      <PrintActionBanner
        className="mb-4"
        title="Debit Note Print / PDF"
        description="Print this posted debit-note preview for controlled adjustment documentation."
      />
      <BillingPrintDocument
        title="Debit Note"
        subtitle="Printable debit-note preview for controlled upward invoice adjustments."
        reference={latestPosted?.note_no || "No posted debit note"}
        meta={
          latestPosted
            ? `Original invoice ${latestPosted.original_invoice_no || "—"}`
            : "Waiting for a posted debit note"
        }
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
            value: latestPosted?.original_invoice_no || "—",
            emphasize: true,
          },
          {
            label: "Stock Effect",
            value: latestPosted?.stock_effect ? "Yes" : "No",
          },
          { label: "Status", value: latestPosted?.status || "—" },
        ]}
        referenceFields={[
          { label: "Note Date", value: latestPosted?.note_date || "—" },
          { label: "Note Number", value: latestPosted?.note_no || "—" },
          { label: "Note Type", value: "Debit Note" },
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
          { label: "Document Status", value: latestPosted?.status || "—" },
        ]}
        lineItems={(latestPosted?.lines || []).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: accountingMoney(line.taxable_value),
          lineTotal: accountingMoney(line.line_total),
          note: line.inventory_item_sku || undefined,
        }))}
      />
    </ERPPageShell>
  );
}
