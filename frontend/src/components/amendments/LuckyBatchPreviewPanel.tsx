"use client";

import { useEffect, useState } from "react";
import { DetailPanel } from "@/components/ui/operations";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { getAdminLuckyBatchPreview, type LuckyBatchPreview, type AmendmentRecord } from "@/services/amendments";

function displayValue(value: unknown) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

export default function LuckyBatchPreviewPanel({ amendment }: { amendment: AmendmentRecord }) {
  const [preview, setPreview] = useState<LuckyBatchPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAdminLuckyBatchPreview(amendment.id);
        setPreview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [amendment.id]);

  if (loading) return <ERPLoadingState label="Loading preview..." />;
  if (error) return <ERPErrorState title="Preview failed" description={error} />;
  if (!preview) return null;

  return (
    <DetailPanel title="Lucky ID / Batch Change Preview" description="Read-only preview. Execution is deferred until controlled draw-safe workflow exists.">
      <div className="space-y-4">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Current State</div>
            <div className="mt-2 text-muted-foreground">Batch: <span className="font-medium text-foreground">{displayValue(preview.current_batch_code)}</span></div>
            <div className="mt-1 text-muted-foreground">Lucky Number: <span className="font-medium text-foreground">{displayValue(preview.current_lucky_number)}</span></div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Requested State</div>
            <div className="mt-2 text-muted-foreground">Batch: <span className="font-medium text-foreground">{displayValue(preview.requested_batch_code)}</span></div>
            <div className="mt-1 text-muted-foreground">Lucky Number: <span className="font-medium text-foreground">{displayValue(preview.requested_lucky_number)}</span></div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/20 p-3 text-sm">
          <div className="font-medium mb-2">Availability & Conflict Status</div>
          <dl className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Availability</dt>
              <dd className="font-medium">{preview.availability_status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Conflict</dt>
              <dd className="font-medium">{preview.ownership_conflict_status}</dd>
            </div>
            {preview.draw_status_risk !== "NONE" && (
              <div className="md:col-span-2">
                <dt className="text-amber-600 dark:text-amber-400">Draw Risk</dt>
                <dd className="text-amber-700 dark:text-amber-300">{preview.draw_status_risk}</dd>
              </div>
            )}
            {preview.waiver_winner_risk !== "NONE" && (
              <div className="md:col-span-2">
                <dt className="text-amber-600 dark:text-amber-400">Waiver/Winner Risk</dt>
                <dd className="text-amber-700 dark:text-amber-300">{preview.waiver_winner_risk}</dd>
              </div>
            )}
          </dl>
        </div>

        {preview.lifecycle_blocker_reason && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <div className="font-medium text-destructive mb-1">Execution Blocked</div>
            <p className="text-destructive/80">{preview.lifecycle_blocker_reason}</p>
          </div>
        )}
      </div>
    </DetailPanel>
  );
}
