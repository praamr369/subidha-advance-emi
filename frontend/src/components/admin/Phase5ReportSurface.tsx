"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";

type Fetcher = () => Promise<unknown>;
type SurfacePayload = unknown;

export default function Phase5ReportSurface({
  title,
  subtitle,
  breadcrumbs,
  fetcher,
}: {
  title: string;
  subtitle: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  fetcher: Fetcher;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SurfacePayload>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher();
      setPayload(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage title={title} subtitle={subtitle} breadcrumbs={breadcrumbs}>
      <WorkspaceSection title="Live BI Surface" description="Real-data API response with stable chart payload contract.">
        {loading ? (
          <LoadingBlock label="Loading..." />
        ) : error ? (
          <ErrorState title="Unable to load report" description={error} onRetry={() => void load()} />
        ) : !payload ? (
          <EmptyState title="No data available" description="No authoritative records returned by this report endpoint." />
        ) : (
          <pre className="overflow-x-auto rounded-2xl border bg-muted/20 p-4 text-xs">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </WorkspaceSection>
    </PortalPage>
  );
}

