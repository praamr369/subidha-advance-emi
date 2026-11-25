"use client";

/**
 * Unified Accessory + Variant + Service selection panel for:
 *   - purchase (PO, Goods Receipt, Vendor Bill, Accounting Purchase Bill)
 *   - sale (Direct Sale)
 *   - contract (Rent / Lease)
 *
 * Supports:
 *   1. Switching parent finished-good variants (with per-variant price/cost & stock)
 *   2. Selecting which accessories and which variant of each accessory to include
 *   3. Per-variant pricing/costing and quantity overrides
 */

import { useEffect, useState } from "react";
import {
  fetchBillingAccessoryOptions,
  type BillingAccessoryOption,
  type BillingAccessoryOptionsResponse,
  type BillingAccessoryVariant,
  type BillingServiceOption,
  type ParentVariantOption,
} from "@/services/inventory";

export type SelectedAccessory = {
  linkId: number;
  inventoryItemId: number;
  productId: number;
  productName: string;
  productCode: string;
  sku: string;
  variantLabel: string;
  unitOfMeasure: string;
  chargeMode: "FREE" | "CHARGEABLE";
  salePrice: string;
  unitCost: string;
  quantity: string;
  serialNumber?: string;
  warrantyMonths?: number;
  warrantyCardNumber?: string;
  sourcingType?: string;
  sourcingVendorName?: string;
  isSuppliedWithParent?: boolean;
  isolationMode?: string;
};

export type SelectedService = {
  linkId: number;
  serviceId: number;
  serviceName: string;
  serviceCode: string;
  chargeMode: "FREE" | "CHARGEABLE";
  salePrice: string;
  taxRatePercent: string;
  hsnSacCode: string;
};

export type AccessorySelectionResult = {
  accessories: SelectedAccessory[];
  services: SelectedService[];
};

export type AccessorySelectionMode = "sale" | "purchase" | "contract";

type Props = {
  productId: number;
  itemId?: number;
  mode?: AccessorySelectionMode;
  parentQuantity?: number;
  confirmLabel?: string;
  compact?: boolean;
  onSwitchParentVariant?: (variant: ParentVariantOption) => void;
  onConfirm: (result: AccessorySelectionResult) => void;
  onCancel?: () => void;
};

function resolveEffectiveSalePrice(opt: BillingAccessoryOption, variant: BillingAccessoryVariant): string {
  if (opt.charge_mode === "FREE") return "0.00";
  const linkPrice = Number(opt.sale_price || 0);
  const variantPrice = Number(variant.base_price || 0);
  if (opt.variants.length > 1) {
    return (variantPrice > 0 ? variantPrice : linkPrice).toFixed(2);
  }
  return (linkPrice > 0 ? linkPrice : variantPrice).toFixed(2);
}

function resolveDefaultPurchaseCost(opt: BillingAccessoryOption, variant: BillingAccessoryVariant): string {
  // If supplied free inside parent price, default to 0.00 (operator can 1-click toggle to item cost)
  if (opt.is_supplied_with_parent && opt.charge_mode === "FREE") {
    return "0.00";
  }
  const purchaseCost = Number(variant.purchase_unit_cost || 0);
  const stdCost = Number(variant.standard_unit_cost || 0);
  const resolved = purchaseCost > 0 ? purchaseCost : stdCost;
  return resolved.toFixed(2);
}

function resolveDefaultQuantity(opt: BillingAccessoryOption, parentQuantity: number): string {
  const linkQty = Math.max(0.001, Number(opt.quantity || 1) || 1);
  const total = Math.max(1, parentQuantity) * linkQty;
  return Number.isInteger(total) ? String(total) : total.toFixed(3);
}

export default function AccessorySelectionPanel({
  productId,
  itemId,
  mode = "sale",
  parentQuantity = 1,
  confirmLabel,
  compact = false,
  onSwitchParentVariant,
  onConfirm,
  onCancel,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingAccessoryOptionsResponse | null>(null);

  // Selected variant InventoryItem ID per link_id (null = excluded)
  const [accSelection, setAccSelection] = useState<Record<number, number | null>>({});
  // Editable per-link quantity and unit price/cost
  const [accQuantities, setAccQuantities] = useState<Record<number, string>>({});
  const [accPrices, setAccPrices] = useState<Record<number, string>>({});
  // Services
  const [svcSelection, setSvcSelection] = useState<Record<number, boolean>>({});
  // Serial and warranty tracking (sale/contract)
  const [serials, setSerials] = useState<Record<number, string>>({});
  const [warranties, setWarranties] = useState<Record<number, number>>({});
  const [warrantyCards, setWarrantyCards] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchBillingAccessoryOptions(productId, itemId ? { itemId } : undefined)
      .then((res) => {
        if (!active) return;
        setData(res);

        const accDefaults: Record<number, number | null> = {};
        const qtyDefaults: Record<number, string> = {};
        const priceDefaults: Record<number, string> = {};

        for (const opt of res.accessory_options) {
          const defaultVarId = opt.selected_variant_id ?? opt.variants[0]?.id ?? null;
          const defaultVar = opt.variants.find((v) => v.id === defaultVarId) ?? opt.variants[0];

          // Pre-select FREE/required defaults; in purchase mode also pre-select supplied-with-parent free items
          const shouldSelectByDefault =
            mode === "purchase"
              ? Boolean(opt.is_supplied_with_parent && opt.charge_mode === "FREE" && opt.variants.length <= 1)
              : Boolean(opt.is_required || (opt.is_default_included && opt.charge_mode === "FREE"));

          accDefaults[opt.link_id] = shouldSelectByDefault ? defaultVarId : null;
          qtyDefaults[opt.link_id] = resolveDefaultQuantity(opt, parentQuantity);
          if (defaultVar) {
            priceDefaults[opt.link_id] =
              mode === "purchase"
                ? resolveDefaultPurchaseCost(opt, defaultVar)
                : resolveEffectiveSalePrice(opt, defaultVar);
          } else {
            priceDefaults[opt.link_id] = "0.00";
          }
        }

        setAccSelection(accDefaults);
        setAccQuantities(qtyDefaults);
        setAccPrices(priceDefaults);

        const svcDefaults: Record<number, boolean> = {};
        for (const svc of res.service_options) {
          svcDefaults[svc.link_id] = svc.is_default_included;
        }
        setSvcSelection(svcDefaults);
      })
      .catch(() => {
        if (active) setError("Failed to load variant and accessory options.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, itemId, mode, parentQuantity]);

  function handleSelectVariant(opt: BillingAccessoryOption, variantId: number | null) {
    setAccSelection((prev) => ({ ...prev, [opt.link_id]: variantId }));
    if (variantId !== null) {
      const variant = opt.variants.find((v) => v.id === variantId);
      if (variant) {
        const nextPrice =
          mode === "purchase"
            ? resolveDefaultPurchaseCost(opt, variant)
            : resolveEffectiveSalePrice(opt, variant);
        setAccPrices((prev) => ({ ...prev, [opt.link_id]: nextPrice }));
      }
    }
  }

  function handleConfirm() {
    if (!data) return;

    const accessories: SelectedAccessory[] = [];
    for (const opt of data.accessory_options) {
      const selectedVariantId = accSelection[opt.link_id];
      if (!selectedVariantId) continue;
      const variant = opt.variants.find((v) => v.id === selectedVariantId);
      if (!variant) continue;

      const enteredVal = accPrices[opt.link_id];
      const fallbackPrice =
        mode === "purchase"
          ? resolveDefaultPurchaseCost(opt, variant)
          : resolveEffectiveSalePrice(opt, variant);
      const effectiveVal = enteredVal !== undefined && enteredVal !== "" ? Number(enteredVal || 0).toFixed(2) : fallbackPrice;

      accessories.push({
        linkId: opt.link_id,
        inventoryItemId: variant.id,
        productId: variant.product_id,
        productName: variant.product_name,
        productCode: variant.product_code,
        sku: variant.sku || variant.product_code,
        variantLabel: variant.variant_label || variant.product_name,
        unitOfMeasure: variant.unit_of_measure || "PCS",
        chargeMode: mode === "purchase" ? (Number(effectiveVal) > 0 ? "CHARGEABLE" : "FREE") : opt.charge_mode,
        salePrice: mode === "purchase" ? resolveEffectiveSalePrice(opt, variant) : effectiveVal,
        unitCost: mode === "purchase" ? effectiveVal : (variant.purchase_unit_cost || variant.standard_unit_cost || "0.00"),
        quantity: accQuantities[opt.link_id] || resolveDefaultQuantity(opt, parentQuantity),
        serialNumber: serials[opt.link_id] || "",
        warrantyMonths: warranties[opt.link_id] || 0,
        warrantyCardNumber: warrantyCards[opt.link_id] || "",
        sourcingType: opt.sourcing_type,
        sourcingVendorName: opt.sourcing_vendor_name,
        isSuppliedWithParent: opt.is_supplied_with_parent,
        isolationMode: opt.isolation_mode,
      });
    }

    const services: SelectedService[] = [];
    if (mode !== "purchase") {
      for (const svc of data.service_options) {
        if (!svcSelection[svc.link_id]) continue;
        services.push({
          linkId: svc.link_id,
          serviceId: svc.service_id,
          serviceName: svc.service_name,
          serviceCode: svc.service_code,
          chargeMode: svc.charge_mode,
          salePrice: svc.charge_mode === "CHARGEABLE" ? svc.sale_price : "0.00",
          taxRatePercent: svc.tax_rate_percent,
          hsnSacCode: svc.hsn_sac_code,
        });
      }
    }

    onConfirm({ accessories, services });
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? "py-4" : "py-10"} text-xs text-muted-foreground`}>
        Loading variants &amp; accessory options…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (!data || !data.has_options) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground text-center">
        No variants, accessories, or services are mapped to this product.
      </div>
    );
  }

  const parentVariants = data.parent_variants ?? [];
  const selectedAccCount = Object.values(accSelection).filter((v) => v !== null && v !== undefined).length;
  const resolvedConfirmLabel =
    confirmLabel ||
    (mode === "purchase"
      ? `Apply Selected Accessories (${selectedAccCount})`
      : mode === "contract"
        ? `Apply to Contract (${selectedAccCount})`
        : "Add to Bill");

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {/* Parent Product Variants Switcher */}
      {parentVariants.length > 1 && onSwitchParentVariant && (
        <section className="rounded-xl border border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-sky-950 dark:text-sky-200 uppercase tracking-wide">
              Parent Product Variants ({parentVariants.length})
            </h4>
            <span className="text-[10px] text-sky-700 dark:text-sky-400">
              Different variants have different {mode === "purchase" ? "purchase costs" : "prices"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parentVariants.map((pv) => {
              const priceLabel =
                mode === "purchase"
                  ? `Cost: ₹${Number(pv.purchase_unit_cost || 0).toLocaleString("en-IN")}`
                  : `₹${Number(pv.base_price || 0).toLocaleString("en-IN")}`;
              return (
                <button
                  key={pv.inventory_item_id}
                  type="button"
                  onClick={() => onSwitchParentVariant(pv)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    pv.is_current
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "border-border bg-background text-foreground hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold">{pv.variant_label || pv.name}</div>
                  <div className={`text-[10px] font-mono ${pv.is_current ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {pv.sku} · {priceLabel} · Stock: {Number(pv.available_stock || 0)}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {data.accessory_options.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
              {mode === "purchase" ? "Vendor Accessories & Variant Selection" : "Accessories & Variant Selection"}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {selectedAccCount} of {data.accessory_options.length} selected
            </span>
          </div>
          <div className="space-y-2.5">
            {data.accessory_options.map((opt) => (
              <AccessoryOptionRow
                key={opt.link_id}
                opt={opt}
                mode={mode}
                selected={accSelection[opt.link_id] ?? null}
                quantity={accQuantities[opt.link_id] ?? "1"}
                price={accPrices[opt.link_id] ?? "0.00"}
                onChange={(variantId) => handleSelectVariant(opt, variantId)}
                onQuantityChange={(val) => setAccQuantities((prev) => ({ ...prev, [opt.link_id]: val }))}
                onPriceChange={(val) => setAccPrices((prev) => ({ ...prev, [opt.link_id]: val }))}
                serialNumber={serials[opt.link_id] || ""}
                onSerialNumberChange={(val) => setSerials((prev) => ({ ...prev, [opt.link_id]: val }))}
                warrantyMonths={warranties[opt.link_id] || 0}
                onWarrantyMonthsChange={(val) => setWarranties((prev) => ({ ...prev, [opt.link_id]: val }))}
                warrantyCardNumber={warrantyCards[opt.link_id] || ""}
                onWarrantyCardNumberChange={(val) => setWarrantyCards((prev) => ({ ...prev, [opt.link_id]: val }))}
              />
            ))}
          </div>
        </section>
      )}

      {mode !== "purchase" && data.service_options.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Services</h4>
          <div className="space-y-2">
            {data.service_options.map((svc) => (
              <ServiceOptionRow
                key={svc.link_id}
                svc={svc}
                selected={svcSelection[svc.link_id] ?? false}
                onChange={(v) => setSvcSelection((prev) => ({ ...prev, [svc.link_id]: v }))}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {resolvedConfirmLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            {mode === "purchase" ? "Close" : "Skip"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChargeBadge({ mode }: { mode: "FREE" | "CHARGEABLE" }) {
  if (mode === "FREE") {
    return (
      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
        FREE / INCLUDED
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
      PAID ADD-ON
    </span>
  );
}

type AccessoryOptionRowProps = {
  opt: BillingAccessoryOption;
  mode: AccessorySelectionMode;
  selected: number | null;
  quantity: string;
  price: string;
  onChange: (variantId: number | null) => void;
  onQuantityChange: (val: string) => void;
  onPriceChange: (val: string) => void;
  serialNumber?: string;
  onSerialNumberChange?: (val: string) => void;
  warrantyMonths?: number;
  onWarrantyMonthsChange?: (val: number) => void;
  warrantyCardNumber?: string;
  onWarrantyCardNumberChange?: (val: string) => void;
};

function AccessoryOptionRow({
  opt,
  mode,
  selected,
  quantity,
  price,
  onChange,
  onQuantityChange,
  onPriceChange,
  serialNumber,
  onSerialNumberChange,
  warrantyMonths,
  onWarrantyMonthsChange,
  warrantyCardNumber,
  onWarrantyCardNumberChange,
}: AccessoryOptionRowProps) {
  const isGroup = opt.link_type === "group" || opt.variants.length > 1;
  const label = isGroup
    ? (opt.group_name ?? opt.accessory_name ?? opt.variants[0]?.product_name ?? "Accessory Group")
    : (opt.accessory_name ?? opt.variants[0]?.product_name ?? "Accessory");
  const sub = [opt.group_category, opt.group_subcategory].filter(Boolean).join(" › ");
  const selectedVariant = opt.variants.find((v) => v.id === selected) ?? opt.variants[0];
  const itemStdCost = selectedVariant
    ? (Number(selectedVariant.purchase_unit_cost || 0) > 0
        ? Number(selectedVariant.purchase_unit_cost)
        : Number(selectedVariant.standard_unit_cost || 0))
    : 0;

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-colors ${
        selected !== null ? "border-primary/50 bg-primary/[0.02]" : "border-border bg-background"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{label}</span>
            <ChargeBadge mode={opt.charge_mode} />
            {opt.sourcing_type === "OUTSOURCED_SEPARATE" ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Outsourced ({opt.sourcing_vendor_name || "Separate Vendor"})
              </span>
            ) : opt.sourcing_type === "INTERNAL_STOCK" ? (
              <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                Internal Stock
              </span>
            ) : (
              <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                Supplied with Parent
              </span>
            )}
            {opt.is_required && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                Required
              </span>
            )}
          </div>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          {opt.notes && <p className="text-[11px] text-muted-foreground italic mt-0.5">{opt.notes}</p>}
        </div>
      </div>

      {/* Variants / Selection */}
      {isGroup ? (
        <div className="flex flex-wrap gap-1.5">
          {!opt.is_required && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className={[
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                selected === null
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/40",
              ].join(" ")}
            >
              Not included
            </button>
          )}
          {opt.variants.map((v) => {
            const vPrice =
              mode === "purchase"
                ? resolveDefaultPurchaseCost(opt, v)
                : resolveEffectiveSalePrice(opt, v);
            const vStock = v.available_stock !== undefined ? Number(v.available_stock) : null;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange(v.id)}
                className={[
                  "rounded-md border px-2.5 py-1 text-left text-xs transition-colors",
                  selected === v.id
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border text-foreground hover:border-primary/40",
                ].join(" ")}
              >
                <span>{v.variant_label || v.product_name}</span>
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                  ({mode === "purchase" ? `Cost ₹${vPrice}` : opt.charge_mode === "FREE" ? "Free" : `₹${vPrice}`}
                  {vStock !== null ? ` · Stock: ${vStock}` : ""})
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected !== null}
            onChange={(e) => onChange(e.target.checked ? (opt.variants[0]?.id ?? null) : null)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-foreground">
            {opt.variants[0]?.variant_label || opt.variants[0]?.product_name}
            {opt.variants[0]?.sku && (
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">({opt.variants[0].sku})</span>
            )}
            <span className="ml-2 font-mono text-[11px] font-medium text-muted-foreground">
              {mode === "purchase"
                ? `Vendor Cost: ₹${opt.variants[0] ? resolveDefaultPurchaseCost(opt, opt.variants[0]) : "0.00"}`
                : opt.charge_mode === "FREE"
                  ? "₹0.00 (Included)"
                  : `₹${opt.variants[0] ? resolveEffectiveSalePrice(opt, opt.variants[0]) : opt.sale_price}`}
              {opt.variants[0]?.available_stock !== undefined
                ? ` · Stock: ${Number(opt.variants[0].available_stock)}`
                : ""}
            </span>
          </span>
        </label>
      )}

      {/* Editable Qty, Price/Cost & Serial/Warranty when selected */}
      {selected !== null && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-dashed border-border mt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Qty:</span>
            <input
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs font-mono outline-none focus:border-ring"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">
              {mode === "purchase" ? "Unit Cost (₹):" : "Unit Price (₹):"}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="h-7 w-24 rounded border border-border bg-background px-1.5 text-xs font-mono outline-none focus:border-ring"
            />
            {mode === "purchase" && itemStdCost > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPriceChange("0.00")}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  title="Included free with parent item"
                >
                  ₹0 Bundled
                </button>
                <button
                  type="button"
                  onClick={() => onPriceChange(itemStdCost.toFixed(2))}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
                  title="Use item's own purchase/standard cost"
                >
                  Item Cost ₹{itemStdCost.toFixed(0)}
                </button>
              </div>
            )}
          </div>

          {mode !== "purchase" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium">Serial #:</span>
                <input
                  type="text"
                  placeholder="e.g. SN-89212"
                  value={serialNumber || ""}
                  onChange={(e) => onSerialNumberChange?.(e.target.value)}
                  className="h-7 w-28 rounded border border-border bg-background px-1.5 text-xs font-mono outline-none focus:border-ring"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">Warranty:</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Mo"
                  value={warrantyMonths || ""}
                  onChange={(e) => onWarrantyMonthsChange?.(Number(e.target.value) || 0)}
                  className="h-7 w-12 rounded border border-border bg-background px-1 text-xs font-mono text-center outline-none focus:border-ring"
                />
                <span className="text-[10px] text-muted-foreground">mos</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium">Card #:</span>
                <input
                  type="text"
                  placeholder="Card #"
                  value={warrantyCardNumber || ""}
                  onChange={(e) => onWarrantyCardNumberChange?.(e.target.value)}
                  className="h-7 w-24 rounded border border-border bg-background px-1.5 text-xs font-mono outline-none focus:border-ring"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type ServiceOptionRowProps = {
  svc: BillingServiceOption;
  selected: boolean;
  onChange: (v: boolean) => void;
};

function ServiceOptionRow({ svc, selected, onChange }: ServiceOptionRowProps) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 cursor-pointer hover:bg-muted/30 transition-colors">
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{svc.service_name}</span>
          <ChargeBadge mode={svc.charge_mode} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {svc.service_category && (
            <span className="text-xs text-muted-foreground">{svc.service_category}</span>
          )}
          {svc.charge_mode === "CHARGEABLE" && parseFloat(svc.sale_price) > 0 && (
            <span className="text-xs text-muted-foreground">₹{parseFloat(svc.sale_price).toFixed(2)}</span>
          )}
          {svc.hsn_sac_code && (
            <span className="text-xs text-muted-foreground">SAC: {svc.hsn_sac_code}</span>
          )}
        </div>
        {svc.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{svc.notes}</p>}
      </div>
    </label>
  );
}
