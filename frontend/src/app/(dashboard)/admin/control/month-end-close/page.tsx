"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  getMonthEndReadiness,
  executeMonthEndClose,
  getMonthEndHistory,
  type MonthEndReadiness,
  type MonthEndCloseRun,
  type CloseCheckResult,
} from "@/services/control-enterprise";

const SEVERITY_CLASS: Record<string, string> = {
  BLOCKING: "text-destructive font-semibold",
  WARNING: "text-yellow-600",
  INFO: "text-muted-foreground",
};

function CheckRow({ check }: { check: CloseCheckResult }) {
  return (
    <tr className="hover:bg-[var(--surface-muted)]">
      <td className="px-4 py-2 font-mono text-xs">{check.check_key}</td>
      <td className={`px-4 py-2 text-xs ${SEVERITY_CLASS[check.severity] ?? ""}`}>{check.severity}</td>
      <td className="px-4 py-2">
        <span className={check.passed ? "text-green-600 font-semibold" : "text-destructive font-semibold"}>
          {check.passed ? "Pass" : "Fail"}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">{check.count > 0 ? check.count : "—"}</td>
      <td className="px-4 py-2 text-xs">{check.detail}</td>
    </tr>
  );
}

export default function AdminControlMonthEndClosePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [readiness, setReadiness] = useState<MonthEndReadiness | null>(null);
  const [history, setHistory] = useState<MonthEndCloseRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<MonthEndCloseRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setExecuteResult(null);
    setExecuteError(null);
    try {
      const [r, h] = await Promise.all([getMonthEndReadiness(year, month), getMonthEndHistory()]);
      setReadiness(r);
      setHistory(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load month-end close data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleExecute(isDryRun: boolean) {
    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);
    try {
      const result = await executeMonthEndClose({ year, month, is_dry_run: isDryRun });
      setExecuteResult(result);
      void load();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : "Execute failed.");
    } finally {
      setExecuting(false);
    }
  }

  const canExecute = readiness?.can_execute ?? false;
  const isBlocked = !canExecute;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <PortalPage
      eyebrow="Enterprise Control"
      title="Month-End Close"
      subtitle="Run readiness checks, dry-run, or execute the month-end close for a period. No financial records are mutated."
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.controlRoot, label: "Control Desk" },
        { label: "Month-End Close" },
      ]}
    >
      {/* Period selector */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Year
          <input
            type="number"
            className="w-24 rounded border border-border bg-background px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2099}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Month
          <select
            className="w-28 rounded border border-border bg-background px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <LoadingBlock />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && (
        <div className="flex flex-col gap-8">
          {/* Readiness panel */}
          {readiness && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Readiness for {MONTHS[month - 1]} {year} —{" "}
                  <span className={canExecute ? "text-green-600" : "text-destructive"}>
                    {canExecute ? "Ready to execute" : `${readiness.blocking_count} blocking check(s) failed`}
                  </span>
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleExecute(true)}
                    disabled={executing}
                    className="rounded border border-border bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-[var(--surface-muted)]"
                  >
                    {executing ? "Running…" : "Dry Run"}
                  </button>
                  <button
                    onClick={() => void handleExecute(false)}
                    disabled={executing || isBlocked}
                    title={isBlocked ? "Cannot execute: blocking checks failed" : "Execute month-end close"}
                    className="rounded border border-primary/85 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[color-mix(in_oklab,var(--primary)_88%,black_12%)]"
                  >
                    {executing ? "Executing…" : "Execute Close"}
                  </button>
                </div>
              </div>

              {executeError && (
                <p className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {executeError}
                </p>
              )}

              {executeResult && (
                <p className="mb-3 rounded border border-green-600/30 bg-green-600/10 px-4 py-2 text-sm text-green-700">
                  {executeResult.is_dry_run ? "Dry run" : "Execute"} completed — status:{" "}
                  <strong>{executeResult.status}</strong>
                </p>
              )}

              {readiness.checks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checks to display.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Check</th>
                        <th className="px-4 py-2">Severity</th>
                        <th className="px-4 py-2">Result</th>
                        <th className="px-4 py-2">Count</th>
                        <th className="px-4 py-2">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {readiness.checks.map((c) => (
                        <CheckRow key={c.check_key} check={c} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* History */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Close History</h2>
            {history.length === 0 ? (
              <EmptyState title="No history" description="No month-end close runs recorded yet." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Run By</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Run At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((run) => (
                      <tr key={run.id} className="hover:bg-[var(--surface-muted)]">
                        <td className="px-4 py-3 font-mono text-xs">
                          {MONTHS[run.period_month - 1]} {run.period_year}
                        </td>
                        <td className="px-4 py-3">{run.branch_name ?? "All"}</td>
                        <td className="px-4 py-3">{run.run_by_username}</td>
                        <td className="px-4 py-3">{run.is_dry_run ? "Dry Run" : "Execute"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              run.status === "EXECUTED"
                                ? "text-green-600 font-semibold"
                                : run.status === "BLOCKED"
                                  ? "text-destructive font-semibold"
                                  : "text-muted-foreground"
                            }
                          >
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(run.run_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </PortalPage>
  );
}
