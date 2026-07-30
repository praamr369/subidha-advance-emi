"use client";

import { formatRupee } from "@/lib/utils/currency";
import { Download, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import CustomerPageShell, { CPageSection } from "@/components/layout/CustomerPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import Link from "next/link";
import { listCustomerInvoices, downloadInvoicePdf, type FinanceInvoiceRow } from "@/services/phase4-finance";

function statusChip(status?: string) {
  const s = (status || "").toUpperCase();
  if (s === "PAID" || s === "SETTLED") return "bg-emerald-100 text-emerald-700";
  if (s === "PARTIAL") return "bg-amber-100 text-amber-700";
  if (s === "OVERDUE") return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

export default function CustomerInvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FinanceInvoiceRow[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  const handleDownload = useCallback(async (invoiceId: number) => {
    setDownloadingId(invoiceId);
    setDownloadError(null);
    try {
      await downloadInvoicePdf(invoiceId);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download invoice");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <CustomerPageShell
      title="My Invoices"
      subtitle="All invoices linked to your account"
      backHref="/customer"
      backLabel="Dashboard"
      actions={
        <Link
          href="/customer/receipts"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Receipts
        </Link>
      }
    >
      {downloadError ? (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {downloadError}
        </div>
      ) : null}

      {loading ? <ERPLoadingState label="Loading invoices..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load invoices" message={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No invoices yet"
          description="Invoices will appear after demands are generated."
          icon={<FileText className="h-10 w-10 text-muted-foreground/40" />}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <CPageSection title={`${rows.length} invoice${rows.length !== 1 ? "s" : ""}`}>
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-foreground">
                      {row.invoice_no || `INV-${row.id}`}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.invoice_date}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip(row.status)}`}>
                    {row.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="mt-0.5 text-sm font-bold text-foreground">{formatRupee(row.grand_total)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Received</p>
                    <p className="mt-0.5 text-sm font-semibold text-emerald-700">{formatRupee(row.received_total)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
                    <p className={`mt-0.5 text-sm font-semibold ${Number(row.balance_total ?? 0) > 0 ? "text-amber-700" : "text-foreground"}`}>
                      {formatRupee(row.balance_total)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => void handleDownload(row.id)}
                  disabled={downloadingId === row.id}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Download className="size-3.5" />
                  {downloadingId === row.id ? "Downloading..." : "Download PDF"}
                </button>
              </div>
            ))}
          </div>
        </CPageSection>
      ) : null}
    </CustomerPageShell>
  );
}
