"use client";

import { useCallback, useEffect, useState } from "react";

import { accountingMoney } from "@/components/accounting/shared";
import {
  FinancialActionItemsList,
  FinancialMetricGrid,
  FinancialSectionCard,
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
  fetchFinancialIntelligence,
  type FinancialIntelligenceSection,
  type FinancialIntelligenceSnapshot,
} from "@/services/financial-intelligence";

function numberValue(section: FinancialIntelligenceSection, key: string) {
  const value = section[key];
  return typeof value === "number" ? String(value) : "—";
}

function moneyValue(section: FinancialIntelligenceSection, key: string) {
  const value = section[key];
  return typeof value === "string" || typeof value === "number"
    ? accountingMoney(value)
    : "—";
}

function nestedSection(
  section: FinancialIntelligenceSection,
  key: string
): FinancialIntelligenceSection {
  const value = section[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FinancialIntelligenceSection;
  }
  return { status: "INFO", deferred: true };
}

const today = new Date().toISOString().slice(0, 10);

export default function FinancialIntelligencePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<FinancialIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchFinancialIntelligence({ year, month, as_of: asOf }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load financial intelligence.");
    } finally {
      setLoading(false);
    }
  }, [asOf, month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = data?.sections;

  return (
    <ERPPageShell
      title="Financial Intelligence"
      subtitle="Read-only finance posture across collections, billing, accounting bridges, reconciliation, liabilities, close controls, inventory, and trial balance."
      helperNote="Diagnostic only. This page does not post journals or mutate financial records."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Financial Intelligence" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingTrialBalanceCheck, label: "Trial Balance Check", variant: "secondary" },
        { href: ROUTES.admin.accountingLiabilityReconciliation, label: "Liability Reconciliation", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only — Read Only", tone: "info" }}
    >
      <ERPSectionShell title="Reporting period" description="All values come from the selected P4 financial-intelligence snapshot.">
        <PeriodSelector
          year={year}
          month={month}
          asOf={asOf}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onAsOfChange={setAsOf}
        />
      </ERPSectionShell>

      {loading ? <ERPLoadingState label="Loading financial intelligence…" /> : null}
      {!loading && error ? (
        <ERPErrorState title="Financial intelligence unavailable" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !data ? (
        <ERPEmptyState title="No financial snapshot" description="The endpoint returned no financial-intelligence payload." />
      ) : null}

      {!loading && !error && data && sections ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {data.period.year}-{String(data.period.month).padStart(2, "0")} · As of {data.as_of}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">Overall finance posture</h2>
              </div>
              <FinancialStatusBadge status={data.overall_status} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <FinancialSectionCard title="Collection posture" section={sections.collection}>
              <FinancialMetricGrid items={[
                { label: "Payments", value: numberValue(sections.collection, "period_payment_count") },
                { label: "Collected", value: moneyValue(sections.collection, "period_payment_amount") },
                { label: "Missing receipts", value: numberValue(sections.collection, "missing_receipt_count") },
                { label: "Reversed payments", value: numberValue(sections.collection, "reversed_payment_count") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Billing posture" section={sections.billing}>
              <FinancialMetricGrid items={[
                { label: "Invoices", value: numberValue(sections.billing, "invoice_count") },
                { label: "Invoice value", value: moneyValue(sections.billing, "invoice_amount") },
                { label: "Rent/lease demands", value: numberValue(sections.billing, "rent_lease_demand_count") },
                { label: "Overdue demands", value: numberValue(sections.billing, "overdue_demand_count") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Accounting bridge posture" section={sections.bridge}>
              <FinancialMetricGrid items={[
                { label: "Bridge postings", value: numberValue(sections.bridge, "total_bridge_postings") },
                { label: "Posted", value: numberValue(sections.bridge, "total_posted") },
                { label: "Draft", value: numberValue(sections.bridge, "total_draft") },
                { label: "Void", value: numberValue(sections.bridge, "total_void") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Reconciliation posture" section={sections.reconciliation}>
              <FinancialMetricGrid items={[
                { label: "Unresolved", value: numberValue(sections.reconciliation, "total_unresolved_items") },
                { label: "Critical", value: numberValue(sections.reconciliation, "critical_unresolved") },
                { label: "High severity", value: numberValue(sections.reconciliation, "high_unresolved") },
                { label: "Stale", value: numberValue(sections.reconciliation, "stale_item_count") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Advance and deposit posture" section={sections.advance_deposit}>
              <FinancialMetricGrid items={[
                { label: "Unapplied advance", value: moneyValue(nestedSection(sections.advance_deposit, "customer_advance"), "total_unapplied_amount") },
                { label: "Advance records", value: numberValue(nestedSection(sections.advance_deposit, "customer_advance"), "total_count") },
                { label: "Deposit collected", value: moneyValue(nestedSection(sections.advance_deposit, "security_deposit"), "collected_amount") },
                { label: "Deposit bridge gaps", value: numberValue(nestedSection(sections.advance_deposit, "security_deposit"), "deposit_transactions_without_bridge") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Control close posture" section={sections.control}>
              <FinancialMetricGrid items={[
                { label: "Open exceptions", value: numberValue(nestedSection(sections.control, "control_exceptions"), "total_open_count") },
                { label: "Critical/high exceptions", value: numberValue(nestedSection(sections.control, "control_exceptions"), "open_critical_high_count") },
                { label: "Open cash sessions", value: numberValue(nestedSection(sections.control, "cash_desk"), "open_sessions_count") },
                { label: "Month-end blockers", value: numberValue(nestedSection(sections.control, "month_end_close"), "blocking_check_count") },
              ]} />
            </FinancialSectionCard>
            <FinancialSectionCard title="Inventory-finance posture" section={sections.inventory_finance}>
              <FinancialMetricGrid items={[
                { label: "Deliveries without stock ledger", value: numberValue(sections.inventory_finance, "delivered_without_stock_ledger_count") },
                { label: "Direct sales without stock ledger", value: numberValue(sections.inventory_finance, "direct_sale_without_stock_ledger_count") },
              ]} />
            </FinancialSectionCard>
            {sections.trial_balance ? (
              <FinancialSectionCard title="Trial balance posture" section={sections.trial_balance}>
                <FinancialMetricGrid items={[
                  { label: "Debit", value: moneyValue(sections.trial_balance, "total_debit") },
                  { label: "Credit", value: moneyValue(sections.trial_balance, "total_credit") },
                  { label: "Difference", value: moneyValue(sections.trial_balance, "difference") },
                  { label: "Critical checks", value: numberValue(sections.trial_balance, "critical_check_count") },
                ]} />
              </FinancialSectionCard>
            ) : null}
          </div>

          <ERPSectionShell title="Prioritised action items" description="Sorted by backend severity. Links appear only when returned by the API.">
            <FinancialActionItemsList items={data.action_items} />
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
