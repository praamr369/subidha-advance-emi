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
  fetchLiabilityReconciliation,
  type FinancialCheck,
  type LiabilityReconciliationResponse,
} from "@/services/financial-intelligence";

const today = new Date().toISOString().slice(0, 10);

function DeferredBalance({ value }: { value?: string | null }) {
  if (value == null) {
    return <span className="text-sky-700">Deferred — posted GL comparison unavailable</span>;
  }
  return <>{accountingMoney(value)}</>;
}

function CheckList({ checks }: { checks: FinancialCheck[] }) {
  if (checks.length === 0) {
    return <p className="text-sm text-muted-foreground">No checks returned.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {checks.map((check) => (
        <article key={check.key} className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold">{check.title ?? check.label ?? check.key}</div>
            <FinancialStatusBadge status={check.status} deferred={check.deferred} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{check.message}</p>
          {check.count > 0 ? <p className="mt-2 text-xs font-medium">Affected records: {check.count}</p> : null}
        </article>
      ))}
    </div>
  );
}

export default function LiabilityReconciliationPage() {
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
    <ERPPageShell
      title="Liability Reconciliation"
      subtitle="Diagnostic comparison of customer-advance and security-deposit source liabilities, bridge coverage, and deferred GL comparison."
      helperNote="Read-only. No advance application, deposit refund, deduction, or accounting posting can be performed from this page."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Liability Reconciliation" },
      ]}
      actions={[{ href: ROUTES.admin.accountingFinancialIntelligence, label: "Financial Intelligence", variant: "secondary" }]}
      statusBadge={{ label: "Admin Only — Read Only", tone: "info" }}
    >
      <ERPSectionShell title="Reporting period">
        <PeriodSelector year={year} month={month} asOf={asOf} onYearChange={setYear} onMonthChange={setMonth} onAsOfChange={setAsOf} />
      </ERPSectionShell>
      {loading ? <ERPLoadingState label="Loading liability reconciliation…" /> : null}
      {!loading && error ? <ERPErrorState title="Liability reconciliation unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && !data ? <ERPEmptyState title="No reconciliation payload" /> : null}
      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
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
                  { label: "Posted GL liability", value: <DeferredBalance value={data.customer_advance.posted_liability_balance} /> },
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
                  { label: "Posted GL liability", value: <DeferredBalance value={data.security_deposit.posted_deposit_liability_balance} /> },
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
    </ERPPageShell>
  );
}
