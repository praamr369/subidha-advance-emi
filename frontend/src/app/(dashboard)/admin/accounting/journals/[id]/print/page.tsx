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
import { apiFetch } from "@/lib/api";
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
import type { JournalEntry } from "@/services/accounting";

function statusLabel(status: string | null | undefined): string {
  return unsafeDocumentStatusLabel(status) || normalizeDocumentStatus(status) || "—";
}

function lineRows(entry: JournalEntry): DocumentLineItem[] {
  return (entry.lines || []).map((line, index) => ({
    key: line.id || `${entry.id}-${index}`,
    description: safeDocumentText(line.chart_account_name, `Line ${index + 1}`),
    code: [line.chart_account_code, line.description].map((part) => (part || "").trim()).filter(Boolean).join(" · "),
    quantity: "—",
    rate: formatDocumentMoney(line.debit_amount),
    discount: "—",
    tax: "—",
    total: formatDocumentMoney(line.credit_amount),
  }));
}

function totalOf(entry: JournalEntry, key: "debit_amount" | "credit_amount"): number {
  return (entry.lines || []).reduce((sum, line) => {
    const amount = Number(line[key] || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function isUnbalanced(entry: JournalEntry): boolean {
  return totalOf(entry, "debit_amount") !== totalOf(entry, "credit_amount");
}

function warning(entry: JournalEntry): string | null {
  if (isUnbalanced(entry)) return "This journal entry is UNBALANCED. It must not be treated as a normal posted accounting voucher.";
  return documentUnsafeStatusMessage(entry.status, "journal entry voucher");
}

function watermark(entry: JournalEntry): string | null {
  if (isUnbalanced(entry)) return "UNBALANCED";
  return documentStatusWatermark(entry.status);
}

export default function AdminJournalEntryPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [entry, setEntry] = useState<JournalEntry | null>(null);
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
        const payload = await apiFetch<JournalEntry>(`/accounting/journal-entries/${id}/`, { cache: "no-store" });
        if (!mounted) return;
        setEntry(payload);
      } catch (err) {
        if (!mounted) return;
        setEntry(null);
        setError(err instanceof Error ? err.message : "Failed to load journal entry voucher.");
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

  if (loading) return <ERPLoadingState label="Loading journal entry voucher..." />;
  if (error || !entry) {
    return <ERPErrorState title="Unable to load journal entry voucher" description={error || "The requested journal entry could not be loaded."} />;
  }

  const totalDebit = totalOf(entry, "debit_amount");
  const totalCredit = totalOf(entry, "credit_amount");
  const diff = totalDebit - totalCredit;
  const warn = warning(entry);

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.accountingJournals} />
      <DocumentPage watermark={watermark(entry)}>
        <DocumentHeader copyLabel={copyLabel} documentNo={entry.entry_no} documentDate={formatDocumentDate(entry.entry_date)} />
        <DocumentTitleStrip title="JOURNAL ENTRY VOUCHER" subtitle="Read-only accounting voucher generated from existing journal-entry records." status={statusLabel(entry.status)} />
        {warn ? <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">{warn}</div> : null}
        <DocumentMetadataGrid
          items={[
            { label: "Journal Reference", value: safeDocumentText(entry.entry_no, `#${entry.id}`) },
            { label: "Posting Date", value: formatDocumentDate(entry.entry_date) },
            { label: "Entry Type", value: safeDocumentText(entry.entry_type) },
            { label: "Status", value: statusLabel(entry.status) },
            { label: "Source Type", value: safeDocumentText(entry.source_type || entry.source_model) },
            { label: "Source Reference", value: safeDocumentText(entry.source_reference || entry.source_id) },
            { label: "Voucher Type", value: safeDocumentText(entry.voucher_type) },
            { label: "Created At", value: formatDocumentDateTime(entry.created_at) },
            { label: "Posted By", value: safeDocumentText(entry.posted_by_username) },
            { label: "Posted At", value: formatDocumentDateTime(entry.posted_at) },
            { label: "Approved By", value: safeDocumentText(entry.approved_by_username) },
            { label: "Approved At", value: formatDocumentDateTime(entry.approved_at) },
          ]}
        />
        {entry.memo || entry.void_reason ? (
          <section className="document-card my-5 rounded-2xl border border-[#e6d6bd] bg-white p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Narration / Description</div>
            <div className="mt-2 whitespace-pre-line text-xs leading-5 text-[#6f5c46]">{entry.memo || entry.void_reason}</div>
          </section>
        ) : null}
        <section className="mt-5">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Debit / Credit Lines</div>
          <DocumentLineItemsTable items={lineRows(entry)} />
        </section>
        <DocumentAmountSummary
          rows={[
            { label: "Total Debit", value: formatDocumentMoney(totalDebit), strong: true },
            { label: "Total Credit", value: formatDocumentMoney(totalCredit), strong: true },
            { label: "Difference / Imbalance", value: formatDocumentMoney(diff), strong: true, danger: diff !== 0 },
          ]}
        />
        <DocumentTermsBlock terms={["This voucher is generated from the existing backend journal entry payload only.", "Totals shown here are a display summary of backend journal lines and do not post, approve, void, reverse, or reconcile this entry.", "Draft, voided, reversed, cancelled, failed, or unbalanced entries must not be treated as normal posted journal vouchers."]} />
        <DocumentSignatureBlock labels={["Prepared By Signature", "Approved By Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]"><Link href={ROUTES.admin.accountingJournals} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">Back to journal register</Link><span>Read-only journal entry voucher generated from existing backend payloads.</span></div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
