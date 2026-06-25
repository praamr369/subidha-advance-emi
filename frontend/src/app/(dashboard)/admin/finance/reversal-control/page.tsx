"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  createReversalCase,
  listReversalCases,
  reconcileReversalCase,
  syncReversalCase,
  type ReversalCase,
} from "@/services/reversal-control";

export default function ReversalControlPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReversalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manualReason, setManualReason] = useState("");
  const [manualReference, setManualReference] = useState("");
  const [manualType, setManualType] = useState("MANUAL_SETTLEMENT");
  const [manualAmount, setManualAmount] = useState("0.00");

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void listReversalCases(q)
      .then((payload) => {
        if (!active) return;
        setRows(payload.results);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load reversal cases");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q]);

  const onQuickOpen = async () => {
    try {
      await createReversalCase({
        source_type: "OTHER",
        source_reference: manualReference || `MANUAL-${Date.now()}`,
        reversal_type: manualType,
        reason: manualReason || "Manual settlement intake from reversal control center.",
        amount_snapshot: manualAmount || "0.00",
      });
      const refreshed = await listReversalCases(q);
      setRows(refreshed.results);
      setError(null);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open reversal case");
    }
  };

  const summary = {
    open: rows.filter((r) => ["DRAFT", "NEEDS_REVIEW", "APPROVED", "READY"].includes(r.status)).length,
    blocked: rows.filter((r) => r.reconciliation_status === "BLOCKED").length,
    ready: rows.filter((r) => r.reconciliation_status === "READY").length,
    pendingReturns: rows.filter((r) => r.source_type.includes("RETURN") || r.source_type === "DIRECT_SALE").length,
    pendingRefunds: rows.filter((r) => r.source_type === "CUSTOMER_REFUND").length,
    receiptVoids: rows.filter((r) => r.source_type.includes("RECEIPT")).length,
    purchaseReturns: rows.filter((r) => r.source_type === "PURCHASE_RETURN").length,
  };

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Reversal & Return Control"
      subtitle="Admin-only audited control center for cancellation, reversal, refund, and reconciliation decisions."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Reversal & Return Control" },
      ]}
      actions={[{ label: "Reversal Reconciliation", href: ROUTES.admin.financeReversalReconciliation }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded border px-3 text-sm font-medium" type="button" onClick={() => setCreateOpen((v) => !v)}>
            Open Manual Case
          </button>
          <button className="h-10 rounded border px-3 text-sm font-medium" type="button" onClick={() => void Promise.all(rows.map((row) => syncReversalCase(row.id)))}>
            Sync All Visible
          </button>
          <Link className="h-10 rounded border px-3 text-sm font-medium inline-flex items-center" href={ROUTES.admin.financeReversalReconciliation}>
            Reversal Reconciliation
          </Link>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded border p-3 text-sm">Open Cases: {summary.open}</div>
          <div className="rounded border p-3 text-sm">Blocked: {summary.blocked}</div>
          <div className="rounded border p-3 text-sm">Ready to Reconcile: {summary.ready}</div>
          <div className="rounded border p-3 text-sm">Pending Returns: {summary.pendingReturns}</div>
          <div className="rounded border p-3 text-sm">Pending Refunds: {summary.pendingRefunds}</div>
          <div className="rounded border p-3 text-sm">Receipt Voids: {summary.receiptVoids}</div>
          <div className="rounded border p-3 text-sm">Purchase Returns: {summary.purchaseReturns}</div>
        </div>
        {createOpen ? (
          <div className="rounded border p-3 space-y-2">
            <div className="text-sm font-medium">Manual Case</div>
            <input className="h-9 w-full rounded border px-2 text-sm" placeholder="Source reference" value={manualReference} onChange={(e) => setManualReference(e.target.value)} />
            <input className="h-9 w-full rounded border px-2 text-sm" placeholder="Reason" value={manualReason} onChange={(e) => setManualReason(e.target.value)} />
            <input className="h-9 w-full rounded border px-2 text-sm" placeholder="Amount" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} />
            <select className="h-9 w-full rounded border px-2 text-sm" value={manualType} onChange={(e) => setManualType(e.target.value)}>
              <option value="MANUAL_SETTLEMENT">MANUAL_SETTLEMENT</option>
              <option value="PAYMENT_REVERSAL">PAYMENT_REVERSAL</option>
              <option value="CANCEL_WITH_REVERSAL">CANCEL_WITH_REVERSAL</option>
            </select>
            <button className="h-9 rounded border px-3 text-sm" type="button" onClick={() => void onQuickOpen()}>
              Create Case
            </button>
          </div>
        ) : null}
        <input
          className="h-10 w-full rounded border px-3 text-sm"
          placeholder="Search customer, source ref, or reason..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />

        {loading ? <LoadingBlock label="Loading reversal control cases..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load reversal cases" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="No reversal cases yet" description="Create a case to drive audited cancellation, refund, or return workflows." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-hidden rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Customer/Party</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reconciliation</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`${ROUTES.admin.financeReversalControl}/${row.id}`}>{row.case_no}</Link>
                    </td>
                    <td className="px-3 py-2">{row.source_reference || `${row.source_type}#${row.source_id}`}</td>
                    <td className="px-3 py-2">{row.customer_name || row.party_name || "—"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.reconciliation_status || "PENDING"}</td>
                    <td className="px-3 py-2">{row.reason}</td>
                    <td className="px-3 py-2">{row.amount}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button className="rounded border px-2 py-1" type="button" onClick={() => void syncReversalCase(row.id)}>
                          Sync
                        </button>
                        <button className="rounded border px-2 py-1" type="button" onClick={() => void reconcileReversalCase(row.id, "Admin reconciliation run from control table.")}>
                          Reconcile
                        </button>
                      </div>
                    </td>
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
