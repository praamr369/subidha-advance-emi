"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listHrAttendance, listHrStaff, markHrAttendance, type HrStaff } from "@/services/admin-hr";

export default function AdminHrAttendancePage() {
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState("PRESENT");
  const [dateValue, setDateValue] = useState("");

  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canMark = useMemo(() => Boolean(staffId) && Boolean(statusValue), [staffId, statusValue]);

  async function load() {
    try {
      setLoading(true);
      const [staffPayload, attendancePayload] = await Promise.all([listHrStaff(), listHrAttendance()]);
      setStaff(staffPayload.results);
      setRows(attendancePayload.results as Array<Record<string, unknown>>);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load attendance.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleMark() {
    if (!canMark || !staffId) return;
    try {
      await markHrAttendance({
        employee: staffId,
        attendance_date: dateValue || undefined,
        status: statusValue,
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to mark attendance.");
    }
  }

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Attendance"
      subtitle="Mark and review attendance using existing payroll-safe attendance records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Attendance" },
      ]}
      actions={[
        { href: ROUTES.admin.hrStaff, label: "Staff", variant: "secondary" },
        { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Mark attendance</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select
            value={staffId ?? ""}
            onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : null)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">Select staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.employee_code})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <select
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="HALF_DAY">Half day</option>
            <option value="LEAVE">Leave</option>
          </select>
          <button
            type="button"
            onClick={() => void handleMark()}
            disabled={!canMark}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </section>

      {loading ? <LoadingBlock label="Loading attendance..." /> : null}
      {!loading && error ? <ErrorState title="Attendance unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No attendance records" description="Mark attendance to build a daily record." /> : null}

      {!loading && !error && rows.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Recent attendance</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)} className="border-t border-border/60">
                    <td className="py-2 pr-4">{String(row.attendance_date ?? "")}</td>
                    <td className="py-2 pr-4">{String(row.employee_name ?? "")}</td>
                    <td className="py-2 pr-4">{String(row.status ?? "")}</td>
                    <td className="py-2 pr-4">{String(row.overtime_hours ?? "0")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PortalPage>
  );
}

