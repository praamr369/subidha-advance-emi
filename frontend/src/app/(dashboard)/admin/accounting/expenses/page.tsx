"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { WorkbenchFilterChips } from "@/components/workbench/WorkbenchFilterChips";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";

import {
  approveExpenseVoucher,
  createExpenseVoucher,
  listChartOfAccounts,
  listExpenses,
  listFinanceAccounts,
  postExpenseVoucher,
  type ChartOfAccount,
  type ExpenseVoucher,
  type FinanceAccount,
} from "@/services/accounting";
import { listBranches, type BranchRecord } from "@/services/branch-control";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load expense workbench.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
}

export default function AccountingExpensesPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseVoucher[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);

  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    branch: "",
    expense_account: "",
    gross_amount: "0.00",
    tax_amount: "0.00",
    net_amount: "0.00",
    payment_mode: "CASH",
    finance_account: "",
    bill_no: "",
    bill_date: "",
    notes: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [expensesPayload, chartPayload, financePayload, branchesPayload] =
        await Promise.all([
          listExpenses(),
          listChartOfAccounts(),
          listFinanceAccounts(),
          listBranches(),
        ]);

      setExpenses(expensesPayload.results);
      setExpenseAccounts(
        chartPayload.results.filter((account) => account.account_type === "EXPENSE")
      );
      setFinanceAccounts(financePayload.results);
      setBranches(branchesPayload.results || []);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setExpenses([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const netAmount = parseFloat(expenseForm.net_amount);
    if (!Number.isFinite(netAmount) || netAmount <= 0) {
      setError("Net amount must be greater than zero.");
      return;
    }
    try {
      await createExpenseVoucher({
        expense_date: expenseForm.expense_date,
        branch: expenseForm.branch ? Number(expenseForm.branch) : null,
        vendor: null, // Vendors are explicitly managed via /admin/vendors
        expense_account: Number(expenseForm.expense_account),
        gross_amount: expenseForm.gross_amount,
        tax_amount: expenseForm.tax_amount,
        net_amount: expenseForm.net_amount,
        payment_mode: expenseForm.payment_mode as ExpenseVoucher["payment_mode"],
        finance_account: expenseForm.finance_account
          ? Number(expenseForm.finance_account)
          : null,
        bill_no: expenseForm.bill_no,
        bill_date: expenseForm.bill_date || null,
        notes: expenseForm.notes,
      });
      setExpenseForm({
        expense_date: new Date().toISOString().slice(0, 10),
        branch: "",
        expense_account: "",
        gross_amount: "0.00",
        tax_amount: "0.00",
        net_amount: "0.00",
        payment_mode: "CASH",
        finance_account: "",
        bill_no: "",
        bill_date: "",
        notes: "",
      });
      setNotice("Expense voucher created successfully.");
      setActiveTab("register");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleApproveExpense(id: number) {
    try {
      await approveExpenseVoucher(id);
      setNotice("Expense voucher approved.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostExpense(id: number) {
    try {
      await postExpenseVoucher(id);
      setNotice("Expense voucher posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const approvedCount = expenses.filter((item) => item.status === "APPROVED").length;
  const postedCount = expenses.filter((item) => item.status === "POSTED").length;
  const draftCount = expenses.filter((item) => item.status === "DRAFT").length;
  
  return (
    <ERPPageShell
      eyebrow="Accounting"
      title="Expense Workbench"
      subtitle="Track, approve, and register all general expenses across the organization."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Expenses" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart Setup", variant: "secondary" },
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
      ]}
      statusBadge={{ label: "Enterprise Workflow", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <WorkbenchFilterChips
            active={activeTab}
            onSelect={setActiveTab}
            chips={[
              { key: "overview", label: "Overview" },
              { key: "register", label: "Expense Register", count: draftCount + approvedCount },
              { key: "create", label: "Add Expense" },
            ]}
          />

          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {notice}
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading expense workbench..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load data"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && activeTab === "overview" && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* KPI Section */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <FileText className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Total Register Items</h3>
                </div>
                <div className="text-3xl font-bold">{expenses.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Draft: {draftCount} | Approved: {approvedCount} | Posted: {postedCount}
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-5 shadow-sm">
                 <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
                  <Clock className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Pending Expenses</h3>
                </div>
                <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">
                  {draftCount}
                </div>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
                  Claims awaiting approval or posting
                </p>
              </div>

               <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-5 shadow-sm">
                 <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Posted Expenses</h3>
                </div>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {postedCount}
                </div>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                  Successfully hit accounting journals
                </p>
              </div>
            </div>

            {/* Quick Navigation / Integrations */}
            <WorkspaceSection title="Ecosystem Connections" description="Jump directly into connected modules.">
              <div className="grid gap-3">
                <Link
                  href="/admin/hr/payroll"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-muted"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Payroll Workbench</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate and pay salary sheets for all staff from the payroll workbench.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link
                  href="/admin/hr/expenses"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-muted"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">HR Staff Claims</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Approve employee-submitted expenses (travel, meals, etc) before payout.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
                <Link
                  href="/admin/vendors"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-muted"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Vendor Management</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create vendor profiles and manage dedicated purchase bills.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </WorkspaceSection>
          </div>
        )}

        {!loading && !error && activeTab === "create" && (
          <WorkspaceSection
            title="Register Manual Expense"
            description="Create a manual general expense (e.g., electricity, rent). Expenses stay in draft until approved and posted."
          >
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateExpense}>
              <label className="text-sm font-medium text-foreground">
                Expense Date
                <input
                  className={fieldClassName()}
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      expense_date: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Branch mapping (Optional)
                <select
                  className={fieldClassName()}
                  value={expenseForm.branch}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      branch: event.target.value,
                    }))
                  }
                >
                  <option value="">Head Office / Unassigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-foreground">
                Chart of Account Category
                <select
                  className={fieldClassName()}
                  value={expenseForm.expense_account}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      expense_account: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select expense category</option>
                  {expenseAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-foreground">
                Originating Finance Account
                <select
                  className={fieldClassName()}
                  value={expenseForm.finance_account}
                  onChange={(event) => {
                    const accId = event.target.value;
                    const account = financeAccounts.find((a) => a.id === Number(accId));
                    setExpenseForm((current) => ({
                      ...current,
                      finance_account: accId,
                      payment_mode: account ? account.kind : current.payment_mode,
                    }));
                  }}
                >
                  <option value="">Select bank/cash source</option>
                  {financeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-foreground">
                Gross amount
                <input
                  className={fieldClassName()}
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.gross_amount}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      gross_amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Tax amount
                <input
                  className={fieldClassName()}
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.tax_amount}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      tax_amount: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Net amount
                <input
                  className={fieldClassName()}
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.net_amount}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      net_amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Payment mode
                <select
                  className={fieldClassName()}
                  value={expenseForm.payment_mode}
                  onChange={(event) => {
                    const mode = event.target.value;
                    const defaultAcc = financeAccounts.find((a) => a.kind === mode);
                    setExpenseForm((current) => ({
                      ...current,
                      payment_mode: mode,
                      finance_account: defaultAcc ? String(defaultAcc.id) : current.finance_account,
                    }));
                  }}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK">Bank Transfer</option>
                </select>
              </label>

              <label className="text-sm font-medium text-foreground">
                Bill / Reference no
                <input
                  className={fieldClassName()}
                  value={expenseForm.bill_no}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      bill_no: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Bill date
                <input
                  className={fieldClassName()}
                  type="date"
                  value={expenseForm.bill_date}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      bill_date: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="text-sm font-medium text-foreground md:col-span-2">
                Notes / Justification
                <textarea
                  className={fieldClassName()}
                  value={expenseForm.notes}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </label>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 shadow-sm"
                >
                  Submit Expense Voucher
                </button>
              </div>
            </form>
          </WorkspaceSection>
        )}

        {!loading && !error && activeTab === "register" && (
          <WorkspaceSection
            title="Expense Register"
            description="All drafted and approved expenses ready for accounting journal execution."
          >
            {expenses.length === 0 ? (
              <EmptyState
                title="No expense vouchers yet"
                description="Click 'Add Expense' to register a new organizational cost."
              />
            ) : (
              <div className="grid gap-3">
                {expenses.map((expense) => {
                  const statusCls =
                    expense.status === "POSTED"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : expense.status === "APPROVED"
                        ? "border-sky-200 bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-400"
                        : "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
                  return (
                    <div key={expense.id} className="rounded-xl border border-border bg-card p-0 shadow-sm transition-all hover:shadow-md">
                      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{expense.voucher_no}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusCls}`}>
                              {expense.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{expense.expense_account_name || expense.expense_account_code}</span>
                            <span>{expense.branch_code ? `Branch: ${expense.branch_code}` : "HQ"} · {expense.payment_mode} · {formatDate(expense.expense_date)}</span>
                            {expense.notes && <span className="italic mt-1">"{expense.notes}"</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-foreground">{formatRupee(expense.net_amount)}</div>
                          <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Net Amount</div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 bg-muted/20 px-4 py-3">
                        {expense.status === "DRAFT" ? (
                          <button type="button" onClick={() => void handleApproveExpense(expense.id)}
                            className="inline-flex h-8 items-center rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-300 px-4 text-xs font-semibold transition-colors">
                            Approve
                          </button>
                        ) : null}
                        {expense.status === "APPROVED" ? (
                          <button type="button" onClick={() => void handlePostExpense(expense.id)}
                            className="inline-flex h-8 items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-4 text-xs font-semibold transition-colors">
                            Post to Journals
                          </button>
                        ) : null}
                        {expense.posted_journal_entry_no ? (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Journal Ref: {expense.posted_journal_entry_no}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WorkspaceSection>
        )}
      </div>
    </ERPPageShell>
  );
}
