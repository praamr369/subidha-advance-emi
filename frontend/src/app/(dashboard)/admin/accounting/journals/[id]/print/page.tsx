"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
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

  const warn = documentUnsafeStatusMessage(entry.status, "journal entry voucher");

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.accountingJournals} />
      <DocumentPage watermark={documentStatusWatermark(entry.status)}>
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
        <section className="document-card my-5 overflow-hidden rounded-2xl border border-[#d9c39c] bg-white">
          <div className="border-b border-[#eadcc6] px-3 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">
            Debit / Credit Lines
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f0dfbd] text-left text-[11px] uppercase tracking-[0.1em] text-[#5e3818]">
                <th className="px-3 py-3">Account Code</th>
                <th className="px-3 py-3">Account Name</th>
                <th className="px-3 py-3">Line Narration</th>
                <th className="px-3 py-3 text-right">Debit</th>
                <th className="px-3 py-3 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(entry.lines || []).map((line, index) => (
                <tr key={line.id || `${entry.id}-${index}`} className="border-t border-[#eadcc6] align-top">
                  <td className="px-3 py-3 font-semibold text-[#2f2418]">{safeDocumentText(line.chart_account_code)}</td>
                  <td className="px-3 py-3 text-[#2f2418]">{safeDocumentText(line.chart_account_name)}</td>
                  <td className="px-3 py-3 text-[#6f5c46]">{safeDocumentText(line.description)}</td>
                  <td className="px-3 py-3 text-right">{formatDocumentMoney(line.debit_amount)}</td>
                  <td className="px-3 py-3 text-right">{formatDocumentMoney(line.credit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <DocumentTermsBlock terms={["This voucher is generated from the existing backend journal entry payload only.", "Debit and credit line amounts are backend-provided. This print page does not calculate debit/credit totals, imbalance, posting state, or reconciliation state.", "Draft, voided, reversed, cancelled, failed, or backend-marked unbalanced entries must not be treated as normal posted journal vouchers."]} />
        <DocumentSignatureBlock labels={["Prepared By Signature", "Approved By Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]"><Link href={ROUTES.admin.accountingJournals} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">Back to journal register</Link><span>Read-only journal entry voucher generated from existing backend payloads.</span></div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
