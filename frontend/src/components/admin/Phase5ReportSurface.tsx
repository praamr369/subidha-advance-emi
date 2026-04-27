"use client";

import { useCallback, useEffect, useState } from "react";
import ActionButton from "@/components/ui/ActionButton";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import Phase5FilterBar from "@/components/admin/Phase5FilterBar";
import Phase5ChartBlock from "@/components/admin/Phase5ChartBlock";
import Phase5KpiCard from "@/components/admin/Phase5KpiCard";
import Phase5SourceMapPanel from "@/components/admin/Phase5SourceMapPanel";
import { getAdminReportSourceMap } from "@/services/phase5-control";

type Fetcher = (query: Record<string, string>) => Promise<unknown>;
type SurfacePayload = unknown;
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

export default function Phase5ReportSurface({
  title,
  subtitle,
  breadcrumbs,
  fetcher,
  exportType,
}: {
  title: string;
  subtitle: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  fetcher: Fetcher;
  exportType?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SurfacePayload>(null);
  const [sourceMap, setSourceMap] = useState<SourceMapRow[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => String(value || "").trim() !== "")
      );
      const [res, map] = await Promise.all([fetcher(cleaned), getAdminReportSourceMap()]);
      setPayload(res);
      setSourceMap(((map as SourceMapResponse)?.results ?? []) as SourceMapRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [fetcher, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage title={title} subtitle={subtitle} breadcrumbs={breadcrumbs}>
      <WorkspaceSection title="Live BI Surface" description="Real-data API response with stable chart payload contract.">
        <Phase5FilterBar value={filters} onChange={setFilters} />
        <div className="mt-3 flex gap-2">
          <ActionButton variant="outline" onClick={() => void load()}>
            Apply filters
          </ActionButton>
          {exportType ? (
            <a
              href={`/api/v1/admin/reports/export/?type=${encodeURIComponent(exportType)}&${new URLSearchParams(filters).toString()}`}
              className="inline-flex items-center rounded-lg border px-3 py-2 text-sm"
            >
              Export CSV
            </a>
          ) : null}
        </div>
        {loading ? (
          <LoadingBlock label="Loading..." />
        ) : error ? (
          <ErrorState title="Unable to load report" description={error} onRetry={() => void load()} />
        ) : !payload ? (
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
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}

