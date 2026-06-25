"use client";

import { useCallback, useEffect, useState } from "react";

import {
  fetchSubscriptionRentalAssetReadiness,
  type RentalAssetReadiness,
  type RentalAssetSummary,
} from "@/services/customer-intelligence";

type Props = {
  subscriptionId: number;
};

function AssetRow({ asset }: { asset: RentalAssetSummary }) {
  return (
    <div
      className="rounded-xl border border-border bg-background px-4 py-3"
      data-testid="rental-asset-row"
      data-asset-id={asset.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">
            {asset.asset_code ?? `Asset #${asset.id}`}
          </div>
          {asset.condition_grade && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Condition: {asset.condition_grade}
            </div>
          )}
        </div>
        {asset.status && (
          <span className="inline-flex rounded border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
            {asset.status}
          </span>
        )}
      </div>
    </div>
  );
}

export function RentalAssetReadinessPanel({ subscriptionId }: Props) {
  const [data, setData] = useState<RentalAssetReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSubscriptionRentalAssetReadiness(subscriptionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rental asset readiness.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="rental-asset-readiness-loading"
      >
        Loading rental asset readiness...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        data-testid="rental-asset-readiness-error"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Rental asset readiness unavailable: {error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        data-testid="rental-asset-readiness-empty"
      >
        No rental asset readiness data available for this subscription.
      </div>
    );
  }

  const readiness = data.activation_readiness;
  const canHandover = readiness.can_reach_active_or_handover;
  const hasLinkedAssets = data.linked_assets.length > 0;

  return (
    <div
      className={`rounded-xl border p-5 ${canHandover ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}
      data-testid="rental-asset-readiness-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Rental Asset Readiness
          </div>
          <div className={`mt-2 text-sm font-semibold ${canHandover ? "text-emerald-800" : "text-amber-800"}`}>
            {canHandover ? "Activation / handover conditions met" : "Handover conditions not yet met"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Plan: {data.plan_type}
            {" · "}
            Before-handover snapshot: {data.has_before_handover_snapshot ? "Present" : "Missing"}
          </div>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${canHandover ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-amber-200 bg-amber-100 text-amber-800"}`}
        >
          {canHandover ? "READY" : "PENDING"}
        </span>
      </div>

      {readiness.blocker_codes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="rental-asset-blockers">
          {readiness.blocker_codes.map((code) => (
            <span
              key={code}
              className="inline-flex rounded border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
            >
              {code}
            </span>
          ))}
        </div>
      )}

      {readiness.missing_documents.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Missing documents: {readiness.missing_documents.join(", ")}
        </div>
      )}

      {hasLinkedAssets ? (
        <div className="mt-4" data-testid="rental-asset-linked-assets">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Linked assets ({data.linked_assets.length})
          </div>
          <div className="space-y-2">
            {data.linked_assets.map((asset) => (
              <AssetRow key={asset.id} asset={asset} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
          No rental assets linked to this subscription.
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        Read-only. Reserve, hand-over, and return actions are not available from this panel.
      </div>
    </div>
  );
}
