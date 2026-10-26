"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

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
import RentalAssetsAwaitingRelease from "@/components/customer-intelligence/RentalAssetsAwaitingRelease";

export type ContractItemOption = {
  id: number;
  product_id: number;
  product_name: string;
  product_code?: string | null;
  quantity: number;
};

type Props = {
  subscriptionId: number;
  /** Contract product, used to suggest an asset code and filter available units. */
  productId?: number | null;
  productCode?: string | null;
  inventoryItemId?: number | null;
  /** Rent/lease only: EMI contracts transfer ownership and own no rental asset. */
  canManageAssets?: boolean;
  contractItems?: ContractItemOption[];
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
          <div className="text-sm font-semibold text-foreground">
            {asset.asset_code ?? `Asset #${asset.id}`}
          </div>
          {asset.product_name && (
            <div className="mt-0.5 text-xs font-medium text-primary">
              Product: {asset.product_name} {asset.product_code ? `(${asset.product_code})` : ""}
            </div>
          )}
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
  contractItems = [],
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

  // Normalize all attached contract products
  const products = useMemo(() => {
    if (contractItems && contractItems.length > 0) {
      return contractItems.map((it) => ({
        id: it.product_id,
        name: it.product_name,
        code: it.product_code || null,
        quantity: it.quantity || 1,
      }));
    }
    if (productId) {
      return [
        {
          id: productId,
          name: "Contract Furniture Item",
          code: productCode || null,
          quantity: 1,
        },
      ];
    }
    return [];
  }, [contractItems, productId, productCode]);

  const [activeProductId, setActiveProductId] = useState<number | null>(
    products[0]?.id ?? productId ?? null
  );

  useEffect(() => {
    if (
      (activeProductId === null || !products.some((p) => p.id === activeProductId)) &&
      products.length > 0
    ) {
      setActiveProductId(products[0].id);
    }
  }, [products, activeProductId]);

  const activeProduct = useMemo(
    () => products.find((p) => p.id === activeProductId) ?? products[0] ?? null,
    [products, activeProductId]
  );

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
      const targetProdId = activeProduct?.id ?? productId ?? undefined;
      const payload = await listAvailableRentalAssets(targetProdId);
      setAvailable(Array.isArray(payload.results) ? payload.results : []);
    } catch {
      setAvailable([]);
    }
  }, [canManageAssets, activeProduct?.id, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAvailable();
  }, [loadAvailable]);

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
            Linked units ({linkedAssets.length})
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
                        void runAction(
                          "Asset marked returned. Mark the delivery RETURNED to bring it back into stock.",
                          () =>
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
        <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/60 p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Link a physical unit to this contract
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Each furniture item attached to this rent/lease contract requires an assigned physical rental asset.
            </p>
          </div>

          {/* Product selector tabs when multi-product or multiple items attached */}
          {products.length > 0 && (
            <div className="space-y-2 border-y border-border/70 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Select target furniture product:
              </div>
              <div className="flex flex-wrap gap-2">
                {products.map((prod) => {
                  const isSelected = prod.id === activeProduct?.id;
                  const linkedCount = linkedAssets.filter(
                    (a) => a.product_id === prod.id
                  ).length;
                  const isFulfilled = linkedCount >= prod.quantity;

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        setActiveProductId(prod.id);
                        setSelectedAssetId("");
                        setNewAssetCode("");
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      )}
                    >
                      <span>{prod.name.replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim() || prod.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                          isSelected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : isFulfilled
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {linkedCount}/{prod.quantity} Linked
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Asset assignment for active product */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>
                Available Units for: <strong className="text-primary">{activeProduct?.name.replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim() || activeProduct?.name}</strong>
              </span>
              {activeProduct?.code && (
                <span className="font-mono text-[11px] text-muted-foreground">Code: {activeProduct.code}</span>
              )}
            </div>

            {available.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">Available unit</span>
                  <select
                    value={selectedAssetId}
                    onChange={(event) => setSelectedAssetId(event.target.value)}
                    className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
                  >
                    <option value="">Select a unit...</option>
                    {available.map((asset) => (
                      <option key={asset.id} value={String(asset.id)}>
                        {asset.asset_code} {asset.condition_grade ? `(${asset.condition_grade})` : ""}
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
                No unlinked units exist for {activeProduct?.name.replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim() || "this product"} yet. Register one below.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="grid gap-1 text-xs">
                <span className="text-muted-foreground">New asset code</span>
                <input
                  value={newAssetCode}
                  onChange={(event) => setNewAssetCode(event.target.value)}
                  placeholder={activeProduct?.code ? `RA-${activeProduct.code}-001` : "RA-0001"}
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
                      product: inventoryItemId ? undefined : activeProduct?.id ?? productId ?? undefined,
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
                Registering here links it to {activeProduct?.name.replace(/\s*\([^)]+:[^)]+\)\s*$/i, "").trim() || "this product"}.
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-3 empty:hidden">
            <RentalAssetsAwaitingRelease
              productId={activeProduct?.id ?? productId}
              onReleased={() => void loadAvailable()}
            />
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
