"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ROUTES } from "@/lib/routes";
import {
  getDailyCloseReadiness,
  getDailyCloseHistory,
  type DailyCloseRun,
  type DailyCloseReadiness,
  type CloseCheckResult,
} from "@/services/control-enterprise";

const SEVERITY_CLASS: Record<string, string> = {
  BLOCKING: "text-destructive font-semibold",
  WARNING: "text-yellow-600",
  INFO: "text-muted-foreground",
};

function CheckRow({ check }: { check: CloseCheckResult }) {
  return (
    <tr className="hover:bg-muted/30">
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

/**
 * Enterprise (multi-user) daily-close readiness checks + close history. Extracted
 * from /admin/control/daily-close so the same workflow renders both on that route
 * and as a tab in the unified Daily Close (/admin/finance/daily-close). Execution
 * happens via the cashier day-close workflow; this is the readiness/history view.
 */
export default function EnterpriseDailyClosePanel() {
  const [readiness, setReadiness] = useState<DailyCloseReadiness | null>(null);
  const [history, setHistory] = useState<DailyCloseRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, h] = await Promise.all([getDailyCloseReadiness(), getDailyCloseHistory()]);
      setReadiness(r);
      setHistory(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load daily close data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Enterprise close (multi-user)</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                This is the multi-user enterprise close readiness view. Single-operator businesses can use the streamlined <a href={ROUTES.admin.financeDailyClose} className="font-semibold underline hover:text-blue-600">Solopreneur Daily Close</a> tab instead.
              </p>
            </div>
          </div>
        </div>
      </div>
      {readiness && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Today&apos;s Readiness —{" "}
            <span className={readiness.can_execute ? "text-green-600" : "text-destructive"}>
              {readiness.can_execute ? "Ready to close" : `${readiness.blocking_count} blocking check(s)`}
            </span>
          </h2>
          {readiness.checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checks to display.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
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

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Close History</h2>
        {history.length === 0 ? (
          <EmptyState title="No history" description="No daily close runs recorded yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Run By</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Run At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((run) => (
                  <tr key={run.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{run.close_date}</td>
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
  );
}
