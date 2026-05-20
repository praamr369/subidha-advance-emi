"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { getInternalCrmFollowUps } from "@/services/crm-module";

type FollowUpRow = {
  id: number;
  lead: number;
  customer: number | null;
  due_at: string;
  status: string;
  call_note: string;
  is_overdue: boolean;
};

export default function AdminCrmFollowUpsPage() {
  const [rows, setRows] = useState<FollowUpRow[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = await getInternalCrmFollowUps();
        if (!active) return;
        const typed = payload as { results?: FollowUpRow[]; overdue_count?: number };
        setRows(Array.isArray(typed?.results) ? typed.results : []);
        setOverdue(Number(typed?.overdue_count || 0));
        setError(null);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : "Unable to load follow-up queue.";
        setError(message);
        setRows([]);
        setOverdue(0);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <ERPPageShell
      title="CRM Follow-ups"
      subtitle="Due and overdue follow-up tasks with assignment and call-note context."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "CRM", href: "/admin/crm" }, { label: "Follow-ups" }]}
      stats={[{ label: "Overdue", value: String(overdue), tone: overdue > 0 ? "warning" : "success" }]}
    >
      <ERPSectionShell
        title="Follow-up queue"
        description="Review due calls and overdue follow-ups. Ownership of subscription creation, payments, and posting remains in their dedicated modules."
      >
        {loading ? <ERPLoadingState label="Loading follow-ups..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load follow-ups" description={error} />
        ) : null}

        {!loading && !error ? (
          rows.length === 0 ? (
            <ERPEmptyState title="No follow-up tasks" description="No due or overdue follow-ups are pending right now." />
          ) : (
            <div className="overflow-x-auto rounded-[1.25rem] border border-border/70 bg-[var(--surface-card-elevated)] shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[color-mix(in_oklab,var(--surface-muted)_55%,transparent)]">
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-4 py-3 font-medium text-foreground">#{row.id} · Lead {row.lead}</td>
                      <td className="px-4 py-3">{new Date(row.due_at).toLocaleString()}</td>
                      <td className="px-4 py-3">{row.is_overdue ? "OVERDUE" : row.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.call_note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
