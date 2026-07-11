"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Grievance = {
  id: number;
  customer_name: string;
  grievance_type: string;
  subject: string;
  status: "PENDING" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED";
  created_at: string;
  sla_deadline: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
  ESCALATED: "bg-red-100 text-red-700",
};

export default function PrivacyGrievancesAdminPage() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");

  useEffect(() => {
    apiFetch("/api/v1/privacy/admin-grievances/")
      .then((d) => setGrievances(Array.isArray(d) ? d as Grievance[] : ((d as { results?: Grievance[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [responding]);

  const handleResolve = async (id: number) => {
    if (!resolution.trim()) return;
    setResponding(id);
    try {
      await apiFetch(`/api/v1/privacy/grievance/${id}/resolve/`, {
        method: "POST",
        body: JSON.stringify({ resolution_notes: resolution }),
      });
      setGrievances((prev) => prev.map((g) => g.id === id ? { ...g, status: "RESOLVED", resolution_notes: resolution } : g));
      setResolution("");
    } catch {
      // silent
    } finally {
      setResponding(null);
    }
  };

  const overdue = grievances.filter((g) => g.status !== "RESOLVED" && new Date(g.sla_deadline) < new Date());

  return (
    <ERPPageShell
      title="Privacy Grievances (DPO)"
      subtitle="Customer privacy complaints — 30-day SLA (DPDP 2023 Article 9)"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Privacy", href: "/admin/privacy/compliance" }, { label: "Grievances" }]}
    >
      <div className="space-y-6">
        {overdue.length > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 rounded-xl">
            <div className="font-bold text-red-800">⚠️ {overdue.length} grievance(s) past 30-day SLA</div>
            <div className="text-sm text-red-700 mt-1">Respond immediately to avoid DPDP 2023 non-compliance.</div>
          </div>
        )}

        <WorkspaceSection title={`${grievances.length} Grievance${grievances.length !== 1 ? "s" : ""}`}>
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && grievances.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-medium">No pending grievances</p>
            </div>
          )}
          {grievances.map((g) => {
            const isOverdue = g.status !== "RESOLVED" && new Date(g.sla_deadline) < new Date();
            const daysLeft = Math.ceil((new Date(g.sla_deadline).getTime() - Date.now()) / 86400000);
            return (
              <div key={g.id} className={`p-4 border rounded-lg mb-3 ${isOverdue ? "border-red-400" : ""}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">#{g.id} — {g.subject}</div>
                    <div className="text-sm text-gray-500">{g.customer_name} · {g.grievance_type?.replace(/_/g, " ")}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[g.status]}`}>
                    {g.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>Filed: {new Date(g.created_at).toLocaleDateString("en-IN")}</span>
                  <span className={isOverdue ? "text-red-600 font-bold" : daysLeft < 5 ? "text-orange-600" : ""}>
                    SLA: {new Date(g.sla_deadline).toLocaleDateString("en-IN")}
                    {isOverdue ? " ⚠️ OVERDUE" : daysLeft < 5 ? ` (${daysLeft}d left)` : ""}
                  </span>
                </div>

                {g.resolution_notes && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700">
                    Resolution: {g.resolution_notes}
                  </div>
                )}

                {g.status !== "RESOLVED" && (
                  responding === g.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-600 resize-none text-sm"
                        rows={3}
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Resolution notes for the customer..."
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setResponding(null); setResolution(""); }}
                          className="flex-1 py-1.5 border rounded text-xs">Cancel</button>
                        <button onClick={() => handleResolve(g.id)}
                          className="flex-1 py-1.5 bg-green-600 text-white rounded text-xs">Mark Resolved</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setResponding(g.id)}
                      className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      Respond & Resolve
                    </button>
                  )
                )}
              </div>
            );
          })}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
