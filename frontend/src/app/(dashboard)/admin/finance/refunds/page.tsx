"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listReversalCases, type ReversalCase } from "@/services/reversal-control";
import { listAdminDepositRegister, type AdminDepositRow } from "@/services/phase4-finance";

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
  if (label === "READY" || label === "RECONCILED" || label === "REFUNDED" || label === "READY_TO_REFUND") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (label === "BLOCKED" || label === "PENDING" || label === "NEEDS_APPROVAL") return "border-amber-200 bg-amber-50 text-amber-900";
  if (label === "CANCELLED" || label === "ARCHIVED") return "border-border bg-muted/50 text-muted-foreground";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function AdminFinanceRefundsPage() {
  const [q, setQ] = useState("");
  const [activeTab, setActiveTab] = useState<"deposits" | "reversals">("deposits");
  const [rows, setRows] = useState<ReversalCase[]>([]);
  const [depositRows, setDepositRows] = useState<AdminDepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [reversalPayload, depositPayload] = await Promise.all([
          listReversalCases(q.trim()),
          listAdminDepositRegister().catch(() => ({ count: 0, results: [] })),
        ]);
        if (!active) return;
        setRows(reversalPayload.results);
        setDepositRows(depositPayload.results || []);
        setError(null);
      } catch (err) {
        if (!active) return;
        setRows([]);
        setDepositRows([]);
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
    <ERPPageShell
      eyebrow="Finance"
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
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={
        activeTab === "deposits"
          ? [
              { label: "Deposit Refunds", value: loading ? "—" : depositRows.length, tone: "info" },
              {
                label: "Refundable Total",
                value: loading ? "—" : `₹${depositRows.reduce((s, r) => s + Number(r.refundable_amount || r.deposit_amount || 0), 0).toLocaleString("en-IN")}`,
                tone: "default",
              },
              {
                label: "Needs Action",
                value: loading ? "—" : depositRows.filter((r) => r.can_record_refund || r.can_approve_refund).length,
                tone: !loading && depositRows.filter((r) => r.can_record_refund || r.can_approve_refund).length > 0 ? "warning" : "success",
              },
            ]
          : [
              { label: "Refund Cases", value: loading ? "—" : refundRows.length, tone: "info" },
              {
                label: "Refundable Total",
                value: loading ? "—" : `₹${refundRows.reduce((s, r) => s + Number(r.refundable_amount || 0), 0).toLocaleString("en-IN")}`,
                tone: "default",
              },
              {
                label: "Blocked",
                value: loading ? "—" : refundRows.filter((r) => (r.blocking_reasons?.length ?? 0) > 0).length,
                tone: !loading && refundRows.filter((r) => (r.blocking_reasons?.length ?? 0) > 0).length > 0 ? "warning" : "success",
              },
            ]
      }
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-amber-300/70 bg-amber-50/90 p-4 text-sm text-amber-900 shadow-sm">
          Refund work is intentionally routed through the audited reversal pipeline. This page is a focused operational view, uniting customer security deposit refunds and billing reversal cases.
        </section>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("deposits")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "deposits"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Security Deposit Refunds ({depositRows.length})
          </button>
          <button
            onClick={() => setActiveTab("reversals")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === "reversals"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Billing Reversal Cases ({refundRows.length})
          </button>
        </div>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {activeTab === "deposits" ? "Deposit Refunds" : "Refund Cases"}
            </div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {activeTab === "deposits" ? depositRows.length : refundRows.length}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending / Needs Action</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {activeTab === "deposits"
                ? depositRows.filter((r) => r.can_record_refund || r.can_approve_refund).length
                : summary.pending}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocked</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {activeTab === "deposits" ? 0 : summary.blocked}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reconciled / Settled</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {activeTab === "deposits"
                ? depositRows.filter((r) => !r.can_record_refund && !r.can_approve_refund).length
                : summary.reconciled}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
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

        {!loading && !error && activeTab === "deposits" && depositRows.length === 0 ? (
          <EmptyState
            title="No security deposit refunds"
            description="No customer security deposit refunds found matching your search."
          />
        ) : null}

        {!loading && !error && activeTab === "deposits" && depositRows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Plan Type</th>
                  <th className="px-4 py-3">Deposit Amount</th>
                  <th className="px-4 py-3">Refundable</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {depositRows.map((row) => {
                  const statusLabel = row.can_record_refund
                    ? "READY_TO_REFUND"
                    : row.can_approve_refund
                    ? "NEEDS_APPROVAL"
                    : row.status || "SETTLED";
                  return (
                    <tr key={row.demand_id || row.subscription_id} className="bg-background">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {row.reference_key || `SUB#${row.subscription_id}`}
                      </td>
                      <td className="px-4 py-3 text-foreground">{row.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.plan_type || "—"}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{money(row.deposit_amount)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{money(row.refundable_amount || row.deposit_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(statusLabel)}`}>
                          {statusLabel}
                        </span>
                        {!row.can_record_refund && !row.can_approve_refund && row.latest_transaction?.transaction_type === 'DEPOSIT_REFUND' && (
                          <div className="mt-2 text-xs text-muted-foreground flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{row.latest_transaction.payment_method} · {row.latest_transaction.finance_account_name || 'No FA'}</span>
                            {row.latest_transaction.reference_no && <span>Ref: {row.latest_transaction.reference_no}</span>}
                            <span>Tx: {row.latest_transaction.transaction_number}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 space-x-2">
                        <Link
                          href={`/admin/finance/deposits?subscription_id=${row.subscription_id}`}
                          className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground shadow-sm hover:bg-secondary/80"
                        >
                          Manage Deposit
                        </Link>
                        {row.can_record_refund && (
                          <Link
                            href={ROUTES.admin.payables}
                            className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                          >
                            Pay in Cash Desk
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && activeTab === "reversals" && refundRows.length === 0 ? (
          <EmptyState
            title="No refund cases"
            description="Refund cases appear here once reversal control receives customer-refund sources."
          />
        ) : null}

        {!loading && !error && activeTab === "reversals" && refundRows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
    </ERPPageShell>
  );
}
