"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { BILLING_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import ActionButton from "@/components/ui/ActionButton";
import AdminCancellationDialog from "@/components/ui/AdminCancellationDialog";
import PortalPage from "@/components/ui/PortalPage";
import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import { toAmountInWordsINR } from "@/lib/print/formatters";
import type { BillingInvoice } from "@/services/billing";
import {
  adminFinalizeDirectSaleInvoice,
  approveBillingInvoice,
  cancelBillingInvoice,
  listBillingInvoices,
  postBillingInvoice,
} from "@/services/billing";
import { buildAdminBillingDocumentRoute } from "@/lib/route-builders";

export default function BillingInvoicesPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BillingInvoice | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const loadPage = useCallback(async () => {
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
  }, [searchParams]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const columns: EnterpriseColumnDef<BillingInvoice>[] = [
    { key: "invoice_date", header: "Date", render: (row) => accountingDate(row.invoice_date) },
    { key: "document_no", header: "Invoice" },
    { key: "customer_name_snapshot", header: "Customer" },
    { key: "billing_channel", header: "Channel" },
    { key: "status", header: "Status" },
    { key: "grand_total", header: "Grand Total", render: (row) => accountingMoney(row.grand_total) },
    {
      key: "active_balance",
      header: "Active Balance",
      render: (row) =>
        ["VOID", "CANCELLED", "REVERSED", "CREDITED_FULLY"].includes(String(row.status || "").toUpperCase())
          ? "History only"
          : accountingMoney(row.balance_total),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {(row.next_actions || []).includes("POST_INVOICE") && row.direct_sale ? (
            <button
              type="button"
              onClick={async () => {
                await adminFinalizeDirectSaleInvoice(row.direct_sale as number);
                await loadPage();
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-orange-700 px-3 text-xs font-semibold text-white transition hover:bg-orange-800"
            >
              Finalize Invoice
            </button>
          ) : null}
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
          {["DRAFT", "APPROVED", "POSTED"].includes(row.status) ? (
            <button
              type="button"
              onClick={() => setCancelTarget(row)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive bg-background px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
            >
              {row.status === "POSTED" ? "Void invoice" : "Cancel invoice"}
            </button>
          ) : null}
          <ActionButton href={buildAdminBillingDocumentRoute(row.id)} variant="outline">
            Open Detail
          </ActionButton>
          {row.direct_sale &&
          row.status === "POSTED" &&
          !["VOID", "CANCELLED", "REVERSED", "CREDITED_FULLY"].includes(String(row.status || "").toUpperCase()) &&
          Number(row.balance_total || 0) > 0 ? (
            <ActionButton
              href={`${ROUTES.admin.financeCollect}?workflow=direct-sale&sale_id=${row.direct_sale}`}
              variant="primary"
            >
              Collect Direct-Sale Balance
            </ActionButton>
          ) : null}
          {(row.next_actions || []).includes("VIEW_RECEIPTS") && row.direct_sale ? (
            <ActionButton href={`${ROUTES.admin.billingReceipts}?direct_sale=${row.direct_sale}`} variant="outline">
              View Receipts
            </ActionButton>
          ) : null}
        </div>
      ),
    },
  ];

  const latestPosted = rows.find((row) => row.status === "POSTED");

  return (
    <PortalPage
      className="receipt-print-page"
      eyebrow="Billing Document Control"
      title="Billing Invoices"
      subtitle="Retail and EMI billing documents with controlled approve/post flows."
      helperNote="Invoices stay inside the billing document rail. Posting remains explicit and separate from accounting books and cashier collection activity."
      helperTone="info"
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
      <WorkspaceDirectory
        className="receipt-print-hide"
        title="Billing route map"
        description="Use the shared billing directory to move from invoice review into receipts, notes, contracts, and posted billing books."
        groups={BILLING_CONTROL_DIRECTORY_GROUPS}
      />

      <div className="receipt-print-hide">
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No billing invoices found"
          emptyDescription="Create a billing invoice to start the retail or EMI-linked billing flow."
        />
      </div>

      <PrintActionBanner
        className="mb-4"
        title="Invoice Print / PDF"
        description="Print this posted invoice preview for counter operations or save it as PDF for filing."
      />

      <BillingPrintDocument
        title={latestPosted?.tax_mode === "GST" ? "GST Tax Invoice" : "Retail Invoice"}
        subtitle="Printable invoice preview sourced from posted billing records."
        reference={latestPosted?.document_no || latestPosted?.source_reference || "No posted invoice"}
        meta={latestPosted ? `Customer ${latestPosted.customer_name_snapshot || "Walk-in"}` : "Waiting for a posted invoice"}
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
            label: "Customer",
            value: latestPosted?.customer_name_snapshot || latestPosted?.customer_name || "Walk-in",
            emphasize: true,
          },
          { label: "Phone", value: latestPosted?.customer_phone_snapshot || "—" },
          { label: "GSTIN", value: latestPosted?.customer_gstin || "—" },
          {
            label: "Branch",
            value: latestPosted?.branch_name || latestPosted?.branch_code || "Primary",
          },
        ]}
        referenceFields={[
          { label: "Invoice Date", value: latestPosted?.invoice_date || "—" },
          { label: "Billing Channel", value: latestPosted?.billing_channel || "—" },
          { label: "Tax Mode", value: latestPosted?.tax_mode || "—" },
          {
            label: "Source Ref",
            value:
              latestPosted?.direct_sale_no ||
              latestPosted?.source_reference ||
              latestPosted?.source_type ||
              "Manual",
          },
        ]}
        summaryFields={[
          { label: "Sub Total", value: accountingMoney(latestPosted?.subtotal || 0) },
          { label: "Tax Total", value: accountingMoney(latestPosted?.tax_total || 0) },
          { label: "Grand Total", value: accountingMoney(latestPosted?.grand_total || 0), emphasize: true },
          { label: "Received", value: accountingMoney(latestPosted?.received_total || 0) },
          { label: "Balance Due", value: accountingMoney(latestPosted?.balance_total || 0), emphasize: true },
        ]}
        detailFields={[
          { label: "Document Status", value: latestPosted?.status || "—" },
          {
            label: "Amount In Words",
            value: toAmountInWordsINR(latestPosted?.grand_total || 0),
          },
          {
            label: "Payment Reference",
            value: latestPosted?.source_reference || latestPosted?.direct_sale_no || "—",
          },
          { label: "Terms", value: latestPosted?.terms || "—" },
          { label: "Notes", value: latestPosted?.notes || "—" },
        ]}
        lineItems={(latestPosted?.lines || []).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: accountingMoney(line.unit_price),
          lineTotal: accountingMoney(line.line_total),
        }))}
      />

      <AdminCancellationDialog
        open={cancelTarget !== null}
        sourceType="BILLING_INVOICE"
        sourceReference={cancelTarget?.document_no || `INV-${cancelTarget?.id || ""}`}
        currentStatus={cancelTarget?.status || ""}
        financialImpactSummary={`Grand total ${accountingMoney(cancelTarget?.grand_total || 0)} · Active receipts ${accountingMoney(cancelTarget?.active_receipt_total || 0)} · Void receipts ${accountingMoney(cancelTarget?.void_receipt_total || 0)} · Balance ${accountingMoney(cancelTarget?.balance_total || 0)}`}
        requiresReceiptReversal={Number(cancelTarget?.active_receipt_total || 0) > 0}
        affected={{
          receipts: Number(cancelTarget?.active_receipt_total || 0) > 0,
          invoices: true,
        }}
        onClose={() => {
          if (!cancelSubmitting) setCancelTarget(null);
        }}
        submitting={cancelSubmitting}
        confirmLabel={cancelTarget?.status === "POSTED" ? "Confirm invoice void" : "Confirm invoice cancellation"}
        onConfirm={async (payload) => {
          if (!cancelTarget) return;
          setCancelSubmitting(true);
          try {
            await cancelBillingInvoice(cancelTarget.id, {
              ...payload,
              reversal_policy: cancelTarget.status === "POSTED" ? "CREATE_CREDIT_NOTE" : "NONE",
            });
            setCancelTarget(null);
            await loadPage();
          } catch (err) {
            throw new Error(accountingErrorMessage(err, "Invoice cancellation failed."));
          } finally {
            setCancelSubmitting(false);
          }
        }}
      />
    </PortalPage>
  );
}
