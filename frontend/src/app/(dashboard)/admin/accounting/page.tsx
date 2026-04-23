"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  Landmark,
  Receipt,
  ReceiptText,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatCard from "@/components/ui/StatCard";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listChartOfAccounts,
  listExpenses,
  listFinanceAccounts,
  listJournalEntries,
  listMoneyMovements,
  listSalarySheets,
  type ExpenseVoucher,
  type JournalEntry,
  type MoneyMovement,
  type SalarySheet,
} from "@/services/accounting";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

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
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load accounting control center.";
}

export default function AdminAccountingPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartCount, setChartCount] = useState(0);
  const [financeCount, setFinanceCount] = useState(0);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseVoucher[]>([]);
  const [salarySheets, setSalarySheets] = useState<SalarySheet[]>([]);
  const [moneyMovements, setMoneyMovements] = useState<MoneyMovement[]>([]);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [
        chartAccountsPayload,
        financeAccountsPayload,
        journalsPayload,
        expensesPayload,
        salaryPayload,
        moneyPayload,
      ] = await Promise.all([
        listChartOfAccounts(),
        listFinanceAccounts(),
        listJournalEntries(),
        listExpenses(),
        listSalarySheets(),
        listMoneyMovements(),
      ]);

      setChartCount(chartAccountsPayload.count);
      setFinanceCount(financeAccountsPayload.count);
      setJournals(journalsPayload.results);
      setExpenses(expensesPayload.results);
      setSalarySheets(salaryPayload.results);
      setMoneyMovements(moneyPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setJournals([]);
        setExpenses([]);
        setSalarySheets([]);
        setMoneyMovements([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const draftJournalCount = journals.filter((item) => item.status === "DRAFT").length;
  const approvedExpenseCount = expenses.filter((item) => item.status === "APPROVED").length;
  const approvedSalaryCount = salarySheets.filter((item) => item.status === "APPROVED").length;
  const postedMovementCount = moneyMovements.filter((item) => item.status === "POSTED").length;
  const latestJournal = journals[0];
  const latestExpense = expenses[0];
  const latestSalary = salarySheets[0];
  const latestMovement = moneyMovements[0];

  return (
    <PortalPage
      eyebrow="Accounting Control"
      title="Accounting Control Center"
      subtitle="Phase-1 accounting workspace with separate double-entry books, admin-only posting controls, and no overlap with the EMI payment ledger."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting" },
      ]}
      actions={[
        {
          href: ROUTES.admin.accountingJournals,
          label: "Manual Journals",
          variant: "primary",
        },
        {
          href: ROUTES.admin.accountingPeriods,
          label: "Periods",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingAssets,
          label: "Assets",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingGst,
          label: "GST Docs",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingItrPack,
          label: "ITR Pack",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Chart Accounts", value: String(chartCount), tone: "info" },
        { label: "Finance Accounts", value: String(financeCount) },
        { label: "Draft Journals", value: String(draftJournalCount), tone: draftJournalCount > 0 ? "warning" : "success" },
        { label: "Posted Movements", value: String(postedMovementCount), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading accounting control center..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load accounting control center"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <ControlLaneGrid
              title="Accounting control lanes"
              description="Accounting remains operationally separate from EMI collection. Each lane opens the dedicated admin register for controlled setup, posting, reconciliation, payroll, or compliance work."
              lanes={[
                {
                  title: "Account structure",
                  description: "Chart of accounts, books, and posting periods for additive ledger governance.",
                  href: ROUTES.admin.accountingChartOfAccounts,
                  icon: <BookOpenText className="h-4 w-4" />,
                  badge: "Setup",
                },
                {
                  title: "Cash / Bank / UPI control",
                  description: "Finance-account and book review stays separate from cashier collection execution.",
                  href: ROUTES.admin.accountingBooks,
                  icon: <Landmark className="h-4 w-4" />,
                  badge: "Books",
                },
                {
                  title: "Posting & journals",
                  description: "Manual journals and controlled accounting entries for finance admins.",
                  href: ROUTES.admin.accountingJournals,
                  icon: <ScrollText className="h-4 w-4" />,
                  badge: "Posting",
                },
                {
                  title: "Receivables / payables",
                  description: "Vendor and procurement registers for payable visibility without merging into collections.",
                  href: ROUTES.admin.accountingPurchaseBills,
                  icon: <Receipt className="h-4 w-4" />,
                  badge: "Ledger",
                },
                {
                  title: "Payroll & staff",
                  description: "Staff, salary, and expense-claim control lanes remain explicit and auditable.",
                  href: ROUTES.admin.accountingStaff,
                  icon: <BriefcaseBusiness className="h-4 w-4" />,
                  badge: "Workforce",
                },
                {
                  title: "Period / tax / controls",
                  description: "Periods, GST, exports, and close controls for finance governance.",
                  href: ROUTES.admin.accountingPeriods,
                  icon: <ShieldCheck className="h-4 w-4" />,
                  badge: "Close",
                },
                {
                  title: "Branch-aware setup",
                  description: "Finance books and branches stay aligned through explicit governance surfaces.",
                  href: ROUTES.admin.branchReporting,
                  icon: <Building2 className="h-4 w-4" />,
                  badge: "Branch",
                },
              ]}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Expense Approvals"
                value={String(approvedExpenseCount)}
                subtext="Approved vouchers waiting for controlled posting"
                tone={approvedExpenseCount > 0 ? "warning" : "success"}
                icon={<ReceiptText className="h-5 w-5" />}
              />
              <StatCard
                label="Salary Approvals"
                value={String(approvedSalaryCount)}
                subtext="Salary sheets ready for payroll accrual posting"
                tone={approvedSalaryCount > 0 ? "warning" : "success"}
                icon={<WalletCards className="h-5 w-5" />}
              />
              <StatCard
                label="Draft Journals"
                value={String(draftJournalCount)}
                subtext="Manual journals are held in draft until admin posts them"
                tone={draftJournalCount > 0 ? "info" : "success"}
                icon={<ScrollText className="h-5 w-5" />}
              />
              <StatCard
                label="Money Movements"
                value={String(moneyMovements.length)}
                subtext={`${postedMovementCount} transfers already posted between finance accounts`}
                tone="default"
                icon={<Landmark className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Latest register activity"
                description="The newest rows from each accounting register, sourced directly from the new accounting API."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard
                    label="Latest Journal"
                    value={latestJournal?.entry_no ?? "No entries"}
                    subtext={latestJournal ? `${latestJournal.status} • ${formatDate(latestJournal.entry_date)}` : "Manual journals will appear here once created"}
                    tone={latestJournal?.status === "DRAFT" ? "warning" : "default"}
                    icon={<BookOpenText className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Latest Expense"
                    value={latestExpense?.voucher_no ?? "No vouchers"}
                    subtext={latestExpense ? `${latestExpense.status} • ${money(latestExpense.net_amount)}` : "Expense vouchers will appear here once recorded"}
                    tone={latestExpense?.status === "APPROVED" ? "warning" : "default"}
                    icon={<ReceiptText className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Latest Salary Sheet"
                    value={
                      latestSalary
                        ? `${latestSalary.employee_code ?? "EMP"} ${latestSalary.year}-${String(
                            latestSalary.month
                          ).padStart(2, "0")}`
                        : "No salary sheets"
                    }
                    subtext={latestSalary ? `${latestSalary.status} • ${money(latestSalary.net_amount)}` : "Salary accrual sheets will appear here once created"}
                    tone={latestSalary?.status === "APPROVED" ? "warning" : "default"}
                    icon={<WalletCards className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Latest Movement"
                    value={latestMovement?.movement_no ?? "No movements"}
                    subtext={latestMovement ? `${latestMovement.status} • ${money(latestMovement.amount)}` : "Inter-account movements will appear here once created"}
                    tone={latestMovement?.status === "DRAFT" ? "info" : "default"}
                    icon={<Landmark className="h-5 w-5" />}
                  />
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Control lanes"
                description="Accounting remains operationally separate from EMI collections. Each lane below opens the dedicated admin register for additive setup or posting."
                contentClassName="grid gap-3 sm:grid-cols-2"
              >
                <Link
                  href={ROUTES.admin.accountingChartOfAccounts}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Chart of accounts and finance accounts
                </Link>
                <Link
                  href={ROUTES.admin.accountingVendors}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Vendor register and procurement master data
                </Link>
                <Link
                  href={ROUTES.admin.accountingPurchaseBills}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Purchase bills and stock inward drafts
                </Link>
                <Link
                  href={ROUTES.admin.accountingExpenses}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Expenses and vendor vouchers
                </Link>
                <Link
                  href={ROUTES.admin.accountingStaff}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Staff register and attendance basics
                </Link>
                <Link
                  href={ROUTES.admin.accountingSalary}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Salary accruals and salary payments
                </Link>
                <Link
                  href={ROUTES.admin.accountingAttendance}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Attendance calendar and overtime capture
                </Link>
                <Link
                  href={ROUTES.admin.accountingLeave}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Leave requests and payroll period locks
                </Link>
                <Link
                  href={ROUTES.admin.accountingExpenseClaims}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Staff expense claims and reimbursements
                </Link>
                <Link
                  href={ROUTES.admin.accountingStaffLedger}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Staff payable and reimbursement ledger
                </Link>
                <Link
                  href={ROUTES.admin.accountingBooks}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Books and money movements
                </Link>
                <Link
                  href={ROUTES.admin.accountingBooksCash}
                  className="rounded-[1.3rem] border border-slate-200 bg-slate-100 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-200"
                >
                  Daily cash, bank, UPI, sales, and purchase books
                </Link>
                <Link
                  href={ROUTES.admin.accountingTrialBalance}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Trial balance, profit & loss, and balance sheet reports
                </Link>
                <Link
                  href={ROUTES.admin.accountingTaxInvoices}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  GST tax invoices, credit notes, and debit notes
                </Link>
                <Link
                  href={ROUTES.admin.accountingItrPack}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  ITR export pack generation
                </Link>
                <Link
                  href={ROUTES.admin.accountingBridges}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Controlled accounting bridge runs
                </Link>
                <Link
                  href={ROUTES.admin.inventory}
                  className="rounded-[1.3rem] border border-slate-200 bg-slate-100 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-200"
                >
                  Inventory stock controls and adjustments
                </Link>
                <Link
                  href={ROUTES.admin.billing}
                  className="rounded-[1.3rem] border border-slate-200 bg-slate-100 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-200"
                >
                  Billing invoices, notes, and receipts
                </Link>
                <Link
                  href={ROUTES.admin.reminders}
                  className="rounded-[1.3rem] border border-slate-200 bg-slate-100 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-200"
                >
                  Reminder queue and follow-up controls
                </Link>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Posting watchlist"
              description="Queues that currently need an admin post action to move from draft or approved state into the accounting books."
            >
              {draftJournalCount > 0 || approvedExpenseCount > 0 || approvedSalaryCount > 0 ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard
                    label="Journals waiting"
                    value={String(draftJournalCount)}
                    subtext={latestJournal?.entry_no ? `Latest draft ${latestJournal.entry_no}` : "No draft journals"}
                    tone={draftJournalCount > 0 ? "warning" : "success"}
                    href={ROUTES.admin.accountingJournals}
                  />
                  <StatCard
                    label="Expenses waiting"
                    value={String(approvedExpenseCount)}
                    subtext={latestExpense?.voucher_no ? `Latest voucher ${latestExpense.voucher_no}` : "No approved vouchers"}
                    tone={approvedExpenseCount > 0 ? "warning" : "success"}
                    href={ROUTES.admin.accountingExpenses}
                  />
                  <StatCard
                    label="Salary waiting"
                    value={String(approvedSalaryCount)}
                    subtext={latestSalary?.employee_code ? `Latest sheet ${latestSalary.employee_code}` : "No approved salary sheets"}
                    tone={approvedSalaryCount > 0 ? "warning" : "success"}
                    href={ROUTES.admin.accountingSalary}
                  />
                </div>
              ) : (
                <EmptyState
                  title="No accounting rows are waiting for admin posting"
                  description="Draft journals and approved vouchers/salary sheets will surface here once the accounting registers start receiving transactions."
                />
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
