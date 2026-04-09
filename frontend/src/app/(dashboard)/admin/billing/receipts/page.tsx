"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import { buildAdminBillingDocumentRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { ReceiptDocument } from "@/services/billing";
import { listReceiptDocuments, voidReceiptDocument } from "@/services/billing";

export default function BillingReceiptsPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ReceiptDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      const payload = await listReceiptDocuments({
        payment: searchParams.get("payment") || undefined,
        billing_invoice: searchParams.get("billing_invoice") || undefined,
        direct_sale: searchParams.get("direct_sale") || undefined,
        subscription: searchParams.get("subscription") || undefined,
        source_type: searchParams.get("source_type") || undefined,
      });
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
        const payload = await listReceiptDocuments({
          payment: searchParams.get("payment") || undefined,
          billing_invoice: searchParams.get("billing_invoice") || undefined,
          direct_sale: searchParams.get("direct_sale") || undefined,
          subscription: searchParams.get("subscription") || undefined,
          source_type: searchParams.get("source_type") || undefined,
        });
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
  }, [searchParams]);

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
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.billing_invoice ? (
            <Link
              href={buildAdminBillingDocumentRoute(row.billing_invoice)}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Billing Detail
            </Link>
          ) : null}
          {row.status === "POSTED" ? (
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
            <span>{row.status}</span>
          )}
        </div>
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
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
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
