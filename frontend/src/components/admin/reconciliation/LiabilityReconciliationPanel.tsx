"use client";

import { useCallback, useEffect, useState } from "react";

import { accountingMoney } from "@/components/accounting/shared";
import {
  FinancialActionItemsList,
  FinancialMetricGrid,
  FinancialStatusBadge,
  PeriodSelector,
} from "@/components/admin/accounting/financial-intelligence";
import { CheckList, PostedGlBalance } from "@/components/admin/reconciliation/liability-reconciliation-shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  fetchLiabilityReconciliation,
  type LiabilityReconciliationResponse,
} from "@/services/financial-intelligence";

const today = new Date().toISOString().slice(0, 10);

/**
 * Diagnostic liability reconciliation (customer advance + security deposit source
 * liabilities vs bridge coverage and deferred GL). Extracted from
 * /admin/accounting/liability-reconciliation so it renders both on that route and
 * as a tab in the Reconciliation Center. Read-only — no posting from here.
 */
export default function LiabilityReconciliationPanel() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<LiabilityReconciliationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchLiabilityReconciliation({ year, month, as_of: asOf }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load liability reconciliation.");
    } finally {
      setLoading(false);
    }
  }, [asOf, month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <ERPSectionShell title="Reporting period">
        <PeriodSelector year={year} month={month} asOf={asOf} onYearChange={setYear} onMonthChange={setMonth} onAsOfChange={setAsOf} />
      </ERPSectionShell>
      {loading ? <ERPLoadingState label="Loading liability reconciliation…" /> : null}
      {!loading && error ? <ERPErrorState title="Liability reconciliation unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !data ? <ERPEmptyState title="No reconciliation payload" /> : null}
      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{data.period.year}-{String(data.period.month).padStart(2, "0")} · As of {data.as_of}</p>
                <h2 className="mt-1 text-xl font-semibold">Overall liability posture</h2>
              </div>
              <FinancialStatusBadge status={data.overall_status} />
            </div>
          </div>

          <ERPSectionShell title="Customer advance liability" description="Expected liability = collected − applied − refunded.">
            {!data.customer_advance.source_available ? (
              <ERPEmptyState title="Customer advance source deferred" description={data.customer_advance.message ?? "Source data is unavailable."} />
            ) : (
              <>
                <FinancialMetricGrid items={[
                  { label: "Collected", value: accountingMoney(data.customer_advance.total_advance_collected) },
                  { label: "Applied", value: accountingMoney(data.customer_advance.total_advance_applied) },
                  { label: "Refunded", value: accountingMoney(data.customer_advance.total_advance_refunded) },
                  { label: "Expected liability", value: accountingMoney(data.customer_advance.expected_liability) },
                  { label: "Unapplied balance", value: accountingMoney(data.customer_advance.unapplied_balance) },
                  { label: "Posted GL liability", value: <PostedGlBalance value={data.customer_advance.posted_liability_balance} difference={data.customer_advance.posted_liability_difference} matches={data.customer_advance.posted_liability_matches} /> },
                  { label: "Bridge gaps", value: data.customer_advance.bridge_gap_count ?? "—" },
                  { label: "Stale unapplied", value: data.customer_advance.stale_unapplied_count ?? "—" },
                ]} />
                <div className="mt-4"><CheckList checks={data.customer_advance.checks} /></div>
              </>
            )}
          </ERPSectionShell>

          <ERPSectionShell title="Security deposit liability" description="Deposit posture remains separate across collection, refund, and damage deduction.">
            {!data.security_deposit.source_available ? (
              <ERPEmptyState title="Security deposit source deferred" description={data.security_deposit.message ?? "Source data is unavailable."} />
            ) : (
              <>
                <FinancialMetricGrid items={[
                  { label: "Collected", value: accountingMoney(data.security_deposit.total_deposit_collected) },
                  { label: "Refunded", value: accountingMoney(data.security_deposit.total_deposit_refunded) },
                  { label: "Deducted", value: accountingMoney(data.security_deposit.total_deposit_deducted) },
                  { label: "Expected liability", value: accountingMoney(data.security_deposit.expected_deposit_liability) },
                  { label: "Posted GL liability", value: <PostedGlBalance value={data.security_deposit.posted_deposit_liability_balance} difference={data.security_deposit.posted_deposit_liability_difference} matches={data.security_deposit.posted_deposit_liability_matches} /> },
                  { label: "Collection bridge gaps", value: data.security_deposit.unposted_collection_count ?? "—" },
                  { label: "Refund bridge gaps", value: data.security_deposit.unposted_refund_count ?? "—" },
                  { label: "Deduction bridge gaps", value: data.security_deposit.unposted_deduction_count ?? "—" },
                ]} />
                <div className="mt-4"><CheckList checks={data.security_deposit.checks} /></div>
              </>
            )}
          </ERPSectionShell>

          <ERPSectionShell title="Prioritised action items" description="No mutation actions are available here. Links appear only when returned by the backend.">
            <FinancialActionItemsList items={data.action_items} />
          </ERPSectionShell>
        </div>
      ) : null}
    </div>
  );
}
