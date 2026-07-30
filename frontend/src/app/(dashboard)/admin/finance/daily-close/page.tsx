"use client";

import React, { useState, useEffect } from "react";
import { fetchSolopreneurLedgerHealth, postSolopreneurDailyClose, type LedgerHealthResponse, type SolopreneurCloseResponse } from "@/services/accounting";
import { Activity, CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ErrorState from "@/components/feedback/ErrorState";
import EnterpriseDailyClosePanel from "@/components/admin/daily-close/EnterpriseDailyClosePanel";
import { ROUTES } from "@/lib/routes";

type DailyCloseTab = "solo" | "enterprise";

const DAILY_CLOSE_TABS: Array<{ id: DailyCloseTab; label: string }> = [
  { id: "solo", label: "Solopreneur Close" },
  { id: "enterprise", label: "Enterprise Readiness & History" },
];

export default function SolopreneurDailyClosePage() {
  const [tab, setTab] = useState<DailyCloseTab>("solo");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [health, setHealth] = useState<LedgerHealthResponse | null>(null);
  const [result, setResult] = useState<SolopreneurCloseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    void loadHealth();
  }, []);

  const loadHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSolopreneurLedgerHealth();
      setHealth(data);
    } catch (err) {
      console.error("Failed to load ledger health", err);
      setError(err instanceof Error ? err.message : "Failed to load ledger health.");
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    setShowConfirm(false);
    try {
      setPosting(true);
      setError(null);
      const res = await postSolopreneurDailyClose();
      setResult(res);
      // Reload health after posting
      await loadHealth();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to run daily close. Check console for details.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Solopreneur Daily Close"
      subtitle="One-click financial closure. Instantly post all pending collections, sales, inventory, and commissions."
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.finance, label: "Finance Workspace" },
        { label: "Daily Close" },
      ]}
      statusBadge={
        result 
          ? { label: result.status, tone: result.status === "SUCCESS" ? "success" : "warning" }
          : undefined
      }
    >
      <div className="space-y-6">
        {/* Tab switcher — solopreneur one-click close + enterprise readiness (additive merge) */}
        <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted p-1">
          {DAILY_CLOSE_TABS.map((t) => (
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

        {tab === "enterprise" ? <EnterpriseDailyClosePanel /> : null}

        {tab === "solo" ? (
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column: Action & Status */}
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">End of Day Close</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Run the unified bridge to finalize all daily operations.
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
            </div>

            <div className="mt-8">
              {!showConfirm ? (
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={loading || posting}
                  className="w-full rounded-lg bg-primary px-4 py-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {posting ? "Posting to Ledger..." : "Post All & Close Day"}
                </button>
              ) : (
                <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
                  <p className="text-sm font-medium text-warning-foreground mb-4">
                    Are you sure you want to post all pending collections, direct sales, and adjustments to the permanent ledger? This will lock pending records and commit double-entry journals.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handlePost}
                      className="flex-1 rounded-md bg-warning px-3 py-2 text-sm font-semibold text-warning-foreground hover:bg-warning/90"
                    >
                      Confirm Post
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!showConfirm && (
                <p className="text-xs text-center text-muted-foreground mt-3">
                  This will lock pending records and commit double-entry journals.
                </p>
              )}
            </div>
          </div>

          {error && <ErrorState message={error} onRetry={() => void loadHealth()} />}

          {result && (
            <div className={`rounded-xl border p-6 shadow-sm ${result.status === "SUCCESS" ? "bg-green-500/10 border-green-500/20" : "bg-yellow-500/10 border-yellow-500/20"}`}>
              <div className="flex items-center gap-3">
                {result.status === "SUCCESS" ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                )}
                <h3 className={`font-semibold ${result.status === "SUCCESS" ? "text-green-800 dark:text-green-300" : "text-yellow-800 dark:text-yellow-300"}`}>
                  Close Result: {result.status}
                </h3>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-md bg-background/60 p-3">
                  <div className="text-muted-foreground">Processed</div>
                  <div className="font-medium text-lg mt-1">{result.processed} records</div>
                </div>
                <div className="rounded-md bg-background/60 p-3">
                  <div className="text-muted-foreground">Errors</div>
                  <div className="font-medium text-lg mt-1">{result.errors} errors</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Ledger Health */}
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm h-full">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">Ledger Health Monitor</h2>
            </div>

            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-10 bg-muted rounded"></div>
                <div className="h-24 bg-muted rounded"></div>
              </div>
            ) : health ? (
              <div className="space-y-6">
                <div className={`flex items-center justify-between rounded-lg p-4 border ${health.is_balanced ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                  <div>
                    <div className={`font-medium ${health.is_balanced ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
                      Trial Balance Integrity
                    </div>
                    <div className={`text-sm mt-1 ${health.is_balanced ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {health.is_balanced ? "Balanced and healthy." : "Imbalance detected!"}
                    </div>
                  </div>
                  {health.is_balanced ? (
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Debit</div>
                    <div className="mt-2 text-xl font-semibold tracking-tight text-foreground">₹{health.total_debit}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Credit</div>
                    <div className="mt-2 text-xl font-semibold tracking-tight text-foreground">₹{health.total_credit}</div>
                  </div>
                </div>

                {health.checks && health.checks.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-medium text-foreground mb-3">Diagnostic Checks</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {health.checks.map((check, idx) => {
                        const passed = check.status === "OK" || check.status === "INFO" || check.passed;
                        return (
                          <div key={idx} className="flex justify-between items-center text-sm p-2 rounded hover:bg-muted/50">
                            <span className="text-muted-foreground">{check.key}</span>
                            <span className={`font-medium ${passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {passed ? "Passed" : `Failed (${check.count})`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Could not load ledger health.
              </div>
            )}
          </div>
        </div>
      </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
