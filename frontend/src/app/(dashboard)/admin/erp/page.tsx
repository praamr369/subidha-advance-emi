"use client";

import { useEffect, useState } from "react";

import { ActionDrawer } from "@/components/admin/erp/ActionDrawer";
import { CommandSearch } from "@/components/admin/erp/CommandSearch";
import { EntityTimeline } from "@/components/admin/erp/EntityTimeline";
import { PipelineBoard } from "@/components/admin/erp/PipelineBoard";
import { WorkspaceShell } from "@/components/admin/erp/WorkspaceShell";
import type { ErpSummary } from "@/services/admin-erp";
import { getAdminErpSummary } from "@/services/admin-erp";
import type { HrSummary } from "@/services/admin-hr";
import { getHrSummary } from "@/services/admin-hr";

export default function AdminErpHomePage() {
  const [payload, setPayload] = useState<ErpSummary | null>(null);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
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

  useEffect(() => {
    let active = true;
    void getHrSummary()
      .then((data) => {
        if (!active) return;
        setHrSummary(data);
      })
      .catch(() => {
        if (!active) return;
        setHrSummary(null);
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
          <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
            <h2 className="text-base font-semibold text-foreground">Staff & HR</h2>
            <p className="mt-1 text-sm text-muted-foreground">Staff posture and pending HR actions.</p>
            {hrSummary ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                  <div className="text-xs text-muted-foreground">Active staff</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{hrSummary.total_active_staff}</div>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                  <div className="text-xs text-muted-foreground">Today present / absent</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {hrSummary.today_present} / {hrSummary.today_absent}
                  </div>
                </div>
                <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                  <div className="text-xs text-muted-foreground">Pending leave / expenses</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {hrSummary.pending_leave_requests} / {hrSummary.pending_expense_claims}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-white/80 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
                HR summary not available.
              </div>
            )}
          </section>
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
