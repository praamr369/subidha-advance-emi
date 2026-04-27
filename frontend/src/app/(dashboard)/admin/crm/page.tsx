"use client";

import { useEffect, useState } from "react";

import { Customer360Panel } from "@/components/admin/erp/Customer360Panel";
import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import type { CrmWorkspacePayload } from "@/services/admin-erp";
import { getAdminCrmWorkspace } from "@/services/admin-erp";

export default function AdminCrmOverviewPage() {
  const [payload, setPayload] = useState<CrmWorkspacePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminCrmWorkspace()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load CRM workspace.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <WorkspaceShell
      title="CRM Workspace"
      subtitle="Lead management, follow-up continuity, customer 360 visibility, and support posture from canonical records."
    >
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {payload ? (
        <>
          <PipelineBoard title="CRM Pipeline" cards={payload.crm_pipeline} />
          <PipelineBoard title="Today Work (CRM related)" cards={payload.today_work} />
          <Customer360Panel customers={payload.customer_360} />
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">Loading CRM workspace...</div>
      )}
    </WorkspaceShell>
  );
}
