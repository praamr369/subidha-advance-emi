"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import DrawerShell from "@/components/ui/DrawerShell";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchSolopreneurLedgerHealth,
  postSolopreneurDailyClose,
  type LedgerHealthResponse,
  type SolopreneurCloseResponse,
} from "@/services/accounting";
import { financeAccountKeys, reconciliationKeys, paymentsKeys } from "@/lib/query-keys";
import { formatRupee } from "@/lib/utils/currency";
import { ROUTES } from "@/lib/routes";

export const EOD_RECONCILIATION_EVENT = "subidha:open-eod-reconciliation";

/**
 * Dispatch custom event to trigger the 1-Click EOD Reconciliation Drawer from anywhere.
 */
export function openEodReconciliationDrawer() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EOD_RECONCILIATION_EVENT));
  }
}

export default function EodReconciliationDrawer() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [health, setHealth] = useState<LedgerHealthResponse | null>(null);
  const [result, setResult] = useState<SolopreneurCloseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadHealth = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSolopreneurLedgerHealth(forceRefresh);
      setHealth(data);
    } catch (err) {
      console.error("Failed to load ledger health", err);
      setError(err instanceof Error ? err.message : "Failed to load ledger health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setShowConfirm(false);
      setResult(null);
      void loadHealth(false);
    };

    window.addEventListener(EOD_RECONCILIATION_EVENT, handleOpen);
    return () => {
      window.removeEventListener(EOD_RECONCILIATION_EVENT, handleOpen);
    };
  }, [loadHealth]);

  const handlePost = async () => {
    setShowConfirm(false);
    try {
      setPosting(true);
      setError(null);
      const res = await postSolopreneurDailyClose();
      setResult(res);
      await loadHealth(true);
      // Synchronize all financial and operational views across the application
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounting"] }),
        queryClient.invalidateQueries({ queryKey: financeAccountKeys.all }),
        queryClient.invalidateQueries({ queryKey: reconciliationKeys.root }),
        queryClient.invalidateQueries({ queryKey: paymentsKeys.root }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
      ]);
    } catch (err) {
      console.error("Failed to post daily close", err);
      setError(err instanceof Error ? err.message : "Failed to run daily close.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={() => setOpen(false)}
      title="1-Click Solopreneur EOD Reconciliation"
      description="Audit ledger trial balance, verify double-entry health, and instantly post pending collections & sales bridges."
      size="default"
      footer={
        <div className="flex items-center justify-between w-full">
          <Link
            href={ROUTES.admin.financeDailyClose}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition"
          >
            <span>Open Full Daily Close &amp; Audit</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-6 py-2">
        {/* Ledger Integrity Card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Ledger Trial Balance</h3>
            </div>
            <button
              type="button"
              disabled={loading || posting}
              onClick={() => void loadHealth(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Refresh ledger health"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-2 py-3">
              <div className="h-8 bg-muted rounded-lg w-full" />
              <div className="h-12 bg-muted rounded-lg w-full" />
            </div>
          ) : health ? (
            <div className="space-y-3">
              <div
                className={`flex items-center justify-between rounded-lg p-3 border ${
                  health.is_balanced
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                    : "bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {health.is_balanced ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <span className="text-xs font-semibold">
                    {health.is_balanced ? "Trial Balance is in Perfect Equilibrium" : "Trial Balance Imbalance Detected"}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold">
                  Diff: {formatRupee(health.difference)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground">Total Debits</span>
                  <div className="font-mono font-semibold text-sm mt-0.5">
                    {formatRupee(health.total_debit)}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <span className="text-muted-foreground">Total Credits</span>
                  <div className="font-mono font-semibold text-sm mt-0.5">
                    {formatRupee(health.total_credit)}
                  </div>
                </div>
              </div>

              {health.checks && health.checks.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Automated System Checks</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {health.checks.map((chk) => (
                      <div
                        key={chk.key}
                        className="flex items-center justify-between rounded border bg-background/50 px-2 py-1 text-[11px]"
                      >
                        <span className="truncate text-muted-foreground font-mono">{chk.key}</span>
                        <span
                          className={`font-semibold ml-1.5 ${
                            chk.passed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {chk.passed ? "PASS" : "WARN"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2">No health diagnostic available.</p>
          )}
        </div>

        {/* 1-Click Action Card */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">End of Day Ledger Posting</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Executes all pending bridges (EMI collections, counter retail sales, stock adjustments, vendor bills) into official journal entries.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div
              className={`rounded-lg border p-3.5 space-y-2 ${
                result.status === "SUCCESS"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold">
                  EOD Posting Status: {result.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-background/70 p-2 text-center">
                  <div className="text-muted-foreground text-[10px]">Processed</div>
                  <div className="font-semibold text-base">{result.processed}</div>
                </div>
                <div className="rounded bg-background/70 p-2 text-center">
                  <div className="text-muted-foreground text-[10px]">Errors</div>
                  <div className="font-semibold text-base">{result.errors}</div>
                </div>
              </div>
            </div>
          )}

          <div>
            {!showConfirm ? (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={loading || posting}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition active:scale-[0.99] cursor-pointer"
              >
                <Zap className="h-4 w-4" />
                <span>{posting ? "Executing Double-Entry Bridges..." : "1-Click Post All & Close Day"}</span>
              </button>
            ) : (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-3">
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  Are you sure? This will lock pending records and commit double-entry journals to the general ledger.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePost()}
                    className="flex-1 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
                  >
                    Confirm &amp; Commit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!showConfirm && (
              <p className="text-[11px] text-center text-muted-foreground mt-2">
                Append-only and strictly auditable under Solopreneur ERP controls.
              </p>
            )}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

