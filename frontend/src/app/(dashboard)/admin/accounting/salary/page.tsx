"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
  accountingMoney,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminSalarySheetRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  approveSalarySheet,
  closePayrollPeriod,
  createSalaryPayment,
  createSalarySheet,
  listEmployees,
  listFinanceAccounts,
  listPayrollPeriods,
  listSalaryPayments,
  listSalarySheets,
  postSalarySheet,
  type EmployeeProfile,
  type FinanceAccount,
  type PayrollPeriod,
  type SalaryPayment,
  type SalarySheet,
} from "@/services/accounting";

function toErrorMessage(error: unknown): string {
  return accountingErrorMessage(error, "Failed to load salary register.");
}

export default function AccountingSalaryPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [salarySheets, setSalarySheets] = useState<SalarySheet[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);

  const [salaryForm, setSalaryForm] = useState({
    employee: "",
    payroll_period: "",
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    auto_generate: true,
    gross_amount: "0.00",
    deductions_amount: "0.00",
    net_amount: "0.00",
  });
  const [paymentForm, setPaymentForm] = useState({
    salary_sheet: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "0.00",
    finance_account: "",
    reference_no: "",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [employeesPayload, salaryPayload, paymentsPayload, financePayload, periodsPayload] =
        await Promise.all([
          listEmployees({ is_active: 1 }),
          listSalarySheets(),
          listSalaryPayments(),
          listFinanceAccounts({ is_active: 1 }),
          listPayrollPeriods(),
        ]);
      setEmployees(employeesPayload.results);
      setSalarySheets(salaryPayload.results);
      setSalaryPayments(paymentsPayload.results);
      setFinanceAccounts(financePayload.results);
      setPayrollPeriods(periodsPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setEmployees([]);
        setSalarySheets([]);
        setSalaryPayments([]);
        setFinanceAccounts([]);
        setPayrollPeriods([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const payableSheets = useMemo(
    () =>
      salarySheets.filter(
        (sheet) => sheet.status === "POSTED" || sheet.status === "PAID_PARTIAL"
      ),
    [salarySheets]
  );

  const openPeriods = payrollPeriods.filter((period) => period.status === "OPEN");
  const closedPeriods = payrollPeriods.filter((period) => period.status === "CLOSED");

  async function handleCreateSalarySheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await createSalarySheet({
        employee: Number(salaryForm.employee),
        payroll_period: salaryForm.payroll_period
          ? Number(salaryForm.payroll_period)
          : null,
        year: Number(salaryForm.year),
        month: Number(salaryForm.month),
        gross_amount: salaryForm.gross_amount,
        deductions_amount: salaryForm.deductions_amount,
        net_amount: salaryForm.net_amount,
        auto_generate: salaryForm.auto_generate,
      });
      setSalaryForm({
        employee: "",
        payroll_period: "",
        year: String(new Date().getFullYear()),
        month: String(new Date().getMonth() + 1),
        auto_generate: true,
        gross_amount: "0.00",
        deductions_amount: "0.00",
        net_amount: "0.00",
      });
      setNotice("Salary sheet created.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function handleCreateSalaryPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await createSalaryPayment({
        salary_sheet: Number(paymentForm.salary_sheet),
        payment_date: paymentForm.payment_date,
        amount: paymentForm.amount,
        finance_account: Number(paymentForm.finance_account),
        reference_no: paymentForm.reference_no,
      });
      setPaymentForm({
        salary_sheet: "",
        payment_date: new Date().toISOString().slice(0, 10),
        amount: "0.00",
        finance_account: "",
        reference_no: "",
      });
      setNotice("Salary payment posted.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function handleApproveSalarySheet(id: number) {
    setError(null);
    setNotice(null);
    try {
      await approveSalarySheet(id);
      setNotice("Salary sheet approved.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function handlePostSalarySheet(id: number) {
    setError(null);
    setNotice(null);
    try {
      await postSalarySheet(id);
      setNotice("Salary sheet posted.");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  async function handleClosePayrollPeriod(period: PayrollPeriod) {
    const closeReason =
      window.prompt(
        `Close payroll period ${period.code}? Posted history stays intact, but attendance, leave, claims, and draft salary work inside the period will be blocked.`,
        ""
      ) ?? "";

    setError(null);
    setNotice(null);
    try {
      await closePayrollPeriod(period.id, closeReason);
      setNotice(`Payroll period ${period.code} closed.`);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    }
  }

  const approvedCount = salarySheets.filter((item) => item.status === "APPROVED").length;
  const payableCount = payableSheets.length;
  const totalOutstanding = payableSheets.reduce(
    (sum, item) => sum + Number(item.outstanding_amount ?? 0),
    0
  );

  return (
    <PortalPage
      title="Salary Register"
      subtitle="Payroll remains a separate operational workflow: period-aware salary sheets, payslip-ready line breakdowns, explicit posting, and controlled salary disbursement into the selected finance book."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Salary" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingAttendance, label: "Attendance", variant: "secondary" },
        { href: ROUTES.admin.accountingLeave, label: "Leave", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenseClaims, label: "Expense Claims", variant: "secondary" },
        { href: ROUTES.admin.accountingStaffLedger, label: "Staff Ledger", variant: "primary" },
      ]}
      stats={[
        { label: "Employees", value: String(employees.length), tone: "info" },
        { label: "Open Periods", value: String(openPeriods.length), tone: openPeriods.length > 0 ? "warning" : "success" },
        { label: "Approved Sheets", value: String(approvedCount), tone: approvedCount > 0 ? "warning" : "success" },
        { label: "Outstanding", value: accountingMoney(totalOutstanding), tone: payableCount > 0 ? "warning" : "success" },
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

        {notice ? <AccountingNotice message={notice} /> : null}
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        {loading ? <LoadingBlock label="Loading salary register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load salary register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              title="Payroll lanes"
              description="Attendance, leave, salary accrual, reimbursement, and staff-ledger work stay separate operational layers over one accounting backbone."
              contentClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
            >
              <Link
                href={ROUTES.admin.accountingStaff}
                className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Staff master and component setup
              </Link>
              <Link
                href={ROUTES.admin.accountingAttendance}
                className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Attendance calendar and overtime
              </Link>
              <Link
                href={ROUTES.admin.accountingLeave}
                className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Leave requests and period locks
              </Link>
              <Link
                href={ROUTES.admin.accountingExpenseClaims}
                className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Staff claims and reimbursements
              </Link>
              <Link
                href={ROUTES.admin.accountingStaffLedger}
                className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Employee payable-receivable ledger
              </Link>
            </WorkspaceSection>

            <div className="grid gap-4 xl:grid-cols-3">
              <WorkspaceSection
                title="Create Salary Sheet"
                description="Auto-generated sheets derive from base salary, active components, approved unpaid leave, and attendance overtime. Manual amounts remain available for controlled correction."
              >
                <form className="grid gap-3" onSubmit={handleCreateSalarySheet}>
                  <label className="text-sm text-muted-foreground">
                    Employee
                    <select
                      className={accountingFieldClassName()}
                      value={salaryForm.employee}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          employee: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employee_code} · {employee.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Payroll period
                    <select
                      className={accountingFieldClassName()}
                      value={salaryForm.payroll_period}
                      onChange={(event) => {
                        const nextPeriodId = event.target.value;
                        const nextPeriod = payrollPeriods.find(
                          (period) => String(period.id) === nextPeriodId
                        );
                        setSalaryForm((current) => ({
                          ...current,
                          payroll_period: nextPeriodId,
                          year: nextPeriod ? String(nextPeriod.year) : current.year,
                          month: nextPeriod ? String(nextPeriod.month) : current.month,
                        }));
                      }}
                    >
                      <option value="">Create or reuse by year/month</option>
                      {payrollPeriods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.code} · {period.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-muted-foreground">
                      Year
                      <input
                        type="number"
                        className={accountingFieldClassName()}
                        value={salaryForm.year}
                        onChange={(event) =>
                          setSalaryForm((current) => ({
                            ...current,
                            year: event.target.value,
                            payroll_period: "",
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      Month
                      <input
                        type="number"
                        min="1"
                        max="12"
                        className={accountingFieldClassName()}
                        value={salaryForm.month}
                        onChange={(event) =>
                          setSalaryForm((current) => ({
                            ...current,
                            month: event.target.value,
                            payroll_period: "",
                          }))
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={salaryForm.auto_generate}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          auto_generate: event.target.checked,
                        }))
                      }
                    />
                    Auto-generate line breakdown from workforce source data
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm text-muted-foreground">
                      Gross amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={accountingFieldClassName()}
                        value={salaryForm.gross_amount}
                        onChange={(event) =>
                          setSalaryForm((current) => ({
                            ...current,
                            gross_amount: event.target.value,
                          }))
                        }
                        disabled={salaryForm.auto_generate}
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      Deductions
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={accountingFieldClassName()}
                        value={salaryForm.deductions_amount}
                        onChange={(event) =>
                          setSalaryForm((current) => ({
                            ...current,
                            deductions_amount: event.target.value,
                          }))
                        }
                        disabled={salaryForm.auto_generate}
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      Net amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={accountingFieldClassName()}
                        value={salaryForm.net_amount}
                        onChange={(event) =>
                          setSalaryForm((current) => ({
                            ...current,
                            net_amount: event.target.value,
                          }))
                        }
                        disabled={salaryForm.auto_generate}
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    Create Salary Sheet
                  </button>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Post Salary Payment"
                description="Salary payment clears salary payable into the selected cash, bank, or UPI book. It cannot bypass salary-sheet posting."
              >
                <form className="grid gap-3" onSubmit={handleCreateSalaryPayment}>
                  <label className="text-sm text-muted-foreground">
                    Salary sheet
                    <select
                      className={accountingFieldClassName()}
                      value={paymentForm.salary_sheet}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          salary_sheet: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select payable sheet</option>
                      {payableSheets.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          {sheet.employee_code} · {sheet.payroll_period_code || `${sheet.year}-${String(sheet.month).padStart(2, "0")}`} · Outstanding {accountingMoney(sheet.outstanding_amount)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Payment date
                    <input
                      type="date"
                      className={accountingFieldClassName()}
                      value={paymentForm.payment_date}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          payment_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Amount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={accountingFieldClassName()}
                      value={paymentForm.amount}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Finance account
                    <select
                      className={accountingFieldClassName()}
                      value={paymentForm.finance_account}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          finance_account: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Select finance account</option>
                      {financeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Reference no
                    <input
                      className={accountingFieldClassName()}
                      value={paymentForm.reference_no}
                      onChange={(event) =>
                        setPaymentForm((current) => ({
                          ...current,
                          reference_no: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                  >
                    Post Salary Payment
                  </button>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Payroll Periods"
                description="Periods stay open while attendance, leave, claims, and draft payroll work continues. Close them only after salary drafts are resolved."
              >
                {payrollPeriods.length === 0 ? (
                  <EmptyState
                    title="No payroll periods yet"
                    description="Creating the first salary sheet will create the matching period automatically."
                  />
                ) : (
                  <div className="space-y-3">
                    {payrollPeriods.slice(0, 8).map((period) => (
                      <div
                        key={period.id}
                        className="rounded-[1.25rem] border border-white/80 bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {period.code}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {accountingDate(period.start_date)} to {accountingDate(period.end_date)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {period.status}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {period.closed_at
                                ? `Closed ${accountingDate(period.closed_at)}`
                                : "Open for staff operations"}
                            </div>
                          </div>
                        </div>
                        {period.status === "OPEN" ? (
                          <button
                            type="button"
                            onClick={() => void handleClosePayrollPeriod(period)}
                            className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Close Period
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Salary Sheets"
              description="Approval and posting remain explicit control steps. Each sheet now carries a payslip-ready salary breakdown and payroll-period linkage."
            >
              {salarySheets.length === 0 ? (
                <EmptyState
                  title="No salary sheets yet"
                  description="Create the first salary sheet above to start the payroll accrual register."
                />
              ) : (
                <div className="grid gap-3">
                  {salarySheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="rounded-[1.4rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {sheet.employee_code} · {sheet.employee_name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {sheet.payroll_period_code ||
                              `${sheet.year}-${String(sheet.month).padStart(2, "0")}`}{" "}
                            • {sheet.employee_designation || "Staff"} • {sheet.lines?.length ?? 0} lines
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {accountingMoney(sheet.net_amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {sheet.status} • Outstanding {accountingMoney(sheet.outstanding_amount)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={buildAdminSalarySheetRoute(sheet.id)}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                        >
                          Open Detail
                        </Link>
                        {sheet.status === "DRAFT" ? (
                          <button
                            type="button"
                            onClick={() => void handleApproveSalarySheet(sheet.id)}
                            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Approve
                          </button>
                        ) : null}
                        {sheet.status === "APPROVED" ? (
                          <button
                            type="button"
                            onClick={() => void handlePostSalarySheet(sheet.id)}
                            className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95"
                          >
                            Post
                          </button>
                        ) : null}
                        {sheet.posted_journal_entry_no ? (
                          <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            Journal {sheet.posted_journal_entry_no}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Salary Payments"
              description="Posted salary payments reduce salary payable and land directly in the selected finance book."
            >
              {salaryPayments.length === 0 ? (
                <EmptyState
                  title="No salary payments yet"
                  description="Post the first salary payment above after at least one salary sheet is posted."
                />
              ) : (
                <div className="grid gap-3">
                  {salaryPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-[1.35rem] border border-white/80 bg-white/75 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {payment.salary_sheet_employee_code} · {payment.salary_sheet_employee_name}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {accountingDate(payment.payment_date)} • {payment.finance_account_name} •{" "}
                            {payment.reference_no || "No reference"}
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-foreground">
                          {accountingMoney(payment.amount)}
                        </div>
                      </div>
                      {payment.posted_journal_entry_no ? (
                        <div className="mt-3 text-xs text-muted-foreground">
                          Journal {payment.posted_journal_entry_no}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Period posture"
              description="Open periods are still operationally live. Closed periods are visible for audit, payroll lock, and correction planning."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.35rem] border border-white/80 bg-white/75 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    Open payroll periods
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {openPeriods.length}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Attendance, leave, claims, and draft salary work can still change inside these periods.
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/80 bg-white/75 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    Closed payroll periods
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {closedPeriods.length}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Historical payroll is locked for daily staff operations and remains available for drill-down and audit.
                  </div>
                </div>
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
