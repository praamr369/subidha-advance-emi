"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { listCustomerInvoices, type FinanceInvoiceRow } from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function CustomerInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceInvoiceRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listCustomerInvoices();
      setRows(payload.results ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="My Invoices"
      subtitle="Customer-scoped invoice register across contract and direct-sale flows."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Invoices" }]}
      actions={[{ href: "/customer/receipts", label: "Receipts", variant: "secondary" }]}
    >
      <WorkspaceSection title="Invoice Register" description="Immutable invoice numbers and current balances.">
        {loading ? (
          <LoadingBlock label="Loading invoices..." />
        ) : error ? (
          <ErrorState title="Unable to load invoices" message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices yet" description="Invoices will appear after demands are generated." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.invoice_no || `INV-${row.id}`}</td>
                    <td className="px-3 py-2">{row.invoice_date}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{money(row.grand_total)}</td>
                    <td className="px-3 py-2">{money(row.received_total)}</td>
                    <td className="px-3 py-2">{money(row.balance_total)}</td>
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
