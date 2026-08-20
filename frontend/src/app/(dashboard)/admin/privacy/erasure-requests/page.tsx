"use client";

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  createErasureRequest,
  executeErasure,
  getErasurePreview,
  listErasureRequests,
  rejectErasure,
  type ErasurePreview,
  type ErasureRequest,
} from "@/services/erasure";

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: "bg-yellow-100 text-yellow-700",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  PARTIALLY_COMPLETED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

export default function ErasureRequestsPage() {
  const [requests, setRequests] = useState<ErasureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ErasurePreview | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRequests(await listErasureRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const kpis = [
    { label: "Total requests", value: requests.length },
    { label: "Pending", value: requests.filter((r) => !["COMPLETED", "REJECTED"].includes(r.status)).length },
    { label: "Completed", value: requests.filter((r) => r.status === "COMPLETED").length },
    { label: "Overdue", value: requests.filter((r) => r.is_overdue).length },
  ];

  const handleCreate = async () => {
    const customerId = prompt("Customer ID:");
    if (!customerId) return;
    try {
      await createErasureRequest(Number(customerId));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handlePreview = async (id: number) => {
    try {
      setPreview(await getErasurePreview(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleExecute = async (id: number) => {
    if (!confirm("Execute erasure? This anonymizes the customer's PII permanently. Financial records are retained per statutory obligations.")) return;
    try {
      await executeErasure(id);
      setPreview(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt("Rejection reason:");
    if (!reason) return;
    try {
      await rejectErasure(id, reason);
      setPreview(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  };

  return (
    <ERPPageShell
      title="Data Erasure Requests"
      subtitle="DPDP 2023 s.12 — Right to Erasure with financial record retention"
      stats={kpis}
    >
      {loading ? (
        <LoadingBlock label="Loading erasure requests…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : (
        <>
          {preview && (
            <WorkspaceSection title={`Erasure preview — ${preview.customer_name}`}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Fields to erase</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4">Field</th>
                          <th className="pb-2 pr-4">Current value</th>
                          <th className="pb-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.fields_to_erase.map((f) => (
                          <tr key={f.field} className="border-b">
                            <td className="py-1 pr-4 font-mono text-xs">{f.field}</td>
                            <td className="py-1 pr-4">{f.current_value}</td>
                            <td className="py-1 text-red-600">{f.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Fields retained (statutory obligation)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4">Record type</th>
                          <th className="pb-2">Legal basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.fields_retained.map((f) => (
                          <tr key={f.field} className="border-b">
                            <td className="py-1 pr-4">{f.field}</td>
                            <td className="py-1 text-xs text-muted-foreground">{f.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleExecute(preview.erasure_guard_id)} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm hover:bg-red-700">Execute erasure</button>
                  <button onClick={() => handleReject(preview.erasure_guard_id)} className="px-3 py-1.5 rounded bg-gray-200 text-gray-700 text-sm hover:bg-gray-300">Reject</button>
                  <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded bg-gray-100 text-gray-600 text-sm hover:bg-gray-200">Close preview</button>
                </div>
              </div>
            </WorkspaceSection>
          )}

          <WorkspaceSection title="Erasure request register">
            <div className="mb-3">
              <button onClick={handleCreate} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">New erasure request</button>
            </div>
            {requests.length === 0 ? (
              <EmptyState title="No erasure requests" description="DPDP erasure requests will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">Reference</th>
                      <th className="pb-2 pr-4">Customer</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Due date</th>
                      <th className="pb-2 pr-4">Completed</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2 pr-4 font-mono text-xs">{r.request_reference}</td>
                        <td className="py-2 pr-4">{r.customer_name ?? `#${r.customer_id}`}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[r.status] ?? ""}`}>
                            {r.status}
                            {r.is_overdue && <span className="ml-1 text-red-600 font-bold">OVERDUE</span>}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{r.due_date}</td>
                        <td className="py-2 pr-4">{r.completed_at ? new Date(r.completed_at).toLocaleDateString("en-IN") : "—"}</td>
                        <td className="py-2 space-x-1">
                          {!["COMPLETED", "REJECTED"].includes(r.status) && (
                            <>
                              <button onClick={() => handlePreview(r.id)} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Preview</button>
                              <button onClick={() => handleExecute(r.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Execute</button>
                              <button onClick={() => handleReject(r.id)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">Reject</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspaceSection>
        </>
      )}
    </ERPPageShell>
  );
}
