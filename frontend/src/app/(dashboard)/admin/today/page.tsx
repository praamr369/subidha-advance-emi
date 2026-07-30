"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronRight, Activity, ArrowRight, RefreshCw } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import TodayWorkQueuesPanel from "@/components/admin/today/TodayWorkQueuesPanel";
import {
  fetchSolopreneurToday,
  postSolopreneurDailyClose,
  type SolopreneurTodayResponse,
  type ActionQueueItem,
} from "@/services/solopreneur";
import { formatRupee } from "@/lib/utils/currency";

type TodayTab = "command" | "work";

const TODAY_TABS: Array<{ id: TodayTab; label: string }> = [
  { id: "command", label: "Command Center" },
  { id: "work", label: "Work Queues" },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong.";
}

export default function SolopreneurTodayPage() {
  const [tab, setTab] = useState<TodayTab>("command");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SolopreneurTodayResponse | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchSolopreneurToday();
      setData(res);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDailyClose() {
    if (closing) return;
    try {
      setClosing(true);
      setCloseResult(null);
      const res = await postSolopreneurDailyClose();
      if (res.status === "SUCCESS") {
        setCloseResult(`Close successful: ${res.processed} records processed.`);
      } else {
        setCloseResult(`Completed with ${res.errors} errors.`);
      }
      await loadData();
    } catch (err) {
      setCloseResult(toErrorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  const renderActionQueueRow = (item: ActionQueueItem, i: number) => {
    let dotClass = "bg-sky-500";
    if (item.severity === "red") dotClass = "bg-rose-500";
    if (item.severity === "amber") dotClass = "bg-amber-500";

    return (
      <div
        key={i}
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <p className="text-sm font-medium text-foreground">{item.label}</p>
        </div>
        <Link
          href={item.href}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Resolve <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  };

  return (
    <ERPPageShell
      eyebrow="Solopreneur"
      title="Today"
      subtitle="Morning command center. Resolve exceptions, check cash position, and run daily close."
      stats={[
        {
          label: "Due Today",
          value: formatRupee(data?.money_today.emis_due_today_total || 0),
        },
        {
          label: "Overdue",
          value: formatRupee(data?.money_today.emis_overdue_total || 0),
          tone: (data?.money_today.emis_overdue_count || 0) > 0 ? "danger" : "default",
        },
        {
          label: "Collected Yesterday",
          value: formatRupee(data?.money_today.yesterday_collections_total || 0),
        },
        {
          label: "Ledger Status",
          value:
            data?.health.is_balanced === true
              ? "Balanced"
              : data?.health.is_balanced === false
              ? "Imbalance"
              : "—",
          tone: data?.health.is_balanced ? "success" : data?.health.is_balanced === false ? "danger" : "default",
        },
      ]}
    >
      <div className="space-y-6">
        {/* Tab switcher — solopreneur command center + ERP work queues (additive merge) */}
        <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1">
          {TODAY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "work" ? <TodayWorkQueuesPanel /> : null}

        {tab === "command" ? (
        <>
      {error && (
        <div className="mb-6 rounded-md bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="ml-2 text-sm">Loading today's brief...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Action Queue (Left 2 cols) */}
          <div className="space-y-4 xl:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Action Queue
            </h2>
            {data && data.action_queue.length > 0 ? (
              <div className="space-y-3">
                {data.action_queue.map((item, i) => renderActionQueueRow(item, i))}
              </div>
            ) : (
              <ERPEmptyState
                title="All clear"
                description="Nothing needs your attention right now."
              />
            )}
          </div>

          {/* Money & Health (Right col) */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Cash Position
              </h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-border">
                    {data?.cash_position.map((acct) => (
                      <tr key={acct.id}>
                        <td className="px-4 py-3 font-medium text-foreground">{acct.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatRupee(acct.opening_balance)}
                        </td>
                      </tr>
                    ))}
                    {(!data?.cash_position || data.cash_position.length === 0) && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                          No settlement accounts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                End of Day
              </h2>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <Activity className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Daily Close</p>
                    <p className="text-sm text-muted-foreground">
                      Last run: {data?.health.last_daily_close_date || "Never"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleDailyClose}
                  disabled={closing}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {closing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    "Run Daily Close"
                  )}
                </button>

                {closeResult && (
                  <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
                    {closeResult}
                  </p>
                )}

                <div className="mt-4 border-t pt-4 text-center">
                  <Link
                    href="/admin/finance/daily-close"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    View ledger health <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
