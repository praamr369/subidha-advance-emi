"use client";

import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
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

  useEffect(() => {
    void getInternalCrmFollowUps().then((payload) => {
      const typed = payload as { results?: FollowUpRow[]; overdue_count?: number };
      setRows(Array.isArray(typed?.results) ? typed.results : []);
      setOverdue(Number(typed?.overdue_count || 0));
    });
  }, []);

  return (
    <PortalPage
      title="CRM Follow-ups"
      subtitle="Due and overdue follow-up tasks with assignment and call-note context."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "CRM", href: "/admin/crm" }, { label: "Follow-ups" }]}
      stats={[{ label: "Overdue", value: String(overdue), tone: overdue > 0 ? "warning" : "success" }]}
    >
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">#{row.id} / Lead {row.lead}</td>
                <td className="px-3 py-2">{new Date(row.due_at).toLocaleString()}</td>
                <td className="px-3 py-2">{row.is_overdue ? "OVERDUE" : row.status}</td>
                <td className="px-3 py-2">{row.call_note || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No follow-up tasks.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </PortalPage>
  );
}

