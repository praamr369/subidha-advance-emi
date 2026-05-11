"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import { SetupChecklistPageShell } from "@/components/layout/page-shells";
import PageHeader from "@/components/ui/PageHeader";
import { getAccountingSetupStatus, type AccountingSetupStatusPayload } from "@/services/accounting-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ChartAccountsSetupGuidePage() {
  const [status, setStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAccountingSetupStatus()
      .then((payload) => {
        if (!mounted) return;
        setStatus(payload);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load accounting setup status.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const chartActiveTotal = toNumber(status?.chart_accounts_active);
  const chartRootsAll = toNumber(status?.chart_accounts_root);
  const chartChildrenActive = toNumber(status?.chart_accounts_active_child);
  const chartChildrenAll = toNumber(status?.chart_accounts_child);
  const mappingsLine =
    status?.required_mappings_complete != null && status?.required_mappings_total != null
      ? `${status.required_mappings_complete} of ${status.required_mappings_total} required mapping purposes covered`
      : "—";
  const journalLine = status?.journal_ready ? "Journal posting prerequisites satisfied" : "Journal posting blocked — see Accounting setup";

  return (
    <SetupChecklistPageShell
      readiness={
        <>
          <PageHeader
            title="Chart accounts"
            description="Chart accounts live under the Accounting module. This setup page is a guide so the first-run flow does not duplicate accounting masters."
          />
          {!error && status ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-medium text-muted-foreground">Active chart accounts</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{chartActiveTotal}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Total {toNumber(status.chart_accounts_total)} · Roots {chartRootsAll}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-medium text-muted-foreground">Active child chart accounts</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{chartChildrenActive}</div>
                <div className="mt-2 text-xs text-muted-foreground">All child rows (incl. inactive): {chartChildrenAll}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:col-span-3">
                <div className="text-xs font-medium text-muted-foreground">Mappings and journal readiness</div>
                <div className="mt-1 text-sm text-foreground">{mappingsLine}</div>
                <div className="mt-1 text-xs text-muted-foreground">{journalLine}</div>
              </div>
            </div>
          ) : null}
        </>
      }
      blockers={
        error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null
      }
      actions={<BusinessSetupLinks />}
      checklist={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/accounting/chart-of-accounts"
            className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Open Chart of Accounts
          </Link>
          <Link
            href="/admin/accounting/setup"
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
          >
            Accounting setup
          </Link>
          <Link
            href="/admin/accounting/books"
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground"
          >
            Open Books
          </Link>
        </div>
      }
      evidence={
        <p className="text-sm text-muted-foreground">
          Configure chart accounts first, then finance accounts (cash/bank/UPI). Counts here use the same backend
          accounting setup service as the Chart of Accounts page posture strip — not the visible COA table row count on
          screen.
        </p>
      }
    />
  );
}
