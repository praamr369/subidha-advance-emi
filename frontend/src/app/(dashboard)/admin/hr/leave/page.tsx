"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listHrLeaveRequests, patchHrLeaveRequest, type HrLeaveRequest } from "@/services/admin-hr";

export default function AdminHrLeaveRequestsPage() {
  const [rows, setRows] = useState<HrLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const payload = await listHrLeaveRequests();
      setRows(payload.results);
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
        { label: "Pending", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "PENDING").length, tone: !loading && rows.filter(r => String(r.status).toUpperCase() === "PENDING").length > 0 ? "warning" : "success" },
        { label: "Approved", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "APPROVED").length, tone: "success" },
        { label: "Rejected", value: loading ? "—" : rows.filter(r => String(r.status).toUpperCase() === "REJECTED").length, tone: "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading leave requests..." /> : null}
      {!loading && error ? <ERPErrorState title="Leave requests unavailable" description={error} onRetry={() => void load()} /> : null}
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
