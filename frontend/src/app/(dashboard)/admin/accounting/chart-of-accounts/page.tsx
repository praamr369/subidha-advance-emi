"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ChartAccountEditDrawer from "@/components/accounting/ChartAccountEditDrawer";
import FinanceAccountEditDrawer from "@/components/accounting/FinanceAccountEditDrawer";
import { ACCOUNTING_REGISTER_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import {
  createChartOfAccount,
  createFinanceAccount,
  listChartOfAccounts,
  listFinanceAccounts,
  type ChartOfAccount,
  type ChartOfAccountDetail,
  type FinanceAccount,
  type FinanceAccountDetail,
} from "@/services/accounting";

function pillClassName(tone: "default" | "success" | "warning" | "info" = "default") {
  if (tone === "success") {
    return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800";
  }
  if (tone === "warning") {
    return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800";
  }
  if (tone === "info") {
    return "inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800";
  }
  return "inline-flex rounded-full border border-border bg-[var(--surface-card-elevated)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
}

export default function AccountingChartOfAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [selectedChartAccountId, setSelectedChartAccountId] = useState<number | null>(null);
  const [selectedFinanceAccountId, setSelectedFinanceAccountId] = useState<number | null>(null);

  const [chartTypeFilter, setChartTypeFilter] = useState("ALL");
  const [chartStatusFilter, setChartStatusFilter] = useState("ALL");
  const [financeKindFilter, setFinanceKindFilter] = useState("ALL");
  const [financeStatusFilter, setFinanceStatusFilter] = useState("ALL");

  const [chartForm, setChartForm] = useState({
    code: "",
    name: "",
    account_type: "ASSET",
    parent: "",
    allow_manual_posting: true,
    system_code: "",
    notes: "",
  });
  const [financeForm, setFinanceForm] = useState({
    name: "",
    kind: "CASH",
    chart_account: "",
    opening_balance: "0.00",
    bank_last4: "",
    upi_handle: "",
    notes: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [chartPayload, financePayload] = await Promise.all([
        listChartOfAccounts({ page_size: 100 }),
        listFinanceAccounts({ page_size: 100 }),
      ]);
      setChartAccounts(chartPayload.results);
      setFinanceAccounts(financePayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load accounting master data."));
      if (mode === "initial") {
        setChartAccounts([]);
        setFinanceAccounts([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateChartAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createChartOfAccount({
        code: chartForm.code || undefined,
        name: chartForm.name,
        account_type: chartForm.account_type as ChartOfAccount["account_type"],
        parent: chartForm.parent ? Number(chartForm.parent) : null,
        allow_manual_posting: chartForm.allow_manual_posting,
        system_code: chartForm.system_code || null,
        notes: chartForm.notes,
      });
      setChartForm({
        code: "",
        name: "",
        account_type: "ASSET",
        parent: "",
        allow_manual_posting: true,
        system_code: "",
        notes: "",
      });
      setNotice("Chart account created.");
      setError(null);
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create chart account."));
    }
  }

  async function handleCreateFinanceAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createFinanceAccount({
        name: financeForm.name,
        kind: financeForm.kind as FinanceAccount["kind"],
        chart_account: Number(financeForm.chart_account),
        opening_balance: financeForm.opening_balance,
        bank_last4: financeForm.bank_last4,
        upi_handle: financeForm.upi_handle,
        notes: financeForm.notes,
      });
      setFinanceForm({
        name: "",
        kind: "CASH",
        chart_account: "",
        opening_balance: "0.00",
        bank_last4: "",
        upi_handle: "",
        notes: "",
      });
      setNotice("Finance account created.");
      setError(null);
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(accountingErrorMessage(err, "Failed to create finance account."));
    }
  }

  const assetChartAccounts = useMemo(
    () => chartAccounts.filter((account) => account.account_type === "ASSET"),
    [chartAccounts]
  );

  const filteredChartAccounts = useMemo(() => {
    return chartAccounts.filter((account) => {
      const matchesType = chartTypeFilter === "ALL" || account.account_type === chartTypeFilter;
      const matchesStatus =
        chartStatusFilter === "ALL" ||
        (chartStatusFilter === "ACTIVE" ? account.is_active : !account.is_active);
      return matchesType && matchesStatus;
    });
  }, [chartAccounts, chartStatusFilter, chartTypeFilter]);

  const chartRowsForStatus = useMemo(() => {
    return chartAccounts.filter((account) => {
      const matchesStatus =
        chartStatusFilter === "ALL" ||
        (chartStatusFilter === "ACTIVE" ? account.is_active : !account.is_active);
      return matchesStatus;
    });
  }, [chartAccounts, chartStatusFilter]);

  const chartHiddenByTypeFilterCount = chartRowsForStatus.length - filteredChartAccounts.length;

  const chartRegisterScopeLabel = useMemo(() => {
    const typeLabel =
      chartTypeFilter === "ALL" ? "All account types" : `${chartTypeFilter} accounts only`;
    const statusLabel =
      chartStatusFilter === "ALL"
        ? "All statuses"
        : chartStatusFilter === "ACTIVE"
          ? "Active only"
          : "Inactive only";
    return `${typeLabel} · ${statusLabel} · Root and child rows (this page)`;
  }, [chartStatusFilter, chartTypeFilter]);

  const filteredFinanceAccounts = useMemo(() => {
    return financeAccounts.filter((account) => {
      const matchesKind = financeKindFilter === "ALL" || account.kind === financeKindFilter;
      const matchesStatus =
        financeStatusFilter === "ALL" ||
        (financeStatusFilter === "ACTIVE" ? account.is_active : !account.is_active);
      return matchesKind && matchesStatus;
    });
  }, [financeAccounts, financeKindFilter, financeStatusFilter]);

  const chartColumns: EnterpriseColumnDef<ChartOfAccount>[] = [
    { key: "code", header: "Code" },
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div className="space-y-1">
          <div className="font-semibold text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.parent_code ? `Parent ${row.parent_code}` : "Root account"}
          </div>
          <div className="flex flex-wrap gap-2">
            {row.system_code ? <span className={pillClassName("info")}>System</span> : null}
            {!row.allow_manual_posting ? <span className={pillClassName("warning")}>Manual locked</span> : null}
            {!row.is_active ? <span className={pillClassName("default")}>Inactive</span> : null}
          </div>
        </div>
      ),
    },
    { key: "account_type", header: "Type" },
    {
      key: "is_active",
      header: "Status",
      render: (row) =>
        row.is_active ? (
          <span className={pillClassName("success")}>Active</span>
        ) : (
          <span className={pillClassName()}>Inactive</span>
        ),
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

  const financeColumns: EnterpriseColumnDef<FinanceAccount>[] = [
    {
      key: "name",
      header: "Account",
      render: (row) => (
        <div className="space-y-1">
          <div className="font-semibold text-foreground">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.branch_code || row.branch_name || "Primary default"}
          </div>
        </div>
      ),
    },
    { key: "kind", header: "Kind" },
    {
      key: "chart_account_code",
      header: "Linked Chart",
      render: (row) => (
        <div className="space-y-1">
          <div className="font-medium text-foreground">{row.chart_account_code || "—"}</div>
          <div className="text-xs text-muted-foreground">{row.chart_account_name || "Unmapped"}</div>
        </div>
      ),
    },
    {
      key: "opening_balance",
      header: "Opening",
      render: (row) => accountingMoney(row.opening_balance),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) =>
        row.is_active ? (
          <span className={pillClassName("success")}>Active</span>
        ) : (
          <span className={pillClassName()}>Inactive</span>
        ),
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
            setSelectedFinanceAccountId(row.id);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  const activeChartAccounts = chartAccounts.filter((account) => account.is_active).length;
  const activeFinanceAccounts = financeAccounts.filter((account) => account.is_active).length;

  return (
    <PortalPage
      eyebrow="Accounting Master Control"
      title="Chart of Accounts"
      subtitle="Create, review, and safely edit accounting masters without weakening posting controls, ledger integrity, or downstream reconciliation."
      helperNote="Chart and finance account setup remain the accounting system of record for posting structure. They do not merge cashier collection, billing execution, or EMI operational truth."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Chart of Accounts" },
      ]}
      actions={[
        { href: ROUTES.admin.accounting, label: "Accounting Overview", variant: "secondary" },
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
        { href: ROUTES.admin.settingsImports, label: "Imports", variant: "primary" },
      ]}
      stats={[
        { label: "Chart Accounts", value: String(chartAccounts.length), tone: "info" },
        { label: "Active Chart", value: String(activeChartAccounts), tone: activeChartAccounts > 0 ? "success" : "default" },
        { label: "Finance Accounts", value: String(financeAccounts.length), tone: "info" },
        { label: "Active Finance", value: String(activeFinanceAccounts), tone: activeFinanceAccounts > 0 ? "success" : "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <AccountingRefreshButton
            loading={loading}
            refreshing={refreshing}
            onClick={() => void loadPage("refresh")}
          />
        </div>

        {notice ? <AccountingNotice tone="success" message={notice} /> : null}
        <WorkspaceDirectory
          title="Accounting control map"
          description="Move between accounting setup, payables, books, and statements without leaving the accounting control family."
          groups={ACCOUNTING_REGISTER_DIRECTORY_GROUPS}
        />
        {loading ? <LoadingBlock label="Loading accounting masters..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load accounting masters"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Create chart account"
                description="Codes, type, parent, and manual-posting posture are still set at creation time. After usage begins, only safe fields remain editable."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateChartAccount}>
                  <label className="text-sm text-muted-foreground">
                    Code
                    <input
                      className={accountingFieldClassName()}
                      value={chartForm.code}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      placeholder="Optional auto-generated"
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Name
                    <input
                      className={accountingFieldClassName()}
                      value={chartForm.name}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Type
                    <select
                      className={accountingFieldClassName()}
                      value={chartForm.account_type}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          account_type: event.target.value,
                        }))
                      }
                    >
                      <option value="ASSET">Asset</option>
                      <option value="LIABILITY">Liability</option>
                      <option value="EQUITY">Equity</option>
                      <option value="INCOME">Income</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Parent
                    <select
                      className={accountingFieldClassName()}
                      value={chartForm.parent}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          parent: event.target.value,
                        }))
                      }
                    >
                      <option value="">No parent</option>
                      {chartAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    System code
                    <input
                      className={accountingFieldClassName()}
                      value={chartForm.system_code}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          system_code: event.target.value,
                        }))
                      }
                      placeholder="Optional protected system code"
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      className={accountingFieldClassName()}
                      value={chartForm.notes}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Setup notes or control remarks."
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
                    <input
                      type="checkbox"
                      checked={chartForm.allow_manual_posting}
                      onChange={(event) =>
                        setChartForm((current) => ({
                          ...current,
                          allow_manual_posting: event.target.checked,
                        }))
                      }
                    />
                    Allow manual posting to this account
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create chart account
                    </button>
                  </div>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Create finance account"
                description="Operational cash, bank, and UPI accounts stay linked to asset-side chart codes so future posting flows and books remain auditable."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateFinanceAccount}>
                  <label className="text-sm text-muted-foreground">
                    Name
                    <input
                      className={accountingFieldClassName()}
                      value={financeForm.name}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Kind
                    <select
                      className={accountingFieldClassName()}
                      value={financeForm.kind}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          kind: event.target.value,
                        }))
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Chart account
                    <select
                      className={accountingFieldClassName()}
                      value={financeForm.chart_account}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          chart_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select asset account</option>
                      {assetChartAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Opening balance
                    <input
                      className={accountingFieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={financeForm.opening_balance}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          opening_balance: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Bank last 4
                    <input
                      className={accountingFieldClassName()}
                      value={financeForm.bank_last4}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          bank_last4: event.target.value,
                        }))
                      }
                      maxLength={4}
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    UPI handle
                    <input
                      className={accountingFieldClassName()}
                      value={financeForm.upi_handle}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          upi_handle: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      className={accountingFieldClassName()}
                      value={financeForm.notes}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Collection posture, ownership, or onboarding notes."
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create finance account
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>

            <p className="text-sm text-muted-foreground">
              Current register view: {chartRegisterScopeLabel}. Showing{" "}
              <span className="font-semibold text-foreground">{filteredChartAccounts.length}</span> row(s) of{" "}
              <span className="font-semibold text-foreground">{chartRowsForStatus.length}</span> matching the status filter
              before type filter.
              {chartHiddenByTypeFilterCount > 0 ? (
                <>
                  {" "}
                  <span className="font-semibold text-foreground">{chartHiddenByTypeFilterCount}</span> additional accounts
                  are not shown in this filtered view.
                </>
              ) : null}
            </p>

            <EnterpriseDataTable
              title="Chart account register"
              subtitle="Search by code or name, filter the tree by type or active state, and open a safe edit drawer with server-backed lock reasons."
              data={filteredChartAccounts}
              columns={chartColumns}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedChartAccountId(row.id)}
              globalFilterPlaceholder="Search chart accounts by code or name..."
              emptyTitle="No chart accounts found"
              emptyDescription="Adjust the current filters or create a new chart account above."
              toolbar={
                <>
                  <select
                    className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground"
                    value={chartTypeFilter}
                    onChange={(event) => setChartTypeFilter(event.target.value)}
                  >
                    <option value="ALL">All types</option>
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                  <select
                    className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground"
                    value={chartStatusFilter}
                    onChange={(event) => setChartStatusFilter(event.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </>
              }
            />

            <EnterpriseDataTable
              title="Finance account register"
              subtitle="Review cash, bank, and UPI finance accounts, then open a controlled edit drawer that locks structural changes once operations start using the account."
              data={filteredFinanceAccounts}
              columns={financeColumns}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelectedFinanceAccountId(row.id)}
              globalFilterPlaceholder="Search finance accounts by name or linked chart..."
              emptyTitle="No finance accounts found"
              emptyDescription="Adjust the current filters or create a finance account above."
              toolbar={
                <>
                  <select
                    className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground"
                    value={financeKindFilter}
                    onChange={(event) => setFinanceKindFilter(event.target.value)}
                  >
                    <option value="ALL">All kinds</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="UPI">UPI</option>
                  </select>
                  <select
                    className="h-10 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm text-foreground"
                    value={financeStatusFilter}
                    onChange={(event) => setFinanceStatusFilter(event.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </>
              }
            />
          </>
        ) : null}
      </div>

      <ChartAccountEditDrawer
        open={selectedChartAccountId !== null}
        accountId={selectedChartAccountId}
        chartAccounts={chartAccounts}
        onClose={() => setSelectedChartAccountId(null)}
        onSaved={async (account: ChartOfAccountDetail) => {
          setNotice(`Chart account ${account.code} updated.`);
          await loadPage("refresh");
        }}
      />

      <FinanceAccountEditDrawer
        open={selectedFinanceAccountId !== null}
        accountId={selectedFinanceAccountId}
        chartAccounts={chartAccounts}
        onClose={() => setSelectedFinanceAccountId(null)}
        onSaved={async (account: FinanceAccountDetail) => {
          setNotice(`Finance account ${account.name} updated.`);
          await loadPage("refresh");
        }}
      />
    </PortalPage>
  );
}
