"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import ChartAccountCreateDrawer from "@/components/accounting/ChartAccountCreateDrawer";
import ChartAccountEditDrawer from "@/components/accounting/ChartAccountEditDrawer";
import {
  AccountingNotice,
  accountingErrorMessage,
} from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  listChartOfAccounts,
  type ChartOfAccount,
  type ChartOfAccountDetail,
} from "@/services/accounting";
import { getAccountingSetupStatus, type AccountingSetupStatusPayload } from "@/services/accounting-setup";

function pillClassName(tone: "default" | "success" | "warning" | "info" = "default") {
  const base = "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]";
  if (tone === "success") return cn(base, "chip-tone-success");
  if (tone === "warning") return cn(base, "chip-tone-warning");
  if (tone === "info") return cn(base, "chip-tone-info");
  return cn(base, "border border-border bg-[var(--surface-card-elevated)] text-muted-foreground shadow-[var(--badge-inset-highlight)]");
}

function payloadNumber(payload: AccountingSetupStatusPayload | null, key: string, fallback: number): number {
  const value = payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export default function AccountingChartOfAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [setupStatus, setSetupStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [setupStatusWarning, setSetupStatusWarning] = useState<string | null>(null);
  const [selectedChartAccountId, setSelectedChartAccountId] = useState<number | null>(null);
  const [createChartOpen, setCreateChartOpen] = useState(false);
  const [chartTypeFilter, setChartTypeFilter] = useState("ALL");
  const [chartStatusFilter, setChartStatusFilter] = useState("ALL");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [chartResult, statusResult] = await Promise.allSettled([
        listChartOfAccounts({ page_size: 500 }),
        getAccountingSetupStatus(),
      ]);
      if (chartResult.status === "rejected") throw chartResult.reason;
      setChartAccounts(chartResult.value.results ?? []);
      if (statusResult.status === "fulfilled") {
        setSetupStatus(statusResult.value);
        setSetupStatusWarning(null);
      } else {
        setSetupStatus(null);
        setSetupStatusWarning(accountingErrorMessage(statusResult.reason, "Accounting setup posture could not be loaded."));
      }
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load chart of accounts."));
      if (mode === "initial") {
        setChartAccounts([]);
        setSetupStatus(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const filteredChartAccounts = useMemo(() => {
    return chartAccounts.filter((account) => {
      const matchesType = chartTypeFilter === "ALL" || account.account_type === chartTypeFilter;
      const matchesStatus = chartStatusFilter === "ALL" || (chartStatusFilter === "ACTIVE" ? account.is_active : !account.is_active);
      return matchesType && matchesStatus;
    });
  }, [chartAccounts, chartStatusFilter, chartTypeFilter]);

  const counts = useMemo(() => {
    const active = chartAccounts.filter((account) => account.is_active).length;
    const legacy = chartAccounts.filter((account) => account.is_legacy).length;
    const system = chartAccounts.filter((account) => Boolean(account.system_code)).length;
    return { active, legacy, system, total: chartAccounts.length };
  }, [chartAccounts]);

  const requiredMappingsComplete = payloadNumber(setupStatus, "required_mappings_complete", NaN);
  const requiredMappingsTotal = payloadNumber(setupStatus, "required_mappings_total", NaN);
  const mappingsLabel = Number.isFinite(requiredMappingsComplete) && Number.isFinite(requiredMappingsTotal) ? `${requiredMappingsComplete}/${requiredMappingsTotal}` : "—";

  const chartColumns: EnterpriseColumnDef<ChartOfAccount>[] = [
    { key: "code", header: "Code" },
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div className="space-y-1">
          <div className="font-semibold text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.parent_code ? `Parent ${row.parent_code}` : "Root account"}</div>
          <div className="flex flex-wrap gap-2">
            {row.system_code ? <span className={pillClassName("info")}>System</span> : null}
            {row.is_legacy ? <span className={pillClassName("warning")}>Legacy</span> : null}
            {!row.allow_manual_posting ? <span className={pillClassName("warning")}>Manual locked</span> : null}
            {!row.is_active ? <span className={pillClassName("default")}>Inactive</span> : null}
          </div>
          {row.is_legacy ? <div className="text-[11px] text-muted-foreground">{row.legacy_reason || "Legacy compatibility account."}</div> : null}
        </div>
      ),
    },
    {
      key: "system_code",
      header: "System code",
      render: (row) => <span className="text-xs text-muted-foreground">{row.system_code || "—"}</span>,
    },
    {
      key: "account_type",
      header: "Type",
      render: (row) => <span className={pillClassName("info")}>{row.account_type}</span>,
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => row.is_active ? <span className={pillClassName("success")}>Active</span> : <span className={pillClassName()}>Inactive</span>,
    },
    {
      key: "manual_posting",
      header: "Manual posting",
      searchable: false,
      render: (row) => row.allow_manual_posting ? <span className={pillClassName("success")}>Unlocked</span> : <span className={pillClassName("warning")}>Locked</span>,
    },
    {
      key: "actions",
      header: "Actions",
      searchable: false,
      render: (row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedChartAccountId(row.id);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <PortalPage
      eyebrow="Accounting Master Control"
      title="Chart of Accounts"
      subtitle="Ledger structure only: ASSET, LIABILITY, EQUITY, INCOME, and EXPENSE accounts used by all posting profiles and reports. Finance instruments now live in the dedicated Finance Accounts page."
      helperNote="This page does not create finance accounts and does not post accounting entries. Use Finance Accounts for cash, bank, UPI, and payment gateway settlement instruments."
      helperTone="info"
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Chart of Accounts" }]}
      actions={[{ href: ROUTES.admin.accountingFinanceAccounts, label: "Finance Accounts", variant: "primary" }, { href: ROUTES.admin.accountingSetup, label: "Setup Matrix", variant: "secondary" }, { href: ROUTES.admin.settingsImports, label: "Imports", variant: "secondary" }]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total COA</p><p className="mt-2 text-lg font-semibold text-foreground">{counts.total}</p></div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</p><p className="mt-2 text-lg font-semibold text-foreground">{counts.active}</p></div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System-coded</p><p className="mt-2 text-lg font-semibold text-foreground">{counts.system}</p></div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required mappings</p><p className="mt-2 text-lg font-semibold text-foreground">{mappingsLabel}</p></div>
        </div>

        {notice ? <AccountingNotice tone="success" message={notice} /> : null}
        {setupStatusWarning ? <AccountingNotice tone="warning" message={setupStatusWarning} /> : null}

        <WorkspaceSection title="Operating split" description="Keep structural ledger accounts separate from real settlement instruments.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="font-semibold text-foreground">Chart of Accounts</div>
              <p className="mt-1 text-muted-foreground">Defines financial classification: assets, liabilities, equity, income, and expenses. Used by subscriptions, direct sale, rent/lease, purchase, payroll, inventory, reports, and bridge posting profiles.</p>
            </div>
            <Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-2xl border border-border bg-card p-4 text-sm transition hover:bg-muted">
              <div className="font-semibold text-foreground">Finance Accounts</div>
              <p className="mt-1 text-muted-foreground">Manage cash drawer, bank, UPI, and payment gateway settlement accounts. Each finance account must map to active ASSET COA.</p>
            </Link>
          </div>
        </WorkspaceSection>

        <WorkspaceSection title="Chart account register" description="Search by code or name, filter by type/status, and open a safe edit drawer with server-backed lock reasons.">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground" value={chartTypeFilter} onChange={(event) => setChartTypeFilter(event.target.value)}>
                <option value="ALL">All types</option>
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="EQUITY">Equity</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
              <select className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground" value={chartStatusFilter} onChange={(event) => setChartStatusFilter(event.target.value)}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCreateChartOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/80 bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[color-mix(in_oklab,var(--primary)_90%,black_10%)]"><Plus className="h-4 w-4" />Create chart account</button>
              <button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
            </div>
          </div>

          {loading ? <LoadingBlock label="Loading chart of accounts..." /> : null}
          {!loading && error ? <ErrorState title="Unable to load chart of accounts" description={error} onRetry={() => void loadPage("initial")} /> : null}
          {!loading && !error ? (
            <EnterpriseDataTable
              title="COA register"
              subtitle={`Showing ${filteredChartAccounts.length} of ${chartAccounts.length} loaded chart accounts. Finance accounts are managed separately.`}
              data={filteredChartAccounts}
              columns={chartColumns}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedChartAccountId(row.id)}
              globalFilterPlaceholder="Search chart accounts by code or name..."
              emptyTitle="No chart accounts found"
              emptyDescription="Adjust the current filters or create a chart account."
            />
          ) : null}
        </WorkspaceSection>
      </div>

      <ChartAccountCreateDrawer
        open={createChartOpen}
        chartAccounts={chartAccounts}
        onClose={() => setCreateChartOpen(false)}
        onCreated={async (account) => {
          setNotice(`Chart account ${account.code} created.`);
          setError(null);
          await loadPage("refresh");
        }}
      />

      <ChartAccountEditDrawer
        open={selectedChartAccountId !== null}
        accountId={selectedChartAccountId}
        chartAccounts={chartAccounts}
        onClose={() => setSelectedChartAccountId(null)}
        onSaved={async (account: ChartAccountDetail) => {
          setNotice(`Chart account ${account.code} updated.`);
          await loadPage("refresh");
        }}
      />
    </PortalPage>
  );
}
