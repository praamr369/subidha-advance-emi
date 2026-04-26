"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getCustomerPaymentSchedule } from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="Payment Schedule"
      subtitle="Upcoming, paid, waived, and overdue schedule rows across your subscriptions."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Payment Schedule" }]}
      actions={[{ href: "/customer/payments", label: "Payments", variant: "secondary" }]}
    >
      <WorkspaceSection title="Schedule" description="Authoritative EMI/payment-demand schedule from backend records.">
        {loading ? (
          <LoadingBlock label="Loading schedule..." />
        ) : error ? (
          <ErrorState title="Unable to load schedule" message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No schedule rows" description="No payment schedule rows are available for this account." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.emi_id} className="border-t">
                    <td className="px-3 py-2">{row.subscription_number || "—"}</td>
                    <td className="px-3 py-2">{row.month_no ?? "—"}</td>
                    <td className="px-3 py-2">{row.due_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.status}
                      {row.is_overdue ? " (Overdue)" : ""}
                    </td>
                    <td className="px-3 py-2">{money(row.amount)}</td>
                    <td className="px-3 py-2">{money(row.outstanding_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}
