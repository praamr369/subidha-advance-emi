"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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
  formatDocumentDate,
  formatDocumentMoney,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { ROUTES } from "@/lib/routes";
import { getGeneralLedger, type GeneralLedgerReport } from "@/services/accounting";

function periodLabel(report: GeneralLedgerReport): string {
  if (report.start_date && report.end_date) return `${formatDocumentDate(report.start_date)} – ${formatDocumentDate(report.end_date)}`;
  if (report.start_date) return `From ${formatDocumentDate(report.start_date)}`;
  if (report.end_date) return `Until ${formatDocumentDate(report.end_date)}`;
  return "All available backend ledger rows";
}

function lineRows(report: GeneralLedgerReport): DocumentLineItem[] {
  return (report.rows || []).slice(0, 80).map((row, index) => ({
    key: `${row.journal_entry_id}-${index}`,
    description: safeDocumentText(row.memo || row.description, row.entry_no),
    code: [row.entry_date, row.entry_no, row.source_type, row.source_reference]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join(" · "),
    quantity: formatDocumentMoney(row.running_balance),
    rate: formatDocumentMoney(row.debit_amount),
    discount: "—",
    tax: "—",
    total: formatDocumentMoney(row.credit_amount),
  }));
}

export default function AdminLedgerStatementPrintPage() {
  const params = useParams<{ accountId: string }>();
  const searchParams = useSearchParams();
  const accountId = params?.accountId;
  const startDate = searchParams.get("start_date") || undefined;
  const endDate = searchParams.get("end_date") || undefined;
  const [report, setReport] = useState<GeneralLedgerReport | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!accountId) return;
      setLoading(true);
      setError(null);
      try {
        const payload = await getGeneralLedger({ account_id: accountId, start_date: startDate, end_date: endDate });
        if (!mounted) return;
        setReport(payload);
      } catch (err) {
        if (!mounted) return;
        setReport(null);
        setError(err instanceof Error ? err.message : "Failed to load ledger account statement.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [accountId, startDate, endDate]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading ledger account statement..." />;
  if (error || !report) {
    return <ERPErrorState title="Unable to load ledger account statement" description={error || "The requested ledger statement could not be loaded."} />;
  }

  const accountRef = `${report.account.code} · ${report.account.name}`;

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.accountingBooks} />
      <DocumentPage>
        <DocumentHeader copyLabel={copyLabel} documentNo={accountRef} documentDate={periodLabel(report)} />
        <DocumentTitleStrip title="LEDGER ACCOUNT STATEMENT" subtitle="Read-only account statement generated from existing backend general-ledger report." status="BACKEND REPORT" />
        <DocumentMetadataGrid
          items={[
            { label: "Account Name", value: safeDocumentText(report.account.name) },
            { label: "Account Code", value: safeDocumentText(report.account.code) },
            { label: "Account Type", value: safeDocumentText(report.account.account_type) },
            { label: "Period", value: periodLabel(report) },
            { label: "Opening Balance", value: "—" },
            { label: "Closing Balance", value: formatDocumentMoney(report.closing_balance) },
          ]}
        />
        <section className="mt-5">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Ledger Transactions</div>
          <DocumentLineItemsTable items={lineRows(report)} />
        </section>
        <DocumentAmountSummary rows={[{ label: "Closing Balance", value: formatDocumentMoney(report.closing_balance), strong: true }]} />
        <DocumentTermsBlock terms={["This statement is generated from the existing backend general-ledger report only.", "Running balance and closing balance are displayed only from backend report payload fields.", "The print page does not calculate ledger balances, post journals, reconcile entries, mutate finance accounts, or alter chart-of-accounts records."]} />
        <DocumentSignatureBlock labels={["Prepared By Signature", "Reviewer Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]"><Link href={ROUTES.admin.accountingBooks} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">Back to accounting books</Link><span>Read-only ledger statement generated from existing backend payloads.</span></div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
