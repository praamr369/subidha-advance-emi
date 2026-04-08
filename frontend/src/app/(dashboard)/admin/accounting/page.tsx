"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpenText,
  Landmark,
  ReceiptText,
  RefreshCw,
  ScrollText,
  WalletCards,
} from "lucide-react";

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
          href: ROUTES.admin.accountingTrialBalance,
          label: "Reports",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.accountingTaxInvoices,
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
                  href={ROUTES.admin.accountingExpenses}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Expenses and vendor vouchers
                </Link>
                <Link
                  href={ROUTES.admin.accountingSalary}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Employees and salary accruals
                </Link>
                <Link
                  href={ROUTES.admin.accountingBooks}
                  className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Books and money movements
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
