"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function CustomerReceiptsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceReceiptRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listCustomerReceipts();
      setRows(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="My Receipts"
      subtitle="Immutable receipts for EMI, rent/lease, and direct-sale collections."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Receipts" }]}
      actions={[{ href: "/customer/documents", label: "Documents", variant: "secondary" }]}
    >
      <WorkspaceSection title="Receipt Register" description="All receipts linked to your account only.">
        {loading ? (
          <LoadingBlock label="Loading receipts..." />
        ) : error ? (
          <ErrorState title="Unable to load receipts" message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No receipts yet" description="Receipts will appear once payments are collected." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.receipt_no || `RCT-${row.id}`}</td>
                    <td className="px-3 py-2">{row.receipt_date}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2">{money(row.amount)}</td>
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
