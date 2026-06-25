"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import { SetupChecklistPageShell } from "@/components/layout/page-shells";
import PageHeader from "@/components/ui/PageHeader";
import { listChartOfAccounts, type ChartOfAccount } from "@/services/accounting";
import { getAccountingSetupStatus, type AccountingSetupStatusPayload } from "@/services/accounting-setup";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function badgeClass(tone: "green" | "amber" | "red" | "blue" | "slate") {
  const map = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return `inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${map[tone]}`;
}

export default function ChartAccountsSetupGuidePage() {
  const [status, setStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadPage() {
    try {
      setLoading(true);
      const [setupPayload, accountPayload] = await Promise.all([
        getAccountingSetupStatus(),
        listChartOfAccounts({ is_active: 1, page_size: 100 }),
      ]);
      setStatus(setupPayload);
      setAccounts(accountPayload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting setup status.");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  const chartActiveTotal = toNumber(status?.chart_accounts_active || accounts.length);
  const chartRootsAll = toNumber(status?.chart_accounts_root || accounts.filter((row) => !row.parent).length);
  const chartChildrenActive = toNumber(status?.chart_accounts_active_child || accounts.filter((row) => row.parent).length);
  const chartChildrenAll = toNumber(status?.chart_accounts_child || chartChildrenActive);
  const mappingsLine = status?.required_mappings_complete != null && status?.required_mappings_total != null ? `${status.required_mappings_complete} of ${status.required_mappings_total} required mapping purposes covered` : "—";
  const journalLine = status?.journal_ready ? "Journal posting prerequisites satisfied" : "Journal posting blocked — see Accounting setup";
  const typeCounts = useMemo(() => {
    return accounts.reduce<Record<string, number>>((acc, account) => {
      acc[account.account_type] = (acc[account.account_type] || 0) + 1;
      return acc;
    }, {});
  }, [accounts]);
  const postingLeafCount = accounts.filter((row) => row.is_active && row.allow_manual_posting).length;
  const controlCount = accounts.filter((row) => row.is_active && !row.allow_manual_posting).length;

  return (
    <SetupChecklistPageShell
      readiness={
        <>
          <PageHeader title="Chart accounts" description="Chart accounts live under the Accounting module. This setup page shows readiness and guides first-run setup without duplicating accounting masters." />
          {!error && status ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">Active chart accounts</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{chartActiveTotal}</div><div className="mt-2 text-xs text-muted-foreground">Total {toNumber(status.chart_accounts_total)} · Roots {chartRootsAll}</div></div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">Active child chart accounts</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{chartChildrenActive}</div><div className="mt-2 text-xs text-muted-foreground">All child rows incl. inactive: {chartChildrenAll}</div></div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">Posting leaf accounts</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{postingLeafCount}</div><div className="mt-2 text-xs text-muted-foreground">Manual/system posting-ready ledgers.</div></div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs font-medium text-muted-foreground">Control/group accounts</div><div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{controlCount}</div><div className="mt-2 text-xs text-muted-foreground">Non-posting grouping/control rows.</div></div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:col-span-4"><div className="text-xs font-medium text-muted-foreground">Mappings and journal readiness</div><div className="mt-1 text-sm text-foreground">{mappingsLine}</div><div className="mt-1 text-xs text-muted-foreground">{journalLine}</div></div>
            </div>
          ) : null}
        </>
      }
      blockers={error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      actions={<BusinessSetupLinks />}
      checklist={
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/accounting/chart-of-accounts" className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Open Chart of Accounts</Link>
            <Link href="/admin/accounting/setup" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">Accounting setup</Link>
            <Link href="/admin/accounting/books" className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">Open Books</Link>
            <button type="button" onClick={() => void loadPage()} className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground">Refresh</button>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].map((type) => (
              <div key={type} className="rounded-xl border border-border bg-card p-3 text-sm"><div className="text-xs font-semibold text-muted-foreground">{type}</div><div className="mt-1 text-lg font-semibold text-foreground">{typeCounts[type] || 0}</div></div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            <div className="font-semibold text-foreground">Active register preview</div>
            <p className="mt-1 text-muted-foreground">Showing up to 100 active accounts from the canonical accounting API.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {accounts.slice(0, 12).map((account) => (
                <div key={account.id} className="rounded-lg border border-border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{account.code}</strong><span className={badgeClass(account.allow_manual_posting ? "green" : "slate")}>{account.allow_manual_posting ? "Posting" : "Control"}</span></div><div className="mt-1 text-xs text-muted-foreground">{account.name} · {account.account_type}</div></div>
              ))}
              {!loading && accounts.length === 0 ? <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No active chart account rows returned.</div> : null}
            </div>
          </div>
        </div>
      }
      evidence={<p className="text-sm text-muted-foreground">Configure chart accounts first, then finance accounts. Finance accounts must map to active ASSET chart accounts; income, liability, inventory, and expense accounts remain ledger-only posting destinations.</p>}
    />
  );
}
