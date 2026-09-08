"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createRentalAsset,
  fetchSubscriptionRentalAssetReadiness,
  handoverRentalAsset,
  listAvailableRentalAssets,
  reserveRentalAsset,
  returnRentalAsset,
  type RentalAssetReadiness,
  type RentalAssetRecord,
  type RentalAssetSummary,
} from "@/services/customer-intelligence";

type Props = {
  subscriptionId: number;
  /** Contract product, used to suggest an asset code and filter available units. */
  productId?: number | null;
  productCode?: string | null;
  inventoryItemId?: number | null;
  /** Rent/lease only: EMI contracts transfer ownership and own no rental asset. */
  canManageAssets?: boolean;
};

function AssetRow({
  asset,
  onReturn,
  busy,
}: {
  asset: RentalAssetSummary;
  onReturn?: (assetId: number) => void;
  busy?: boolean;
}) {
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
        <div className="flex items-center gap-2">
          {asset.status && (
            <span className="inline-flex rounded border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              {asset.status}
            </span>
          )}
          {onReturn && asset.status === "HANDED_OVER" ? (
            <button
              type="button"
              onClick={() => onReturn(asset.id)}
              disabled={busy}
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Mark returned
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RentalAssetReadinessPanel({
  subscriptionId,
  productId,
  productCode,
  inventoryItemId,
  canManageAssets = false,
}: Props) {
  const [data, setData] = useState<RentalAssetReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<RentalAssetRecord[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [newAssetCode, setNewAssetCode] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const loadAvailable = useCallback(async () => {
    if (!canManageAssets) return;
    try {
      const payload = await listAvailableRentalAssets(productId ?? undefined);
      setAvailable(Array.isArray(payload.results) ? payload.results : []);
    } catch {
      setAvailable([]);
    }
  }, [canManageAssets, productId]);

  useEffect(() => {
    void load();
    void loadAvailable();
  }, [load, loadAvailable]);

  async function runAction(label: string, fn: () => Promise<unknown>) {
    setActionBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await fn();
      setActionMessage(label);
      await load();
      await loadAvailable();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionBusy(false);
    }
  }

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
            className="inline-flex items-center rounded-md border border-amber-300 bg-card px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50"
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
  const blockerCodes = Array.isArray(readiness?.blocker_codes)
    ? readiness.blocker_codes
    : [];
  const missingDocuments = Array.isArray(readiness?.missing_documents)
    ? readiness.missing_documents
    : [];
  const linkedAssets = Array.isArray(data.linked_assets) ? data.linked_assets : [];
  const canHandover = Boolean(readiness?.can_reach_active_or_handover);
  const hasLinkedAssets = linkedAssets.length > 0;

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

      {blockerCodes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="rental-asset-blockers">
          {blockerCodes.map((code) => (
            <span
              key={code}
              className="inline-flex rounded border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
            >
              {code}
            </span>
          ))}
        </div>
      )}

      {missingDocuments.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Missing documents: {missingDocuments.join(", ")}
        </div>
      )}

      {hasLinkedAssets ? (
        <div className="mt-4" data-testid="rental-asset-linked-assets">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Linked assets ({linkedAssets.length})
          </div>
          <div className="space-y-2">
            {linkedAssets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                busy={actionBusy}
                onReturn={
                  canManageAssets
                    ? (assetId) =>
                        void runAction("Asset marked returned and back in stock.", () =>
                          returnRentalAsset(assetId)
                        )
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
          No rental assets linked to this subscription.
        </div>
      )}

      {canManageAssets ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Link a physical unit to this contract
          </div>

          {available.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Available asset</span>
                <select
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                  className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">Select a unit...</option>
                  {available.map((asset) => (
                    <option key={asset.id} value={String(asset.id)}>
                      {asset.asset_code}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!selectedAssetId || actionBusy}
                onClick={() =>
                  void runAction("Asset reserved for this contract.", () =>
                    reserveRentalAsset(Number(selectedAssetId), subscriptionId)
                  )
                }
                className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Reserve
              </button>
              <button
                type="button"
                disabled={!selectedAssetId || actionBusy}
                onClick={() =>
                  void runAction("Asset handed over to the customer.", async () => {
                    const assetId = Number(selectedAssetId);
                    await reserveRentalAsset(assetId, subscriptionId).catch(() => undefined);
                    return handoverRentalAsset(assetId, subscriptionId);
                  })
                }
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50"
              >
                Reserve + hand over
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No unlinked units exist for this product yet. Register one below.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">New asset code</span>
              <input
                value={newAssetCode}
                onChange={(event) => setNewAssetCode(event.target.value)}
                placeholder={productCode ? `RA-${productCode}-001` : "RA-0001"}
                className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!newAssetCode.trim() || actionBusy}
              onClick={() =>
                void runAction("Rental asset registered from inventory.", () =>
                  createRentalAsset({
                    asset_code: newAssetCode.trim(),
                    inventory_item: inventoryItemId ?? undefined,
                    product: inventoryItemId ? undefined : productId ?? undefined,
                  }).then((asset) => {
                    setNewAssetCode("");
                    setSelectedAssetId(String(asset.id));
                    return asset;
                  })
                )
              }
              className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Register unit
            </button>
            <p className="w-full text-[11px] text-muted-foreground">
              One rental asset is one physical unit you can hire out and take back.
              Registering here links it to this product inventory item.
            </p>
          </div>

          {actionError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}
          {actionMessage ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {actionMessage}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          Rental assets apply to RENT and LEASE contracts only.
        </div>
      )}
    </div>
  );
}
