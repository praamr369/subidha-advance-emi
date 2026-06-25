"use client";

import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listLuckyDrawWinners, type LuckyDrawRecord } from "@/services/draws";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return v;
  }
}

function fmtMoney(v?: string | null): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (isNaN(n)) return v;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DELIVERY_LABELS: Record<string, { label: string; color: string }> = {
  NOT_SCHEDULED: { label: "Not Scheduled", color: "bg-muted text-muted-foreground" },
  PENDING: { label: "Pending", color: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  SCHEDULED: { label: "Scheduled", color: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  DISPATCHED: { label: "Dispatched", color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", color: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  DELIVERED: { label: "Delivered", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  FAILED: { label: "Failed", color: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  CANCELLED: { label: "Cancelled", color: "bg-muted text-muted-foreground" },
  RETURNED: { label: "Returned", color: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
};

function DeliveryBadge({ status }: { status?: string | null }) {
  const s = status ?? "NOT_SCHEDULED";
  const info = DELIVERY_LABELS[s] ?? { label: s, color: "bg-gray-100 text-muted-foreground" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

export default function LuckyPlanWinnersPage() {
  const [winners, setWinners] = useState<LuckyDrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [batchFilter, setBatchFilter] = useState("");
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { batch?: string; page?: number } = { page };
      if (batchFilter) params.batch = batchFilter;
      const data = await listLuckyDrawWinners(params);
      setWinners(data.results ?? []);
      setTotalCount(data.count ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load winners.");
    } finally {
      setLoading(false);
    }
  }, [page, batchFilter]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <ERPPageShell
      eyebrow="Lucky Plan"
      title="Winners Register"
      subtitle="Complete Lucky Draw winner register — EMI waivers, delivery tracking, and audit trail"
      breadcrumbs={[
        { href: ROUTES.admin.luckyPlanControl, label: "Lucky Plan" },
        { label: "Winners" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Winners", value: loading ? "—" : totalCount, tone: "info" },
        { label: "Waived (page)", value: loading ? "—" : `₹${winners.reduce((s, w) => s + Number(w.waived_amount || 0), 0).toLocaleString("en-IN")}`, tone: "default" },
        { label: "Delivered (page)", value: loading ? "—" : winners.filter(w => w.delivery_status === "DELIVERED").length, tone: "success" },
        { label: "Delivery Pending (page)", value: loading ? "—" : winners.filter(w => !w.delivery_status || ["NOT_SCHEDULED", "PENDING", "SCHEDULED"].includes(w.delivery_status)).length, tone: !loading && winners.filter(w => !w.delivery_status || ["NOT_SCHEDULED", "PENDING", "SCHEDULED"].includes(w.delivery_status)).length > 0 ? "warning" : "success" },
      ]}
    >
      <ERPSectionShell
        title="Filters"
        description="Narrow winners by batch ID"
      >
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Batch ID</label>
            <input
              type="number"
              value={batchFilter}
              onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }}
              placeholder="e.g. 5"
              className="h-9 w-32 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          {batchFilter && (
            <button
              onClick={() => { setBatchFilter(""); setPage(1); }}
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs hover:bg-muted"
            >
              Clear filter
            </button>
          )}
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title={`Winners${totalCount > 0 ? ` — ${totalCount} total` : ""}`}
        description="Each row is a confirmed winner with EMI waiver and delivery status"
      >
        {loading && <ERPLoadingState label="Loading winners…" />}
        {!loading && error && <ERPErrorState title="Error" description={error} />}
        {!loading && !error && winners.length === 0 && (
          <ERPEmptyState
            title="No winners yet"
            description={batchFilter ? "No winners found for this batch." : "No Lucky Draw winners yet. Winners appear here once a draw is revealed."}
          />
        )}

        {!loading && !error && winners.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3 text-right">Draw Month</th>
                    <th className="px-4 py-3 text-right">Lucky ID</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3 text-right">Paid EMIs</th>
                    <th className="px-4 py-3 text-right">Waived EMIs</th>
                    <th className="px-4 py-3 text-right">Waived Amount</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Draw Date</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((w) => (
                    <tr key={w.id} className="border-t border-border/60 hover:bg-muted/30/50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-muted/50 px-2 py-0.5 rounded-lg">
                          {w.batch_code ?? `#${w.batch}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{w.draw_month ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {w.winner_lucky_number != null ? (
                          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-800 font-bold text-sm">
                            {String(w.winner_lucky_number).padStart(2, "0")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {w.winner_customer_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {w.winner_subscription_number ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {w.paid_emi_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {w.waived_emi_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                        {fmtMoney(w.waived_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryBadge status={w.delivery_status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {fmtDate(w.draw_date ?? w.revealed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} records)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-8 rounded-xl border border-border bg-background px-3 text-xs hover:bg-muted disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 rounded-xl border border-border bg-background px-3 text-xs hover:bg-muted disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </ERPSectionShell>

      <ERPSectionShell title="Waiver rule" description="How the waiver is applied after a draw is revealed">
        <p className="text-sm text-muted-foreground">
          When a Lucky Draw is revealed and a winner Lucky ID is confirmed, the linked subscriber
          receives a waiver on <span className="font-medium text-foreground">future EMI instalments only</span>.
          Past-paid EMIs are not reversed. The waiver is evidence-backed and audit-logged
          against the draw record. This rule cannot be changed from this page.
        </p>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
