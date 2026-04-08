"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { ReceiptDocument } from "@/services/billing";
import { listReceiptDocuments, voidReceiptDocument } from "@/services/billing";

export default function BillingReceiptsPage() {
  const [rows, setRows] = useState<ReceiptDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listReceiptDocuments();
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load receipt register."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadPageOnce() {
      try {
        const payload = await listReceiptDocuments();
        if (cancelled) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load receipt register."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPageOnce();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: EnterpriseColumnDef<ReceiptDocument>[] = [
    { key: "receipt_date", header: "Date", render: (row) => accountingDate(row.receipt_date) },
    { key: "receipt_no", header: "Receipt" },
    { key: "receipt_type", header: "Type" },
    { key: "customer_name_snapshot", header: "Customer" },
    { key: "finance_account_name", header: "Finance Account" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    { key: "posted_journal_entry_no", header: "Journal" },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.status === "POSTED" ? (
          <ConfirmActionButton
            label="Void"
            title={`Void ${row.receipt_no || `receipt ${row.id}`}?`}
            description="Voiding creates a reversal journal and preserves the original receipt document."
            onConfirm={async () => {
              await voidReceiptDocument(row.id, "Voided from billing receipt register.");
              await loadPage();
            }}
            variant="destructive"
          />
        ) : (
          row.status
        ),
    },
  ];

  const latestReceipt = rows[0];

  return (
    <PortalPage
      title="Receipt Register"
      subtitle="Retail receipts and EMI payment receipts remain separate printable documents with accounting provenance."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Receipts" },
      ]}
    >
      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No receipts found"
        emptyDescription="Generate retail or EMI receipts after the underlying operational event exists."
      />

      <BillingPrintDocument
        title={latestReceipt?.receipt_type === "EMI_PAYMENT_RECEIPT" ? "EMI Payment Receipt" : "Retail Receipt"}
        subtitle="Printable receipt preview"
        reference={latestReceipt?.receipt_no || "No receipt generated"}
        meta={latestReceipt ? `Customer ${latestReceipt.customer_name_snapshot || "—"}` : "Waiting for a generated receipt"}
        summaryFields={[
          { label: "Date", value: latestReceipt?.receipt_date || "—" },
          { label: "Amount", value: accountingMoney(latestReceipt?.amount || 0) },
          { label: "Type", value: latestReceipt?.receipt_type || "—" },
          { label: "Finance Account", value: latestReceipt?.finance_account_name || "—" },
        ]}
        detailFields={[
          { label: "Customer", value: latestReceipt?.customer_name_snapshot || "—" },
          { label: "Phone", value: latestReceipt?.customer_phone_snapshot || "—" },
          { label: "Notes", value: latestReceipt?.notes || "—" },
          { label: "Journal", value: latestReceipt?.posted_journal_entry_no || "Pending" },
        ]}
      />
    </PortalPage>
  );
}
