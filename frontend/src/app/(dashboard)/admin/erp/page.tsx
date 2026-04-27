"use client";

import { useEffect, useState } from "react";

import { ActionDrawer } from "@/components/admin/erp/ActionDrawer";
import { CommandSearch } from "@/components/admin/erp/CommandSearch";
import { EntityTimeline } from "@/components/admin/erp/EntityTimeline";
import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import type { ErpSummary } from "@/services/admin-erp";
import { getAdminErpSummary } from "@/services/admin-erp";

export default function AdminErpHomePage() {
  const [payload, setPayload] = useState<ErpSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminErpSummary()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load ERP summary.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <WorkspaceShell
      title="ERP Home"
      subtitle="One connected command surface for CRM, sales, operations, delivery, finance, and partner workflows."
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {payload ? (
        <>
          <ActionDrawer actions={payload.quick_actions} />
          <CommandSearch />
          <PipelineBoard title="Today's Work" cards={payload.today_work} />
          <PipelineBoard title="Business Health" cards={payload.business_health} />
          <PipelineBoard title="CRM Pipeline" cards={payload.crm_pipeline} />
          <PipelineBoard title="Sales Pipeline" cards={payload.sales_pipeline} />
          <PipelineBoard title="Operations Pipeline" cards={payload.operations_pipeline} />
          <EntityTimeline
            title="KPI Timeline"
            points={(payload.charts?.monthly_collection_and_requests || []).map((point) => ({
              label: point.month,
              value: `Collections ${point.collections} · Requests ${point.requests}`,
            }))}
          />
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
          Loading ERP home...
        </div>
      )}
    </WorkspaceShell>
  );
}
