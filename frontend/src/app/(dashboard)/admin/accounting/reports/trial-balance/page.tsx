"use client";

import { useEffect, useState } from "react";

import { ACCOUNTING_REPORT_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import {
  accountingErrorMessage,
  AccountingNotice,
  AccountingPeriodFilters,
  AccountingRefreshButton,
  accountingMoney,
} from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ReportPageShell } from "@/components/layout/page-shells";
import { ROUTES } from "@/lib/routes";
import { getTrialBalance, type TrialBalanceReport } from "@/services/accounting";

function toErrorMessage(error: unknown) {
  return accountingErrorMessage(
    error,
    "Failed to load the trial balance report."
  );
}

const today = new Date().toISOString().slice(0, 10);

export default function AccountingTrialBalancePage() {
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [startDate, setStartDate] = useState(today.slice(0, 8) + "01");
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getTrialBalance({
        start_date: startDate,
        end_date: endDate,
      });
      setReport(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setReport(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadReport("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ERPPageShell
      eyebrow="Accounting Statements"
      title="Trial Balance"
      subtitle="Read-only trial balance over posted accounting journals. This report stays inside the separate accounting subsystem and does not reinterpret EMI ledger history."
      helperNote="Trial balance remains a posted accounting statement. It is not a collections dashboard and does not alter source ledgers."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Trial Balance" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingProfitLoss, label: "Profit & Loss", variant: "secondary" },
        { href: ROUTES.admin.accountingBalanceSheet, label: "Balance Sheet", variant: "secondary" },
      ]}
      stats={[
        { label: "Rows", value: String(report?.rows.length ?? 0), tone: "info" },
        { label: "Debits", value: accountingMoney(report?.total_debits) },
        { label: "Credits", value: accountingMoney(report?.total_credits) },
        {
          label: "Balanced",
          value: report?.balanced ? "Yes" : "No",
          tone: report?.balanced ? "success" : "warning",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ReportPageShell
        filters={
          <div className="space-y-6">
            <WorkspaceDirectory
              title="Accounting statement map"
              description="Move between trial balance, profit and loss, balance sheet, and the supporting books that explain posted totals."
              groups={ACCOUNTING_REPORT_DIRECTORY_GROUPS}
            />

            <ERPDataToolbar
              left={
                <AccountingPeriodFilters
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
              }
              right={
                <AccountingRefreshButton
                  loading={loading}
                  refreshing={refreshing}
                  onClick={() => void loadReport("refresh")}
                />
              }
            />
          </div>
        }
        summary={
          <div className="space-y-4">
            {report && !report.balanced ? (
              <AccountingNotice
                tone="danger"
                message="Trial balance is out of balance. Review posted journal integrity before approving downstream accounting work."
              />
            ) : null}

            {loading ? <ERPLoadingState label="Loading trial balance..." /> : null}

            {!loading && error ? (
              <ERPErrorState
                title="Unable to load trial balance"
                description={error}
                onRetry={() => void loadReport("initial")}
              />
            ) : null}
          </div>
        }
        chartTable={
          !loading && !error ? (
            <ERPSectionShell
              title="Posted account balances"
              description="Debits and credits are rolled up directly from posted journal entry lines."
            >
              {!report || report.rows.length === 0 ? (
                <ERPEmptyState
                  title="No posted balances"
                  description="Post accounting journals for the selected period to populate the trial balance."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Account</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debit</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credit</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {report.rows.map((row) => (
                        <tr key={row.account_id} className="bg-card transition hover:bg-muted/30">
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-semibold text-muted-foreground">{row.account_code}</div>
                            <div className="text-sm text-foreground">{row.account_name}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.account_type}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{accountingMoney(row.debit_total)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{accountingMoney(row.credit_total)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="tabular-nums font-semibold text-foreground">{accountingMoney(row.balance)}</span>
                            {row.balance_side ? <span className="ml-1 text-xs text-muted-foreground">{row.balance_side}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ERPSectionShell>
          ) : null
        }
      />
    </ERPPageShell>
  );
}
