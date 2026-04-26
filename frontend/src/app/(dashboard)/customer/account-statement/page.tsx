"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getCustomerAccountStatement } from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function CustomerAccountStatementPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    summary: Record<string, string>;
    payments: Array<Record<string, unknown>>;
    receipts: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getCustomerAccountStatement();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account statement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title="Account Statement"
      subtitle="Chronological finance statement across invoices, receipts, and payments."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Account Statement" }]}
      actions={[{ href: "/customer/documents", label: "Documents", variant: "secondary" }]}
    >
      <WorkspaceSection title="Statement Summary" description="Computed from authoritative billing and payment records.">
        {loading ? (
          <LoadingBlock label="Loading statement..." />
        ) : error ? (
          <ErrorState title="Unable to load statement" message={error} onRetry={() => void load()} />
        ) : !data ? (
          <EmptyState title="No statement available" description="No account statement data is available right now." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Invoice Total</div>
              <div className="text-xl font-semibold">{money(data.summary.invoice_total)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Invoice Balance</div>
              <div className="text-xl font-semibold">{money(data.summary.invoice_balance_total)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Payments Total</div>
              <div className="text-xl font-semibold">{money(data.summary.payments_total)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs text-muted-foreground">Receipts Total</div>
              <div className="text-xl font-semibold">{money(data.summary.receipts_total)}</div>
            </div>
          </div>
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}
