"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
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
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  createLeaveType,
  listEmployees,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  type EmployeeProfile,
  type LeaveRequest,
  type LeaveType,
} from "@/services/accounting";

type LeaveTypeFormState = {
  code: string;
  name: string;
  is_paid: boolean;
  annual_allowance_days: string;
  notes: string;
};

type LeaveRequestFormState = {
  employee: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  day_count: string;
  reason: string;
  notes: string;
};

const LEAVE_TYPE_EMPTY: LeaveTypeFormState = {
  code: "",
  name: "",
  is_paid: true,
  annual_allowance_days: "",
  notes: "",
};

const today = new Date().toISOString().slice(0, 10);

const LEAVE_REQUEST_EMPTY: LeaveRequestFormState = {
  employee: "",
  leave_type: "",
  start_date: today,
  end_date: today,
  day_count: "1.0",
  reason: "",
  notes: "",
};

function deriveInclusiveDayCount(startDate: string, endDate: string): string {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "1.0";
  return String(Math.floor((end - start) / 86400000) + 1) + ".0";
}

export default function AccountingLeavePage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypeForm, setLeaveTypeForm] = useState<LeaveTypeFormState>(LEAVE_TYPE_EMPTY);
  const [leaveRequestForm, setLeaveRequestForm] =
    useState<LeaveRequestFormState>(LEAVE_REQUEST_EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [employeesPayload, leaveTypesPayload, leaveRequestsPayload] =
          await Promise.all([
            listEmployees({ is_active: 1 }),
            listLeaveTypes(),
            listLeaveRequests(),
          ]);
        setEmployees(employeesPayload.results);
        setLeaveTypes(leaveTypesPayload.results);
        setLeaveRequests(leaveRequestsPayload.results);
        if (!leaveRequestForm.employee && employeesPayload.results[0]) {
          setLeaveRequestForm((current) => ({
            ...current,
            employee: String(employeesPayload.results[0].id),
          }));
        }
        if (!leaveRequestForm.leave_type && leaveTypesPayload.results[0]) {
          setLeaveRequestForm((current) => ({
            ...current,
            leave_type: String(leaveTypesPayload.results[0].id),
          }));
        }
        setError(null);
      } catch (err) {
        setError(accountingErrorMessage(err, "Failed to load leave workspace."));
        if (mode === "initial") {
          setEmployees([]);
          setLeaveTypes([]);
          setLeaveRequests([]);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [leaveRequestForm.employee, leaveRequestForm.leave_type]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  async function handleCreateLeaveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createLeaveType({
        ...leaveTypeForm,
        annual_allowance_days: leaveTypeForm.annual_allowance_days || null,
      });
      setLeaveTypeForm(LEAVE_TYPE_EMPTY);
      setNotice("Leave type created.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create leave type."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLeaveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createLeaveRequest({
        employee: Number(leaveRequestForm.employee),
        leave_type: Number(leaveRequestForm.leave_type),
        start_date: leaveRequestForm.start_date,
        end_date: leaveRequestForm.end_date,
        day_count: leaveRequestForm.day_count,
        reason: leaveRequestForm.reason,
        notes: leaveRequestForm.notes,
      });
      setLeaveRequestForm((current) => ({
        ...LEAVE_REQUEST_EMPTY,
        employee: current.employee,
        leave_type: current.leave_type,
      }));
      setNotice("Leave request created.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create leave request."));
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id: number) {
    setError(null);
    setNotice(null);
    try {
      await approveLeaveRequest(id);
      setNotice("Leave request approved.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to approve leave request."));
    }
  }

  async function handleReject(id: number) {
    const reason = window.prompt("Rejection reason", "") ?? "";
    if (!reason.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await rejectLeaveRequest(id, reason);
      setNotice("Leave request rejected.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to reject leave request."));
    }
  }

  async function handleCancel(id: number) {
    const reason = window.prompt("Cancellation reason", "") ?? "";
    if (!reason.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await cancelLeaveRequest(id, reason);
      setNotice("Leave request cancelled.");
      await loadPage("refresh");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to cancel leave request."));
    }
  }

  const requestColumns: EnterpriseColumnDef<LeaveRequest>[] = [
    { key: "request_no", header: "Request" },
    { key: "employee_code", header: "Code" },
    { key: "employee_name", header: "Staff" },
    { key: "leave_type_name", header: "Type" },
    {
      key: "start_date",
      header: "Dates",
      render: (row) =>
        `${accountingDate(row.start_date)} to ${accountingDate(row.end_date)}`,
    },
    { key: "day_count", header: "Days" },
    { key: "status", header: "Status" },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.status === "DRAFT" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleApprove(row.id)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleReject(row.id)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => void handleCancel(row.id)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          "—"
        ),
    },
  ];

  const approvedCount = leaveRequests.filter((request) => request.status === "APPROVED").length;
  const paidLeaveTypes = leaveTypes.filter((type) => type.is_paid).length;

  return (
    <PortalPage
      title="Leave Register"
      subtitle="Leave is kept as a separate operational workflow with explicit approval and attendance sync. Payroll consumes approved leave safely instead of mutating salary sheets by hand."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Leave" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingAttendance, label: "Attendance", variant: "secondary" },
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Salary Register", variant: "primary" },
      ]}
      stats={[
        { label: "Leave Types", value: String(leaveTypes.length), tone: "info" },
        { label: "Paid Types", value: String(paidLeaveTypes), tone: "success" },
        { label: "Requests", value: String(leaveRequests.length) },
        { label: "Approved", value: String(approvedCount), tone: approvedCount > 0 ? "warning" : "success" },
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

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkspaceSection
            title="Create Leave Type"
            description="Keep leave master data separate from staff attendance rows and payroll posting."
          >
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateLeaveType}>
              <label className="text-sm text-muted-foreground">
                Code
                <input
                  className={accountingFieldClassName()}
                  value={leaveTypeForm.code}
                  onChange={(event) =>
                    setLeaveTypeForm((current) => ({ ...current, code: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Name
                <input
                  className={accountingFieldClassName()}
                  value={leaveTypeForm.name}
                  onChange={(event) =>
                    setLeaveTypeForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Annual allowance days
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={accountingFieldClassName()}
                  value={leaveTypeForm.annual_allowance_days}
                  onChange={(event) =>
                    setLeaveTypeForm((current) => ({
                      ...current,
                      annual_allowance_days: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={leaveTypeForm.is_paid}
                  onChange={(event) =>
                    setLeaveTypeForm((current) => ({
                      ...current,
                      is_paid: event.target.checked,
                    }))
                  }
                />
                Paid leave type
              </label>
              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  rows={3}
                  className={accountingFieldClassName()}
                  value={leaveTypeForm.notes}
                  onChange={(event) =>
                    setLeaveTypeForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60 md:col-span-2"
              >
                {saving ? "Saving..." : "Create Leave Type"}
              </button>
            </form>
          </WorkspaceSection>

          <WorkspaceSection
            title="Create Leave Request"
            description="Approved requests write leave attendance rows explicitly. Rejected or cancelled requests leave payroll source data unchanged."
          >
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateLeaveRequest}>
              <label className="text-sm text-muted-foreground">
                Staff
                <select
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.employee}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
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
                Leave type
                <select
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.leave_type}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      leave_type: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((leaveType) => (
                    <option key={leaveType.id} value={leaveType.id}>
                      {leaveType.code} · {leaveType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted-foreground">
                Start date
                <input
                  type="date"
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.start_date}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      start_date: event.target.value,
                      day_count: deriveInclusiveDayCount(
                        event.target.value,
                        current.end_date
                      ),
                    }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                End date
                <input
                  type="date"
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.end_date}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      end_date: event.target.value,
                      day_count: deriveInclusiveDayCount(
                        current.start_date,
                        event.target.value
                      ),
                    }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Day count
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.day_count}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      day_count: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Reason
                <input
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.reason}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm text-muted-foreground md:col-span-2">
                Notes
                <textarea
                  rows={3}
                  className={accountingFieldClassName()}
                  value={leaveRequestForm.notes}
                  onChange={(event) =>
                    setLeaveRequestForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:opacity-60 md:col-span-2"
              >
                {saving ? "Saving..." : "Create Leave Request"}
              </button>
            </form>
          </WorkspaceSection>
        </div>

        <WorkspaceSection
          title="Leave Types"
          description="Paid versus unpaid leave matters because salary auto-generation can derive leave deductions only from approved unpaid requests."
        >
          {leaveTypes.length === 0 ? (
            <EmptyState
              title="No leave types yet"
              description="Create the first leave type above."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {leaveTypes.map((leaveType) => (
                <div
                  key={leaveType.id}
                  className="rounded-[1.2rem] border border-white/80 bg-white/75 p-4"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {leaveType.code} · {leaveType.name}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {leaveType.is_paid ? "Paid" : "Unpaid"} • Allowance{" "}
                    {leaveType.annual_allowance_days || "—"}
                  </div>
                  {leaveType.notes ? (
                    <div className="mt-2 text-xs text-muted-foreground">{leaveType.notes}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          title="Leave Requests"
          description="Only draft requests can be approved, rejected, or cancelled. Approval writes explicit leave attendance rows for the approved dates."
        >
          <EnterpriseDataTable
            data={leaveRequests}
            columns={requestColumns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage("initial")}
            emptyTitle="No leave requests"
            emptyDescription="Create the first leave request above."
          />
        </WorkspaceSection>
      </div>
    </PortalPage>
  );
}
