"use client";
import { formatRupee } from "@/lib/utils/currency";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { DataTableShell } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { listCustomerDirectSales, type CustomerDirectSaleListItem } from "@/services/customer";


function formatDate(value?: string): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CustomerDirectSalesPage() {
  const [rows, setRows] = useState<CustomerDirectSaleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listCustomerDirectSales({ page: 1, pageSize: 100 });
      setRows(response.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load direct sales.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      title="Direct Sales"
      subtitle="Customer-scoped direct-sale invoices, dues, and receipts."
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Direct Sales" }]}
      actions={[
        { href: "/customer/payments", label: "Payments", variant: "secondary" },
        { href: "/customer/invoices", label: "Invoices", variant: "secondary" },
      ]}
    >
      <WorkspaceSection
        title="Direct-sale invoice register"
        description="Only direct-sale records linked to your registered customer profile appear here."
      >
        {loading ? <ERPLoadingState label="Loading direct sales..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load direct sales" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No direct sales found" description="No direct-sale invoices are currently linked to your account." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="space-y-2.5 md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground truncate">
                        {row.invoice_number || row.document_number || `Direct Sale #${row.id}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Date: {formatDate(row.sale_date)}
                      </div>
                    </div>
                    <ERPStatusBadge status={row.status || "DRAFT"} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Total</span>
                      <div className="font-bold text-foreground mt-0.5">{formatRupee(row.grand_total)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Paid</span>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{formatRupee(row.paid_amount)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Due</span>
                      <div className={`font-bold mt-0.5 ${Number(row.outstanding_amount ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`}>
                        {formatRupee(row.outstanding_amount)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/customer/direct-sales/${row.id}`}
                      className="flex-1 flex min-h-10 items-center justify-center rounded-xl bg-card border border-border px-3 text-xs font-bold text-foreground shadow-xs transition hover:bg-muted active:scale-[0.98]"
                    >
                      View Details
                    </Link>
                    {row.invoice_pdf_url ? (
                      <button
                        onClick={() => {
                          const url = new URL(row.invoice_pdf_url!, window.location.origin);
                          void downloadAuthenticatedFile(url.pathname, `invoice-${row.id}.pdf`);
                        }}
                        className="flex-1 flex min-h-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 px-3 text-xs font-bold text-primary shadow-xs transition hover:bg-primary/20 active:scale-[0.98]"
                      >
                        PDF
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <DataTableShell>
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Paid</th>
                        <th className="px-3 py-2 text-right">Due</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium text-foreground">
                            {row.invoice_number || row.document_number || `DS-${row.id}`}
                          </td>
                          <td className="px-3 py-2">{formatDate(row.sale_date)}</td>
                          <td className="px-3 py-2">
                            <ERPStatusBadge status={row.status || "DRAFT"} />
                          </td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.grand_total)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.paid_amount)}</td>
                          <td className="px-3 py-2 text-right">{formatRupee(row.outstanding_amount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Link
                                href={`/customer/direct-sales/${row.id}`}
                                className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                              >
                                View
                              </Link>
                              {row.invoice_pdf_url ? (
                                <button
                                  onClick={() => {
                                    const url = new URL(row.invoice_pdf_url!, window.location.origin);
                                    void downloadAuthenticatedFile(url.pathname, `invoice-${row.id}.pdf`);
                                  }}
                                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                                >
                                  Download Invoice
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataTableShell>
            </div>
          </>
        ) : null}
      </WorkspaceSection>
    </ERPPageShell>
  );
}
