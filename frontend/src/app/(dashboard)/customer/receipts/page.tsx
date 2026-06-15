"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";


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
    <ERPPageShell
      title="My Receipts"
      subtitle="Immutable receipts for EMI, rent/lease, and direct-sale collections."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "Receipts" }]}
      actions={[{ href: "/customer/documents", label: "Documents", variant: "secondary" }]}
    >
      <ERPSectionShell title="Receipt register" description="All receipts linked to your account only.">
        {loading ? (
          <ERPLoadingState label="Loading receipts..." />
        ) : error ? (
          <ERPErrorState title="Unable to load receipts" message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <ERPEmptyState title="No receipts yet" description="Receipts will appear once payments are collected." />
        ) : (
          <div className="overflow-x-auto rounded-[1.25rem] border border-border/70 bg-[var(--surface-card-elevated)] shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[color-mix(in_oklab,var(--surface-muted)_55%,transparent)] text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Receipt
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Method
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {row.receipt_no || `RCT-${row.id}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.receipt_date || "—"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.status || "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.payment_method || "—"}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                      {formatRupee(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
