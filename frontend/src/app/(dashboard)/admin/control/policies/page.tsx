"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { getPolicies, type BusinessPolicy } from "@/services/control-enterprise";

export default function AdminControlPoliciesPage() {
  const [rows, setRows] = useState<BusinessPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getPolicies());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policies.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ERPPageShell
      eyebrow="Enterprise Control"
      title="Business Policies"
      subtitle="Enterprise policy toggles. Changes take effect immediately and are audit-logged."
      breadcrumbs={[
        { href: ROUTES.admin.dashboard, label: "Admin" },
        { href: ROUTES.admin.controlRoot, label: "Control Desk" },
        { label: "Policies" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Policies", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Enabled", value: loading ? "—" : rows.filter(r => r.is_enabled).length, tone: "success" },
        { label: "Disabled", value: loading ? "—" : rows.filter(r => !r.is_enabled).length, tone: "default" },
      ]}
    >
      {loading && <LoadingBlock />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && <EmptyState title="No policies" description="No business policies found." />}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Policy Key</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Enabled</th>
                <th className="px-4 py-3">Last Updated By</th>
                <th className="px-4 py-3">Updated At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{row.policy_key}</td>
                  <td className="px-4 py-3">{row.description}</td>
                  <td className="px-4 py-3">
                    <span className={row.is_enabled ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                      {row.is_enabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.updated_by_username ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ERPPageShell>
  );
}
