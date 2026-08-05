"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type ServiceJob = {
  id: number;
  claim_id: number;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  defect_type: string;
  preferred_date: string | null;
  scheduled_date: string | null;
  technician_name: string | null;
  status: string;
  address: string;
};

export default function ServiceSchedulePage() {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ scheduled_date: "", technician_name: "" });

  useEffect(() => {
    apiFetch("/api/v1/warranty/service-schedule/")
      .then((d) => setJobs(Array.isArray(d) ? d as ServiceJob[] : ((d as { results?: ServiceJob[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [editing]);

  const handleSave = async (id: number) => {
    await apiFetch(`/api/v1/warranty/claim/${id}/schedule/`, {
      method: "POST",
      body: JSON.stringify(editForm),
    });
    setEditing(null);
  };

  const handleComplete = async (id: number) => {
    await apiFetch(`/api/v1/warranty/service-call/${id}/complete/`, { method: "POST" });
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, status: "RESOLVED" } : j));
  };

  const today = new Date().toISOString().split("T")[0];
  const todayJobs = jobs.filter((j) => j.scheduled_date?.startsWith(today));
  const upcomingJobs = jobs.filter((j) => j.scheduled_date && j.scheduled_date > today && j.status !== "RESOLVED");
  const unscheduled = jobs.filter((j) => !j.scheduled_date && j.status !== "RESOLVED");

  return (
    <ERPPageShell
      title="Service Scheduling"
      subtitle="Assign technicians and schedule warranty service visits"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Service", href: "/admin/service-desk" }, { label: "Schedule" }]}
    >
      <div className="space-y-6">
        {!loading && (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border rounded-xl border-orange-200 bg-orange-50 dark:bg-orange-900/20">
              <div className="text-2xl font-bold text-orange-700">{todayJobs.length}</div>
              <div className="text-xs text-orange-600 mt-1">Today's Visits</div>
            </div>
            <div className="p-4 border rounded-xl">
              <div className="text-2xl font-bold">{upcomingJobs.length}</div>
              <div className="text-xs text-gray-500 mt-1">Upcoming Scheduled</div>
            </div>
            <div className="p-4 border rounded-xl border-red-200 bg-red-50 dark:bg-red-900/20">
              <div className="text-2xl font-bold text-red-700">{unscheduled.length}</div>
              <div className="text-xs text-red-600 mt-1">Needs Scheduling</div>
            </div>
          </div>
        )}

        {unscheduled.length > 0 && (
          <WorkspaceSection title="Unscheduled — Action Required">
            {unscheduled.map((job) => (
              <div key={job.id} className="p-4 border border-red-200 rounded-lg mb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{job.product_name}</div>
                    <div className="text-sm text-gray-500">{job.customer_name} · {job.customer_phone}</div>
                    <div className="text-sm text-gray-600">{job.defect_type?.replace(/_/g, " ")} · {job.address}</div>
                    {job.preferred_date && (
                      <div className="text-xs text-blue-600 mt-1">Preferred: {new Date(job.preferred_date).toLocaleDateString("en-IN")}</div>
                    )}
                  </div>
                </div>
                {editing === job.id ? (
                  <div className="mt-3 flex gap-2 items-end flex-wrap">
                    <input type="date" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800"
                      value={editForm.scheduled_date} onChange={(e) => setEditForm({ ...editForm, scheduled_date: e.target.value })}
                      min={today} />
                    <input type="text" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 flex-1 min-w-32"
                      placeholder="Technician name"
                      value={editForm.technician_name} onChange={(e) => setEditForm({ ...editForm, technician_name: e.target.value })} />
                    <button onClick={() => handleSave(job.claim_id)} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs">Save</button>
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditing(job.id); setEditForm({ scheduled_date: "", technician_name: "" }); }}
                    className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                    Schedule Visit
                  </button>
                )}
              </div>
            ))}
          </WorkspaceSection>
        )}

        <WorkspaceSection title={`Today's Schedule — ${todayJobs.length} Visit${todayJobs.length !== 1 ? "s" : ""}`}>
          {loading && <div className="py-4 text-center text-gray-500">Loading...</div>}
          {!loading && todayJobs.length === 0 && <div className="py-6 text-center text-gray-500 text-sm">No visits scheduled for today.</div>}
          {todayJobs.map((job) => (
            <div key={job.id} className="p-4 border rounded-lg mb-2 flex items-start justify-between">
              <div>
                <div className="font-medium">{job.product_name}</div>
                <div className="text-sm text-gray-500">{job.customer_name} · {job.customer_phone}</div>
                <div className="text-sm text-gray-500">{job.address}</div>
                {job.technician_name && <div className="text-xs text-blue-600 mt-1">Technician: {job.technician_name}</div>}
              </div>
              {job.status !== "RESOLVED" && (
                <button onClick={() => handleComplete(job.id)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex-shrink-0">
                  Mark Complete
                </button>
              )}
            </div>
          ))}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
