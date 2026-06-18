"use client";

import { useCallback, useEffect, useState } from "react";

import { accountingMoney } from "@/components/accounting/shared";
import {
  FinancialActionItemsList,
  FinancialMetricGrid,
  FinancialStatusBadge,
  PeriodSelector,
} from "@/components/admin/accounting/financial-intelligence";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  fetchTrialBalanceCheck,
  type TrialBalanceCheckResponse,
} from "@/services/financial-intelligence";

const today = new Date().toISOString().slice(0, 10);

export default function TrialBalanceCheckPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<TrialBalanceCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchTrialBalanceCheck({ year, month, as_of: asOf }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trial balance check.");
    } finally {
      setLoading(false);
    }
  }, [asOf, month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      title="Trial Balance Check"
      subtitle="Read-only automation check over posted journal lines. Draft and void journals remain excluded from totals."
      helperNote="Opening-balance automation is deferred. Opening columns display backend-provided zero values and must not be treated as historical opening truth."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Trial Balance Check" },
      ]}
      actions={[{ href: ROUTES.admin.accountingFinancialIntelligence, label: "Financial Intelligence", variant: "secondary" }]}
      statusBadge={{ label: "Admin Only — Read Only", tone: "info" }}
    >
      <ERPSectionShell title="Reporting period">
        <PeriodSelector year={year} month={month} asOf={asOf} onYearChange={setYear} onMonthChange={setMonth} onAsOfChange={setAsOf} />
      </ERPSectionShell>
      {loading ? <ERPLoadingState label="Loading trial balance check…" /> : null}
      {!loading && error ? <ERPErrorState title="Trial balance check unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !data ? <ERPEmptyState title="No trial balance payload" /> : null}
      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{data.period_start} to {data.period_end} · As of {data.as_of}</p>
                <h2 className="mt-1 text-xl font-semibold">{data.is_balanced ? "Debit and credit are balanced" : "Trial balance is unbalanced"}</h2>
              </div>
              <FinancialStatusBadge status={data.status} />
            </div>
            <div className="mt-5">
              <FinancialMetricGrid items={[
                { label: "Total debit", value: accountingMoney(data.total_debit) },
                { label: "Total credit", value: accountingMoney(data.total_credit) },
                { label: "Difference", value: accountingMoney(data.difference) },
                { label: "Critical checks", value: data.critical_check_count },
              ]} />
            </div>
          </div>

          <ERPSectionShell title="Automation checks" description="Draft and void handling is reported as diagnostic messages only.">
            <div className="grid gap-3 md:grid-cols-2">
              {data.checks.map((check) => (
                <article key={check.key} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold">{check.label ?? check.title ?? check.key}</div>
                    <FinancialStatusBadge status={check.status} deferred={check.deferred ?? check.metadata?.deferred === true} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{check.message}</p>
                </article>
              ))}
            </div>
          </ERPSectionShell>

          <ERPSectionShell title="Account rows" description="Only accounts returned by the backend are shown.">
            {data.rows.length === 0 ? (
              <ERPEmptyState title="No posted account rows" description="No posted journal lines were returned for this period." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Account</th><th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Opening Dr</th><th className="px-3 py-2 text-right">Opening Cr</th>
                      <th className="px-3 py-2 text-right">Period Dr</th><th className="px-3 py-2 text-right">Period Cr</th>
                      <th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.rows.map((row) => (
                      <tr key={row.account_id}>
                        <td className="px-3 py-3"><div className="font-medium">{row.account_code} · {row.account_name}</div>{!row.is_active ? <div className="text-xs text-amber-700">Inactive account</div> : null}</td>
                        <td className="px-3 py-3">{row.account_type}</td>
                        <td className="px-3 py-3 text-right">{accountingMoney(row.opening_debit)}</td>
                        <td className="px-3 py-3 text-right">{accountingMoney(row.opening_credit)}</td>
                        <td className="px-3 py-3 text-right">{accountingMoney(row.period_debit)}</td>
                        <td className="px-3 py-3 text-right">{accountingMoney(row.period_credit)}</td>
                        <td className="px-3 py-3 text-right font-medium">{accountingMoney(row.net_balance)}</td>
                        <td className="px-3 py-3"><FinancialStatusBadge status={row.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ERPSectionShell>

          <ERPSectionShell title="Action items">
            <FinancialActionItemsList items={data.action_items} />
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
