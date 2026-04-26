"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  getPartnerFinanceSummary,
  listPartnerLinkedCustomerPayments,
  listPartnerReceipts,
} from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function PartnerFinancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [receipts, setReceipts] = useState<
    Array<{
      id: number;
      receipt_no: string | null;
      receipt_date: string;
      amount: string;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryPayload, paymentsPayload, receiptsPayload] = await Promise.all([
        getPartnerFinanceSummary(),
        listPartnerLinkedCustomerPayments(),
        listPartnerReceipts(),
      ]);
      setSummary(summaryPayload.summary ?? {});
      setPayments(paymentsPayload.results ?? []);
      setReceipts(
        (receiptsPayload.results ?? []).map((row) => ({
          id: Number(row.id ?? 0),
          receipt_no: row.receipt_no ?? null,
          receipt_date: String(row.receipt_date ?? "—"),
          amount: String(row.amount ?? "0.00"),
        }))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partner finance summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="Partner Finance Summary"
      subtitle="Partner-scoped collections, receipts, and linked-customer payment status."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Finance" }]}
      actions={[
        { href: "/partner/payments", label: "Payments", variant: "secondary" },
        { href: "/partner/commissions", label: "Commissions", variant: "secondary" },
      ]}
    >
      <WorkspaceSection title="Summary" description="Only partner-linked records are shown here.">
        {loading ? (
          <LoadingBlock label="Loading partner finance summary..." />
        ) : error ? (
          <ErrorState title="Unable to load partner finance summary" message={error} onRetry={() => void load()} />
        ) : !summary ? (
          <EmptyState title="No summary available" description="Partner finance summary is unavailable." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Collections Total</div>
              <div className="text-xl font-semibold">{money(summary.collections_total)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Pending Dues</div>
              <div className="text-xl font-semibold">{money(summary.pending_dues)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Commission Total</div>
              <div className="text-xl font-semibold">{money(summary.commission_total)}</div>
            </div>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Linked Customer Payments" description="Recent partner-scope payment rows.">
        {loading ? (
          <LoadingBlock label="Loading linked payments..." />
        ) : payments.length === 0 ? (
          <EmptyState title="No linked payments" description="No partner-linked payment rows found." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 20).map((row, idx) => (
                  <tr key={String(row.id ?? idx)} className="border-t">
                    <td className="px-3 py-2">{String(row.customer_name ?? "—")}</td>
                    <td className="px-3 py-2">{String(row.subscription_number ?? "—")}</td>
                    <td className="px-3 py-2">{String(row.payment_date ?? "—")}</td>
                    <td className="px-3 py-2">{String(row.method ?? "—")}</td>
                    <td className="px-3 py-2">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Receipts" description="Partner-scoped receipt history.">
        {loading ? (
          <LoadingBlock label="Loading receipts..." />
        ) : receipts.length === 0 ? (
          <EmptyState title="No receipts" description="No partner-linked receipts found." />
        ) : (
          <div className="space-y-2">
            {receipts.slice(0, 20).map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3"
              >
                <div className="text-sm font-medium">{row.receipt_no || `RCT-${row.id}`}</div>
                <div className="text-sm text-muted-foreground">
                  {String(row.receipt_date)} • {money(row.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}
