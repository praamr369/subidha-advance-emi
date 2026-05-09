"use client";

import { useEffect, useState } from "react";

import AiBiExplanationPanel from "@/components/admin/ai/AiBiExplanationPanel";
import Phase5ChartBlock from "@/components/admin/Phase5ChartBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getAdminBiSummary, type BiSummary } from "@/services/admin-bi";
import { BiChartCard } from "@/components/admin/bi/BiChartCard";
import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import EmptyState from "@/components/feedback/EmptyState";

export default function AdminBiControlCenterPage() {
  const [payload, setPayload] = useState<BiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminBiSummary()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load BI summary.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      eyebrow="BI Control Center"
      title="Business Intelligence"
      subtitle="Read-only trends and posture. Use Reports for exports and drill-down tables."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI Control Center" },
      ]}
      actions={[
        { href: ROUTES.admin.dashboard, label: "Admin Dashboard", variant: "secondary" },
        { href: ROUTES.admin.erp, label: "ERP Home", variant: "secondary" },
        { href: ROUTES.admin.reports, label: "Reports", variant: "secondary" },
        { href: ROUTES.admin.globalSearch, label: "Global Search", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!payload ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
            {error ? "BI summary is temporarily unavailable." : "Loading BI control center..."}
          </div>
          <BiChartCard
            title="BI report links"
            source="BI Control Center"
            asOf={new Date().toISOString()}
            href={ROUTES.admin.reports}
            emptyReason={error || "Waiting for BI snapshot data."}
          >
            <div />
          </BiChartCard>
        </div>
      ) : (
        <div className="space-y-6">
          <AiBiExplanationPanel />
          <BiInsightsDashboard />

          <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
            <h2 className="text-base font-semibold text-foreground">HR Snapshot</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Active staff</div>
                <div className="mt-1 text-2xl font-semibold">{payload.hr.active_staff}</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Today present / absent</div>
                <div className="mt-1 text-2xl font-semibold">
                  {payload.hr.today_present} / {payload.hr.today_absent}
                </div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Pending leave / expenses</div>
                <div className="mt-1 text-2xl font-semibold">
                  {payload.hr.pending_leave_requests} / {payload.hr.pending_expense_claims}
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <BiChartCard
              title="Collection trend"
              source={payload.finance.collection_trend.meta?.source || "unknown"}
              asOf={payload.as_of}
              href={ROUTES.admin.reportsCollections}
              emptyReason={payload.finance.collection_trend.meta?.empty_reason}
            >
              <Phase5ChartBlock payload={payload.finance.collection_trend} />
            </BiChartCard>

            <BiChartCard
              title="Overdue aging"
              source={payload.finance.overdue_aging.meta?.source || "unknown"}
              asOf={payload.as_of}
              href={ROUTES.admin.reportsOverdue}
              emptyReason={payload.finance.overdue_aging.meta?.empty_reason}
            >
              <Phase5ChartBlock payload={payload.finance.overdue_aging} />
            </BiChartCard>

            <BiChartCard
              title="Payment method split"
              source={payload.finance.payment_method_split.meta?.source || "unknown"}
              asOf={payload.as_of}
              href={ROUTES.admin.accountingControlCenter}
              emptyReason={payload.finance.payment_method_split.meta?.empty_reason}
            >
              <Phase5ChartBlock payload={payload.finance.payment_method_split} />
            </BiChartCard>

            <BiChartCard
              title="Product demand (contracts)"
              source={payload.subscriptions.product_demand.meta?.source || "unknown"}
              asOf={payload.as_of}
              href={ROUTES.admin.reportsBatchPerformance}
              emptyReason={payload.subscriptions.product_demand.meta?.empty_reason}
            >
              <Phase5ChartBlock payload={payload.subscriptions.product_demand} />
            </BiChartCard>
          </div>

          <section className="rounded-2xl border border-white/80 bg-white/80 p-5">
            <h2 className="text-base font-semibold text-foreground">Finance exposure snapshot</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Waived EMI count</div>
                <div className="mt-1 text-2xl font-semibold">{payload.finance.waiver_loss_exposure.waived_count}</div>
                <div className="mt-1 text-xs text-muted-foreground">Waived amount: {payload.finance.waiver_loss_exposure.waived_amount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Deposit liability held</div>
                <div className="mt-1 text-2xl font-semibold">{payload.finance.deposit_liability.held_total}</div>
                <div className="mt-1 text-xs text-muted-foreground">Source: Subscription deposits</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-muted-foreground">Revenue breakdown (cards)</div>
                <div className="mt-1 text-xs text-muted-foreground">Source: Accounting Control Center</div>
                <div className="mt-2 rounded-lg bg-[#fffaf5] p-3 text-xs text-foreground">
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(payload.finance.revenue_breakdown, null, 2)}</pre>
                </div>
              </div>
            </div>
          </section>

          {payload.operations.queue_summary?.results?.length ? null : (
            <EmptyState title="Operations queues" description="No active operational queue rows." />
          )}
        </div>
      )}
    </PortalPage>
  );
}
