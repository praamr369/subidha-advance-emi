"use client";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { getStaffAttendance, type StaffAttendancePayload } from "@/services/staff";

export default function StaffAttendancePage() {
  return (
    <StaffDataPage<StaffAttendancePayload>
      title="Attendance"
      description="Read-only view of your own attendance. Check-in/check-out actions are not exposed from this portal."
      load={() => getStaffAttendance()}
      empty={(data) => data.results.length === 0}
      emptyMessage="No attendance records found for your profile."
      render={(data) => (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-4">
            {Object.entries(data.counts).map(([status, count]) => (
              <div key={status} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{count}</div>
              </div>
            ))}
          </section>
          <section className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3">Overtime</th><th className="px-4 py-3">Notes</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.results.map((row) => (
                  <tr key={row.id}><td className="px-4 py-3">{row.attendance_date}</td><td className="px-4 py-3 font-semibold">{row.status}</td><td className="px-4 py-3">{row.worked_hours || "0.00"}</td><td className="px-4 py-3">{row.overtime_hours || "0.00"}</td><td className="px-4 py-3 text-muted-foreground">{row.notes || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    />
  );
}
