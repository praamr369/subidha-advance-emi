"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ChartAccountCreateDrawer from "@/components/accounting/ChartAccountCreateDrawer";
import ChartAccountEditDrawer from "@/components/accounting/ChartAccountEditDrawer";
import { AccountingNotice, accountingErrorMessage } from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listChartOfAccounts, type ChartOfAccount, type ChartOfAccountDetail } from "@/services/accounting";
import { getAccountingSetupStatus, type AccountingSetupStatusPayload } from "@/services/accounting-setup";

function pill(tone: "success" | "warning" | "info" | "muted" = "muted") {
  const base = "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide";
  if (tone === "success") return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
  if (tone === "warning") return `${base} border-amber-200 bg-amber-50 text-amber-900`;
  if (tone === "info") return `${base} border-blue-200 bg-blue-50 text-blue-800`;
  return `${base} border-border bg-muted text-muted-foreground`;
}

function metric(payload: AccountingSetupStatusPayload | null, key: string, fallback: string) {
  const value = (payload as Record<string, unknown> | null)?.[key];
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export default function AccountingChartOfAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [setupStatus, setSetupStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [selectedChartAccountId, setSelectedChartAccountId] = useState<number | null>(null);
  const [createChartOpen, setCreateChartOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function loadPage() {
    setLoading(true);
    try {
      const [chartResult, statusResult] = await Promise.allSettled([
        listChartOfAccounts({ page_size: 500 }),
        getAccountingSetupStatus(),
      ]);
      if (chartResult.status === "rejected") throw chartResult.reason;
      setChartAccounts(chartResult.value.results ?? []);
      setSetupStatus(statusResult.status === "fulfilled" ? statusResult.value : null);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load chart of accounts."));
      setChartAccounts([]);
      setSetupStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPage(); }, []);

  const filtered = useMemo(() => chartAccounts.filter((row) => {
    const typeMatch = typeFilter === "ALL" || row.account_type === typeFilter;
    const statusMatch = statusFilter === "ALL" || (statusFilter === "ACTIVE" ? row.is_active : !row.is_active);
    return typeMatch && statusMatch;
  }), [chartAccounts, statusFilter, typeFilter]);

  const counts = useMemo(() => ({
    total: chartAccounts.length,
    active: chartAccounts.filter((row) => row.is_active).length,
    system: chartAccounts.filter((row) => Boolean(row.system_code)).length,
    legacy: chartAccounts.filter((row) => Boolean(row.is_legacy)).length,
  }), [chartAccounts]);

  const columns: EnterpriseColumnDef<ChartOfAccount>[] = [
    { key: "code", header: "Code" },
    { key: "name", header: "Account", render: (row) => <div><div className="font-semibold text-foreground">{row.name}</div><div className="text-xs text-muted-foreground">{row.parent_code ? `Parent ${row.parent_code}` : "Root account"}</div></div> },
    { key: "system_code", header: "System code", render: (row) => <span className="text-xs text-muted-foreground">{row.system_code || "—"}</span> },
    { key: "account_type", header: "Type", render: (row) => <span className={pill("info")}>{row.account_type}</span> },
    { key: "is_active", header: "Status", render: (row) => row.is_active ? <span className={pill("success")}>Active</span> : <span className={pill()}>Inactive</span> },
    { key: "allow_manual_posting", header: "Manual", searchable: false, render: (row) => row.allow_manual_posting ? <span className={pill("success")}>Unlocked</span> : <span className={pill("warning")}>Locked</span> },
    { key: "actions", header: "Actions", searchable: false, render: (row) => <button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={(event) => { event.stopPropagation(); setSelectedChartAccountId(row.id); }}>Edit</button> },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting Master Control"
      title="Chart of Accounts"
      subtitle="COA-only workspace for ledger structure. Finance instruments now live in the dedicated Finance Accounts page."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Chart of Accounts" }]}
      actions={[{ href: ROUTES.admin.accountingFinanceAccounts, label: "Finance Accounts", variant: "primary" }, { href: ROUTES.admin.accountingSetup, label: "Setup Matrix", variant: "secondary" }]}
      stats={[{ label: "Total COA", value: String(counts.total), tone: "info" }, { label: "Active", value: String(counts.active), tone: "success" }, { label: "System-coded", value: String(counts.system), tone: "info" }, { label: "Required mappings", value: `${metric(setupStatus, "required_mappings_complete", "—")}/${metric(setupStatus, "required_mappings_total", "—")}`, tone: "warning" }]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {notice ? <AccountingNotice tone="success" message={notice} /> : null}
        {loading ? <ERPLoadingState label="Loading chart of accounts..." /> : null}
        {error ? <ERPErrorState title="Unable to load chart of accounts" description={error} onRetry={() => void loadPage()} /> : null}

        <ERPSectionShell title="Operating split" description="COA is financial classification; Finance Accounts are real settlement instruments.">
          <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border bg-card p-4 text-sm"><div className="font-semibold">Chart of Accounts</div><p className="mt-1 text-muted-foreground">ASSET, LIABILITY, EQUITY, INCOME, and EXPENSE accounts used by all modules and reports.</p></div><Link href={ROUTES.admin.accountingFinanceAccounts} className="rounded-xl border bg-card p-4 text-sm transition hover:bg-muted"><div className="font-semibold">Finance Accounts</div><p className="mt-1 text-muted-foreground">Cash, bank, UPI, and payment gateway settlement accounts mapped to active ASSET COA.</p></Link></div>
        </ERPSectionShell>

        <ERPSectionShell title="Chart account register" description="Filter by type/status, then open safe server-backed edit controls.">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><select className="rounded-xl border px-3 py-2 text-sm" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All types</option><option value="ASSET">Asset</option><option value="LIABILITY">Liability</option><option value="EQUITY">Equity</option><option value="INCOME">Income</option><option value="EXPENSE">Expense</option></select><select className="rounded-xl border px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div><button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => setCreateChartOpen(true)}>Create chart account</button></div>
          {!loading && !error ? <EnterpriseDataTable title="COA register" subtitle={`Showing ${filtered.length} of ${chartAccounts.length} chart accounts. Finance accounts are managed separately.`} data={filtered} columns={columns} rowKey={(row) => row.id} onRowClick={(row) => setSelectedChartAccountId(row.id)} globalFilterPlaceholder="Search chart accounts..." emptyTitle="No chart accounts found" emptyDescription="Adjust filters or create a chart account." /> : null}
        </ERPSectionShell>
      </div>
      <ChartAccountCreateDrawer open={createChartOpen} chartAccounts={chartAccounts} onClose={() => setCreateChartOpen(false)} onCreated={async (account) => { setNotice(`Chart account ${account.code} created.`); await loadPage(); }} />
      <ChartAccountEditDrawer open={selectedChartAccountId !== null} accountId={selectedChartAccountId} chartAccounts={chartAccounts} onClose={() => setSelectedChartAccountId(null)} onSaved={async (account: ChartOfAccountDetail) => { setNotice(`Chart account ${account.code} updated.`); await loadPage(); }} />
    </ERPPageShell>
  );
}
