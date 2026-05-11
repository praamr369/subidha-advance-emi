"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ACCOUNTING_REPORT_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import {
  accountingErrorMessage,
  AccountingNotice,
  AccountingPeriodFilters,
  AccountingRefreshButton,
  accountingMoney,
} from "@/components/accounting/shared";
import { ReportPageShell } from "@/components/layout/page-shells";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
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
    <PortalPage
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

            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <AccountingPeriodFilters
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <AccountingRefreshButton
                loading={loading}
                refreshing={refreshing}
                onClick={() => void loadReport("refresh")}
              />
            </div>
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

            {loading ? <LoadingBlock label="Loading trial balance..." /> : null}

            {!loading && error ? (
              <ErrorState
                title="Unable to load trial balance"
                description={error}
                onRetry={() => void loadReport("initial")}
              />
            ) : null}
          </div>
        }
        chartTable={
          !loading && !error ? (
            <WorkspaceSection
              title="Posted account balances"
              description="Debits and credits are rolled up directly from posted journal entry lines."
            >
              {!report || report.rows.length === 0 ? (
                <EmptyState
                  title="No posted balances"
                  description="Post accounting journals for the selected period to populate the trial balance."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Account</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Debit</th>
                        <th className="px-3 py-2 font-medium">Credit</th>
                        <th className="px-3 py-2 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row) => (
                        <tr key={row.account_id} className="border-b border-slate-100">
                          <td className="px-3 py-3">
                            <div className="font-medium text-foreground">{row.account_code}</div>
                            <div className="text-xs text-muted-foreground">{row.account_name}</div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{row.account_type}</td>
                          <td className="px-3 py-3">{accountingMoney(row.debit_total)}</td>
                          <td className="px-3 py-3">{accountingMoney(row.credit_total)}</td>
                          <td className="px-3 py-3">
                            {accountingMoney(row.balance)} {row.balance_side}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WorkspaceSection>
          ) : null
        }
      />
    </PortalPage>
  );
}
