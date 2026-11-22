"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Loader2,
  Repeat,
  Zap,
  Calendar,
  PlusCircle,
  Power,
  RefreshCw,
  Sparkles,
  Building2,
} from "lucide-react";

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
  listRecurringExpenses,
  createRecurringExpense,
  toggleRecurringExpenseActive,
  generateRecurringExpenseVoucher,
  postExpenseVoucher,
  type ChartOfAccount,
  type ExpenseVoucher,
  type FinanceAccount,
  type RecurringExpenseSetup,
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
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
  }
  return "Failed to complete expense operation.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
}

export default function AccountingExpensesPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["expensesPageData"],
    queryFn: async () => {
      const [expensesPayload, chartPayload, financePayload, branchesPayload, recurringPayload] =
        await Promise.all([
          listExpenses(),
          listChartOfAccounts({ account_type: "EXPENSE", page_size: 200 }),
          listFinanceAccounts({ page_size: 100 }),
          listBranches(),
          listRecurringExpenses(),
        ]);
      return {
        expenses: expensesPayload.results,
        expenseAccounts: chartPayload.results.filter((account) => account.account_type === "EXPENSE"),
        financeAccounts: financePayload.results,
        branches: branchesPayload.results || [],
        recurringSetups: recurringPayload.results || [],
      };
    },
  });

  const expenses: ExpenseVoucher[] = query.data?.expenses ?? [];
  const expenseAccounts: ChartOfAccount[] = query.data?.expenseAccounts ?? [];
  const financeAccounts: FinanceAccount[] = query.data?.financeAccounts ?? [];
  const branches: BranchRecord[] = query.data?.branches ?? [];
  const recurringSetups: RecurringExpenseSetup[] = query.data?.recurringSetups ?? [];

  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? toErrorMessage(query.error) : null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One-time vs Monthly Recurring setup selector for Add Expense
  const [expenseType, setExpenseType] = useState<"ONE_TIME" | "MONTHLY_RECURRING">("ONE_TIME");
  const [selectedRecurringSetupId, setSelectedRecurringSetupId] = useState<string>("");

  // Sub-filter for register
  const [registerFilter, setRegisterFilter] = useState<"ALL" | "ONE_TIME" | "MONTHLY_RECURRING">("ALL");

  // Recurring setup action states
  const [togglingSetupId, setTogglingSetupId] = useState<number | null>(null);
  const [generatingSetupId, setGeneratingSetupId] = useState<number | null>(null);
  const [showCreateRecurringModal, setShowCreateRecurringModal] = useState(false);
  const [isSubmittingRecurring, setIsSubmittingRecurring] = useState(false);

  const [recurringForm, setRecurringForm] = useState({
    title: "",
    frequency: "MONTHLY" as const,
    expense_account: "",
    branch: "",
    finance_account: "",
    payment_mode: "BANK",
    gross_amount: "",
    tax_amount: "0.00",
    net_amount: "",
    recurring_day: 5,
    is_active: true,
    notes: "",
  });

  const loadPage = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    branch: "",
    expense_account: "",
    gross_amount: "",
    tax_amount: "0.00",
    net_amount: "",
    payment_mode: "CASH",
    finance_account: "",
    bill_no: "",
    bill_date: "",
    notes: "",
  });

  const handleSelectRecurringSetup = (setupId: string) => {
    setSelectedRecurringSetupId(setupId);
    if (!setupId) return;
    const found = recurringSetups.find((s) => s.id === Number(setupId));
    if (found) {
      setExpenseForm((current) => ({
        ...current,
        expense_account: String(found.expense_account),
        branch: found.branch ? String(found.branch) : "",
        finance_account: found.finance_account ? String(found.finance_account) : "",
        payment_mode: found.payment_mode || "BANK",
        gross_amount: found.gross_amount,
        tax_amount: found.tax_amount || "0.00",
        net_amount: found.net_amount,
        notes: found.notes ? `Monthly Recurring: ${found.title} - ${found.notes}` : `Monthly Recurring: ${found.title}`,
      }));
    }
  };

  const handleGrossChange = (val: string) => {
    const grossNum = parseFloat(val);
    const taxNum = parseFloat(expenseForm.tax_amount) || 0;
    setExpenseForm((current) => ({
      ...current,
      gross_amount: val,
      net_amount: Number.isFinite(grossNum) ? (grossNum + taxNum).toFixed(2) : current.net_amount,
    }));
  };

  const handleTaxChange = (val: string) => {
    const taxNum = parseFloat(val) || 0;
    const grossNum = parseFloat(expenseForm.gross_amount);
    const netNum = parseFloat(expenseForm.net_amount);
    setExpenseForm((current) => {
      if (Number.isFinite(grossNum) && grossNum > 0) {
        return {
          ...current,
          tax_amount: val,
          net_amount: (grossNum + taxNum).toFixed(2),
        };
      }
      if (Number.isFinite(netNum) && netNum > 0) {
        return {
          ...current,
          tax_amount: val,
          gross_amount: Math.max(0, netNum - taxNum).toFixed(2),
        };
      }
      return {
        ...current,
        tax_amount: val,
      };
    });
  };

  const handleNetChange = (val: string) => {
    const netNum = parseFloat(val);
    const taxNum = parseFloat(expenseForm.tax_amount) || 0;
    setExpenseForm((current) => ({
      ...current,
      net_amount: val,
      gross_amount: Number.isFinite(netNum) ? Math.max(0, netNum - taxNum).toFixed(2) : current.gross_amount,
    }));
  };

  const handleRecurringGrossChange = (val: string) => {
    const grossNum = parseFloat(val);
    const taxNum = parseFloat(recurringForm.tax_amount) || 0;
    setRecurringForm((current) => ({
      ...current,
      gross_amount: val,
      net_amount: Number.isFinite(grossNum) ? (grossNum + taxNum).toFixed(2) : current.net_amount,
    }));
  };

  const handleRecurringTaxChange = (val: string) => {
    const taxNum = parseFloat(val) || 0;
    const grossNum = parseFloat(recurringForm.gross_amount);
    const netNum = parseFloat(recurringForm.net_amount);
    setRecurringForm((current) => {
      if (Number.isFinite(grossNum) && grossNum > 0) {
        return {
          ...current,
          tax_amount: val,
          net_amount: (grossNum + taxNum).toFixed(2),
        };
      }
      if (Number.isFinite(netNum) && netNum > 0) {
        return {
          ...current,
          tax_amount: val,
          gross_amount: Math.max(0, netNum - taxNum).toFixed(2),
        };
      }
      return {
        ...current,
        tax_amount: val,
      };
    });
  };

  const handleRecurringNetChange = (val: string) => {
    const netNum = parseFloat(val);
    const taxNum = parseFloat(recurringForm.tax_amount) || 0;
    setRecurringForm((current) => ({
      ...current,
      net_amount: val,
      gross_amount: Number.isFinite(netNum) ? Math.max(0, netNum - taxNum).toFixed(2) : current.gross_amount,
    }));
  };

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!expenseForm.expense_account) {
      setActionError("Please select a Chart of Account category for this expense.");
      return;
    }

    let grossVal = parseFloat(expenseForm.gross_amount) || 0;
    const taxVal = parseFloat(expenseForm.tax_amount) || 0;
    let netVal = parseFloat(expenseForm.net_amount) || 0;

    if (grossVal <= 0 && netVal > 0) {
      grossVal = taxVal > 0 && netVal > taxVal ? Number((netVal - taxVal).toFixed(2)) : netVal;
    } else if (netVal <= 0 && grossVal > 0) {
      netVal = Number((grossVal + taxVal).toFixed(2));
    }

    if (netVal <= 0 || grossVal <= 0) {
      setActionError("Please enter a valid expense amount greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createExpenseVoucher({
        expense_type: expenseType,
        recurring_setup: expenseType === "MONTHLY_RECURRING" && selectedRecurringSetupId ? Number(selectedRecurringSetupId) : null,
        expense_date: expenseForm.expense_date,
        branch: expenseForm.branch ? Number(expenseForm.branch) : null,
        vendor: null,
        expense_account: Number(expenseForm.expense_account),
        gross_amount: grossVal.toFixed(2),
        tax_amount: taxVal > 0 ? taxVal.toFixed(2) : "0.00",
        net_amount: netVal.toFixed(2),
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
        gross_amount: "",
        tax_amount: "0.00",
        net_amount: "",
        payment_mode: "CASH",
        finance_account: "",
        bill_no: "",
        bill_date: "",
        notes: "",
      });
      setSelectedRecurringSetupId("");
      setExpenseType("ONE_TIME");
      setNotice("Expense voucher created successfully.");
      setActiveTab("register");
      await loadPage();
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleSetupActive(id: number, currentTitle: string, willBeActive: boolean) {
    setTogglingSetupId(id);
    setActionError(null);
    try {
      await toggleRecurringExpenseActive(id);
      setNotice(`"${currentTitle}" is now ${willBeActive ? "active" : "paused / inactive"}.`);
      await loadPage();
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setTogglingSetupId(null);
    }
  }

  async function handleGenerateRecurringVoucher(id: number, currentTitle: string) {
    setGeneratingSetupId(id);
    setActionError(null);
    try {
      const res = await generateRecurringExpenseVoucher(id);
      setNotice(`Draft voucher ${res.voucher.voucher_no} generated for "${currentTitle}". Ready for approval.`);
      await loadPage();
      setActiveTab("register");
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setGeneratingSetupId(null);
    }
  }

  async function handleCreateRecurringSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!recurringForm.title.trim()) {
      setActionError("Please provide a title for the monthly recurring setup.");
      return;
    }
    if (!recurringForm.expense_account) {
      setActionError("Please select a Chart of Account category.");
      return;
    }

    let grossVal = parseFloat(recurringForm.gross_amount) || 0;
    const taxVal = parseFloat(recurringForm.tax_amount) || 0;
    let netVal = parseFloat(recurringForm.net_amount) || 0;

    if (grossVal <= 0 && netVal > 0) {
      grossVal = taxVal > 0 && netVal > taxVal ? Number((netVal - taxVal).toFixed(2)) : netVal;
    } else if (netVal <= 0 && grossVal > 0) {
      netVal = Number((grossVal + taxVal).toFixed(2));
    }

    if (netVal <= 0 || grossVal <= 0) {
      setActionError("Please enter a valid recurring monthly amount greater than zero.");
      return;
    }

    setIsSubmittingRecurring(true);
    try {
      await createRecurringExpense({
        title: recurringForm.title.trim(),
        frequency: recurringForm.frequency,
        expense_account: Number(recurringForm.expense_account),
        branch: recurringForm.branch ? Number(recurringForm.branch) : null,
        finance_account: recurringForm.finance_account ? Number(recurringForm.finance_account) : null,
        payment_mode: recurringForm.payment_mode as RecurringExpenseSetup["payment_mode"],
        gross_amount: grossVal.toFixed(2),
        tax_amount: taxVal > 0 ? taxVal.toFixed(2) : "0.00",
        net_amount: netVal.toFixed(2),
        recurring_day: Number(recurringForm.recurring_day) || 1,
        is_active: recurringForm.is_active,
        notes: recurringForm.notes,
      });
      setShowCreateRecurringModal(false);
      setRecurringForm({
        title: "",
        frequency: "MONTHLY",
        expense_account: "",
        branch: "",
        finance_account: "",
        payment_mode: "BANK",
        gross_amount: "",
        tax_amount: "0.00",
        net_amount: "",
        recurring_day: 5,
        is_active: true,
        notes: "",
      });
      setNotice(`Monthly recurring setup "${recurringForm.title}" created successfully.`);
      await loadPage();
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setIsSubmittingRecurring(false);
    }
  }

  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [postingId, setPostingId] = useState<number | null>(null);

  async function handleApproveExpense(id: number) {
    setApprovingId(id);
    setActionError(null);
    try {
      await approveExpenseVoucher(id);
      setNotice("Expense voucher approved. You can now post it to journals.");
      await loadPage();
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  }

  async function handlePostExpense(id: number) {
    setPostingId(id);
    setActionError(null);
    try {
      await postExpenseVoucher(id);
      setNotice("Expense voucher successfully posted to General Journal!");
      await loadPage();
    } catch (err) {
      setNotice(null);
      setActionError(toErrorMessage(err));
    } finally {
      setPostingId(null);
    }
  }

  const approvedCount = expenses.filter((item) => item.status === "APPROVED").length;
  const postedCount = expenses.filter((item) => item.status === "POSTED").length;
  const draftCount = expenses.filter((item) => item.status === "DRAFT").length;
  const activeSetupsCount = recurringSetups.filter((s) => s.is_active).length;
  const inactiveSetupsCount = recurringSetups.filter((s) => !s.is_active).length;
  const monthlyCommitmentTotal = recurringSetups
    .filter((s) => s.is_active && s.frequency === "MONTHLY")
    .reduce((sum, s) => sum + (parseFloat(s.net_amount) || 0), 0);

  const filteredExpenses = expenses.filter((expense) => {
    if (registerFilter === "ONE_TIME") return expense.expense_type !== "MONTHLY_RECURRING";
    if (registerFilter === "MONTHLY_RECURRING") return expense.expense_type === "MONTHLY_RECURRING";
    return true;
  });

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
            onSelect={(tab) => {
              setActiveTab(tab);
              setActionError(null);
            }}
            chips={[
              { key: "overview", label: "Overview" },
              { key: "register", label: "Expense Register", count: draftCount + approvedCount },
              { key: "create", label: "Add Expense" },
              { key: "recurring", label: "Monthly Recurring Setups", count: activeSetupsCount },
            ]}
          />

          <button
            type="button"
            onClick={() => void loadPage()}
            disabled={refreshing || loading}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30 p-4 text-sm text-rose-800 dark:text-rose-200 flex items-start justify-between gap-3 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900 dark:text-rose-100">Unable to complete action</p>
                <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{actionError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-500 hover:text-rose-800 dark:hover:text-rose-200 p-1"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {loading ? <LoadingBlock label="Loading expense workbench..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load data"
            description={error || actionError || undefined}
            onRetry={() => void loadPage()}
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

              <div className="rounded-2xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-2">
                  <Repeat className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Monthly Setups (Rent / EMI)</h3>
                </div>
                <div className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                  {formatRupee(monthlyCommitmentTotal)}
                </div>
                <p className="text-xs text-purple-600/80 dark:text-purple-400/80 mt-1">
                  {activeSetupsCount} active setups · {inactiveSetupsCount} paused
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
                <button
                  type="button"
                  onClick={() => setActiveTab("recurring")}
                  className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 dark:border-purple-900/30 dark:bg-purple-950/20 p-4 transition-colors hover:border-purple-400 text-left cursor-pointer"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-1.5">
                      <Repeat className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      Manage Monthly Recurring Setups
                    </h4>
                    <p className="text-xs text-purple-700/80 dark:text-purple-300/80 mt-1">
                      Configure monthly Rent, Loan EMIs, and Utilities with active/deactive toggles.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </button>
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
            description="Create an ad-hoc single expense or pull from a recurring monthly setup (Rent, EMI, Utilities). Expenses stay in draft until approved and posted."
          >
            {actionError ? (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Cannot submit expense: </span>
                    <span>{actionError}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-destructive hover:opacity-75"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {/* Expense Classification Selector */}
            <div className="mb-6 rounded-2xl border border-border bg-muted/30 p-4">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                Expense Setup Nature
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType("ONE_TIME");
                    setSelectedRecurringSetupId("");
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                    expenseType === "ONE_TIME"
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-lg p-2 ${
                      expenseType === "ONE_TIME" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">One-Time / Ad-hoc Expense</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Single-time cost where date is uncertain/as-it-happens (repairs, tea, ad-hoc purchases).
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExpenseType("MONTHLY_RECURRING");
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                    expenseType === "MONTHLY_RECURRING"
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-lg p-2 ${
                      expenseType === "MONTHLY_RECURRING"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Monthly Recurring Setup</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Regular monthly commitments (Rent, Loan EMI, Utilities, Internet).
                    </div>
                  </div>
                </button>
              </div>

              {expenseType === "MONTHLY_RECURRING" && (
                <div className="mt-4 pt-3.5 border-t border-border/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Select Monthly Commitment to Autofill:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("recurring");
                        setShowCreateRecurringModal(true);
                      }}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      + Create New Monthly Commitment
                    </button>
                  </div>
                  <select
                    className={fieldClassName()}
                    value={selectedRecurringSetupId}
                    onChange={(e) => handleSelectRecurringSetup(e.target.value)}
                  >
                    <option value="">-- Choose active recurring setup (e.g. Rent, EMI) --</option>
                    {recurringSetups.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} · {formatRupee(s.net_amount)}/mo (Due: {s.recurring_day}th) {!s.is_active ? "[PAUSED]" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

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

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="expense_account_select" className="text-sm font-medium text-foreground">
                    Chart of Account Category
                  </label>
                  <Link
                    href={ROUTES.admin.accountingChartOfAccounts}
                    className="text-xs text-primary hover:underline font-medium"
                    target="_blank"
                  >
                    + Manage Categories
                  </Link>
                </div>
                <select
                  id="expense_account_select"
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
              </div>

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
                  placeholder="0.00"
                  value={expenseForm.gross_amount}
                  onChange={(event) => handleGrossChange(event.target.value)}
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
                  placeholder="0.00"
                  value={expenseForm.tax_amount}
                  onChange={(event) => handleTaxChange(event.target.value)}
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Net amount
                <input
                  className={fieldClassName()}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseForm.net_amount}
                  onChange={(event) => handleNetChange(event.target.value)}
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
                  disabled={isSubmitting}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 shadow-sm disabled:opacity-60 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting Expense...
                    </>
                  ) : (
                    "Submit Expense Voucher"
                  )}
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
            {/* Sub-filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setRegisterFilter("ALL")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  registerFilter === "ALL"
                    ? "bg-foreground text-background font-bold shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                All Expenses ({expenses.length})
              </button>
              <button
                type="button"
                onClick={() => setRegisterFilter("ONE_TIME")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  registerFilter === "ONE_TIME"
                    ? "bg-foreground text-background font-bold shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Zap className="h-3 w-3" />
                One-Time / Ad-hoc ({expenses.filter((e) => e.expense_type !== "MONTHLY_RECURRING").length})
              </button>
              <button
                type="button"
                onClick={() => setRegisterFilter("MONTHLY_RECURRING")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  registerFilter === "MONTHLY_RECURRING"
                    ? "bg-foreground text-background font-bold shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Repeat className="h-3 w-3" />
                Monthly Recurring ({expenses.filter((e) => e.expense_type === "MONTHLY_RECURRING").length})
              </button>
            </div>

            {filteredExpenses.length === 0 ? (
              <EmptyState
                title="No expense vouchers found"
                description={
                  registerFilter !== "ALL"
                    ? "No expenses matching the selected category. Try switching filters or click 'Add Expense'."
                    : "Click 'Add Expense' to register a new organizational cost."
                }
              />
            ) : (
              <div className="grid gap-3">
                {filteredExpenses.map((expense) => {
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-foreground">{expense.voucher_no}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusCls}`}>
                              {expense.status}
                            </span>
                            {expense.expense_type === "MONTHLY_RECURRING" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                <Repeat className="h-3 w-3" />
                                {expense.recurring_setup_title || "Monthly Recurring"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-2 py-0.5 text-[10px] font-semibold">
                                <Zap className="h-3 w-3" />
                                One-Time
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{expense.expense_account_name || expense.expense_account_code}</span>
                            <span>{expense.branch_code ? `Branch: ${expense.branch_code}` : "HQ"} · {expense.payment_mode} · {formatDate(expense.expense_date)}</span>
                            {expense.notes && <span className="italic mt-1">&ldquo;{expense.notes}&rdquo;</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-foreground">{formatRupee(expense.net_amount)}</div>
                          <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Net Amount</div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 bg-muted/20 px-4 py-3">
                        {expense.status === "DRAFT" ? (
                          <button
                            type="button"
                            disabled={approvingId === expense.id}
                            onClick={() => void handleApproveExpense(expense.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-300 px-4 text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            {approvingId === expense.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Approving...
                              </>
                            ) : (
                              "Approve"
                            )}
                          </button>
                        ) : null}
                        {expense.status === "APPROVED" ? (
                          <button
                            type="button"
                            disabled={postingId === expense.id}
                            onClick={() => void handlePostExpense(expense.id)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-4 text-xs font-semibold transition-colors disabled:opacity-60 shadow-sm cursor-pointer"
                          >
                            {postingId === expense.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Posting to Journals...
                              </>
                            ) : (
                              "Post to Journals"
                            )}
                          </button>
                        ) : null}
                        {expense.posted_journal_entry_no ? (
                          <Link
                            href={ROUTES.admin.accountingJournals}
                            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 hover:underline"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Journal Ref: {expense.posted_journal_entry_no}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WorkspaceSection>
        )}

        {!loading && !error && activeTab === "recurring" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Repeat className="h-5 w-5 text-primary" />
                  Monthly Recurring Setups (Rent / EMI / Utilities)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure ongoing monthly commitments. Activate or pause setups anytime, and generate draft vouchers in 1 click.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRecurringModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-sm cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                Add Monthly Setup
              </button>
            </div>

            {/* KPI Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Monthly Commitment</div>
                <div className="text-2xl font-bold text-foreground mt-1">{formatRupee(monthlyCommitmentTotal)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Accrued across all active monthly setups</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20 p-5 shadow-sm">
                <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold uppercase tracking-wider">Active Setups</div>
                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{activeSetupsCount}</div>
                <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Active & ready for monthly voucher generation</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Paused / Inactive Setups</div>
                <div className="text-2xl font-bold text-muted-foreground mt-1">{inactiveSetupsCount}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Deactivated commitments (can be reactivated anytime)</div>
              </div>
            </div>

            {/* Setups Cards Grid */}
            {recurringSetups.length === 0 ? (
              <EmptyState
                title="No recurring monthly setups yet"
                description="Click 'Add Monthly Setup' to configure regular commitments like Rent, EMI, or Utilities."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {recurringSetups.map((setup) => {
                  const isToggling = togglingSetupId === setup.id;
                  const isGenerating = generatingSetupId === setup.id;
                  return (
                    <div
                      key={setup.id}
                      className={`rounded-2xl border p-5 transition-all shadow-sm ${
                        setup.is_active
                          ? "border-border bg-card hover:shadow-md"
                          : "border-border/60 bg-muted/30 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base text-foreground">{setup.title}</h4>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                setup.is_active
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground border border-border"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${setup.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                              {setup.is_active ? "Active" : "Paused"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {setup.expense_account_name || setup.expense_account_code} · {setup.frequency}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-foreground">{formatRupee(setup.net_amount)}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">per month</div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Due Day:</span>
                          <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            {setup.recurring_day}th of every month
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Payment Mode / Source:</span>
                          <span className="font-semibold text-foreground mt-0.5 block truncate">
                            {setup.payment_mode} {setup.finance_account_name ? `(${setup.finance_account_name})` : ""}
                          </span>
                        </div>
                        {setup.branch_name && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground text-[11px]">Branch: </span>
                            <span className="font-medium text-foreground">{setup.branch_name}</span>
                          </div>
                        )}
                        {setup.notes && (
                          <div className="col-span-2 text-muted-foreground italic text-[11px] line-clamp-2">
                            &ldquo;{setup.notes}&rdquo;
                          </div>
                        )}
                        {setup.last_voucher_date && (
                          <div className="col-span-2 text-[11px] text-muted-foreground">
                            Last generated voucher: <span className="font-medium text-foreground">{formatDate(setup.last_voucher_date)}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                        {/* Activate / Deactivate Toggle Button */}
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => void handleToggleSetupActive(setup.id, setup.title, !setup.is_active)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 cursor-pointer ${
                            setup.is_active
                              ? "bg-muted text-muted-foreground hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300"
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {isToggling ? "Updating..." : setup.is_active ? "Deactivate / Pause" : "Activate Setup"}
                        </button>

                        {/* Generate Monthly Voucher Button */}
                        {setup.is_active && (
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void handleGenerateRecurringVoucher(setup.id, setup.title)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3.5 py-1.5 text-xs font-bold hover:bg-primary/90 transition shadow-sm disabled:opacity-60 cursor-pointer"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Zap className="h-3.5 w-3.5" />
                                Generate Voucher for This Month
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal: Create New Monthly Recurring Setup */}
        {showCreateRecurringModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Repeat className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">Add Monthly Recurring Setup</h3>
                    <p className="text-xs text-muted-foreground">Setup regular monthly commitments like Rent, EMI, or Utilities.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateRecurringModal(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form className="mt-4 space-y-4" onSubmit={handleCreateRecurringSetup}>
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Expense Title * (e.g. Showroom Rent, Delivery Van EMI, Broadband)
                  </label>
                  <input
                    className={fieldClassName()}
                    placeholder="e.g. Asansol Showroom Rent"
                    value={recurringForm.title}
                    onChange={(e) => setRecurringForm((prev) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Chart of Account Category *</label>
                    <select
                      className={fieldClassName()}
                      value={recurringForm.expense_account}
                      onChange={(e) => setRecurringForm((prev) => ({ ...prev, expense_account: e.target.value }))}
                      required
                    >
                      <option value="">Select Category</option>
                      {expenseAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} · {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground">Monthly Recurring Day (1-31)</label>
                    <input
                      className={fieldClassName()}
                      type="number"
                      min={1}
                      max={31}
                      value={recurringForm.recurring_day}
                      onChange={(e) => setRecurringForm((prev) => ({ ...prev, recurring_day: parseInt(e.target.value) || 1 }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Gross Amount (₹)</label>
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={recurringForm.gross_amount}
                      onChange={(e) => handleRecurringGrossChange(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Tax Amount (₹)</label>
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={recurringForm.tax_amount}
                      onChange={(e) => handleRecurringTaxChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Net Amount (₹)</label>
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={recurringForm.net_amount}
                      onChange={(e) => handleRecurringNetChange(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Originating Finance Account</label>
                    <select
                      className={fieldClassName()}
                      value={recurringForm.finance_account}
                      onChange={(e) => {
                        const accId = e.target.value;
                        const account = financeAccounts.find((a) => a.id === Number(accId));
                        setRecurringForm((prev) => ({
                          ...prev,
                          finance_account: accId,
                          payment_mode: account ? account.kind : prev.payment_mode,
                        }));
                      }}
                    >
                      <option value="">Select Bank / Cash</option>
                      {financeAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground">Branch Mapping (Optional)</label>
                    <select
                      className={fieldClassName()}
                      value={recurringForm.branch}
                      onChange={(e) => setRecurringForm((prev) => ({ ...prev, branch: e.target.value }))}
                    >
                      <option value="">Head Office / Unassigned</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} - {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Notes / Reference (Optional)</label>
                  <textarea
                    className={fieldClassName()}
                    placeholder="e.g. Landlord Sri A. Banerjee, account ref #4432"
                    rows={2}
                    value={recurringForm.notes}
                    onChange={(e) => setRecurringForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={recurringForm.is_active}
                      onChange={(e) => setRecurringForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    Mark setup as Active immediately
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateRecurringModal(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRecurring}
                      className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-sm disabled:opacity-60 flex items-center gap-1.5"
                    >
                      {isSubmittingRecurring ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Monthly Setup"
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
