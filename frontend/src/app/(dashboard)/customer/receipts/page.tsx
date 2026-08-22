"use client";

import { formatRupee } from "@/lib/utils/currency";
import { useCallback, useEffect, useState } from "react";
import CustomerPageShell, { CPageSection } from "@/components/layout/CustomerPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import Link from "next/link";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";
import { customerReceiptPdfUrl } from "@/services/customer-portal";

function downloadHref(id: number | string) {
  return customerReceiptPdfUrl(id);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = Date.parse(value);
  if (Number.isNaN(d)) return value;
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ReceiptCard({ row }: { row: FinanceReceiptRow }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">{row.receipt_no || `RCT-${row.id}`}</div>
          {row.subscription_number ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{row.subscription_number}</div>
          ) : null}
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(row.receipt_date)} · {row.payment_method || "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-base font-bold text-foreground">{formatRupee(row.amount)}</span>
          <a
            href={downloadHref(row.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            PDF
          </a>
        </div>
      </div>
    </div>
  );
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

  useEffect(() => { void load(); }, [load]);

  return (
    <CustomerPageShell
      title="My Receipts"
      subtitle="All payment receipts for your account"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/invoices"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Invoices
        </Link>
      }
    >
      {loading ? <ERPLoadingState label="Loading receipts..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load receipts" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No receipts yet" description="Receipts will appear once payments are collected." />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <CPageSection title={`${rows.length} receipt${rows.length !== 1 ? "s" : ""}`}>
          <div className="space-y-3">
            {rows.map((row) => <ReceiptCard key={row.id} row={row} />)}
          </div>
        </CPageSection>
      ) : null}
    </CustomerPageShell>
  );
}
