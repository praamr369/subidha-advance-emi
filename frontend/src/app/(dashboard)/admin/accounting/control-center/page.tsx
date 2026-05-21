"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ActionButton from "@/components/ui/ActionButton";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { AccountingControlShell } from "@/components/layout/page-shells";
import { FormSection } from "@/components/ui/operations";
import Phase5FilterBar from "@/components/admin/Phase5FilterBar";
import Phase5ChartBlock from "@/components/admin/Phase5ChartBlock";
import Phase5KpiCard from "@/components/admin/Phase5KpiCard";
import Phase5SourceMapPanel from "@/components/admin/Phase5SourceMapPanel";
import { MetricStrip } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getAdminAccountingControlCenter } from "@/services/phase5-control";
import { getAdminReportSourceMap } from "@/services/phase5-control";

type SourceMapRow = {
  kpi_key: string;
  label: string;
  authoritative_source: string;
  calculation_summary: string;
  exclusions: string[];
  related_detail_url: string;
};
type SourceMapResponse = { results?: SourceMapRow[] };
type KpiCardShape = {
  label: string;
  value: string | number;
  source?: string;
  severity?: string;
  detail_url?: string;
  empty_reason?: string | null;
};
type PayloadWithKpis = { kpi_cards?: KpiCardShape[] };

function kpiSeverity(severity?: string): "danger" | "warning" | "info" {
  const normalized = String(severity || "").toLowerCase();
  if (normalized.includes("danger") || normalized.includes("critical") || normalized.includes("block")) return "danger";
  if (normalized.includes("warn")) return "warning";
  return "info";
}

export default function AdminAccountingControlCenterPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [sourceMap, setSourceMap] = useState<SourceMapRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => String(value || "").trim() !== "")
      );
      const [res, map] = await Promise.all([getAdminAccountingControlCenter(cleaned), getAdminReportSourceMap()]);
      setPayload(res);
      setSourceMap(((map as SourceMapResponse)?.results ?? []) as SourceMapRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load control center.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpiCards = Array.isArray((payload as PayloadWithKpis)?.kpi_cards) ? ((payload as PayloadWithKpis).kpi_cards ?? []) : [];
  const kpiSummary = kpiCards.reduce(
    (acc, card) => {
      const tone = kpiSeverity(card.severity);
      acc.total += 1;
      acc[tone] += 1;
      return acc;
    },
    { total: 0, danger: 0, warning: 0, info: 0 }
  );

  return (
    <ERPPageShell
      title="Accounting Control Center"
      subtitle="Admin-only accounting command surface for reconciliation blockers, mappings, journals, and period posture (no posting changes here)."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Accounting", href: "/admin/accounting" },
        { label: "Control Center" },
      ]}
    >
      <AccountingControlShell
        readinessWarnings={
          <div className="space-y-4">
            <FormSection
              title="Blockers (authoritative)"
              description="This page only renders what the control-center endpoint returns. No client-side fabricated KPIs."
            >
              {loading ? <ERPLoadingState label="Loading control center..." /> : null}
              {!loading && error ? (
                <ERPErrorState title="Unable to load control center" description={error} onRetry={() => void load()} />
              ) : null}
              {!loading && !error && payload ? (
                <MetricStrip
                  items={[
                    { label: "Signals", value: String(kpiSummary.total) },
                    { label: "Blockers", value: String(kpiSummary.danger) },
                    { label: "Warnings", value: String(kpiSummary.warning) },
                  ]}
                />
              ) : null}
            </FormSection>
          </div>
        }
        primaryRegister={
          !loading && !error ? (
            !payload ? (
              <ERPEmptyState title="No data available" description="No authoritative records returned by this report endpoint." />
            ) : (
              <div className="space-y-4">
                {kpiCards.length > 0 ? (
                  <ERPSectionShell title="Exception and blocker register" description="Use these signals to decide what to fix next. Follow detail links for the underlying register or control surface.">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {kpiCards.map((card) => (
                        <Phase5KpiCard key={`${card.label}-${card.source}`} card={card} />
                      ))}
                    </div>
                  </ERPSectionShell>
                ) : (
                  <ERPEmptyState
                    title="No KPI signals returned"
                    description="The control-center endpoint did not return KPI cards for the current filter set."
                  />
                )}
                <Phase5ChartBlock payload={payload as Record<string, unknown>} />
                <details className="rounded-lg border p-3 text-xs">
                  <summary className="cursor-pointer font-semibold">Audit evidence (raw response)</summary>
                  <pre className="mt-3 max-h-[28rem] overflow-auto">{JSON.stringify(payload, null, 2)}</pre>
                </details>
                <Phase5SourceMapPanel rows={sourceMap} />
              </div>
            )
          ) : null
        }
        controlPanel={
          <div className="space-y-4">
            <WorkspaceSection title="Control panel" description="Deep links into the operational control surfaces used by finance/accounting staff.">
              <div className="grid gap-2">
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href={ROUTES.admin.accountingBooks}>
                  Books
                </Link>
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href={ROUTES.admin.accountingJournals}>
                  Journals
                </Link>
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href={ROUTES.admin.accountingPeriods}>
                  Periods & posting locks
                </Link>
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href="/admin/accounting/reconciliation">
                  Accounting reconciliation queue
                </Link>
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href={ROUTES.admin.accountingChartOfAccounts}>
                  Chart of accounts
                </Link>
                <Link className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted" href={ROUTES.admin.accountingBridges}>
                  Bridges & mappings
                </Link>
              </div>
            </WorkspaceSection>

            <WorkspaceSection title="Filters" description="Filters are sent to the control-center endpoint as query params.">
              <Phase5FilterBar value={filters} onChange={setFilters} />
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton variant="outline" onClick={() => void load()} loading={loading}>
                  Apply filters
                </ActionButton>
              </div>
            </WorkspaceSection>
          </div>
        }
      />
    </ERPPageShell>
  );
}
