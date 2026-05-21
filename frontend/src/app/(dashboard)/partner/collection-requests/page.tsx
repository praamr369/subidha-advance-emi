"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DataTableShell } from "@/components/ui/operations";
import {
  listPartnerCollectionRequests,
  type PartnerCollectionRequest,
} from "@/services/partner";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load collection requests.";
}

export default function PartnerCollectionRequestsPage() {
  const [rows, setRows] = useState<PartnerCollectionRequest[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listPartnerCollectionRequests();
      setRows(payload.results);
      setCount(payload.count);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      eyebrow="Partner Collections"
      title="Collection Requests"
      subtitle="Requests you submitted for admin or cashier review. Only your partner-scoped rows appear here."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Collection Requests" }]}
      actions={[
        { href: "/partner/collections/create", label: "Submit request", variant: "primary" },
        { href: "/partner/collections", label: "Collection workspace", variant: "secondary" },
      ]}
    >
      <ERPSectionShell
        title="Request register"
        description="This register is partner-scoped and read-only. Admin/cashier verification and final posting remains authoritative in backend workflows."
        actions={
          <ActionButton
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
            leftIcon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            Refresh
          </ActionButton>
        }
      >
        {loading ? <ERPLoadingState label="Loading collection requests…" /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load requests" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No collection requests"
            description="You have not submitted any collection requests yet, or none are visible in your partner scope."
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DataTableShell>
            <ERPDataToolbar
              left={
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{rows.length}</span> of{" "}
                  <span className="font-semibold text-foreground">{count}</span> request(s).
                </p>
              }
            />
            <div className="overflow-x-auto rounded-[1.25rem] border border-border/70 bg-[var(--surface-card-elevated)] shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color-mix(in_oklab,var(--surface-muted)_55%,transparent)] text-left">
                  <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Payment date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Review</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-t border-border/70">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{row.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{row.customer_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.customer_phone || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.subscription_number || "—"}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                        {money(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.method || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(row.payment_date)}</td>
                      <td className="px-4 py-3">
                        <ERPStatusBadge status={row.status || "SUBMITTED"} />
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-muted-foreground">
                        {row.review_note || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/partner/collections/${row.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataTableShell>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
