"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createChartOfAccount,
  createFinanceAccount,
  listChartOfAccounts,
  listFinanceAccounts,
  type ChartOfAccount,
  type FinanceAccount,
} from "@/services/accounting";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load chart of accounts.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export default function AccountingChartOfAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);

  const [chartForm, setChartForm] = useState({
    code: "",
    name: "",
    account_type: "ASSET",
    parent: "",
    allow_manual_posting: true,
    system_code: "",
  });
  const [financeForm, setFinanceForm] = useState({
    name: "",
    kind: "CASH",
    chart_account: "",
    opening_balance: "0.00",
    bank_last4: "",
    upi_handle: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [chartPayload, financePayload] = await Promise.all([
        listChartOfAccounts(),
        listFinanceAccounts(),
      ]);
      setChartAccounts(chartPayload.results);
      setFinanceAccounts(financePayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
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
      });
      setChartForm({
        code: "",
        name: "",
        account_type: "ASSET",
        parent: "",
        allow_manual_posting: true,
        system_code: "",
      });
      setNotice("Chart account created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
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
      });
      setFinanceForm({
        name: "",
        kind: "CASH",
        chart_account: "",
        opening_balance: "0.00",
        bank_last4: "",
        upi_handle: "",
      });
      setNotice("Finance account created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const assetChartAccounts = chartAccounts.filter(
    (account) => account.account_type === "ASSET"
  );

  return (
    <PortalPage
      title="Chart of Accounts"
      subtitle="Set up the separate accounting chart and finance accounts without touching the EMI payment ledger or its historical semantics."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Chart of Accounts" },
      ]}
      actions={[
        { href: ROUTES.admin.accounting, label: "Accounting Overview", variant: "secondary" },
        { href: ROUTES.admin.accountingBooks, label: "Books", variant: "secondary" },
      ]}
      stats={[
        { label: "Chart Accounts", value: String(chartAccounts.length), tone: "info" },
        { label: "Finance Accounts", value: String(financeAccounts.length) },
      ]}
      statusBadge={{ label: "Admin Setup", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading chart of accounts..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load accounting setup"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Create chart account"
                description="Chart accounts are the accounting book structure. Manual posting can be restricted per account without touching EMI or reconciliation models."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateChartAccount}>
                  <label className="text-sm text-muted-foreground">
                    Code
                    <input
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                description="Finance accounts map operational cash, bank, and UPI wallets to asset-side chart accounts for later posting flows."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateFinanceAccount}>
                  <label className="text-sm text-muted-foreground">
                    Name
                    <input
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
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
                      className={fieldClassName()}
                      value={financeForm.upi_handle}
                      onChange={(event) =>
                        setFinanceForm((current) => ({
                          ...current,
                          upi_handle: event.target.value,
                        }))
                      }
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

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Chart accounts"
                description="Accounting-side master list. Manual-posting restrictions and system codes are visible here for finance control."
              >
                {chartAccounts.length === 0 ? (
                  <EmptyState
                    title="No chart accounts yet"
                    description="Create the first account above to start building the accounting tree."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          <th className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code</th>
                          <th className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                          <th className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                          <th className="border-b border-border px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartAccounts.map((account) => (
                          <tr key={account.id}>
                            <td className="border-b border-border px-3 py-3 text-sm font-medium text-foreground">
                              {account.code}
                            </td>
                            <td className="border-b border-border px-3 py-3 text-sm text-foreground">
                              <div>{account.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {account.parent_code ? `Parent ${account.parent_code}` : "Root account"}
                                {account.system_code ? ` • ${account.system_code}` : ""}
                              </div>
                            </td>
                            <td className="border-b border-border px-3 py-3 text-sm text-foreground">
                              {account.account_type}
                            </td>
                            <td className="border-b border-border px-3 py-3 text-sm text-foreground">
                              {account.allow_manual_posting ? "Manual allowed" : "System only"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title="Finance accounts"
                description="Operational cash, bank, and UPI accounts mapped to asset chart codes for money movement and expense posting."
              >
                {financeAccounts.length === 0 ? (
                  <EmptyState
                    title="No finance accounts yet"
                    description="Create a cash, bank, or UPI account above before posting expenses or money movements."
                  />
                ) : (
                  <div className="grid gap-3">
                    {financeAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {account.name}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {account.kind} • {account.chart_account_code} • {account.chart_account_name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Opening
                            </div>
                            <div className="text-sm font-semibold text-foreground">
                              {money(account.opening_balance)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
