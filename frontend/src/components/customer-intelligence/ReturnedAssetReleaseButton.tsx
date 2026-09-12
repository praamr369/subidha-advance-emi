"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listRentalAssets,
  releaseRentalAsset,
  type RentalAssetRecord,
} from "@/services/customer-intelligence";

const RELEASABLE = new Set(["RETURNED", "UNDER_REPAIR"]);

/**
 * Release the rental unit that came back on a rent/lease return.
 *
 * A return unlinks the unit from its contract, so it is looked up by the
 * contract it was returned from. Renders nothing when no unit came back.
 */
export default function ReturnedAssetReleaseButton({
  subscriptionId,
  compact = false,
}: {
  subscriptionId: number;
  compact?: boolean;
}) {
  const [asset, setAsset] = useState<RentalAssetRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await listRentalAssets({ returnedFromSubscription: subscriptionId });
      setAsset(page.results[0] ?? null);
    } catch {
      setAsset(null);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!asset) return null;

  const releasable = RELEASABLE.has(asset.status);

  async function release() {
    if (!asset) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await releaseRentalAsset(asset.id);
      setMessage(`${asset.asset_code} released — available to hire again.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "inline-flex flex-col items-start gap-1" : "space-y-2"}>
      {!compact ? (
        <div className="text-sm text-foreground">
          Returned unit <span className="font-medium">{asset.asset_code}</span>
          <span className="ml-2 inline-flex rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
            {asset.status}
          </span>
        </div>
      ) : null}
      {releasable ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void release()}
          title={`Release ${asset.asset_code} to available`}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Releasing..." : "Release to available"}
        </button>
      ) : !compact ? (
        <p className="text-xs text-muted-foreground">This unit is already back in the rental pool.</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
