"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  type AccountingExportReportMeta,
} from "@/services/accounting";
import {
  downloadAccountingExport,
  fetchAccountingExport,
  fetchAccountingExportIndex,
  type AccountingExportIndex,
  type AccountingExportReport,
} from "@/services/financial-intelligence";

const REPORT_FETCH_MAP: Record<
  string,
  (params: { year: number; month: number; as_of: string }) => Promise<AccountingExportReport>
> = {
  trial_balance_export: (p) => fetchAccountingExport("trial-balance", p),
  journal_export: (p) => fetchAccountingExport("journals", p),
  ledger_export: (p) => fetchAccountingExport("ledgers", p),
  receivables_export: (p) => fetchAccountingExport("receivables", p),
  liability_export: (p) => fetchAccountingExport("liabilities", p),
  bridge_audit_export: (p) => fetchAccountingExport("bridge-audit", p),
};

const REPORT_CSV_KEY_MAP: Record<
  string,
  "trial-balance" | "journals" | "ledgers" | "receivables" | "liabilities" | "bridge-audit"
> = {
  trial_balance_export: "trial-balance",
  journal_export: "journals",
  ledger_export: "ledgers",
  receivables_export: "receivables",
  liability_export: "liabilities",
  bridge_audit_export: "bridge-audit",
};

const today = new Date();

export default function AccountingExportReportsPage() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [asOf, setAsOf] = useState(today.toISOString().slice(0, 10));
  const [reloadKey, setReloadKey] = useState(0);
  const [index, setIndex] = useState<AccountingExportIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportData, setReportData] = useState<Record<string, AccountingExportReport | null>>({});
  const [reportLoading, setReportLoading] = useState<Record<string, boolean>>({});
  const [reportError, setReportError] = useState<Record<string, string | null>>({});
  const [csvLoading, setCsvLoading] = useState<Record<string, boolean>>({});
  const [csvError, setCsvError] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIndex(null);
    setReportData({});
    setReportError({});

    fetchAccountingExportIndex({ year, month, as_of: asOf })
      .then((payload) => {
        if (!cancelled) {
          setIndex(payload);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load export index.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [asOf, year, month, reloadKey]);

  function handleFetchReport(reportKey: string) {
    const fetcher = REPORT_FETCH_MAP[reportKey];
    if (!fetcher) return;
    setReportLoading((prev) => ({ ...prev, [reportKey]: true }));
    setReportError((prev) => ({ ...prev, [reportKey]: null }));

    fetcher({ year, month, as_of: asOf })
      .then((payload) => {
        setReportData((prev) => ({ ...prev, [reportKey]: payload }));
      })
      .catch((err: unknown) => {
        setReportError((prev) => ({
          ...prev,
          [reportKey]: err instanceof Error ? err.message : "Failed to fetch report.",
        }));
      })
      .finally(() => {
        setReportLoading((prev) => ({ ...prev, [reportKey]: false }));
      });
  }

  async function handleDownloadCsv(reportKey: string) {
    const csvKey = REPORT_CSV_KEY_MAP[reportKey];
    if (!csvKey) return;
    setCsvLoading((prev) => ({ ...prev, [reportKey]: true }));
    setCsvError((prev) => ({ ...prev, [reportKey]: null }));

    try {
      await downloadAccountingExport(csvKey, { year, month, as_of: asOf });
    } catch (err: unknown) {
      setCsvError((prev) => ({
        ...prev,
        [reportKey]: err instanceof Error ? err.message : "CSV download failed.",
      }));
    } finally {
      setCsvLoading((prev) => ({ ...prev, [reportKey]: false }));
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);
  const reports = Array.isArray(index?.reports) ? index.reports : [];
  const monthOptions = [
    [1, "Jan"], [2, "Feb"], [3, "Mar"], [4, "Apr"],
    [5, "May"], [6, "Jun"], [7, "Jul"], [8, "Aug"],
    [9, "Sep"], [10, "Oct"], [11, "Nov"], [12, "Dec"],
  ] as const;

  return (
    <ERPPageShell
      title="Accounting Exports"
      subtitle="Read-only structured exports for manual review or import preparation. JSON and CSV available."
      helperNote="No external accounting sync or export jobs run here. Reports are fetched directly from the read-only P4E endpoints."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Exports" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingFinancialIntelligence, label: "Financial Intelligence", variant: "secondary" },
        { href: ROUTES.admin.accountingCloseCockpit, label: "Close Cockpit", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only — Read Only", tone: "info" }}
    >
      <ERPSectionShell
        title="Period Selector"
        description="Select the accounting period for all reports below."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            As of
            <input
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Month
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {monthOptions.map(([num, label]) => (
                <option key={num} value={num}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </ERPSectionShell>

      {loading ? <ERPLoadingState label="Loading export index…" /> : null}
      {!loading && error ? (
        <ERPErrorState
          title="Export index unavailable"
          description={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {!loading && !error && index ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <ReportCard
              key={report.key}
              report={report}
              year={year}
              month={month}
              data={reportData[report.key] ?? null}
              isLoading={reportLoading[report.key] ?? false}
              fetchError={reportError[report.key] ?? null}
              isCsvLoading={csvLoading[report.key] ?? false}
              csvError={csvError[report.key] ?? null}
              onFetch={() => handleFetchReport(report.key)}
              onDownloadCsv={() => void handleDownloadCsv(report.key)}
            />
          ))}
        </div>
      ) : null}

      {!loading && !error && index && reports.length === 0 ? (
        <ERPEmptyState
          title="No reports available"
          description="The export index returned no reports. Check backend configuration."
        />
      ) : null}
    </ERPPageShell>
  );
}

type ReportCardProps = {
  report: AccountingExportReportMeta;
  year: number;
  month: number;
  data: AccountingExportReport | null;
  isLoading: boolean;
  fetchError: string | null;
  isCsvLoading: boolean;
  csvError: string | null;
  onFetch: () => void;
  onDownloadCsv: () => void;
};

function ReportCard({
  report,
  data,
  isLoading,
  fetchError,
  isCsvLoading,
  csvError,
  onFetch,
  onDownloadCsv,
}: ReportCardProps) {
  const hasCsv = report.formats.includes("csv");
  const csvKey = REPORT_CSV_KEY_MAP[report.key];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background px-5 py-4 gap-3">
      <div>
        <div className="font-semibold text-foreground">{report.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{report.description}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFetch}
          disabled={isLoading}
          className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {isLoading ? "Loading…" : "View JSON"}
        </button>

        {hasCsv && csvKey ? (
          <button
            type="button"
            onClick={onDownloadCsv}
            disabled={isCsvLoading}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
          >
            {isCsvLoading ? "Downloading…" : "Download CSV"}
          </button>
        ) : null}
      </div>

      {fetchError ? (
        <p className="text-xs text-destructive">{fetchError}</p>
      ) : null}

      {csvError ? (
        <p className="text-xs text-destructive">CSV: {csvError}</p>
      ) : null}

      {isLoading ? (
        <ERPLoadingState label="Fetching report…" />
      ) : null}

      {!isLoading && data ? (
        <ReportSummary data={data} />
      ) : null}
    </div>
  );
}

function ReportSummary({ data }: { data: AccountingExportReport }) {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const totals = data.totals && typeof data.totals === "object" ? data.totals : {};
  const rowCount = rows.length;
  const totalLineCount = typeof totals["total_line_count"] === "number"
    ? totals["total_line_count"]
    : null;
  const truncated = totals["truncated"] === true;

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-3">
        <span className="text-muted-foreground">
          Rows: <span className="font-medium text-foreground">{rowCount}</span>
          {totalLineCount !== null && totalLineCount > rowCount
            ? ` of ${totalLineCount}`
            : null}
        </span>
        {totals["total_debit"] !== undefined ? (
          <span className="text-muted-foreground">
            Dr: <span className="font-medium text-foreground">{String(totals["total_debit"])}</span>
          </span>
        ) : null}
        {totals["total_credit"] !== undefined ? (
          <span className="text-muted-foreground">
            Cr: <span className="font-medium text-foreground">{String(totals["total_credit"])}</span>
          </span>
        ) : null}
        {totals["total_outstanding"] !== undefined ? (
          <span className="text-muted-foreground">
            Outstanding: <span className="font-medium text-foreground">{String(totals["total_outstanding"])}</span>
          </span>
        ) : null}
        {totals["overall_status"] !== undefined ? (
          <span className="text-muted-foreground">
            Status: <span className="font-medium text-foreground">{String(totals["overall_status"])}</span>
          </span>
        ) : null}
      </div>

      {truncated ? (
        <p className="text-amber-600">Result truncated. Narrow the period or use a smaller limit.</p>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-amber-600 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}

      {rowCount > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Preview first {Math.min(rowCount, 3)} row{rowCount > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="border border-border px-2 py-1 text-left font-medium text-muted-foreground bg-muted/40"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 3).map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col} className="border border-border px-2 py-1 text-foreground">
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className="text-muted-foreground italic">No rows in this period.</p>
      )}
    </div>
  );
}
