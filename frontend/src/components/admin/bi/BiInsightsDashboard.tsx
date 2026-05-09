"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import Card from "@/components/ui/card";
import {
  getAdminBiInsights,
  type BiBatchPerformance,
  type BiCashflow,
  type BiCustomerInsights,
  type BiHrCosts,
  type BiInsightsPayload,
  type BiInventoryIntelligence,
  type BiProfitability,
} from "@/services/admin-bi";

type BiInsightMode =
  | "all"
  | "profitability"
  | "customers"
  | "batches"
  | "cashflow"
  | "inventory"
  | "hr";

const MODULE_LINKS = [
  { href: "/admin/bi/profitability", label: "Profitability" },
  { href: "/admin/bi/customers", label: "Customers" },
  { href: "/admin/bi/batches", label: "Batches" },
  { href: "/admin/bi/cashflow", label: "Cashflow" },
  { href: "/admin/bi/inventory", label: "Inventory" },
  { href: "/admin/bi/hr", label: "HR costs" },
];

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "0";
  return String(value);
}

function MetricTile({ label, value, note }: { label: string; value: string | number | null | undefined; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/85 p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{display(value)}</div>
      {note ? <div className="mt-1 text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}

function SourceList({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return <div className="mt-3 text-xs text-muted-foreground">Sources: {sources.join(", ")}</div>;
}

function InsightSection({
  title,
  description,
  sources,
  children,
}: {
  title: string;
  description: string;
  sources: string[];
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/80 p-5 shadow-[0_14px_26px_-24px_rgba(15,23,42,0.45)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
      <SourceList sources={sources} />
    </section>
  );
}

function SimpleTable({
  emptyTitle,
  columns,
  rows,
}: {
  emptyTitle: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle} description="No rows are available for the selected window." />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-slate-200 px-3 py-2 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 text-foreground">
                  {display(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfitabilitySection({ data }: { data: BiProfitability }) {
  return (
    <InsightSection
      title="Profitability View"
      description="EMI revenue, waiver exposure, direct sale revenue, rent/lease income, deposit liability, and monthly operating summary."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="EMI revenue" value={data.summary.emi_revenue} />
        <MetricTile label="Waived EMI" value={data.summary.emi_waived_amount} />
        <MetricTile label="Direct sale revenue" value={data.summary.direct_sale_revenue} />
        <MetricTile label="Operating margin" value={data.summary.operating_margin} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Rent income" value={data.summary.rent_income} />
        <MetricTile label="Lease income" value={data.summary.lease_income} />
        <MetricTile label="Deposit liabilities" value={data.summary.deposit_liabilities} />
        <MetricTile label="Salary cost" value={data.summary.salary_cost} />
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-[#f8fbff] p-3 text-xs text-muted-foreground">
        {data.basis_note}
      </div>
      <div className="mt-4">
        <SimpleTable
          emptyTitle="No monthly profit rows"
          columns={["Month", "Income", "Waived", "Salary", "Operating margin"]}
          rows={data.monthly_profit_summary.map((row) => [
            row.month,
            row.income,
            row.waived_amount,
            row.salary_cost,
            row.operating_margin,
          ])}
        />
      </div>
    </InsightSection>
  );
}

function CustomerSection({ data }: { data: BiCustomerInsights }) {
  return (
    <InsightSection
      title="Customer Insights"
      description="Active/inactive customers, high overdue customers, repeat customers, and churn-risk posture."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Active customers" value={data.summary.active_customers} />
        <MetricTile label="Inactive customers" value={data.summary.inactive_customers} />
        <MetricTile label="High overdue" value={data.summary.high_overdue_customers} />
        <MetricTile label="Churn risk" value={data.summary.churn_risk_customers} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card variant="bordered" title="High overdue customers">
          <SimpleTable
            emptyTitle="No high overdue customers"
            columns={["Customer", "Phone", "Count", "Amount"]}
            rows={data.high_overdue_customers.map((row) => [row.name, row.phone, row.overdue_count, row.overdue_amount])}
          />
        </Card>
        <Card variant="bordered" title="Repeat customers">
          <SimpleTable
            emptyTitle="No repeat customers"
            columns={["Customer", "Phone", "Relationships"]}
            rows={data.repeat_customers.map((row) => [row.name, row.phone, row.relationship_count])}
          />
        </Card>
      </div>
    </InsightSection>
  );
}

function BatchSection({ data }: { data: BiBatchPerformance }) {
  return (
    <InsightSection
      title="Batch Performance"
      description="Fill rate, payment discipline, default rate, and draw completion by batch."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile label="Batches" value={data.summary.batch_count} />
        <MetricTile label="Average fill rate" value={`${data.summary.average_fill_rate}%`} />
        <MetricTile label="High-risk batches" value={data.summary.high_risk_batches} />
      </div>
      <div className="mt-4">
        <SimpleTable
          emptyTitle="No batch rows"
          columns={["Batch", "Fill", "Discipline", "Default", "Draws", "Risk"]}
          rows={data.rows.map((row) => [
            row.batch_code,
            `${row.fill_rate}%`,
            `${row.payment_discipline}%`,
            `${row.default_rate}%`,
            `${row.draws_completed} (${row.draw_completion}%)`,
            row.risk_level,
          ])}
        />
      </div>
    </InsightSection>
  );
}

function CashflowSection({ data }: { data: BiCashflow }) {
  const maxInflow = useMemo(
    () => Math.max(1, ...data.daily_trend.map((row) => Number(row.inflow || 0)).filter((value) => Number.isFinite(value))),
    [data.daily_trend]
  );
  return (
    <InsightSection
      title="Cashflow Dashboard"
      description="Daily inflow, expected inflow, and overdue exposure from live receivable records."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Today inflow" value={data.summary.daily_inflow} />
        <MetricTile label="Window inflow" value={data.summary.window_inflow} />
        <MetricTile label="Expected inflow" value={data.summary.expected_inflow} />
        <MetricTile label="Overdue exposure" value={data.summary.overdue_exposure} />
      </div>
      <div className="mt-4 space-y-2">
        {data.daily_trend.length ? (
          data.daily_trend.map((row) => {
            const width = `${Math.max(2, Math.round((Number(row.inflow || 0) / maxInflow) * 100))}%`;
            return (
              <div key={row.date} className="grid gap-2 text-xs sm:grid-cols-[9rem_1fr_6rem] sm:items-center">
                <span className="font-medium text-foreground">{row.date}</span>
                <div className="h-2 rounded bg-muted">
                  <div className="h-full rounded bg-primary" style={{ width }} />
                </div>
                <span className="text-muted-foreground">{row.inflow}</span>
              </div>
            );
          })
        ) : (
          <EmptyState title="No daily inflow rows" />
        )}
      </div>
    </InsightSection>
  );
}

function InventorySection({ data }: { data: BiInventoryIntelligence }) {
  return (
    <InsightSection
      title="Inventory Intelligence"
      description="Fast-moving items, slow-moving items, and stock-risk items from stock ledger and reorder levels."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Fast moving" value={data.summary.fast_moving_count} />
        <MetricTile label="Slow moving" value={data.summary.slow_moving_count} />
        <MetricTile label="Stock risk" value={data.summary.stock_risk_count} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card variant="bordered" title="Fast moving">
          <SimpleTable
            emptyTitle="No fast-moving items"
            columns={["Product", "Code", "Moved out"]}
            rows={data.fast_moving_items.map((row) => [row.product_name, row.product_code, row.moved_out_qty])}
          />
        </Card>
        <Card variant="bordered" title="Slow moving">
          <SimpleTable
            emptyTitle="No slow-moving items"
            columns={["Product", "On hand", "Moved out"]}
            rows={data.slow_moving_items.map((row) => [row.product_name, row.on_hand_qty, row.moved_out_qty])}
          />
        </Card>
        <Card variant="bordered" title="Stock risk">
          <SimpleTable
            emptyTitle="No stock-risk items"
            columns={["Product", "On hand", "Reorder", "Reason"]}
            rows={data.stock_risk.map((row) => [row.product_name, row.on_hand_qty, row.reorder_level_qty, row.reason])}
          />
        </Card>
      </div>
    </InsightSection>
  );
}

function HrSection({ data }: { data: BiHrCosts }) {
  return (
    <InsightSection
      title="HR Cost Insights"
      description="Salary vs revenue ratio, department cost, and temporary versus permanent cost split."
      sources={data.sources}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Salary cost" value={data.summary.salary_cost} />
        <MetricTile label="Revenue" value={data.summary.revenue} />
        <MetricTile label="Salary/revenue" value={data.summary.salary_vs_revenue_ratio ? `${data.summary.salary_vs_revenue_ratio}%` : "Unavailable"} />
        <MetricTile label="Active staff" value={data.summary.active_staff} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card variant="bordered" title="Cost per department">
          <SimpleTable
            emptyTitle="No department cost rows"
            columns={["Department", "Cost", "Employees"]}
            rows={data.cost_per_department.map((row) => [row.department, row.cost, row.employee_count])}
          />
        </Card>
        <Card variant="bordered" title="Employment split">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile label="Temporary" value={data.employment_type_split.temporary_cost} />
            <MetricTile label="Permanent" value={data.employment_type_split.permanent_cost} />
          </div>
        </Card>
      </div>
    </InsightSection>
  );
}

function Sections({ payload, mode }: { payload: BiInsightsPayload; mode: BiInsightMode }) {
  return (
    <div className="space-y-5">
      {mode === "all" ? (
        <div className="flex flex-wrap gap-2">
          {MODULE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-slate-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
      {mode === "all" || mode === "profitability" ? <ProfitabilitySection data={payload.profitability} /> : null}
      {mode === "all" || mode === "customers" ? <CustomerSection data={payload.customer_insights} /> : null}
      {mode === "all" || mode === "batches" ? <BatchSection data={payload.batch_performance} /> : null}
      {mode === "all" || mode === "cashflow" ? <CashflowSection data={payload.cashflow} /> : null}
      {mode === "all" || mode === "inventory" ? <InventorySection data={payload.inventory_intelligence} /> : null}
      {mode === "all" || mode === "hr" ? <HrSection data={payload.hr_costs} /> : null}
    </div>
  );
}

export default function BiInsightsDashboard({ mode = "all" }: { mode?: BiInsightMode }) {
  const [payload, setPayload] = useState<BiInsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminBiInsights()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load BI insights.");
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!payload) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
        Loading operational insights...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        Read-only BI snapshot. Financial mutation: {payload.safety.financial_mutation_enabled ? "enabled" : "disabled"}.
        AI automation: {payload.safety.ai_automation_enabled ? "enabled" : "disabled"}.
      </div>
      <Sections payload={payload} mode={mode} />
    </div>
  );
}
