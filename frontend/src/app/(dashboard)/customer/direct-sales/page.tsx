"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DataTableShell } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import StatusBadge from "@/components/ui/status-badge";
import { listCustomerDirectSales, type CustomerDirectSaleListItem } from "@/services/customer";

function money(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

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
    <PortalPage
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
        {loading ? <LoadingBlock label="Loading direct sales..." /> : null}
        {!loading && error ? (
          <ErrorState title="Unable to load direct sales" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="No direct sales found" description="No direct-sale invoices are currently linked to your account." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
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
                        <StatusBadge status={row.status || "DRAFT"} />
                      </td>
                      <td className="px-3 py-2 text-right">{money(row.grand_total)}</td>
                      <td className="px-3 py-2 text-right">{money(row.paid_amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.outstanding_amount)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/customer/direct-sales/${row.id}`}
                            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                          >
                            View
                          </Link>
                          {row.invoice_pdf_url ? (
                            <a
                              href={row.invoice_pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                            >
                              Download Invoice
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataTableShell>
        ) : null}
      </WorkspaceSection>
    </PortalPage>
  );
}
