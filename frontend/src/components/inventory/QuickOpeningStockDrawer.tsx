"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Layers, Loader2, PackagePlus, Store, X } from "lucide-react";
import { useEffect, useState } from "react";

import DrawerShell from "@/components/ui/DrawerShell";
import ProductSpecSearch, { type ProductSpecRow } from "@/components/products/ProductSpecSearch";
import { invalidateAfterOpeningStockMutation } from "@/lib/operational-query-invalidation";
import {
  createAdminOpeningStockEntry,
  listStockLocations,
  postAdminOpeningStockEntry,
  type StockLocation,
} from "@/services/inventory";
import { prepareProductInventoryProfile } from "@/services/products";

export type QuickOpeningStockProduct = {
  id: number;
  name: string;
  product_code?: string;
  sku?: string | null;
  unit_of_measure?: string;
  current_stock_qty?: string | number | null;
  base_price?: string | number | null;
};

export type StockPostedResult = {
  productId: number;
  inventoryItemId: number;
  stockLocationId: number;
  stockLocationName: string;
  quantityAdded: number;
  newAvailableQty: number;
  unitCost?: string | null;
  effectiveDate: string;
  note?: string;
};

export type QuickOpeningStockDrawerProps = {
  open?: boolean;
  onClose: () => void;
  initialProduct?: QuickOpeningStockProduct | null;
  onStockPosted?: (result: StockPostedResult) => void;
  variant?: "drawer" | "embedded";
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function QuickOpeningStockDrawer({
  open = true,
  onClose,
  initialProduct,
  onStockPosted,
  variant = "drawer",
}: QuickOpeningStockDrawerProps) {
  const queryClient = useQueryClient();

  // Selected product
  const [product, setProduct] = useState<QuickOpeningStockProduct | null>(initialProduct ?? null);
  const [changingProduct, setChangingProduct] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationId, setLocationId] = useState<string>("");

  // Input fields
  const [quantity, setQuantity] = useState<string>("1");
  const [unitCost, setUnitCost] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(todayIso());
  const [note, setNote] = useState<string>("Quick stock intake from billing/subscription");

  // Status & errors
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<StockPostedResult | null>(null);

  // Reset or initialize product when initialProduct changes
  useEffect(() => {
    if (initialProduct) {
      setProduct(initialProduct);
      setChangingProduct(false);
      if (initialProduct.base_price) {
        setUnitCost(String(initialProduct.base_price));
      }
    } else {
      setProduct(null);
      setChangingProduct(true);
    }
    setError(null);
    setSuccessResult(null);
  }, [initialProduct, open]);

  // Load active stock locations
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    setLoadingLocations(true);
    listStockLocations({ is_active: true })
      .then((res) => {
        if (!isMounted) return;
        const locs = res.results || [];
        setLocations(locs);
        if (locs.length > 0) {
          // Default to showroom/primary if available, else first location
          const primary = locs.find(
            (l) =>
              (l as { is_primary?: boolean }).is_primary ||
              l.name.toLowerCase().includes("showroom") ||
              l.name.toLowerCase().includes("main")
          );
          setLocationId(String(primary ? primary.id : locs[0].id));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.detail || "Could not load stock locations. Please verify system setup.");
        }
      })
      .finally(() => {
        if (isMounted) setLoadingLocations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open]);

  function handleSelectFromSearch(row: ProductSpecRow) {
    const currentStock = row.current_stock_qty ?? row.inventory_status?.available ?? 0;
    setProduct({
      id: row.id,
      name: row.name,
      product_code: row.product_code || undefined,
      sku: row.sku || undefined,
      unit_of_measure: row.unit_of_measure || "PCS",
      current_stock_qty: currentStock,
      base_price: row.base_price,
    });
    setUnitCost(row.base_price ? String(row.base_price) : "");
    setChangingProduct(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) {
      setError("Please select a product first.");
      return;
    }
    const qtyNum = Number.parseFloat(quantity);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Quantity must be a positive number greater than 0.");
      return;
    }
    if (!locationId) {
      setError("Please select a stock location.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Ensure inventory profile exists for this product
      const prepareRes = await prepareProductInventoryProfile(product.id, {
        default_stock_location: Number(locationId),
        stock_tracking_enabled: true,
      });

      const invItemId =
        prepareRes.inventory_profile?.id ??
        prepareRes.inventory_profile_id;

      if (!invItemId) {
        throw new Error("Unable to resolve inventory profile for product. Please ensure product exists.");
      }

      // Step 2: Create opening stock entry
      const entryPayload = {
        inventory_item: invItemId,
        stock_location: Number(locationId),
        quantity: qtyNum.toFixed(3),
        unit_cost_snapshot: unitCost ? Number.parseFloat(unitCost).toFixed(2) : null,
        effective_date: effectiveDate || todayIso(),
        note: note.trim() || "Quick stock intake from billing/subscription",
      };

      const createdEntry = await createAdminOpeningStockEntry(entryPayload);

      // Step 3: Post the entry immediately so it updates ledger and on-hand balance
      await postAdminOpeningStockEntry(createdEntry.id);

      // Step 4: Invalidate queries to update all caches across application
      await invalidateAfterOpeningStockMutation(queryClient);

      // Step 5: Compute updated quantities
      const prevStock = parseNumber(product.current_stock_qty);
      const newAvailable = prevStock + qtyNum;
      const targetLoc = locations.find((l) => String(l.id) === String(locationId));

      const result: StockPostedResult = {
        productId: product.id,
        inventoryItemId: invItemId,
        stockLocationId: Number(locationId),
        stockLocationName: targetLoc ? targetLoc.name : "Warehouse",
        quantityAdded: qtyNum,
        newAvailableQty: newAvailable,
        unitCost: unitCost || null,
        effectiveDate: effectiveDate || todayIso(),
        note: note.trim(),
      };

      // Step 6: Dispatch window event so any listening view can update in real-time
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("opening-stock-posted", { detail: result }));
      }

      // Step 7: Invoke callback
      onStockPosted?.(result);

      // Update product current stock in local state & show success
      setProduct((prev) => (prev ? { ...prev, current_stock_qty: newAvailable } : null));
      setSuccessResult(result);
    } catch (err: unknown) {
      const msg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { message?: string })?.message ||
        "Failed to post stock intake. Please verify stock location and permissions.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const uom = product?.unit_of_measure || "PCS";
  const currentStockVal = parseNumber(product?.current_stock_qty);
  const inputQtyVal = parseNumber(quantity);
  const projectedStockVal = currentStockVal + inputQtyVal;

  const content = (
    <div className="space-y-5">
      {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <span className="font-semibold">Unable to post stock</span>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successResult && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1 flex-1">
              <span className="font-bold text-sm">Stock Successfully Posted!</span>
              <p>
                Added <strong>{successResult.quantityAdded} {uom}</strong> to{" "}
                <strong>{successResult.stockLocationName}</strong> for {product?.name}.
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                New real-time available stock: <strong>{successResult.newAvailableQty} {uom}</strong>. This is now reflected on your billing/subscription screen.
              </p>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700"
                >
                  Done (Return to Workspace)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessResult(null);
                    setQuantity("1");
                  }}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
                >
                  Add More Stock
                </button>
              </div>
            </div>
          </div>
        )}

        {!successResult && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Product selection card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <PackagePlus className="h-3.5 w-3.5 text-primary" />
                  Target Product
                </label>
                {product && !changingProduct && (
                  <button
                    type="button"
                    onClick={() => setChangingProduct(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Change Product
                  </button>
                )}
              </div>

              {product && !changingProduct ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div>
                    <div className="font-semibold text-sm text-foreground">{product.name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {product.product_code || product.sku || `#${product.id}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${
                        currentStockVal > 0
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                          : "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {currentStockVal > 0 ? `Current: ${currentStockVal} ${uom}` : `Out of Stock (0 ${uom})`}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Search and select the product to add stock for:</p>
                  <ProductSpecSearch
                    onSelect={handleSelectFromSearch}
                    placeholder="Search product by name, code, SKU, or category…"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Stock Parameters */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Location */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="stock-location-select">
                  <Store className="h-3.5 w-3.5 text-muted-foreground" />
                  Stock Location <span className="text-destructive">*</span>
                </label>
                {loadingLocations ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading locations…
                  </div>
                ) : (
                  <select
                    id="stock-location-select"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={submitting}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.code ? `(${loc.code})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="stock-qty-input">
                  <span>Quantity to Add <span className="text-destructive">*</span></span>
                  <span className="text-[11px] text-muted-foreground font-mono">UOM: {uom}</span>
                </label>
                <input
                  id="stock-qty-input"
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="e.g. 5.000"
                  required
                />
              </div>

              {/* Unit Cost */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between" htmlFor="stock-unit-cost-input">
                  <span>Unit Cost Snapshot</span>
                  <span className="text-[11px] text-muted-foreground">Optional</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <input
                    id="stock-unit-cost-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    disabled={submitting}
                    className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Effective Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="stock-date-input">
                  Effective Date <span className="text-destructive">*</span>
                </label>
                <input
                  id="stock-date-input"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="stock-note-input">
                  Reference Note
                </label>
                <input
                  id="stock-note-input"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="e.g. Counter intake, opening batch"
                />
              </div>
            </div>

            {/* Real-time projection preview */}
            {product && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  Real-time Stock Preview
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Current</div>
                    <div className="text-sm font-bold font-mono text-foreground mt-0.5">{currentStockVal} {uom}</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-muted-foreground uppercase font-medium">Adding</div>
                    <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      +{inputQtyVal > 0 ? inputQtyVal : 0} {uom}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/80 p-2 border border-emerald-300 dark:border-emerald-700">
                    <div className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase font-medium">New Total</div>
                    <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {projectedStockVal} {uom}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !product || inputQtyVal <= 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Posting Stock Intake…
                  </>
                ) : (
                  <>
                    <PackagePlus className="h-3.5 w-3.5" />
                    Post Stock Intake
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
  );

  if (variant === "embedded") {
    return content;
  }

  return (
    <DrawerShell
      open={open}
      title="Quick Stock Intake / Opening Stock"
      description="Post opening stock or stock intake for products right from your current workflow. The stock ledger and on-hand quantities reflect immediately."
      onClose={onClose}
      size="default"
      closeOnEscape={!submitting}
      closeOnOverlayClick={!submitting}
    >
      {content}
    </DrawerShell>
  );
}
