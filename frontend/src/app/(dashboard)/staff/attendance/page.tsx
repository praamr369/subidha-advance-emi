"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getStaffAttendance,
  staffCheckIn,
  type StaffAttendancePayload,
} from "@/services/staff";

export default function StaffAttendancePage() {
  const [data, setData] = useState<StaffAttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getStaffAttendance();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckIn = useCallback(async () => {
    setCheckingIn(true);
    setMessage(null);
    setError(null);
    try {
      const res = await staffCheckIn();
      setMessage(res.detail);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setCheckingIn(false);
    }
  }, [load]);

  const attendanceRows = Array.isArray(data?.results) ? data.results : [];

  return (
    <div className="space-y-6 p-1">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Your attendance record. Use check-in to mark yourself present today.
          </p>
        </div>
        <button
          onClick={handleCheckIn}
          disabled={checkingIn}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {checkingIn ? "Checking in…" : "Check in today"}
        </button>
      </header>

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading attendance…</p>
      ) : !data || attendanceRows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No attendance records found for your profile.
        </p>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-4">
            {Object.entries(data.counts ?? {}).map(([status, count]) => (
              <div
                key={status}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {status}
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {count}
                </div>
              </div>
            ))}
          </section>
          <section className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Worked</th>
                  <th className="px-4 py-3">Overtime</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attendanceRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.attendance_date}</td>
                    <td className="px-4 py-3 font-semibold">{row.status}</td>
                    <td className="px-4 py-3">{row.worked_hours || "0.00"}</td>
                    <td className="px-4 py-3">{row.overtime_hours || "0.00"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
