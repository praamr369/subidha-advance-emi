"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cancelStaffLeaveRequest,
  createStaffLeaveRequest,
  getStaffLeaveBalance,
  getStaffLeaveRequests,
  getStaffLeaveTypes,
  type StaffLeaveBalanceRow,
  type StaffLeaveRequest,
  type StaffLeaveType,
} from "@/services/staff";

export default function StaffLeavePage() {
  const [leaveTypes, setLeaveTypes] = useState<StaffLeaveType[]>([]);
  const [requests, setRequests] = useState<StaffLeaveRequest[]>([]);
  const [balance, setBalance] = useState<StaffLeaveBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ leave_type: "", start_date: "", end_date: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesPayload, requestsPayload, balancePayload] = await Promise.all([
        getStaffLeaveTypes(),
        getStaffLeaveRequests(),
        getStaffLeaveBalance(),
      ]);
      setLeaveTypes(typesPayload.results);
      setRequests(requestsPayload.results);
      setBalance(balancePayload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    if (!form.leave_type || !form.start_date) {
      setError("Select a leave type and start date.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await createStaffLeaveRequest({
        leave_type: Number(form.leave_type),
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        reason: form.reason || undefined,
      });
      setForm({ leave_type: "", start_date: "", end_date: "", reason: "" });
      setMessage("Leave request submitted. Awaiting admin approval.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit leave request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    setMessage(null);
    setError(null);
    try {
      await cancelStaffLeaveRequest(id, "Cancelled by staff member.");
      setMessage("Leave request cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel leave request.");
    }
  }

  return (
    <div className="space-y-6 p-1">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Leave</h1>
        <p className="text-sm text-muted-foreground">Submit a leave request and track its approval status. Balance shown is approved days taken this year against your annual allowance.</p>
      </header>

      {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading leave data…</p>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3">
            {balance.map((row) => (
              <div key={row.leave_type_id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.leave_type_name} ({row.leave_type_code})
                </div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {row.available_now ?? row.remaining_this_year ?? "—"} <span className="text-sm font-normal text-muted-foreground">available now</span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <div>Earned so far this year: <span className="font-semibold text-foreground">{row.earned_to_date ?? "—"}</span> of {row.annual_allowance_days ?? "unlimited"}</div>
                  <div>Used (approved): <span className="font-semibold text-foreground">{row.taken_this_year}</span> · Pending: <span className="font-semibold text-foreground">{row.pending_approval}</span></div>
                  <div>Left this year: <span className="font-semibold text-foreground">{row.remaining_this_year ?? "—"}</span> · {row.is_paid ? "Paid leave" : "Unpaid leave"}</div>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Submit a leave request</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.leave_type} onChange={(e) => setForm((c) => ({ ...c, leave_type: e.target.value }))}>
                <option value="">Select leave type</option>
                {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
              </select>
              <input type="date" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm((c) => ({ ...c, start_date: e.target.value }))} />
              <input type="date" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="End date (optional)" value={form.end_date} onChange={(e) => setForm((c) => ({ ...c, end_date: e.target.value }))} />
              <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Reason" value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} />
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit leave request"}
            </button>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">No leave requests yet.</td>
                  </tr>
                ) : (
                  requests.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-mono text-xs">{row.request_no}</td>
                      <td className="px-4 py-3">{row.leave_type_name}</td>
                      <td className="px-4 py-3">{row.start_date} → {row.end_date}</td>
                      <td className="px-4 py-3">{row.day_count}</td>
                      <td className="px-4 py-3 font-semibold">{row.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.reason || "—"}</td>
                      <td className="px-4 py-3">
                        {row.status === "DRAFT" ? (
                          <button
                            onClick={() => void handleCancel(row.id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
