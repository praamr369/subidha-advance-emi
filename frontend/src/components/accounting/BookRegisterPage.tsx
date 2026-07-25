"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef, GenericRecord } from "@/components/enterprise/columns";
import {
  WorkspaceDirectory,
  type WorkspaceDirectoryGroup,
} from "@/components/admin/control-center/WorkspaceDirectory";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { RegistryPageShell } from "@/components/layout/page-shells";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
  AccountingPeriodFilters,
  AccountingRefreshButton,
} from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";

type RegisterReport<T extends GenericRecord> = {
  start_date: string | null;
  end_date: string | null;
  rows: T[];
  // Optional balance summary — present on cash/bank/UPI finance books so the
  // operator can see how much money the book holds. Absent on sales/purchase
  // books, where the strip simply omits the balance.
  summary?: {
    total_debit?: string;
    total_credit?: string;
    net_balance?: string;
    row_count?: number;
  } | null;
  // Optional per-account balances — present on cash/bank/UPI finance books so the
  // operator can see how much money each individual counter / bank / UPI account
  // holds, not just the combined total.
  accounts?: BookAccountBalance[];
};

type BookAccountBalance = {
  finance_account_id: number;
  finance_account_name: string;
  kind: string;
  total_debit: string;
  total_credit: string;
  net_balance: string;
};

type BookRegisterPageProps<T extends GenericRecord> = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  printTitle: string;
  helperNote?: string;
  helperTone?: "default" | "info" | "warning";
  fetchReport: (params: { start_date?: string; end_date?: string }) => Promise<RegisterReport<T>>;
  columns: EnterpriseColumnDef<T>[];
  toPrintRow: (row: T) => React.ReactNode[];
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: Array<{ href: string; label: string; variant?: "primary" | "secondary" | "ghost" | "danger" }>;
  statusBadge?: { label: string; tone?: "default" | "success" | "warning" | "danger" | "info" };
  directoryTitle?: string;
  directoryDescription?: string;
  directoryGroups?: WorkspaceDirectoryGroup[];
};

export default function BookRegisterPage<T extends GenericRecord>({
  eyebrow,
  title,
  subtitle,
  printTitle,
  helperNote,
  helperTone = "default",
  fetchReport,
  columns,
  toPrintRow,
  breadcrumbs,
  actions,
  statusBadge,
  directoryTitle,
  directoryDescription,
  directoryGroups,
}: BookRegisterPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rangeLabel, setRangeLabel] = useState("Current filter");
  const [netBalance, setNetBalance] = useState<string | null>(null);
  const [accountBalances, setAccountBalances] = useState<BookAccountBalance[]>([]);
  const previewLimit = 12;

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await fetchReport({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
        setRows(payload.rows);
        setNetBalance(payload.summary?.net_balance ?? null);
        setAccountBalances(payload.accounts ?? []);
        setRangeLabel(
          payload.start_date || payload.end_date
            ? `${accountingDate(payload.start_date)} to ${accountingDate(payload.end_date)}`
            : "All posted rows"
        );
        setError(null);
      } catch (err) {
        setError(accountingErrorMessage(err, `Failed to load ${title.toLowerCase()}.`));
        setRows([]);
        setNetBalance(null);
        setAccountBalances([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [endDate, fetchReport, startDate, title]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const printableRows = useMemo(
    () => rows.slice(0, previewLimit).map(toPrintRow),
    [previewLimit, rows, toPrintRow]
  );
  const overflowRows = Math.max(rows.length - previewLimit, 0);

  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      helperNote={helperNote}
      helperTone={helperTone}
      breadcrumbs={
        breadcrumbs ?? [
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "Accounting", href: ROUTES.admin.accounting },
          { label: "Books", href: ROUTES.admin.accountingBooks },
          { label: title },
        ]
      }
      actions={actions}
      statusBadge={statusBadge ?? { label: "Posted Data Only", tone: "info" }}
    >
      <RegistryPageShell
        filters={
          <div className="receipt-print-hide space-y-4">
            {directoryGroups?.length ? (
              <WorkspaceDirectory
                title={directoryTitle ?? "Related routes"}
                description={directoryDescription}
                groups={directoryGroups}
              />
            ) : null}
            <WorkspaceSection
              title={`${title} Filters`}
              description="Books remain powered from posted accounting journals and finalized operational registers only."
              action={
                <AccountingRefreshButton
                  loading={loading}
                  refreshing={refreshing}
                  onClick={() => void loadPage("refresh")}
                />
              }
            >
              <AccountingPeriodFilters
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            </WorkspaceSection>
          </div>
        }
        summary={
          !loading && !error ? (
            <MetricStrip
              className="receipt-print-hide"
              items={[
                ...(netBalance !== null
                  ? [{ label: "Money in this book", value: accountingMoney(netBalance) }]
                  : []),
                { label: "Rows", value: String(rows.length) },
                { label: "Range", value: rangeLabel },
              ]}
            />
          ) : null
        }
        register={
          <div className="space-y-6">
            {loading ? <LoadingBlock label={`Loading ${title.toLowerCase()}...`} /> : null}
            {!loading && !error && accountBalances.length > 0 ? (
              <WorkspaceSection
                className="receipt-print-hide"
                title="Money in each account"
                description="How much this book holds, split by every individual account. Debit adds money in, credit takes it out — the balance is what is left."
              >
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Account</th>
                        <th className="px-4 py-2 text-left">Type</th>
                        <th className="px-4 py-2 text-right">Money in (debit)</th>
                        <th className="px-4 py-2 text-right">Money out (credit)</th>
                        <th className="px-4 py-2 text-right">Balance held</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountBalances.map((account) => (
                        <tr key={account.finance_account_id} className="border-t border-border">
                          <td className="px-4 py-2 font-medium text-foreground">{account.finance_account_name}</td>
                          <td className="px-4 py-2 text-muted-foreground">{account.kind}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{accountingMoney(account.total_debit)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{accountingMoney(account.total_credit)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{accountingMoney(account.net_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {netBalance !== null ? (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="px-4 py-2 font-semibold text-foreground" colSpan={4}>
                            Total money in this book
                          </td>
                          <td className="px-4 py-2 text-right font-bold tabular-nums">{accountingMoney(netBalance)}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </WorkspaceSection>
            ) : null}
            <WorkspaceSection
              className="receipt-print-hide"
              title={title}
              description="Use the table for operational review and the print surface for branded export/print."
            >
              <EnterpriseDataTable
                data={rows}
                columns={columns}
                loading={loading}
                error={error}
                onRetry={() => void loadPage("initial")}
                emptyTitle={`No ${title.toLowerCase()} rows found`}
                emptyDescription="Adjust the date filter or post new operational documents."
              />
            </WorkspaceSection>


          </div>
        }
      />
    </ERPPageShell>
  );
}
