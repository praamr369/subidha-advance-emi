"use client";

import { useEffect, useState } from "react";

import { ACCOUNTING_REPORT_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import {
  accountingErrorMessage,
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
import { getProfitLoss, type ProfitLossReport } from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingProfitLossPage() {
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [startDate, setStartDate] = useState(today.slice(0, 8) + "01");
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getProfitLoss({
        start_date: startDate,
        end_date: endDate,
      });
      setReport(payload);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load the profit and loss report."));
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
      title="Profit & Loss"
      subtitle="Revenue and expense rollup sourced from posted accounting entries only. This additive report does not alter EMI, payout, or reconciliation behavior."
      helperNote="Profit and loss is a posted accounting statement. It stays separate from billing execution, finance payout control, and cashier collection flows."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Profit & Loss" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTrialBalance, label: "Trial Balance", variant: "secondary" },
        { href: ROUTES.admin.accountingBalanceSheet, label: "Balance Sheet", variant: "secondary" },
      ]}
      stats={[
        { label: "Income", value: accountingMoney(report?.income_total), tone: "success" },
        { label: "Expenses", value: accountingMoney(report?.expense_total), tone: "warning" },
        {
          label: "Net Profit",
          value: accountingMoney(report?.net_profit),
          tone: report == null ? "default" : Number(report.net_profit ?? 0) >= 0 ? "success" : "danger",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <ReportPageShell
        filters={
          <div className="space-y-6">
            <WorkspaceDirectory
              title="Accounting statement map"
              description="Use the shared statement directory to move between income review, balance integrity, and supporting posted books."
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
            {loading ? <ERPLoadingState label="Loading profit and loss..." /> : null}

            {!loading && error ? (
              <ERPErrorState
                title="Unable to load profit and loss"
                description={error}
                onRetry={() => void loadReport("initial")}
              />
            ) : null}
          </div>
        }
        chartTable={
          !loading && !error ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <ERPSectionShell title="Income" description="Posted income accounts for the selected period.">
                {!report || report.income.length === 0 ? (
                  <ERPEmptyState
                    title="No income rows"
                    description="Income accounts will appear once posted accounting revenue exists in the selected period."
                  />
                ) : (
                  <div className="space-y-3">
                    {report.income.map((row) => (
                      <div
                        key={row.account_id}
                        className="rounded-2xl border border-border/70 bg-background px-4 py-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{row.account_code}</div>
                            <div className="text-xs text-muted-foreground">{row.account_name}</div>
                          </div>
                          <div className="font-semibold text-emerald-700">{accountingMoney(row.amount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ERPSectionShell>

              <ERPSectionShell title="Expenses" description="Posted expense accounts for the selected period.">
                {!report || report.expenses.length === 0 ? (
                  <ERPEmptyState
                    title="No expense rows"
                    description="Expense accounts will appear once posted accounting spend exists in the selected period."
                  />
                ) : (
                  <div className="space-y-3">
                    {report.expenses.map((row) => (
                      <div
                        key={row.account_id}
                        className="rounded-2xl border border-border/70 bg-background px-4 py-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{row.account_code}</div>
                            <div className="text-xs text-muted-foreground">{row.account_name}</div>
                          </div>
                          <div className="font-semibold text-amber-700">{accountingMoney(row.amount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ERPSectionShell>
            </div>
          ) : null
        }
      />
    </ERPPageShell>
  );
}
