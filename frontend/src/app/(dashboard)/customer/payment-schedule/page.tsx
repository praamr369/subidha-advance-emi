"use client";

import { formatRupee } from "@/lib/utils/currency";
import { useCallback, useEffect, useState } from "react";
import CustomerPageShell, { CPageSection } from "@/components/layout/CustomerPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { getCustomerPaymentSchedule } from "@/services/phase4-finance";
import Link from "next/link";

type ScheduleRow = {
  emi_id: number;
  subscription_number?: string | null;
  plan_type?: string;
  product_name?: string;
  month_no?: number;
  due_date?: string;
  amount?: string;
  status?: string;
  paid_amount?: string;
  outstanding_amount?: string;
  is_overdue?: boolean;
};

function statusChip(status?: string, overdue?: boolean) {
  const s = (status || "").toUpperCase();
  if (overdue || s === "OVERDUE") return "bg-red-100 text-red-700";
  if (s === "PAID") return "bg-emerald-100 text-emerald-700";
  if (s === "WAIVED") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export default function CustomerPaymentSchedulePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScheduleRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getCustomerPaymentSchedule();
      setRows((payload.results ?? []) as ScheduleRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payment schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overdue = rows.filter((r) => r.is_overdue || (r.status || "").toUpperCase() === "OVERDUE");
  const pending = rows.filter((r) => !r.is_overdue && (r.status || "").toUpperCase() === "PENDING");
  const paid = rows.filter((r) => (r.status || "").toUpperCase() === "PAID");

  return (
    <CustomerPageShell
      title="Payment Schedule"
      subtitle="All upcoming, paid, and overdue EMIs"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/payments"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Payments
        </Link>
      }
    >
      {loading ? <ERPLoadingState label="Loading schedule..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load schedule" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No schedule yet"
          description="Your EMI payment schedule will appear here once your contract is active."
        />
      ) : null}

      {!loading && !error && overdue.length > 0 ? (
        <CPageSection title={`⚠️ Overdue (${overdue.length})`}>
          <div className="space-y-2">
            {overdue.map((row) => <ScheduleCard key={row.emi_id} row={row} />)}
          </div>
        </CPageSection>
      ) : null}

      {!loading && !error && pending.length > 0 ? (
        <CPageSection title={`Upcoming (${pending.length})`}>
          <div className="space-y-2">
            {pending.map((row) => <ScheduleCard key={row.emi_id} row={row} />)}
          </div>
        </CPageSection>
      ) : null}

      {!loading && !error && paid.length > 0 ? (
        <CPageSection title={`Paid (${paid.length})`}>
          <div className="space-y-2">
            {paid.map((row) => <ScheduleCard key={row.emi_id} row={row} />)}
          </div>
        </CPageSection>
      ) : null}
    </CustomerPageShell>
  );
}

function ScheduleCard({ row }: { row: ScheduleRow }) {
  const chipCls = statusChip(row.status, row.is_overdue);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">
            {row.subscription_number || "—"}
          </div>
          {row.product_name ? (
            <div className="text-xs text-muted-foreground mt-0.5">{row.product_name}</div>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${chipCls}`}>
          {row.is_overdue ? "Overdue" : (row.status || "Pending")}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Month</p>
          <p className="mt-0.5 text-sm font-semibold">{row.month_no ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Due Date</p>
          <p className="mt-0.5 text-sm font-semibold">{row.due_date ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Amount</p>
          <p className="mt-0.5 text-sm font-semibold">{formatRupee(row.amount)}</p>
        </div>
      </div>
      {Number(row.outstanding_amount ?? 0) > 0 ? (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Outstanding: {formatRupee(row.outstanding_amount)}
        </div>
      ) : null}
    </div>
  );
}
