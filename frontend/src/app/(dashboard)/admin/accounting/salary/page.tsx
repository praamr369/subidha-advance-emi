"use client";

import { useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveSalarySheet,
  createEmployeeProfile,
  createSalarySheet,
  listEmployees,
  listSalarySheets,
  postSalarySheet,
  type EmployeeProfile,
  type SalarySheet,
} from "@/services/accounting";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load salary register.";
}

function fieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export default function AccountingSalaryPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [salarySheets, setSalarySheets] = useState<SalarySheet[]>([]);

  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    joining_date: new Date().toISOString().slice(0, 10),
    base_salary: "0.00",
  });
  const [salaryForm, setSalaryForm] = useState({
    employee: "",
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    gross_amount: "0.00",
    deductions_amount: "0.00",
    net_amount: "0.00",
  });

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [employeesPayload, salaryPayload] = await Promise.all([
        listEmployees(),
        listSalarySheets(),
      ]);
      setEmployees(employeesPayload.results);
      setSalarySheets(salaryPayload.results);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setEmployees([]);
        setSalarySheets([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  async function handleCreateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createEmployeeProfile({
        name: employeeForm.name,
        joining_date: employeeForm.joining_date,
        base_salary: employeeForm.base_salary,
      });
      setEmployeeForm({
        name: "",
        joining_date: new Date().toISOString().slice(0, 10),
        base_salary: "0.00",
      });
      setNotice("Employee profile created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleCreateSalarySheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createSalarySheet({
        employee: Number(salaryForm.employee),
        year: Number(salaryForm.year),
        month: Number(salaryForm.month),
        gross_amount: salaryForm.gross_amount,
        deductions_amount: salaryForm.deductions_amount,
        net_amount: salaryForm.net_amount,
      });
      setSalaryForm({
        employee: "",
        year: String(new Date().getFullYear()),
        month: String(new Date().getMonth() + 1),
        gross_amount: "0.00",
        deductions_amount: "0.00",
        net_amount: "0.00",
      });
      setNotice("Salary sheet created.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handleApproveSalarySheet(id: number) {
    try {
      await approveSalarySheet(id);
      setNotice("Salary sheet approved.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  async function handlePostSalarySheet(id: number) {
    try {
      await postSalarySheet(id);
      setNotice("Salary sheet posted.");
      await loadPage("refresh");
    } catch (err) {
      setNotice(null);
      setError(toErrorMessage(err));
    }
  }

  const approvedCount = salarySheets.filter((item) => item.status === "APPROVED").length;
  const postedCount = salarySheets.filter(
    (item) => item.status === "POSTED" || item.status === "PAID" || item.status === "PAID_PARTIAL"
  ).length;

  return (
    <PortalPage
      title="Salary"
      subtitle="Employee profiles and salary sheets remain inside the separate accounting module, with approval and posting controlled by admin only."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Salary" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingJournals, label: "Journals", variant: "secondary" },
        { href: ROUTES.admin.accounting, label: "Accounting Overview", variant: "secondary" },
      ]}
      stats={[
        { label: "Employees", value: String(employees.length), tone: "info" },
        { label: "Salary Sheets", value: String(salarySheets.length) },
        { label: "Approved", value: String(approvedCount), tone: approvedCount > 0 ? "warning" : "success" },
        { label: "Posted", value: String(postedCount), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
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
            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Create employee profile"
                description="Employee master data is additive and stays independent of partner, customer, or internal cashier role records."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateEmployee}>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Name
                    <input
                      className={fieldClassName()}
                      value={employeeForm.name}
                      onChange={(event) =>
                        setEmployeeForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Joining date
                    <input
                      className={fieldClassName()}
                      type="date"
                      value={employeeForm.joining_date}
                      onChange={(event) =>
                        setEmployeeForm((current) => ({
                          ...current,
                          joining_date: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Base salary
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={employeeForm.base_salary}
                      onChange={(event) =>
                        setEmployeeForm((current) => ({
                          ...current,
                          base_salary: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create employee profile
                    </button>
                  </div>
                </form>
              </WorkspaceSection>

              <WorkspaceSection
                title="Create salary sheet"
                description="Salary sheets accrue payroll into the accounting books. Approval and posting remain separate control steps."
              >
                <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateSalarySheet}>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Employee
                    <select
                      className={fieldClassName()}
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
                    Year
                    <input
                      className={fieldClassName()}
                      type="number"
                      value={salaryForm.year}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          year: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Month
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="1"
                      max="12"
                      value={salaryForm.month}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          month: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Gross amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryForm.gross_amount}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          gross_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground">
                    Deductions
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryForm.deductions_amount}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          deductions_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="text-sm text-muted-foreground md:col-span-2">
                    Net amount
                    <input
                      className={fieldClassName()}
                      type="number"
                      min="0"
                      step="0.01"
                      value={salaryForm.net_amount}
                      onChange={(event) =>
                        setSalaryForm((current) => ({
                          ...current,
                          net_amount: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                    >
                      Create salary sheet
                    </button>
                  </div>
                </form>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Salary sheets"
              description="Approval and posting are explicit accounting controls. Posted sheets carry their journal entry number for audit and drill-down."
            >
              {salarySheets.length === 0 ? (
                <EmptyState
                  title="No salary sheets yet"
                  description="Create an employee profile and a salary sheet above to start the payroll accrual register."
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
                            {sheet.year}-{String(sheet.month).padStart(2, "0")} • Payment total {money(sheet.payment_total)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-foreground">
                            {money(sheet.net_amount)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {sheet.status}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
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
                            className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
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
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
