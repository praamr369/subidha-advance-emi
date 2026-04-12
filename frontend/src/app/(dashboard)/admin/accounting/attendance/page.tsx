"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
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
  getAttendanceCalendar,
  listEmployeeAttendance,
  listEmployees,
  recordEmployeeAttendance,
  type AttendanceCalendarReport,
  type EmployeeAttendance,
  type EmployeeAttendanceStatus,
  type EmployeeProfile,
} from "@/services/accounting";

type AttendanceFormState = {
  employee: string;
  attendance_date: string;
  status: EmployeeAttendanceStatus;
  worked_hours: string;
  overtime_hours: string;
  notes: string;
};

const ATTENDANCE_EMPTY: AttendanceFormState = {
  employee: "",
  attendance_date: new Date().toISOString().slice(0, 10),
  status: "PRESENT",
  worked_hours: "8.00",
  overtime_hours: "0.00",
  notes: "",
};

function statusClassName(status?: EmployeeAttendanceStatus | null): string {
  switch (status) {
    case "PRESENT":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "HALF_DAY":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ABSENT":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "LEAVE":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

export default function AccountingAttendancePage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<EmployeeAttendance[]>([]);
  const [calendar, setCalendar] = useState<AttendanceCalendarReport | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [form, setForm] = useState<AttendanceFormState>(ATTENDANCE_EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [employeesPayload, attendancePayload] = await Promise.all([
          listEmployees({ is_active: 1 }),
          listEmployeeAttendance(),
        ]);
        setEmployees(employeesPayload.results);
        setAttendanceRows(attendancePayload.results);
        if (!selectedEmployeeId && employeesPayload.results[0]) {
          const fallbackEmployeeId = String(employeesPayload.results[0].id);
          setSelectedEmployeeId(fallbackEmployeeId);
          setForm((current) => ({ ...current, employee: fallbackEmployeeId }));
        }
        setError(null);
      } catch (err) {
        setError(accountingErrorMessage(err, "Failed to load attendance workspace."));
        if (mode === "initial") {
          setEmployees([]);
          setAttendanceRows([]);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [selectedEmployeeId]
  );

  async function loadCalendar(employeeId: string, selectedYear: string, selectedMonth: string) {
    if (!employeeId) {
      setCalendar(null);
      return;
    }
    try {
      setCalendarLoading(true);
      const payload = await getAttendanceCalendar({
        employee: Number(employeeId),
        year: Number(selectedYear),
        month: Number(selectedMonth),
      });
      setCalendar(payload);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to load attendance calendar."));
      setCalendar(null);
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  useEffect(() => {
    void loadCalendar(selectedEmployeeId, year, month);
  }, [selectedEmployeeId, year, month]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => String(employee.id) === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await recordEmployeeAttendance({
        employee: Number(form.employee),
        attendance_date: form.attendance_date,
        status: form.status,
        worked_hours: form.worked_hours,
        overtime_hours: form.overtime_hours,
        notes: form.notes,
      });
      setNotice("Attendance recorded.");
      setSelectedEmployeeId(form.employee);
      setForm((current) => ({
        ...ATTENDANCE_EMPTY,
        employee: current.employee,
      }));
      await loadPage("refresh");
      await loadCalendar(form.employee, year, month);
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to record attendance."));
    } finally {
      setSaving(false);
    }
  }

  const columns: EnterpriseColumnDef<EmployeeAttendance>[] = [
    {
      key: "attendance_date",
      header: "Date",
      render: (row) => accountingDate(row.attendance_date),
    },
    { key: "employee_code", header: "Code" },
    { key: "employee_name", header: "Staff" },
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

  const trackedOvertime = attendanceRows.reduce(
    (sum, row) => sum + Number(row.overtime_hours ?? 0),
    0
  );

  return (
    <PortalPage
      title="Attendance"
      subtitle="Attendance remains an operational source register. Overtime, leave linkage, and payroll reporting derive from these rows through workforce services, not from payroll-side edits."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Attendance" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingLeave, label: "Leave Register", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Salary Register", variant: "primary" },
      ]}
      stats={[
        { label: "Active Staff", value: String(employees.length), tone: "info" },
        { label: "Rows", value: String(attendanceRows.length) },
        { label: "OT Hours", value: trackedOvertime.toFixed(2), tone: "warning" },
        { label: "Calendar Staff", value: selectedEmployee?.employee_code ?? "—", tone: "default" },
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

        <div className="grid gap-4 xl:grid-cols-3">
          <WorkspaceSection
            title="Record Attendance"
            description="Re-recording the same employee and date updates the daily row explicitly. Payroll, leave, and journals remain downstream consumers."
          >
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <label className="text-sm text-muted-foreground">
                Staff
                <select
                  className={accountingFieldClassName()}
                  value={form.employee}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, employee: event.target.value }));
                    setSelectedEmployeeId(event.target.value);
                  }}
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
                  value={form.attendance_date}
                  onChange={(event) =>
                    setForm((current) => ({
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
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
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
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-muted-foreground">
                  Worked hours
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={accountingFieldClassName()}
                    value={form.worked_hours}
                    onChange={(event) =>
                      setForm((current) => ({
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
                    value={form.overtime_hours}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        overtime_hours: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="text-sm text-muted-foreground">
                Notes
                <input
                  className={accountingFieldClassName()}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Recording..." : "Record Attendance"}
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Calendar Filters"
            description="Use the monthly attendance calendar to review leave-linked dates, worked hours, and overtime accumulation before closing payroll."
          >
            <div className="grid gap-3">
              <label className="text-sm text-muted-foreground">
                Staff
                <select
                  className={accountingFieldClassName()}
                  value={selectedEmployeeId}
                  onChange={(event) => {
                    setSelectedEmployeeId(event.target.value);
                    setForm((current) => ({ ...current, employee: event.target.value }));
                  }}
                >
                  <option value="">Select staff</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_code} · {employee.name}
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
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                  />
                </label>
                <label className="text-sm text-muted-foreground">
                  Month
                  <input
                    type="number"
                    min="1"
                    max="12"
                    className={accountingFieldClassName()}
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  />
                </label>
              </div>
              {calendar ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.2rem] border border-white/80 bg-white/75 p-4">
                    <div className="text-xs text-muted-foreground">Present / Leave</div>
                    <div className="mt-2 text-xl font-semibold text-foreground">
                      {calendar.summary.present_count} / {calendar.summary.leave_count}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/80 bg-white/75 p-4">
                    <div className="text-xs text-muted-foreground">Worked / OT Hours</div>
                    <div className="mt-2 text-xl font-semibold text-foreground">
                      {calendar.summary.worked_hours} / {calendar.summary.overtime_hours}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a staff member to load the attendance calendar.
                </p>
              )}
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="Attendance Governance"
            description="These controls stay operational, not decorative. Payroll close blocks further edits inside closed periods, and approved leave writes attendance rows explicitly."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Attendance remains a source register for salary, overtime, and leave reporting.</p>
              <p>Leave-linked rows are written by the leave approval workflow, not by hidden payroll edits.</p>
              <p>Closed payroll periods block attendance changes for the locked dates.</p>
            </div>
          </WorkspaceSection>
        </div>

        <WorkspaceSection
          title="Attendance Calendar"
          description="Monthly view for the selected staff member. Empty cells mean no row was recorded for that date."
        >
          {calendarLoading ? (
            <LoadingBlock label="Loading attendance calendar..." />
          ) : calendar ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {calendar.days.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-[1.15rem] border px-4 py-4 text-sm ${statusClassName(day.status)}`}
                >
                  <div className="font-semibold text-foreground">{accountingDate(day.date)}</div>
                  <div className="mt-2 text-xs">{day.status || "No row"}</div>
                  <div className="mt-2 text-xs">
                    Worked {day.worked_hours} • OT {day.overtime_hours}
                  </div>
                  {day.leave_request_id ? (
                    <div className="mt-2 text-xs">Leave request #{day.leave_request_id}</div>
                  ) : null}
                  {day.notes ? <div className="mt-2 text-xs">{day.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Attendance calendar unavailable"
              description="Select a staff member to review the monthly calendar."
            />
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Recent Attendance"
          description="Latest attendance rows across staff. Use this register to verify that daily source records exist before payroll generation."
        >
          <EnterpriseDataTable
            data={attendanceRows}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No attendance rows yet"
            emptyDescription="Record the first daily attendance row above."
          />
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
