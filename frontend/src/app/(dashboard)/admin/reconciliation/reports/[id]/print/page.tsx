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
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  normalizeDocumentStatus,
  safeDocumentText,
  unsafeDocumentStatusLabel,
} from "@/lib/documents/formatters";
import {
  getReconciliationRun,
  listReconciliationItems,
} from "@/services/reconciliation/control-tower";
import type { ReconciliationItem, ReconciliationRun } from "@/types/reconciliation";

type MetaValue = string | number | boolean | null | undefined | Record<string, unknown> | Array<unknown>;
type Meta = Record<string, MetaValue>;

function statusLabel(status: string | null | undefined): string {
  return unsafeDocumentStatusLabel(status) || normalizeDocumentStatus(status) || "—";
}

function metaText(meta: Meta, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function period(run: ReconciliationRun): string {
  if (run.date_from && run.date_to) return `${formatDocumentDate(run.date_from)} – ${formatDocumentDate(run.date_to)}`;
  if (run.date_from) return formatDocumentDate(run.date_from);
  if (run.date_to) return formatDocumentDate(run.date_to);
  return formatDocumentDateTime(run.started_at);
}

function warning(run: ReconciliationRun): string | null {
  const status = String(run.status || "").toUpperCase();
  if (status === "FAILED" || status === "CANCELLED") return `This reconciliation report is ${status}. It is retained for audit and must not be treated as reconciled.`;
  if (status === "PENDING" || status === "RUNNING") return `This reconciliation report is ${status}. It is not a completed reconciliation report.`;
  if (Number(run.total_exceptions || 0) > 0 || Number(run.high_risk_count || 0) > 0) return "This reconciliation report has open exceptions and must not be treated as fully reconciled.";
  return null;
}

function watermark(run: ReconciliationRun): string | undefined {
  const status = String(run.status || "").toUpperCase();
  if (status === "FAILED" || status === "CANCELLED") return documentStatusWatermark(status) ?? undefined;
  if (Number(run.total_exceptions || 0) > 0 || Number(run.high_risk_count || 0) > 0) return "UNRECONCILED";
  return documentStatusWatermark(run.status) ?? undefined;
}

function itemRows(items: ReconciliationItem[]): DocumentLineItem[] {
  return items.slice(0, 20).map((item) => ({
    key: item.id,
    description: safeDocumentText(item.source_label || item.exception_message || item.exception_code, `Item #${item.id}`),
    code: [item.module, item.source_type, item.source_id, item.exception_code].map((part) => (part || "").trim()).filter(Boolean).join(" · "),
    quantity: safeDocumentText(item.severity),
    rate: formatDocumentMoney(item.expected_amount),
    discount: safeDocumentText(item.status),
    tax: formatDocumentMoney(item.actual_amount),
    total: formatDocumentMoney(item.amount_delta),
  }));
}

export default function AdminReconciliationReportPrintPage() {
  const params = useParams<{ id: string }>();
  const reportId = params?.id;
  const [run, setRun] = useState<ReconciliationRun | null>(null);
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!reportId) return;
      setLoading(true);
      setError(null);
      try {
        const [runPayload, itemsPayload] = await Promise.all([
          getReconciliationRun(reportId),
          listReconciliationItems({ run: reportId }),
        ]);
        if (!mounted) return;
        setRun(runPayload);
        setItems(itemsPayload.results || []);
      } catch (err) {
        if (!mounted) return;
        setRun(null);
        setItems([]);
        setError(err instanceof Error ? err.message : "Failed to load reconciliation report.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [reportId]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading reconciliation report..." />;
  if (error || !run) {
    return <ERPErrorState title="Unable to load reconciliation report" description={error || "The requested reconciliation report could not be loaded."} />;
  }

  const meta = (run.metadata || {}) as Meta;
  const reportRef = `RUN-${run.run_no || run.id}`;
  const rows = itemRows(items);
  const warn = warning(run);

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={`/admin/reconciliation/runs/${run.id}`} />
      <DocumentPage watermark={watermark(run)}>
        <DocumentHeader copyLabel={copyLabel} documentNo={reportRef} documentDate={period(run)} />
        <DocumentTitleStrip title="RECONCILIATION REPORT" subtitle="Read-only report generated from backend reconciliation run records." status={statusLabel(run.status)} />
        {warn ? <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">{warn}</div> : null}
        <DocumentMetadataGrid
          items={[
            { label: "Report Reference", value: reportRef },
            { label: "Report Type / Source", value: safeDocumentText(run.scope) },
            { label: "Source Module", value: safeDocumentText(run.module) },
            { label: "Branch", value: safeDocumentText(metaText(meta, ["branch_name", "branch_code"]) || (run.branch == null ? null : `Branch #${run.branch}`)) },
            { label: "Business Date / Period", value: period(run) },
            { label: "Status", value: statusLabel(run.status) },
            { label: "Prepared By", value: safeDocumentText(run.started_by_username, `User #${run.started_by}`) },
            { label: "Generated At", value: formatDocumentDateTime(run.started_at) },
            { label: "Reviewed By", value: safeDocumentText(metaText(meta, ["reviewed_by", "approved_by"])) },
            { label: "Reviewed At", value: formatDocumentDateTime(metaText(meta, ["reviewed_at", "approved_at"]) || run.finished_at) },
            { label: "Finance Account", value: safeDocumentText(metaText(meta, ["finance_account_name", "account_name"])) },
            { label: "Cash Counter / Source", value: safeDocumentText(metaText(meta, ["cash_counter_name", "source_module"])) },
          ]}
        />
        <DocumentAmountSummary
          rows={[
            { label: "Expected Amount", value: formatDocumentMoney(metaText(meta, ["expected_amount", "expected_total"])) },
            { label: "Matched Amount", value: formatDocumentMoney(metaText(meta, ["matched_amount", "matched_total"])) },
            { label: "Unmatched Amount", value: formatDocumentMoney(metaText(meta, ["unmatched_amount", "unmatched_total"])) },
            { label: "Variance Amount", value: formatDocumentMoney(metaText(meta, ["variance_amount", "amount_delta", "variance_total"])), strong: true, danger: Number(run.total_exceptions || 0) > 0 },
          ]}
        />
        <DocumentMetadataGrid
          items={[
            { label: "Total Source Records", value: safeDocumentText(metaText(meta, ["total_source_records"]) || String(run.total_checked ?? "")) },
            { label: "Matched Count", value: safeDocumentText(metaText(meta, ["matched_count"]) || String(run.total_matched ?? "")) },
            { label: "Unmatched Count", value: safeDocumentText(metaText(meta, ["unmatched_count"])) },
            { label: "Exception Count", value: safeDocumentText(metaText(meta, ["exception_count"]) || String(run.total_exceptions ?? "")) },
            { label: "Pending Review Count", value: safeDocumentText(metaText(meta, ["pending_review_count", "needs_review_count"])) },
            { label: "High Risk Count", value: safeDocumentText(String(run.high_risk_count ?? "")) },
          ]}
        />
        {rows.length ? <section className="mt-5"><div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Exception / Source References</div><DocumentLineItemsTable items={rows} /></section> : null}
        <DocumentTermsBlock terms={["This report is generated from existing backend reconciliation run and item payloads only.", "The print page does not recalculate totals, variance, counts, status, ledger state, or accounting truth.", "The print page does not mutate reconciliation items, settlements, payments, receipts, journals, finance accounts, lifecycle events, or accounting records."]} />
        <DocumentSignatureBlock labels={["Prepared By Signature", "Reviewer / Admin Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]"><Link href={`/admin/reconciliation/runs/${run.id}`} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">Back to reconciliation run</Link><span>Read-only reconciliation report generated from existing backend payloads.</span></div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
