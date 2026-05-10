"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
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
    <div className="space-y-6">
      <PageHeader
        title="Chart accounts"
        description="Chart accounts live under the Accounting module. This setup page is a guide so the first-run flow does not duplicate accounting masters."
      />
      <BusinessSetupLinks />

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Active chart accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{status ? chartActiveTotal : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Chart accounts (total): {status ? toNumber(status.chart_accounts_total) : "—"} · Root chart accounts:{" "}
            {status ? chartRootsAll : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">Child chart accounts</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{status ? chartChildrenActive : "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Active child rows (parent set). All child rows (incl. inactive): {status ? chartChildrenAll : "—"}.
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-3">
          <div className="text-sm font-medium text-muted-foreground">Mappings and journal readiness</div>
          <div className="mt-2 text-sm text-foreground">{status ? mappingsLine : "—"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{status ? journalLine : "—"}</div>
          <div className="mt-3 flex flex-wrap gap-2">
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
          <div className="mt-3 text-sm text-muted-foreground">
            Configure chart accounts first, then finance accounts (cash/bank/UPI). Counts here match the same backend
            service used on the Chart of Accounts KPI band — not the visible table page length.
          </div>
        </div>
      </section>
    </div>
  );
}
