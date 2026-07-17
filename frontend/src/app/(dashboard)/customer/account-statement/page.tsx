"use client";

import { formatRupee } from "@/lib/utils/currency";
import { useCallback, useEffect, useState } from "react";
import CustomerPageShell, { CPageSection, CPageStats, CPageStat } from "@/components/layout/CustomerPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import Link from "next/link";
import { getCustomerAccountStatement } from "@/services/phase4-finance";

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

  useEffect(() => { void load(); }, [load]);

  return (
    <CustomerPageShell
      title="Account Statement"
      subtitle="Your complete finance summary"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/documents"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Documents
        </Link>
      }
    >
      {loading ? <ERPLoadingState label="Loading statement..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load statement" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !data ? (
        <ERPEmptyState
          title="No statement available"
          description="No account statement data is available right now."
        />
      ) : null}

      {!loading && !error && data ? (
        <>
          <CPageStats>
            <CPageStat label="Invoice Total" value={formatRupee(data.summary.invoice_total)} tone="info" />
            <CPageStat label="Payments" value={formatRupee(data.summary.payments_total)} tone="success" />
            <CPageStat label="Balance" value={formatRupee(data.summary.invoice_balance_total)} tone={Number(data.summary.invoice_balance_total ?? 0) > 0 ? "warning" : "default"} />
            <CPageStat label="Receipts" value={formatRupee(data.summary.receipts_total)} />
          </CPageStats>

          {data.invoices.length > 0 ? (
            <CPageSection title={`Invoices (${data.invoices.length})`}>
              <div className="space-y-2">
                {data.invoices.map((inv, i) => (
                  <div key={String(inv.id ?? i)} className="rounded-2xl border border-border bg-card p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{String(inv.invoice_number || inv.document_number || `INV-${String(inv.id)}`)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{String(inv.invoice_date || inv.created_at || "—")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatRupee(String(inv.grand_total ?? "0"))}</div>
                        {Number(inv.balance_due ?? inv.outstanding_amount ?? 0) > 0 ? (
                          <div className="text-xs text-amber-700">Due: {formatRupee(String(inv.balance_due ?? inv.outstanding_amount ?? "0"))}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CPageSection>
          ) : null}

          {data.payments.length > 0 ? (
            <CPageSection title={`Payments (${data.payments.length})`}>
              <div className="space-y-2">
                {data.payments.map((p, i) => (
                  <div key={String(p.id ?? i)} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                    <div>
                      <div className="font-semibold">#{String(p.id)}</div>
                      <div className="text-xs text-muted-foreground">{String(p.payment_date || p.created_at || "—")} · {String(p.method || "—")}</div>
                    </div>
                    <div className="font-bold">{formatRupee(String(p.amount ?? "0"))}</div>
                  </div>
                ))}
              </div>
            </CPageSection>
          ) : null}
        </>
      ) : null}
    </CustomerPageShell>
  );
}
