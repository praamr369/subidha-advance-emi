"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
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
import { type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  formatDocumentDate,
  formatDocumentMoney,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { ROUTES } from "@/lib/routes";
import {
  getCashbook,
  getFinanceAccount,
  type CashbookReport,
  type FinanceAccountDetail,
} from "@/services/accounting";

function periodLabel(report: CashbookReport): string {
  if (report.start_date && report.end_date) return `${formatDocumentDate(report.start_date)} – ${formatDocumentDate(report.end_date)}`;
  if (report.start_date) return `From ${formatDocumentDate(report.start_date)}`;
  if (report.end_date) return `Until ${formatDocumentDate(report.end_date)}`;
  return "All available backend finance-account rows";
}

function accountKindLabel(kind?: string | null): string {
  const normalized = (kind || "").trim().toUpperCase();
  if (normalized === "CASH") return "Cash";
  if (normalized === "BANK") return "Bank";
  if (normalized === "UPI") return "UPI";
  if (normalized === "PAYMENT_GATEWAY" || normalized === "GATEWAY") return "Gateway";
  return normalized || "Other";
}

function accountWarning(account: FinanceAccountDetail): string | null {
  if (!account.is_active) return "This finance account is INACTIVE. The statement must not be treated as a normal active account statement.";
  return null;
}

export default function AdminFinanceAccountStatementPrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;
  const startDate = searchParams.get("start_date") || undefined;
  const endDate = searchParams.get("end_date") || undefined;
  const [account, setAccount] = useState<FinanceAccountDetail | null>(null);
  const [report, setReport] = useState<CashbookReport | null>(null);
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
        const [accountPayload, reportPayload] = await Promise.all([
          getFinanceAccount(Number(id)),
          getCashbook({ finance_account_id: id, start_date: startDate, end_date: endDate }),
        ]);
        if (!mounted) return;
        setAccount(accountPayload);
        setReport(reportPayload);
      } catch (err) {
        if (!mounted) return;
        setAccount(null);
        setReport(null);
        setError(err instanceof Error ? err.message : "Failed to load finance account statement.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [id, startDate, endDate]);

  const generatedAt = useMemo(() => new Date().toISOString(), []);

  if (loading) return <ERPLoadingState label="Loading finance account statement..." />;
  if (error || !account || !report) {
    return <ERPErrorState title="Unable to load finance account statement" description={error || "The requested finance account statement could not be loaded."} />;
  }

  const warn = accountWarning(account);
  const accountRef = `${account.name} · ${accountKindLabel(account.kind)}`;

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={ROUTES.admin.accountingBooks} />
      <DocumentPage watermark={account.is_active ? null : "INACTIVE"}>
        <DocumentHeader copyLabel={copyLabel} documentNo={accountRef} documentDate={periodLabel(report)} />
        <DocumentTitleStrip title="FINANCE ACCOUNT STATEMENT" subtitle="Read-only finance account statement generated from existing backend account and cashbook report payloads." status={account.is_active ? "ACTIVE" : "INACTIVE"} />
        {warn ? <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">{warn}</div> : null}
        <DocumentMetadataGrid
          items={[
            { label: "Finance Account", value: safeDocumentText(account.name) },
            { label: "Account Type", value: accountKindLabel(account.kind) },
            { label: "Linked Chart Account", value: [account.chart_account_code, account.chart_account_name].map((part) => (part || "").trim()).filter(Boolean).join(" · ") || safeDocumentText(report.finance_account.chart_account_code) },
            { label: "Branch", value: [account.branch_code, account.branch_name].map((part) => (part || "").trim()).filter(Boolean).join(" · ") || "—" },
            { label: "Period", value: periodLabel(report) },
            { label: "Opening Balance", value: "—" },
            { label: "Closing Balance", value: formatDocumentMoney(report.closing_balance) },
            { label: "Reconciliation Status", value: "—" },
          ]}
        />
        <section className="document-card my-5 overflow-hidden rounded-2xl border border-[#d9c39c] bg-white">
          <div className="border-b border-[#eadcc6] px-3 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">
            Finance Account Transactions
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f0dfbd] text-left text-[11px] uppercase tracking-[0.1em] text-[#5e3818]">
                <th className="px-3 py-3">Date / Reference</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Narration</th>
                <th className="px-3 py-3 text-right">Debit / Inflow</th>
                <th className="px-3 py-3 text-right">Credit / Outflow</th>
                <th className="px-3 py-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {(report.rows || []).slice(0, 80).map((row, index) => (
                <tr key={`${row.journal_entry_id}-${index}`} className="border-t border-[#eadcc6] align-top">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#2f2418]">{formatDocumentDate(row.entry_date)}</div>
                    <div className="mt-1 text-[11px] text-[#7c6a56]">{safeDocumentText(row.entry_no)}</div>
                  </td>
                  <td className="px-3 py-3 text-[#2f2418]">
                    <div>{safeDocumentText(row.source_type || row.voucher_type)}</div>
                    <div className="mt-1 text-[11px] text-[#7c6a56]">{safeDocumentText(row.source_reference || row.source_id)}</div>
                  </td>
                  <td className="px-3 py-3 text-[#6f5c46]">{safeDocumentText(row.memo || row.description)}</td>
                  <td className="px-3 py-3 text-right">{formatDocumentMoney(row.debit_amount)}</td>
                  <td className="px-3 py-3 text-right">{formatDocumentMoney(row.credit_amount)}</td>
                  <td className="px-3 py-3 text-right">{formatDocumentMoney(row.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.rows.length === 0 ? <div className="border-t border-[#eadcc6] px-3 py-6 text-center text-sm text-[#7c6a56]">No backend statement rows were returned for this finance account and period.</div> : null}
        </section>
        <DocumentAmountSummary rows={[{ label: "Closing Balance", value: formatDocumentMoney(report.closing_balance), strong: true }]} />
        <DocumentTermsBlock terms={["This statement is generated from the existing finance-account detail endpoint and existing backend cashbook/general-ledger report payload only.", "Opening balance and reconciliation status are displayed only when a backend report contract exposes them; this page does not invent missing fields.", "The print page does not calculate opening balance, closing balance, running balance, inflow/outflow totals, variance, reconciliation state, or finance account truth."]} />
        <DocumentSignatureBlock labels={["Prepared By Signature", "Reviewer Signature"]} />
        <div className="document-screen-only mt-5 flex justify-between gap-4 text-xs text-[#7c6a56]"><Link href={ROUTES.admin.accountingBooks} className="font-semibold text-[#6f4e27] underline-offset-4 hover:underline">Back to accounting books</Link><span>Read-only finance account statement generated from existing backend payloads.</span></div>
        <DocumentAuditFooter generatedAt={generatedAt} />
      </DocumentPage>
    </>
  );
}
