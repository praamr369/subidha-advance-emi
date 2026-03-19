"use client";

import { useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import { apiFetch } from "@/lib/api";

type AuditLog = {
  id: number;
  action_type: string;
  model_name: string;
  object_id: number | string | null;
  performed_by: number | null;
  performed_by_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogListResponse =
  | AuditLog[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      results?: AuditLog[];
    };

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function toAuditRows(payload: AuditLogListResponse): AuditLog[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  async function loadLogs() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (query) params.append("q", query);
      if (modelFilter) params.append("model_name", modelFilter);
      if (actionFilter) params.append("action_type", actionFilter);

      const data = await apiFetch<AuditLogListResponse>(
        `/admin/audit-logs/?${params.toString()}`
      );

      setLogs(toAuditRows(data));
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const filteredLogs = useMemo(() => logs, [logs]);

  return (
    <PortalPage
      title="Audit Logs"
      subtitle="System audit trail for financial and operational events."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="text"
            placeholder="Search..."
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <input
            type="text"
            placeholder="Model"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          />

          <input
            type="text"
            placeholder="Action"
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>

        <div>
          <button
            onClick={() => void loadLogs()}
            className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
          >
            Apply Filters
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading audit logs..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Failed to load audit logs"
            description={error}
            onRetry={() => void loadLogs()}
          />
        ) : null}

        {!loading && !error ? (
          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-left">Object</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Time</th>
                </tr>
              </thead>

              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No audit records found
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="px-4 py-2">{log.id}</td>
                      <td className="px-4 py-2">{log.action_type}</td>
                      <td className="px-4 py-2">{log.model_name}</td>
                      <td className="px-4 py-2">{log.object_id ?? "-"}</td>
                      <td className="px-4 py-2">{log.performed_by_username || "-"}</td>
                      <td className="px-4 py-2">{formatDate(log.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}