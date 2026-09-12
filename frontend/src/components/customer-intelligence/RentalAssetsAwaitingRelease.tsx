"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listRentalAssetsAwaitingRelease,
  releaseRentalAsset,
  type RentalAssetRecord,
} from "@/services/customer-intelligence";

/**
 * Rental units back from hire (RETURNED / UNDER_REPAIR), each with a
 * "Release to available" action. Renders nothing when no unit is waiting.
 */
export default function RentalAssetsAwaitingRelease({
  productId,
  onReleased,
}: {
  /** Narrow to one product; omit for every product. */
  productId?: number | null;
  onReleased?: () => void;
}) {
  const [rows, setRows] = useState<RentalAssetRecord[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listRentalAssetsAwaitingRelease(productId ?? undefined));
    } catch {
      setRows([]);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function release(asset: RentalAssetRecord) {
    setBusyId(asset.id);
    setError(null);
    setMessage(null);
    try {
      await releaseRentalAsset(asset.id);
      setMessage(`${asset.asset_code} released — available to hire again.`);
      await load();
      onReleased?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0 && !message && !error) return null;

  return (
    <div className="space-y-2" data-testid="rental-asset-awaiting-release">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Back from hire — awaiting release
      </div>
      {rows.map((asset) => (
        <div
          key={asset.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
        >
          <div className="text-sm text-foreground">
            {asset.asset_code}
            {!productId && asset.product_name ? (
              <span className="ml-2 text-xs text-muted-foreground">{asset.product_name}</span>
            ) : null}
            <span className="ml-2 inline-flex rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
              {asset.status}
            </span>
          </div>
          <button
            type="button"
            disabled={busyId !== null}
            onClick={() => void release(asset)}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
          >
            {busyId === asset.id ? "Releasing..." : "Release to available"}
          </button>
        </div>
      ))}
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
      <p className="text-[11px] text-muted-foreground">
        Release a unit once it is repaired or checked. A maintenance hold from its return
        inspection is lifted at the same time.
      </p>
    </div>
  );
}
