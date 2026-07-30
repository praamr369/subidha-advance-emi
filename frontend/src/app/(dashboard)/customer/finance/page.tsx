"use client";

import { formatRupee } from "@/lib/utils/currency";
import { useCallback, useEffect, useState } from "react";
import CustomerPageShell, { CPageSection, CPageStats, CPageStat } from "@/components/layout/CustomerPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import Link from "next/link";
import { getCustomerFinanceSummary } from "@/services/phase4-finance";

export default function CustomerFinanceSummaryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [split, setSplit] = useState<Array<{ payment_method: string; count: number; amount: string }>>([]);
  const [depositRows, setDepositRows] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getCustomerFinanceSummary();
      setSummary(payload.summary ?? {});
      setSplit(payload.payment_method_split ?? []);
      setDepositRows(payload.deposit_summary ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <CustomerPageShell
      title="Finance Summary"
      subtitle="Invoices, receipts, dues, and payment methods"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/account-statement"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Statement
        </Link>
      }
    >
      {loading ? <ERPLoadingState label="Loading finance summary..." /> : null}

      {!loading && error ? (
        <ERPErrorState title="Unable to load finance summary" message={error} onRetry={() => void load()} />
      ) : null}

      {!loading && !error && !summary ? (
        <ERPEmptyState title="No summary available" description="Finance summary is not yet available." />
      ) : null}

      {!loading && !error && summary ? (
        <>
          <CPageStats>
            <CPageStat label="Total Paid" value={formatRupee(summary.total_paid)} tone="success" />
            <CPageStat label="Pending" value={formatRupee(summary.total_pending)} tone="warning" />
            <CPageStat label="Overdue" value={formatRupee(summary.total_overdue)} tone={Number(summary.total_overdue ?? 0) > 0 ? "danger" : "default"} />
          </CPageStats>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Active Contracts</div>
              <div className="mt-1 text-xl font-bold text-foreground">{String(summary.active_contracts ?? 0)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Next Due</div>
              <div className="mt-1 text-base font-bold text-foreground">{String(summary.next_due_date ?? "—")}</div>
              {summary.next_due_amount ? (
                <div className="text-xs text-amber-700 mt-0.5">{formatRupee(summary.next_due_amount)}</div>
              ) : null}
            </div>
          </div>

          {split.length > 0 ? (
            <CPageSection title="How You Pay">
              <div className="space-y-2">
                {split.map((row) => (
                  <div key={row.payment_method} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                    <div className="text-sm font-semibold text-foreground">{row.payment_method}</div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{formatRupee(row.amount)}</div>
                      <div className="text-xs text-muted-foreground">{row.count} payment{row.count !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CPageSection>
          ) : null}

          {depositRows.length > 0 ? (
            <CPageSection title="Security Deposits">
              <div className="space-y-2">
                {depositRows.map((row, idx) => (
                  <div key={String(row.subscription_id ?? idx)} className="rounded-2xl border border-border bg-card p-4 text-sm">
                    <div className="font-semibold text-foreground">
                      {String(row.subscription_number ?? "Contract")} · {String(row.plan_type ?? "RENT/LEASE")}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Paid: </span><span className="font-medium">{formatRupee(row.collected_amount)}</span></div>
                      <div><span className="text-muted-foreground">Held: </span><span className="font-medium">{formatRupee(row.held_amount)}</span></div>
                      <div><span className="text-muted-foreground">Refundable: </span><span className="font-medium text-emerald-700">{formatRupee(row.refundable_amount)}</span></div>
                      <div><span className="text-muted-foreground">Status: </span><span className="font-medium">{String(row.refund_status ?? "PENDING")}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CPageSection>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/customer/invoices" className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted">
              Invoices →
            </Link>
            <Link href="/customer/receipts" className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted">
              Receipts →
            </Link>
          </div>
        </>
      ) : null}
    </CustomerPageShell>
  );
}
