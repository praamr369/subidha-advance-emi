"use client";

import { useCallback, useEffect, useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { AccountingControlShell } from "@/components/layout/page-shells";
import PortalPage from "@/components/ui/PortalPage";
import { FormSection } from "@/components/ui/operations";
import Phase5FilterBar from "@/components/admin/Phase5FilterBar";
import Phase5ChartBlock from "@/components/admin/Phase5ChartBlock";
import Phase5KpiCard from "@/components/admin/Phase5KpiCard";
import Phase5SourceMapPanel from "@/components/admin/Phase5SourceMapPanel";
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

  return (
    <PortalPage
      title="Accounting Control Center"
      subtitle="Admin-only accounting command surface with receivables, reconciliation, deposits, and finance KPI controls."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Accounting", href: "/admin/accounting" },
        { label: "Control Center" },
      ]}
    >
      <AccountingControlShell
        readinessWarnings={
          <FormSection title="Filters and export" description="This surface reads the real control-center endpoint response.">
            <Phase5FilterBar value={filters} onChange={setFilters} />
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton variant="outline" onClick={() => void load()} loading={loading}>
                Apply filters
              </ActionButton>
            </div>
            {loading ? <LoadingBlock label="Loading..." /> : null}
            {!loading && error ? <ErrorState title="Unable to load control center" description={error} onRetry={() => void load()} /> : null}
          </FormSection>
        }
        primaryRegister={
          !loading && !error ? (
            !payload ? (
              <EmptyState title="No data available" description="No authoritative records returned by this report endpoint." />
            ) : (
              <div className="space-y-4">
                {Array.isArray((payload as PayloadWithKpis)?.kpi_cards) ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {((payload as PayloadWithKpis).kpi_cards ?? []).map((card) => (
                      <Phase5KpiCard key={`${card.label}-${card.source}`} card={card} />
                    ))}
                  </div>
                ) : null}
                <Phase5ChartBlock payload={payload as Record<string, unknown>} />
                <details className="rounded-lg border p-3 text-xs">
                  <summary className="cursor-pointer font-semibold">Raw response</summary>
                  <pre className="mt-3 overflow-x-auto">{JSON.stringify(payload, null, 2)}</pre>
                </details>
                <Phase5SourceMapPanel rows={sourceMap} />
              </div>
            )
          ) : null
        }
      />
    </PortalPage>
  );
}
