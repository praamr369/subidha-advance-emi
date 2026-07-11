"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type Claim = {
  id: number;
  customer_name: string;
  product_name: string;
  defect_type: string;
  status: string;
  created_at: string;
  preferred_date: string | null;
  description: string;
};

const STATUS_COLOR: Record<string, string> = {
  FILED: "bg-gray-100 text-gray-600",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  APPROVED: "bg-purple-100 text-purple-700",
  SCHEDULED: "bg-orange-100 text-orange-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  RESOLVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function WarrantyClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("OPEN");
  const [scheduling, setScheduling] = useState<number | null>(null);
  const [schedDate, setSchedDate] = useState("");
  const [techName, setTechName] = useState("");

  useEffect(() => {
    const qs = filter === "OPEN"
      ? "status=FILED,UNDER_REVIEW,APPROVED,SCHEDULED,IN_PROGRESS"
      : filter === "RESOLVED" ? "status=RESOLVED" : "";
    apiFetch(`/api/v1/warranty/admin-claims/?${qs}`)
      .then((d) => setClaims(Array.isArray(d) ? d as Claim[] : ((d as { results?: Claim[] })?.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, scheduling]);

  const handleApprove = async (id: number) => {
    await apiFetch(`/api/v1/warranty/claim/${id}/approve/`, { method: "POST" });
    setClaims((prev) => prev.map((c) => c.id === id ? { ...c, status: "APPROVED" } : c));
  };

  const handleSchedule = async (id: number) => {
    await apiFetch(`/api/v1/warranty/claim/${id}/schedule/`, {
      method: "POST",
      body: JSON.stringify({ scheduled_date: schedDate, technician_name: techName }),
    });
    setScheduling(null);
    setSchedDate("");
    setTechName("");
  };

  return (
    <ERPPageShell
      title="Warranty Claims"
      subtitle="Review and process customer warranty service requests"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Warranty Claims" }]}
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {["OPEN", "RESOLVED", "ALL"].map((f) => (
            <button key={f} onClick={() => { setFilter(f); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f ? "bg-orange-600 text-white" : "border hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              {f}
            </button>
          ))}
        </div>

        <WorkspaceSection title={`${claims.length} Claim${claims.length !== 1 ? "s" : ""}`}>
          {loading && <div className="py-8 text-center text-gray-500">Loading...</div>}
          {!loading && claims.length === 0 && (
            <div className="py-12 text-center text-gray-500">No claims in this category.</div>
          )}
          {claims.map((c) => (
            <div key={c.id} className="p-4 border rounded-lg mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">#{c.id} — {c.product_name}</div>
                  <div className="text-sm text-gray-500">{c.customer_name} · {c.defect_type?.replace(/_/g, " ")}</div>
                  <div className="text-sm text-gray-600 mt-1 line-clamp-2">{c.description}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || "bg-gray-100"}`}>
                  {c.status?.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>{new Date(c.created_at).toLocaleDateString("en-IN")}</span>
                {c.preferred_date && <span>Preferred: {new Date(c.preferred_date).toLocaleDateString("en-IN")}</span>}
              </div>

              {c.status === "FILED" && (
                <button onClick={() => handleApprove(c.id)}
                  className="mt-3 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                  Approve Claim
                </button>
              )}
              {c.status === "APPROVED" && (
                scheduling === c.id ? (
                  <div className="mt-3 flex gap-2 items-end">
                    <input type="date" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800"
                      value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
                    <input type="text" className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 flex-1"
                      placeholder="Technician name" value={techName} onChange={(e) => setTechName(e.target.value)} />
                    <button onClick={() => handleSchedule(c.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">Schedule</button>
                    <button onClick={() => setScheduling(null)} className="px-3 py-1.5 border rounded text-xs">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setScheduling(c.id)}
                    className="mt-3 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700">
                    Schedule Service
                  </button>
                )
              )}
            </div>
          ))}
        </WorkspaceSection>
      </div>
    </ERPPageShell>
  );
}
