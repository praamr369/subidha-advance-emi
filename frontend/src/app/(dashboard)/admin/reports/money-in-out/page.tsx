"use client";

import { useCallback, useEffect, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { getMoneyInOut, type MoneyInOutResponse } from "@/services/reports";

export default function MoneyInOutReportPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<MoneyInOutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getMoneyInOut({ date_from: dateFrom || undefined, date_to: dateTo || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load money in/out report.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = data?.totals;

  return (
    <ERPPageShell
      eyebrow="BI & Reports"
      title="Money In vs Out"
      subtitle="Consolidated cash flow by payment method — what you collected vs what you spent, by Cash / UPI / Bank / Card."
      helperNote="Money In = customer payments by method. Money Out = posted expense vouchers, vendor payments, and salary payments grouped by the paying finance account's kind. Read-only report."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Money In vs Out" },
      ]}
      statusBadge={{ label: "Backend Analytics", tone: "info" as const }}
      stats={[
        { label: "Money In", value: loading || !totals ? "—" : formatRupee(totals.money_in), tone: "success" },
        { label: "Money Out", value: loading || !totals ? "—" : formatRupee(totals.money_out), tone: "warning" },
        {
          label: "Net",
          value: loading || !totals ? "—" : formatRupee(totals.net),
          tone: !loading && totals && Number(totals.net) < 0 ? "danger" : "success",
        },
      ]}
    >
      <ERPSectionShell title="Reporting period" description="Leave dates blank for all-time totals.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted-foreground">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block h-10 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="text-sm text-muted-foreground">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block h-10 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Loading…" : "Apply"}
          </button>
        </div>
      </ERPSectionShell>

      {loading ? <ERPLoadingState label="Loading money in/out…" /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load report" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && data ? (
        <ERPSectionShell title="By payment method" description="Inflow, outflow, and net per method over the selected period.">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Money In</th>
                  <th className="px-4 py-3 text-right">Money Out</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.buckets.map((bucket) => {
                  const net = Number(bucket.net);
                  return (
                    <tr key={bucket.method}>
                      <td className="px-4 py-3 font-medium text-foreground">{bucket.method}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatRupee(bucket.money_in)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{formatRupee(bucket.money_out)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${net < 0 ? "text-red-600" : "text-foreground"}`}>
                        {formatRupee(bucket.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatRupee(totals?.money_in ?? 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{formatRupee(totals?.money_out ?? 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupee(totals?.net ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Sources — In: {data.sources.money_in.join(", ")}. Out: {data.sources.money_out.join(", ")}.
            {data.sources.note ? ` ${data.sources.note}` : ""}
          </p>
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
