"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ActionButton from "@/components/ui/ActionButton";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import { buildAdminBillingDocumentRoute, buildAdminBillingReceiptPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { ReceiptDocument } from "@/services/billing";
import { listReceiptDocuments, voidReceiptDocument } from "@/services/billing";
import { apiFetch } from "@/lib/api";
import CustomerPostureToggle from "@/components/customers/CustomerPostureToggle";

// Rent/lease money never becomes a ReceiptDocument (those are retail / Advance
// EMI only), so it is listed from its own source rows: monthly collections and
// security-deposit receipts/refunds.
type RentLeaseReceiptRow = {
  key: string;
  kind: string;
  number: string;
  amount: string;
  payment_date: string | null;
  payment_method: string;
  status: string;
  reference_no: string;
  demand_due_date: string | null;
  collected_by_username: string;
  subscription_id: number | null;
  subscription_number: string;
  customer_id: number | null;
  customer_name: string;
};

const RENT_LEASE_RECEIPT_LABELS: Record<string, string> = {
  RENT_MONTHLY: "Monthly rent",
  LEASE_MONTHLY: "Monthly lease",
  DEPOSIT_RECEIPT: "Security deposit received",
  DEPOSIT_REFUND: "Security deposit refunded",
};

export default function BillingReceiptsPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ReceiptDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rentLeaseRows, setRentLeaseRows] = useState<RentLeaseReceiptRow[]>([]);
  const [rentLeaseLoading, setRentLeaseLoading] = useState(true);
  const [rentLeaseError, setRentLeaseError] = useState<string | null>(null);
  // Payment / invoice / direct-sale / source-type filters only apply to receipt
  // documents; rent/lease rows follow the subscription and customer filters.
  const documentOnlyFilter = Boolean(
    searchParams.get("payment") ||
      searchParams.get("billing_invoice") ||
      searchParams.get("direct_sale") ||
      searchParams.get("source_type")
  );
  const rentLeaseSubscription = searchParams.get("subscription") || "";
  const rentLeaseCustomer = searchParams.get("customer") || "";

  useEffect(() => {
    if (documentOnlyFilter) {
      setRentLeaseRows([]);
      setRentLeaseLoading(false);
      return;
    }
    let cancelled = false;
    setRentLeaseLoading(true);
    const query = new URLSearchParams();
    if (rentLeaseSubscription) query.set("subscription", rentLeaseSubscription);
    if (rentLeaseCustomer) query.set("customer", rentLeaseCustomer);
    apiFetch<{ results?: RentLeaseReceiptRow[] }>(
      `/admin/subscriptions/rent-lease-receipts/?${query.toString()}`,
      { cache: "no-store" }
    )
      .then((data) => {
        if (cancelled) return;
        setRentLeaseRows(Array.isArray(data?.results) ? data.results : []);
        setRentLeaseError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setRentLeaseRows([]);
        setRentLeaseError(accountingErrorMessage(err, "Failed to load rent/lease receipts."));
      })
      .finally(() => {
        if (!cancelled) setRentLeaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentOnlyFilter, rentLeaseSubscription, rentLeaseCustomer]);

  const rentLeaseReceived = useMemo(
    () =>
      rentLeaseRows
        .filter((row) => row.status === "ACTIVE" && row.kind !== "DEPOSIT_REFUND")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rentLeaseRows]
  );

  const rentLeaseColumns: EnterpriseColumnDef<RentLeaseReceiptRow>[] = [
    { key: "payment_date", header: "Received", render: (row) => accountingDate(row.payment_date) },
    { key: "number", header: "Reference" },
    { key: "kind", header: "Type", render: (row) => RENT_LEASE_RECEIPT_LABELS[row.kind] ?? row.kind },
    { key: "subscription_number", header: "Contract", render: (row) => row.subscription_number || "—" },
    {
      key: "customer_name",
      header: "Customer",
      render: (row) => (
        <div>
          <div>{row.customer_name || "—"}</div>
          <CustomerPostureToggle customerId={row.customer_id} />
        </div>
      ),
    },
    { key: "payment_method", header: "Method", render: (row) => row.payment_method || "—" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    {
      key: "demand_due_date",
      header: "For Month Due",
      render: (row) => (row.demand_due_date ? accountingDate(row.demand_due_date) : "—"),
    },
    { key: "status", header: "Status" },
  ];

  const loadPage = useCallback(async () => {
    setLoading(true);
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
  }, [searchParams]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const receiptStats = useMemo(() => {
    const posted = rows.filter((row) => String(row.status || "").toUpperCase() === "POSTED");
    const postedAmount = posted.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const voided = rows.filter((row) => String(row.status || "").toUpperCase() === "VOID").length;
    return { posted: posted.length, postedAmount, voided };
  }, [rows]);

  const columns: EnterpriseColumnDef<ReceiptDocument>[] = [
    { key: "receipt_date", header: "Date", render: (row) => accountingDate(row.receipt_date) },
    { key: "receipt_no", header: "Receipt" },
    { key: "receipt_type", header: "Type" },
    {
      key: "customer_name_snapshot",
      header: "Customer",
      // Name plus the customer's per-product money position, on demand.
      render: (row) => (
        <div>
          <div>{row.customer_name_snapshot || "—"}</div>
          <CustomerPostureToggle customerId={row.customer} />
        </div>
      ),
    },
    { key: "finance_account_name", header: "Finance Account" },
    { key: "amount", header: "Amount", render: (row) => accountingMoney(row.amount) },
    { key: "posted_journal_entry_no", header: "Journal" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <ActionButton href={buildAdminBillingReceiptPrintRoute(row.id)} variant="primary">
            Print / Save PDF
          </ActionButton>
          {row.billing_invoice ? (
            <ActionButton href={buildAdminBillingDocumentRoute(row.billing_invoice)} variant="outline">
              Billing Detail
            </ActionButton>
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
  const receiptShare = latestReceipt
    ? {
        title: "Receipt",
        message: `Receipt: ${latestReceipt.receipt_no || `#${latestReceipt.id}`}\nAmount: ${accountingMoney(latestReceipt.amount)}\n(Requires login to view)`,
        whatsappPhone: latestReceipt.customer_phone_snapshot || null,
        label: "Share",
      }
    : undefined;

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing Document Control"
      title="Receipt Register"
      subtitle="Retail receipts and EMI payment receipts remain separate printable documents with accounting provenance."
      helperNote="Receipt documents are billing artifacts with posting provenance. They do not replace cashier payment capture or accounting book review."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Receipts" },
      ]}
      actions={[
        { href: ROUTES.admin.billingRegister, label: "Document Register", variant: "secondary" },
        { href: ROUTES.admin.billingInvoices, label: "Invoices", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Receipts", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Posted", value: loading ? "—" : receiptStats.posted, tone: "success" },
        { label: "Posted Amount", value: loading ? "—" : accountingMoney(receiptStats.postedAmount), tone: "default" },
        { label: "Voided", value: loading ? "—" : receiptStats.voided, tone: !loading && receiptStats.voided > 0 ? "warning" : "success" },
        {
          label: "Rent/Lease Received",
          value: rentLeaseLoading ? "—" : accountingMoney(rentLeaseReceived),
          tone: "default",
        },
      ]}
    >
      <ERPSectionShell
        title="Billing control directory"
        description="Use the shared billing directory to move from receipts into invoices, documents, notes, contracts, and billing books."
      >
        <WorkspaceDirectory
          className="receipt-print-hide"
          title="Billing route map"
          description="Use the shared billing directory to move from receipts into invoices, documents, notes, contracts, and billing books."
          groups={BILLING_CONTROL_DIRECTORY_GROUPS}
        />
      </ERPSectionShell>

      <ERPSectionShell
        title="Receipt ledger"
        description="Receipts are immutable documents with posting provenance; voiding creates a reversal journal and preserves history."
        className="receipt-print-hide"
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No receipts found"
          emptyDescription="Generate retail or EMI receipts after the underlying operational event exists."
        />
      </ERPSectionShell>

      {!documentOnlyFilter ? (
        <ERPSectionShell
          title="Rent / lease receipts"
          description="Monthly rent/lease collections and security-deposit receipts. These are recorded against the rent/lease contract, not as receipt documents, so they are listed here from their source records."
          className="receipt-print-hide"
        >
          <EnterpriseDataTable
            data={rentLeaseRows}
            columns={rentLeaseColumns}
            loading={rentLeaseLoading}
            error={rentLeaseError}
            emptyTitle="No rent/lease receipts found"
            emptyDescription="Rent/lease collections and deposit receipts appear here once they are recorded."
          />
        </ERPSectionShell>
      ) : null}

      <PrintActionBanner
        className="mb-4"
        title="Receipt Print / PDF"
        description="Print this posted receipt preview for customer handover or save it as PDF for records. Use the row action for the branded A4 receipt template."
        share={receiptShare}
      />

      <BillingPrintDocument
        title={latestReceipt?.receipt_type === "EMI_PAYMENT_RECEIPT" ? "EMI Payment Receipt" : "Retail Receipt"}
        subtitle="Printable receipt preview sourced from posted receipt records."
        reference={latestReceipt?.receipt_no || "No receipt generated"}
        meta={latestReceipt ? `Customer ${latestReceipt.customer_name_snapshot || "—"}` : "Waiting for a generated receipt"}
        statusLabel={latestReceipt?.status}
        statusToneClassName={
          latestReceipt?.status === "POSTED"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : latestReceipt?.status === "VOID"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-border bg-muted text-foreground"
        }
        partyFields={[
          {
            label: "Customer",
            value: latestReceipt?.customer_name_snapshot || "Counter party",
            emphasize: true,
          },
          { label: "Phone", value: latestReceipt?.customer_phone_snapshot || "—" },
          {
            label: "Branch",
            value: latestReceipt?.branch_name || latestReceipt?.branch_code || "Primary",
          },
          {
            label: "Counter",
            value:
              latestReceipt?.cash_counter_name ||
              latestReceipt?.cash_counter_code ||
              "—",
          },
        ]}
        referenceFields={[
          { label: "Receipt Date", value: latestReceipt?.receipt_date || "—" },
          { label: "Receipt Type", value: latestReceipt?.receipt_type || "—" },
          { label: "Source Type", value: latestReceipt?.source_type || "—" },
          {
            label: "Source Ref",
            value:
              latestReceipt?.source_reference ||
              latestReceipt?.direct_sale_no ||
              "—",
          },
        ]}
        summaryFields={[
          { label: "Amount Received", value: accountingMoney(latestReceipt?.amount || 0), emphasize: true },
          { label: "Receipt Type", value: latestReceipt?.receipt_type || "—" },
          { label: "Source Ref", value: latestReceipt?.source_reference || latestReceipt?.direct_sale_no || "—" },
        ]}
        detailFields={[
          { label: "Document Status", value: latestReceipt?.status || "—" },
          { label: "Direct Sale", value: latestReceipt?.direct_sale_no || "—" },
          { label: "Notes", value: latestReceipt?.notes || "—" },
        ]}
      />
    </ERPPageShell>
  );
}
