"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
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
    <PortalPage
      eyebrow="Partner Collections"
      title="Collection Requests"
      subtitle="Requests you submitted for admin or cashier review. Only your partner-scoped rows appear here."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Collection Requests" }]}
      actions={[
        { href: "/partner/collections/create", label: "Submit request", variant: "primary" },
        { href: "/partner/collections", label: "Collection workspace", variant: "secondary" },
      ]}
    >
      <div className="mb-4 flex justify-end">
        <ActionButton
          type="button"
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          leftIcon={<RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
        >
          Refresh
        </ActionButton>
      </div>

      {loading ? <LoadingBlock label="Loading collection requests…" /> : null}
      {!loading && error ? (
        <ErrorState title="Unable to load requests" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No collection requests"
          description="You have not submitted any collection requests yet, or none are visible in your partner scope."
        />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <DataTableShell>
          <p className="mb-3 text-sm text-muted-foreground">
            Showing {rows.length} of {count} request(s).
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Subscription</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Payment date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Review</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">#{row.id}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.customer_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.customer_phone || ""}</div>
                    </td>
                    <td className="px-3 py-2">{row.subscription_number || "—"}</td>
                    <td className="px-3 py-2 text-right">{money(row.amount)}</td>
                    <td className="px-3 py-2">{row.method || "—"}</td>
                    <td className="px-3 py-2">{formatDate(row.payment_date)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status || "SUBMITTED"} />
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                      {row.review_note || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/partner/collections/${row.id}`}
                        className="text-xs font-medium text-primary hover:underline"
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
    </PortalPage>
  );
}
