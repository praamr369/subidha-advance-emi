"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  createEmployeeProfile,
  listEmployeeAttendance,
  listEmployees,
  recordEmployeeAttendance,
  updateEmployeeProfile,
  type EmployeeAttendance,
  type EmployeeAttendanceStatus,
  type EmployeeCompensationComponent,
  type EmployeeProfile,
} from "@/services/accounting";

type CompensationComponentFormState = {
  component_name: string;
  component_type: "EARNING" | "DEDUCTION";
  amount: string;
  sort_order: string;
  is_active: boolean;
  notes: string;
};

type StaffFormState = {
  name: string;
  phone: string;
  designation: string;
  department: string;
  joining_date: string;
  base_salary: string;
  standard_daily_hours: string;
  overtime_rate_per_hour: string;
  is_active: boolean;
  notes: string;
  compensation_components: CompensationComponentFormState[];
};

type AttendanceFormState = {
  employee: string;
  attendance_date: string;
  status: EmployeeAttendanceStatus;
  worked_hours: string;
  overtime_hours: string;
  notes: string;
};

const EMPTY_COMPONENT: CompensationComponentFormState = {
  component_name: "",
  component_type: "EARNING",
  amount: "0.00",
  sort_order: "1",
  is_active: true,
  notes: "",
};

const STAFF_EMPTY: StaffFormState = {
  name: "",
  phone: "",
  designation: "",
  department: "",
  joining_date: new Date().toISOString().slice(0, 10),
  base_salary: "0.00",
  standard_daily_hours: "8.00",
  overtime_rate_per_hour: "",
  is_active: true,
  notes: "",
  compensation_components: [],
};

const ATTENDANCE_EMPTY: AttendanceFormState = {
  employee: "",
  attendance_date: new Date().toISOString().slice(0, 10),
  status: "PRESENT",
  worked_hours: "8.00",
  overtime_hours: "0.00",
  notes: "",
};

function toComponentFormState(
  component: EmployeeCompensationComponent,
  index: number
): CompensationComponentFormState {
  return {
    component_name: component.component_name,
    component_type: component.component_type,
    amount: component.amount,
    sort_order: String(component.sort_order ?? index + 1),
    is_active: component.is_active ?? true,
    notes: component.notes ?? "",
  };
}

function toStaffFormState(employee: EmployeeProfile): StaffFormState {
  return {
    name: employee.name,
    phone: employee.phone ?? "",
    designation: employee.designation ?? "",
    department: employee.department ?? "",
    joining_date: employee.joining_date,
    base_salary: employee.base_salary ?? "0.00",
    standard_daily_hours: employee.standard_daily_hours ?? "8.00",
    overtime_rate_per_hour: employee.overtime_rate_per_hour ?? "",
    is_active: employee.is_active,
    notes: employee.notes ?? "",
    compensation_components: (employee.compensation_components ?? []).map(
      toComponentFormState
    ),
  };
}

export default function AccountingStaffPage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<EmployeeAttendance[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormState>(STAFF_EMPTY);
  const [attendanceForm, setAttendanceForm] =
    useState<AttendanceFormState>(ATTENDANCE_EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [employeePayload, attendancePayload] = await Promise.all([
        listEmployees(),
        listEmployeeAttendance(),
      ]);
      setEmployees(employeePayload.results);
      setAttendanceRows(attendancePayload.results);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load staff register."));
      if (mode === "initial") {
        setEmployees([]);
        setAttendanceRows([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  function resetStaffForm() {
    setSelectedEmployeeId(null);
    setStaffForm(STAFF_EMPTY);
  }

  function addCompensationComponent() {
    setStaffForm((current) => ({
      ...current,
      compensation_components: [
        ...current.compensation_components,
        {
          ...EMPTY_COMPONENT,
          sort_order: String(current.compensation_components.length + 1),
        },
      ],
    }));
  }

  function updateCompensationComponent(
    index: number,
    patch: Partial<CompensationComponentFormState>
  ) {
    setStaffForm((current) => ({
      ...current,
      compensation_components: current.compensation_components.map((component, currentIndex) =>
        currentIndex === index ? { ...component, ...patch } : component
      ),
    }));
  }

  function removeCompensationComponent(index: number) {
    setStaffForm((current) => ({
      ...current,
      compensation_components: current.compensation_components
        .filter((_, currentIndex) => currentIndex !== index)
        .map((component, currentIndex) => ({
          ...component,
          sort_order: String(currentIndex + 1),
        })),
    }));
  }

  async function handleSaveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingStaff(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...staffForm,
        overtime_rate_per_hour: staffForm.overtime_rate_per_hour || null,
        compensation_components: staffForm.compensation_components
          .filter((component) => component.component_name.trim())
          .map((component, index) => ({
            component_name: component.component_name,
            component_type: component.component_type,
            amount: component.amount,
            sort_order: Number(component.sort_order || index + 1),
            is_active: component.is_active,
            notes: component.notes,
          })),
      };
      if (selectedEmployee) {
        await updateEmployeeProfile(selectedEmployee.id, payload);
        setNotice(`Staff profile ${selectedEmployee.employee_code} updated.`);
      } else {
        await createEmployeeProfile(payload);
        setNotice("Staff profile created.");
      }
      resetStaffForm();
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to save staff profile."));
    } finally {
      setSavingStaff(false);
    }
  }

  async function handleRecordAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAttendance(true);
    setError(null);
    setNotice(null);
    try {
      await recordEmployeeAttendance({
        employee: Number(attendanceForm.employee),
        attendance_date: attendanceForm.attendance_date,
        status: attendanceForm.status,
        worked_hours: attendanceForm.worked_hours,
        overtime_hours: attendanceForm.overtime_hours,
        notes: attendanceForm.notes,
      });
      setNotice("Attendance recorded.");
      setAttendanceForm((current) => ({
        ...ATTENDANCE_EMPTY,
        employee: current.employee,
      }));
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to record attendance."));
    } finally {
      setSavingAttendance(false);
    }
  }

  const employeeColumns: EnterpriseColumnDef<EmployeeProfile>[] = [
    { key: "employee_code", header: "Code" },
    { key: "name", header: "Name" },
    { key: "designation", header: "Designation" },
    { key: "department", header: "Department" },
    {
      key: "standard_daily_hours",
      header: "Daily Hours",
      render: (row) => row.standard_daily_hours ?? "8.00",
    },
    {
      key: "compensation_components",
      header: "Components",
      render: (row) => String(row.compensation_components?.length ?? 0),
    },
    {
      key: "is_active",
      header: "Active",
      render: (row) => (row.is_active ? "Yes" : "No"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setSelectedEmployeeId(row.id);
            setStaffForm(toStaffFormState(row));
            setAttendanceForm((current) => ({ ...current, employee: String(row.id) }));
            setError(null);
            setNotice(null);
          }}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Edit
        </button>
      ),
    },
  ];

  const attendanceColumns: EnterpriseColumnDef<EmployeeAttendance>[] = [
    {
      key: "attendance_date",
      header: "Date",
      render: (row) => accountingDate(row.attendance_date),
    },
    { key: "employee_code", header: "Code" },
    { key: "employee_name", header: "Staff" },
    { key: "employee_department", header: "Department" },
    { key: "status", header: "Status" },
    { key: "worked_hours", header: "Worked" },
    { key: "overtime_hours", header: "OT" },
    {
      key: "leave_request_no",
      header: "Leave Ref",
      render: (row) => row.leave_request_no || "—",
    },
    { key: "recorded_by_username", header: "Recorded By" },
  ];

  const activeEmployees = employees.filter((employee) => employee.is_active).length;
  const todayAttendance = attendanceRows.filter(
    (row) => row.attendance_date === new Date().toISOString().slice(0, 10)
  ).length;
  const overtimeTracked = attendanceRows.reduce(
    (sum, row) => sum + Number(row.overtime_hours ?? 0),
    0
  );

  return (
    <PortalPage
      title="Staff Register"
      subtitle="Maintain additive staff master data, compensation structures, and attendance capture without mixing workforce operations into auth roles, partner records, or EMI subscription truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Staff" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingAttendance, label: "Attendance Calendar", variant: "secondary" },
        { href: ROUTES.admin.accountingLeave, label: "Leave Register", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenseClaims, label: "Expense Claims", variant: "secondary" },
        { href: ROUTES.admin.accountingStaffLedger, label: "Staff Ledger", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Salary Register", variant: "primary" },
      ]}
      stats={[
        { label: "Staff", value: String(employees.length), tone: "info" },
        { label: "Active", value: String(activeEmployees), tone: "success" },
        { label: "Today Attendance", value: String(todayAttendance), tone: "warning" },
        { label: "Tracked OT Hours", value: overtimeTracked.toFixed(2), tone: "default" },
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

        <WorkspaceSection
          title="Workforce lanes"
          description="Use the dedicated payroll, leave, reimbursement, and staff-ledger lanes when the workflow needs approval, accounting posting, or period control."
          contentClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Link
            href={ROUTES.admin.accountingAttendance}
            className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Attendance calendar and daily hours
          </Link>
          <Link
            href={ROUTES.admin.accountingLeave}
            className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Leave types and approval register
          </Link>
          <Link
            href={ROUTES.admin.accountingExpenseClaims}
            className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Staff expense claims and reimbursements
          </Link>
          <Link
            href={ROUTES.admin.accountingStaffLedger}
            className="rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Staff payable and reimbursement ledger
          </Link>
        </WorkspaceSection>

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkspaceSection
            title={selectedEmployee ? "Edit Staff Profile" : "Create Staff Profile"}
            description="Staff master remains operational identity only. Salary accruals, leave approvals, reimbursements, and accounting books stay in their own workflows."
          >
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSaveStaff}>
              <label className="text-sm text-muted-foreground md:col-span-2">
                Name
                <input
                  className={accountingFieldClassName()}
                  value={staffForm.name}
                  onChange={(event) =>
                    setStaffForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Phone
                <input
                  className={accountingFieldClassName()}
                  value={staffForm.phone}
                  onChange={(event) =>
                    setStaffForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Joining date
                <input
                  type="date"
                  className={accountingFieldClassName()}
                  value={staffForm.joining_date}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      joining_date: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Designation
                <input
                  className={accountingFieldClassName()}
                  value={staffForm.designation}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      designation: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Department
                <input
                  className={accountingFieldClassName()}
                  value={staffForm.department}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      department: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Base salary
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={staffForm.base_salary}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      base_salary: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Standard daily hours
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={staffForm.standard_daily_hours}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      standard_daily_hours: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Overtime rate per hour
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={staffForm.overtime_rate_per_hour}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      overtime_rate_per_hour: event.target.value,
                    }))
                  }
                  placeholder="Auto-derive if blank"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground md:col-span-2">
                <input
                  type="checkbox"
                  checked={staffForm.is_active}
                  onChange={(event) =>
                    setStaffForm((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                />
                Staff profile is active for payroll and reimbursement work
              </label>
              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  className={accountingFieldClassName()}
                  value={staffForm.notes}
                  onChange={(event) =>
                    setStaffForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={3}
                />
              </label>

              <div className="rounded-[1.35rem] border border-border bg-background/70 p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Salary Components
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Maintain recurring earning and deduction lines once, then let payroll
                      auto-generate the payslip-ready salary sheet.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addCompensationComponent}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
                  >
                    Add Component
                  </button>
                </div>

                {staffForm.compensation_components.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No recurring components yet. Base salary can still be used on its own.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {staffForm.compensation_components.map((component, index) => (
                      <div
                        key={`${selectedEmployeeId ?? "new"}-${index}`}
                        className="grid gap-3 rounded-[1.15rem] border border-border bg-background p-4 md:grid-cols-6"
                      >
                        <label className="text-sm text-muted-foreground md:col-span-2">
                          Component
                          <input
                            className={accountingFieldClassName()}
                            value={component.component_name}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                component_name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="text-sm text-muted-foreground">
                          Type
                          <select
                            className={accountingFieldClassName()}
                            value={component.component_type}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                component_type: event.target.value as
                                  | "EARNING"
                                  | "DEDUCTION",
                              })
                            }
                          >
                            <option value="EARNING">Earning</option>
                            <option value="DEDUCTION">Deduction</option>
                          </select>
                        </label>
                        <label className="text-sm text-muted-foreground">
                          Amount
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={accountingFieldClassName()}
                            value={component.amount}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                amount: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="text-sm text-muted-foreground">
                          Sort order
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className={accountingFieldClassName()}
                            value={component.sort_order}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                sort_order: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeCompensationComponent(index)}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Remove
                          </button>
                        </div>
                        <label className="text-sm text-muted-foreground md:col-span-5">
                          Notes
                          <input
                            className={accountingFieldClassName()}
                            value={component.notes}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                notes: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={component.is_active}
                            onChange={(event) =>
                              updateCompensationComponent(index, {
                                is_active: event.target.checked,
                              })
                            }
                          />
                          Active
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                >
                  {savingStaff
                    ? "Saving..."
                    : selectedEmployee
                      ? "Update Staff"
                      : "Create Staff"}
                </button>
                {selectedEmployee ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetStaffForm();
                      setError(null);
                      setNotice(null);
                    }}
                    className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Record Attendance"
            description="Attendance remains explicit and editable only through the attendance workflow. Salary, leave, and reimbursements stay separate downstream processes."
          >
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleRecordAttendance}>
              <label className="text-sm text-muted-foreground">
                Staff
                <select
                  className={accountingFieldClassName()}
                  value={attendanceForm.employee}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      employee: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select staff</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_code} · {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Date
                <input
                  type="date"
                  className={accountingFieldClassName()}
                  value={attendanceForm.attendance_date}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      attendance_date: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Status
                <select
                  className={accountingFieldClassName()}
                  value={attendanceForm.status}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      status: event.target.value as EmployeeAttendanceStatus,
                    }))
                  }
                >
                  <option value="PRESENT">Present</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LEAVE">Leave</option>
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Worked hours
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={attendanceForm.worked_hours}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      worked_hours: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Overtime hours
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={accountingFieldClassName()}
                  value={attendanceForm.overtime_hours}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      overtime_hours: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Notes
                <input
                  className={accountingFieldClassName()}
                  value={attendanceForm.notes}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={savingAttendance}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
                >
                  {savingAttendance ? "Recording..." : "Record Attendance"}
                </button>
              </div>
            </form>
          </WorkspaceSection>
        </div>

        <WorkspaceSection
          title="Staff Master"
          description="Use the staff register for workforce identity, salary component defaults, and overtime posture before entering payroll or reimbursement events."
        >
          <EnterpriseDataTable
            data={employees}
            columns={employeeColumns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No staff profiles found"
            emptyDescription="Create the first staff profile above."
          />
        </WorkspaceSection>

        <WorkspaceSection
          title="Recent Attendance"
          description="Recent attendance rows remain operational source records. Leave, salary, and accounting mirrors build on top of them through controlled services."
        >
          <EnterpriseDataTable
            data={attendanceRows}
            columns={attendanceColumns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No attendance recorded"
            emptyDescription="Record the first daily attendance row above."
          />
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
