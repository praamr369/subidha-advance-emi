"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  createHrLeaveRequest,
  listHrLeaveRequests,
  listHrLeaveTypes,
  listHrStaff,
  patchHrLeaveRequest,
  type HrLeaveRequest,
  type HrLeaveType,
  type HrStaff,
} from "@/services/admin-hr";

export default function AdminHrLeaveRequestsPage() {
  const [rows, setRows] = useState<HrLeaveRequest[]>([]);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ employee: "", leave_type: "", start_date: "", end_date: "", reason: "" });

  async function load() {
    try {
      setLoading(true);
      const [payload, staffPayload, leaveTypePayload] = await Promise.all([
        listHrLeaveRequests(),
        listHrStaff(),
        listHrLeaveTypes({ is_active: 1 }),
      ]);
      setRows(payload.results);
      setStaff(staffPayload.results);
      setLeaveTypes(leaveTypePayload.results);
      setError(null);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load leave requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: number, action: "APPROVE" | "REJECT") {
    try {
      await patchHrLeaveRequest(id, { action, reason: action === "REJECT" ? "Rejected by admin" : undefined });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Leave action failed.");
    }
  }

  async function createForStaff() {
    if (!form.employee || !form.leave_type || !form.start_date) {
      setError("Select staff, leave type, and a start date.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createHrLeaveRequest({
        employee: Number(form.employee),
        leave_type: Number(form.leave_type),
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        reason: form.reason || undefined,
      });
      setForm({ employee: "", leave_type: "", start_date: "", end_date: "", reason: "" });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create leave request for staff.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Staff HR"
      title="Leave Requests"
      subtitle="Approve or reject leave requests (existing leave workflow)."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Leave" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Requests", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Awaiting decision", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "DRAFT").length, tone: !loading && rows.filter(r => String(r.status).toUpperCase() === "DRAFT").length > 0 ? "warning" : "success" },
        { label: "Approved", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "APPROVED").length, tone: "success" },
        { label: "Rejected", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "REJECTED").length, tone: "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading leave requests..." /> : null}
      {!loading && error ? <ERPErrorState title="Leave requests unavailable" description={error} onRetry={() => void load()} /> : null}

      {!loading ? (
        <ERPSectionShell title="Apply leave for staff" description="Raise a leave request directly on a staff member's behalf. It lands in the same draft state as staff self-service requests, so it still goes through Approve/Reject below.">
          <div className="grid gap-3 md:grid-cols-5">
            <select className="rounded-xl border px-3 py-2 text-sm" value={form.employee} onChange={(e) => setForm((c) => ({ ...c, employee: e.target.value }))}>
              <option value="">Select staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.employee_code})</option>)}
            </select>
            <select className="rounded-xl border px-3 py-2 text-sm" value={form.leave_type} onChange={(e) => setForm((c) => ({ ...c, leave_type: e.target.value }))}>
              <option value="">Select leave type</option>
              {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>)}
            </select>
            <input type="date" className="rounded-xl border px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm((c) => ({ ...c, start_date: e.target.value }))} />
            <input type="date" className="rounded-xl border px-3 py-2 text-sm" placeholder="End date (optional)" value={form.end_date} onChange={(e) => setForm((c) => ({ ...c, end_date: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Reason" value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} />
          </div>
          <button type="button" disabled={creating} className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void createForStaff()}>
            {creating ? "Creating..." : "Apply leave for staff"}
          </button>
        </ERPSectionShell>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No leave requests" description="Leave requests will appear once staff submits them through the leave module." />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title="Leave requests" description="Approve/reject actions call the existing leave workflow.">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Request</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Dates</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">{row.request_no}</td>
                    <td className="py-2 pr-4">{row.employee_name}</td>
                    <td className="py-2 pr-4">
                      {row.start_date} → {row.end_date}
                    </td>
                    <td className="py-2 pr-4">{row.status}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void act(row.id, "APPROVE")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void act(row.id, "REJECT")}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
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
