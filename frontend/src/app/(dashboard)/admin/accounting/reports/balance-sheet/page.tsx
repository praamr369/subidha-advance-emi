"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  accountingErrorMessage,
  AccountingPeriodFilters,
  AccountingRefreshButton,
  accountingMoney,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getBalanceSheet, type BalanceSheetReport } from "@/services/accounting";

const today = new Date().toISOString().slice(0, 10);

export default function AccountingBalanceSheetPage() {
  const [report, setReport] = useState<BalanceSheetReport | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getBalanceSheet({ as_of: asOf });
      setReport(payload);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load the balance sheet."));
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
      title="Balance Sheet"
      subtitle="Point-in-time balance sheet over posted accounting journals, including current-period net income folded into equity."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Balance Sheet" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTrialBalance, label: "Trial Balance", variant: "secondary" },
        { href: ROUTES.admin.accountingProfitLoss, label: "Profit & Loss", variant: "secondary" },
      ]}
      stats={[
        { label: "Assets", value: accountingMoney(report?.total_assets), tone: "info" },
        { label: "Liabilities", value: accountingMoney(report?.total_liabilities) },
        { label: "Equity", value: accountingMoney(report?.total_equity), tone: "success" },
        {
          label: "Balanced",
          value: report?.balanced ? "Yes" : "No",
          tone: report?.balanced ? "success" : "warning",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <AccountingPeriodFilters asOf={asOf} onAsOfChange={setAsOf} />
          <AccountingRefreshButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void loadReport("refresh")}
          />
        </div>

        {loading ? <LoadingBlock label="Loading balance sheet..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load balance sheet"
            description={error}
            onRetry={() => void loadReport("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {[
              { title: "Assets", rows: report?.assets ?? [] },
              { title: "Liabilities", rows: report?.liabilities ?? [] },
              { title: "Equity", rows: report?.equity ?? [] },
            ].map((section) => (
              <WorkspaceSection
                key={section.title}
                title={section.title}
                description={`Posted ${section.title.toLowerCase()} as of ${asOf}.`}
              >
                {section.rows.length === 0 ? (
                  <EmptyState
                    title={`No ${section.title.toLowerCase()} rows`}
                    description={`Posted ${section.title.toLowerCase()} will appear here once journals exist.`}
                  />
                ) : (
                  <div className="space-y-3">
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.account_code}-${row.account_name}`} className="rounded-2xl border border-white/75 bg-white/75 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{row.account_code}</div>
                            <div className="text-xs text-muted-foreground">{row.account_name}</div>
                          </div>
                          <div className="font-semibold text-foreground">{accountingMoney(row.balance)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </WorkspaceSection>
            ))}
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
