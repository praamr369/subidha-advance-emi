"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getCustomerFinanceSummary } from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function CustomerFinanceSummaryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [split, setSplit] = useState<Array<{ payment_method: string; count: number; amount: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getCustomerFinanceSummary();
      setSummary(payload.summary ?? {});
      setSplit(payload.payment_method_split ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="Finance Summary"
      subtitle="Unified customer finance snapshot across invoices, receipts, dues, and payment methods."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Finance" }]}
      actions={[
        { href: "/customer/invoices", label: "Invoices", variant: "secondary" },
        { href: "/customer/receipts", label: "Receipts", variant: "secondary" },
        { href: "/customer/account-statement", label: "Account Statement", variant: "ghost" },
      ]}
    >
      <WorkspaceSection title="Summary" description="All values are derived from live finance records.">
        {loading ? (
          <LoadingBlock label="Loading customer finance summary..." />
        ) : error ? (
          <ErrorState title="Unable to load finance summary" message={error} onRetry={() => void load()} />
        ) : !summary ? (
          <EmptyState title="No summary available" description="Finance summary is unavailable for this account." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Total Paid</div>
              <div className="mt-1 text-xl font-semibold">{money(summary.total_paid)}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Total Pending</div>
              <div className="mt-1 text-xl font-semibold">{money(summary.total_pending)}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Total Overdue</div>
              <div className="mt-1 text-xl font-semibold">{money(summary.total_overdue)}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Active Contracts</div>
              <div className="mt-1 text-xl font-semibold">{String(summary.active_contracts ?? 0)}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Next Due Date</div>
              <div className="mt-1 text-xl font-semibold">{String(summary.next_due_date ?? "—")}</div>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="text-xs text-muted-foreground">Next Due Amount</div>
              <div className="mt-1 text-xl font-semibold">{money(summary.next_due_amount)}</div>
            </div>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Payment Method Split" description="Your recorded collections by method.">
        {loading ? (
          <LoadingBlock label="Loading method split..." />
        ) : split.length === 0 ? (
          <EmptyState title="No payment data" description="No payment method split is available yet." />
        ) : (
          <div className="space-y-2">
            {split.map((row) => (
              <div key={row.payment_method} className="flex items-center justify-between rounded-xl border px-4 py-2">
                <div className="text-sm font-medium">{row.payment_method}</div>
                <div className="text-sm text-muted-foreground">
                  {row.count} payments • {money(row.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}
