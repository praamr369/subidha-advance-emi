"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentLineItemsTable,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
  type DocumentLineItem,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  documentUnsafeStatusMessage,
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  normalizeDocumentStatus,
  safeDocumentText,
  unsafeDocumentStatusLabel,
} from "@/lib/documents/formatters";
import { ROUTES } from "@/lib/routes";
import { getAdminCashierDayClose } from "@/services/settlements";
import type { CashierDayClose } from "@/types/settlements";

type MetadataValue = string | number | boolean | null | undefined | Record<string, unknown> | Array<unknown>;

type MethodSummaryRow = {
  method: string;
  label: string;
  amount?: string | number | null;
  count?: string | number | null;
};

function displayStatus(status: string | null | undefined): string {
  return unsafeDocumentStatusLabel(status) || normalizeDocumentStatus(status) || "—";
}

function getMetadata(record: CashierDayClose): Record<string, MetadataValue> {
  return (record.metadata || {}) as Record<string, MetadataValue>;
}

function metadataText(metadata: Record<string, MetadataValue>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function metadataMoney(metadata: Record<string, MetadataValue>, keys: string[]): string | null {
  const text = metadataText(metadata, keys);
  return text === null ? null : text;
}

function metadataCount(metadata: Record<string, MetadataValue>, keys: string[]): string | null {
  const text = metadataText(metadata, keys);
  return text === null ? null : text;
}

function rawMoneyValue(value: unknown): string | number | null | undefined {
  return typeof value === "string" || typeof value === "number" || value == null ? value : undefined;
}

function buildPaymentMethodSummary(record: CashierDayClose): DocumentLineItem[] {
  const metadata = getMetadata(record);
  const rawRows = metadata.payment_method_summary || metadata.collection_breakdown || metadata.method_summary;
  if (Array.isArray(rawRows)) {
    return rawRows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
      .map((row, index) => {
        const method = String(row.method || row.payment_method || row.label || `Method ${index + 1}`);
        return {
          key: `${method}-${index}`,
          description: method,
          code: typeof row.status === "string" ? row.status : undefined,
          quantity: row.count == null ? "—" : String(row.count),
          rate: "—",
          discount: "—",
          tax: "—",
          total: formatDocumentMoney(rawMoneyValue(row.amount ?? row.total ?? row.collected)),
        };
      });
  }

  const rows: MethodSummaryRow[] = [
    { method: "cash", label: "Cash", amount: record.system_cash_total, count: metadataCount(metadata, ["cash_payment_count", "cash_count"]) },
    { method: "upi", label: "UPI", amount: metadataMoney(metadata, ["upi_collected", "upi_total", "upi_amount"]), count: metadataCount(metadata, ["upi_payment_count", "upi_count"]) },
    { method: "bank", label: "Bank / Card", amount: metadataMoney(metadata, ["bank_collected", "card_collected", "bank_card_total", "bank_total", "card_total"]), count: metadataCount(metadata, ["bank_payment_count", "card_payment_count", "bank_card_count"]) },
  ];

  return rows
    .filter((row) => row.amount !== null && row.amount !== undefined && row.amount !== "")
    .map((row) => ({
      key: row.method,
      description: row.label,
      quantity: row.count == null ? "—" : String(row.count),
      rate: "—",
      discount: "—",
      tax: "—",
      total: formatDocumentMoney(row.amount),
    }));
}

function hasVariance(record: CashierDayClose): boolean {
  return Number(record.variance || 0) !== 0;
}

function reportWarning(record: CashierDayClose): string | null {
  if (record.status === "VOIDED") return documentUnsafeStatusMessage(record.status, "cashier day close report");
  if (record.status === "REJECTED") return "This cashier day close is REJECTED. It is retained as evidence and must not be treated as an approved balanced report.";
  if (record.status === "DRAFT" || record.status === "SUBMITTED") return `This cashier day close is ${record.status}. It is not an approved final day-close report.`;
  if (hasVariance(record)) return "This cashier day close has a non-zero variance. Treat it as unbalanced until reviewed and resolved through approved controls.";
  return null;
}

function reportWatermark(record: CashierDayClose): string | undefined {
  if (hasVariance(record)) return "UNBALANCED";
  return documentStatusWatermark(record.status) ?? undefined;
}

export default function AdminCashierDayClosePrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [record, setRecord] = useState<CashierDayClose | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await getAdminCashierDayClose(id);
        if (!mounted) return;
        setRecord(payload);
      } catch (err) {
        if (!mounted) return;
        setRecord(null);
        setError(err instanceof Error ? err.message : "Failed to load cashier day close report.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading cashier day close report..." />;
  if (error || !record) {
    return <ERPErrorState title="Unable to load cashier day close report" description={error || "The requested day close report could not be loaded."} />;
  }

  const metadata = getMetadata(record);
  const methodRows = buildPaymentMethodSummary(record);
  const warning = reportWarning(record);
  const expectedTotal = metadataMoney(metadata, ["expected_total", "expected_cash", "system_total", "system_cash_total"]) || record.system_cash_total;
  const declaredTotal = metadataMoney(metadata, ["declared_total", "declared_cash", "counted_total", "counted_cash"]) || record.counted_cash;

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={`${ROUTES.admin.settlementsDayCloses}/${record.id}`} />
      <DocumentPage watermark={reportWatermark(record)}>
        <DocumentHeader copyLabel={copyLabel} documentNo={record.close_no || `Day Close ${record.id}`} documentDate={formatDocumentDate(record.business_date)} />
        <DocumentTitleStrip title="CASHIER DAY CLOSE REPORT" subtitle="Read-only cashier settlement evidence generated from backend day-close records." status={displayStatus(record.status)} />
        {warning ? (
          <div className="document-card mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {warning}
          </div>
        ) : null}
        <DocumentMetadataGrid
          items={[
            { label: "Report Reference", value: safeDocumentText(record.close_no, `#${record.id}`) },
            { label: "Cashier", value: safeDocumentText(record.cashier_username, `User #${record.cashier}`) },
            { label: "Branch", value: safeDocumentText(record.branch_name || record.branch_code) },
            { label: "Cash Counter", value: safeDocumentText(record.cash_counter_name) },
            { label: "Finance Account", value: safeDocumentText(record.finance_account_name) },
            { label: "Business Date", value: formatDocumentDate(record.business_date) },
            { label: "Settlement Status", value: displayStatus(record.status) },
            { label: "Reconciliation Status", value: safeDocumentText(metadataText(metadata, ["reconciliation_status", "reconcile_status", "settlement_reconciliation_status"])) },
            { label: "Prepared / Closed By", value: safeDocumentText(record.closed_by_username) },
            { label: "Closed At", value: formatDocumentDateTime(record.closed_at) },
            { label: "Verified / Approved By", value: safeDocumentText(record.approved_by_username) },
            { label: "Approved At", value: formatDocumentDateTime(record.approved_at) },
          ]}
        />
        <DocumentAmountSummary
          rows={[
            { label: "Opening Cash", value: formatDocumentMoney(record.opening_cash) },
            { label: "Cash Collected / System Cash", value: formatDocumentMoney(record.system_cash_total), strong: true },
            { label: "UPI Collected", value: formatDocumentMoney(metadataMoney(metadata, ["upi_collected", "upi_total", "upi_amount"])) },
            { label: "Bank / Card Collected", value: formatDocumentMoney(metadataMoney(metadata, ["bank_collected", "card_collected", "bank_card_total", "bank_total", "card_total"])) },
            { label: "Expected Total", value: formatDocumentMoney(expectedTotal) },
            { label: "Declared Total", value: formatDocumentMoney(declaredTotal) },
            { label: "Variance / Shortage / Excess", value: formatDocumentMoney(record.variance), strong: true, danger: hasVariance(record) },
          ]}
        />
        <DocumentMetadataGrid
          items={[
            { label: "Payment Count", value: safeDocumentText(metadataCount(metadata, ["payment_count", "payments_count", "total_payment_count"])) },
            { label: "Receipt Count", value: safeDocumentText(metadataCount(metadata, ["receipt_count", "receipts_count", "total_receipt_count"])) },
            { label: "Cancelled Receipts", value: safeDocumentText(metadataCount(metadata, ["cancelled_receipt_count", "cancelled_receipts"])) },
            { label: "Voided Receipts", value: safeDocumentText(metadataCount(metadata, ["voided_receipt_count", "voided_receipts"])) },
            { label: "Reversed Receipts", value: safeDocumentText(metadataCount(metadata, ["reversed_receipt_count", "reversed_receipts"])) },
            { label: "Collection Rows", value: safeDocumentText(metadataCount(metadata, ["collection_row_count", "collection_rows_count"])) },
          ]}
        />
        {methodRows.length ? (
          <section className="mt-5">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Payment Method Summary</div>
            <DocumentLineItemsTable items={methodRows} />
          </section>
        ) : null}
        {record.notes ? (
          <section className="document-card my-5 rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Remarks / Notes</div>
            <div className="mt-2 whitespace-pre-line text-xs leading-5 text-[#6f5c46]">{record.notes}</div>
          </section>
        ) : null}
        <DocumentTermsBlock
          terms={[
            "This report is generated from the existing backend cashier day-close detail payload only.",
            "Cash totals, counted cash, variance, status, and approval fields are not recalculated in this print page.",
            "This report does not create settlement allocations, money movements, journal entries, receipts, payments, reconciliation rows, or finance account changes.",
          ]}
        />
        <DocumentSignatureBlock labels={["Cashier Signature", "Manager / Admin Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]">
          <Link href={`${ROUTES.admin.settlementsDayCloses}/${record.id}`} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">
            Back to day-close review
          </Link>
          <span>Read-only cashier day-close report generated from existing backend payloads.</span>
        </div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
