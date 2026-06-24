"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listReversalCases, type ReversalCase } from "@/services/reversal-control";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function money(value: string | number | null | undefined): string {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return String(value ?? "0.00");
  return parsed.toFixed(2);
}

function toneClass(label: string): string {
  if (label === "READY" || label === "RECONCILED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (label === "BLOCKED" || label === "PENDING") return "border-amber-200 bg-amber-50 text-amber-900";
  if (label === "CANCELLED" || label === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function AdminFinanceRefundsPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReversalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const payload = await listReversalCases(q.trim());
        if (!active) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load refund cases.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [q]);

  const refundRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.source_type === "CUSTOMER_REFUND" ||
          row.reversal_type.includes("REFUND") ||
          row.reason.toLowerCase().includes("refund")
      ),
    [rows]
  );

  const summary = useMemo(() => {
    const pending = refundRows.filter((row) => row.reconciliation_status !== "RECONCILED").length;
    const blocked = refundRows.filter((row) => row.reconciliation_status === "BLOCKED").length;
    const ready = refundRows.filter((row) => row.reconciliation_status === "READY").length;
    const reconciled = refundRows.filter((row) => row.reconciliation_status === "RECONCILED").length;
    return { pending, blocked, ready, reconciled };
  }, [refundRows]);

  return (
    <PortalPage
      title="Refunds"
      subtitle="Customer refunds stay source-driven inside reversal control so finance can reconcile, block, or approve them with a full audit trail."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Refunds" },
      ]}
      actions={[
        { href: ROUTES.admin.financeReversalControl, label: "Reversal Control", variant: "primary" },
        { href: ROUTES.admin.financeReversalReconciliation, label: "Reconciliation Queue", variant: "secondary" },
        { href: ROUTES.admin.finance, label: "Finance Operations", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm">
          Refund work is intentionally routed through the audited reversal pipeline. This page is a focused operational view, not a new financial posting surface.
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refund cases</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{refundRows.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{summary.pending}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocked</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{summary.blocked}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reconciled</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{summary.reconciled}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label className="block text-sm font-medium text-foreground">
            Search refunds
            <input
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Search case, source, customer, or reason"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </label>
        </section>

        {loading ? <LoadingBlock label="Loading refund cases..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load refunds" description={error} /> : null}
        {!loading && !error && refundRows.length === 0 ? (
          <EmptyState
            title="No refund cases"
            description="Refund cases appear here once reversal control receives customer-refund sources."
          />
        ) : null}

        {!loading && !error && refundRows.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reconciliation</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {refundRows.map((row) => (
                  <tr key={row.id} className="bg-background">
                    <td className="px-4 py-3">
                      <Link href={`${ROUTES.admin.financeReversalControl}/${row.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                        {row.case_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.source_reference || `${row.source_type}#${row.source_id}`}</div>
                      <div className="text-xs text-muted-foreground">{row.source_type}</div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{row.customer_name || row.party_name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(row.reconciliation_status || "PENDING")}`}>
                        {row.reconciliation_status || "PENDING"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{money(row.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateTime(row.metadata?.updated_at as string | null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
