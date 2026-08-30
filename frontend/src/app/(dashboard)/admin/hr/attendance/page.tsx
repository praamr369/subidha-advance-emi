"use client";

import { useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listHrAttendance, listHrStaff, markHrAttendance, type HrStaff } from "@/services/admin-hr";

export default function AdminHrAttendancePage() {
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [statusValue, setStatusValue] = useState("PRESENT");
  const [dateValue, setDateValue] = useState("");

  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMark = useMemo(() => Boolean(staffId) && Boolean(statusValue), [staffId, statusValue]);

  async function load(isInitial = false) {
    try {
      if (isInitial) setLoading(true); else setRefreshing(true);
      const [staffPayload, attendancePayload] = await Promise.all([
        listHrStaff({ employment_type: "PERMANENT_MONTHLY" }),
        listHrAttendance(),
      ]);
      setStaff(staffPayload.results);
      setRows(attendancePayload.results as Array<Record<string, unknown>>);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load attendance.");
      if (isInitial) setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(true);
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
    <ERPPageShell
      eyebrow="Staff HR — Attendance source workflow"
      title="Attendance"
      subtitle="Attendance source workflow: mark and review attendance records using existing payroll-safe attendance models. Attendance does not auto-generate payroll sheets or salary payments."
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
      stats={[
        { label: "Staff", value: loading ? "—" : staff.length, tone: "info" },
        { label: "Records", value: loading ? "—" : rows.length, tone: "default" },
        { label: "Present", value: loading ? "—" : rows.filter(r => String((r as { status?: unknown }).status ?? "").toUpperCase() === "PRESENT").length, tone: "success" },
        { label: "Absent", value: loading ? "—" : rows.filter(r => String((r as { status?: unknown }).status ?? "").toUpperCase() === "ABSENT").length, tone: !loading && rows.filter(r => String((r as { status?: unknown }).status ?? "").toUpperCase() === "ABSENT").length > 0 ? "warning" : "success" },
      ]}
    >
      <ERPSectionShell title="Mark attendance" description="Writes only through the existing attendance mutation endpoint; no local state becomes authoritative.">
        <div className="grid gap-3 md:grid-cols-4">
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
      </ERPSectionShell>

      {refreshing && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 bg-primary" style={{ animation: "slide 1.2s ease-in-out infinite" }} />
          <style>{`@keyframes slide { 0% { transform:translateX(-100%) } 100% { transform:translateX(400%) } }`}</style>
        </div>
      )}
      {loading ? <ERPLoadingState label="Loading attendance..." /> : null}
      {!loading && error ? <ERPErrorState title="Attendance unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No attendance records" description="Mark attendance to build a daily record." />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title="Recent attendance" description="Read-only view of the most recent attendance rows returned by the current API.">
          <div className="overflow-auto">
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
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
