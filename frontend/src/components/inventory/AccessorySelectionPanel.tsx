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

import { useCallback, useEffect, useState } from "react";
import {
  addFGAccessoryLink,
  addFGServiceLink,
  createServiceCatalogItem,
  fetchBillingAccessoryOptions,
  listAccessories,
  listServiceCatalog,
  quickCreateAndLinkAccessory,
  type AccessoryRow,
  type BillingAccessoryOption,
  type BillingAccessoryOptionsResponse,
  type BillingAccessoryVariant,
  type BillingServiceOption,
  type ParentVariantOption,
  type ServiceCatalogItem,
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
  defaultOpenSetup?: boolean;
  onOptionsChanged?: () => void;
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
  defaultOpenSetup = false,
  onOptionsChanged,
  onSwitchParentVariant,
  onConfirm,
  onCancel,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingAccessoryOptionsResponse | null>(null);

  // Selected variant InventoryItem ID per link_id (null = excluded)
  const [accSelection, setAccSelection] = useState<Record<number, number | null>>({});
  // Editable per-link charge mode, quantity, and unit price/cost
  const [accChargeModes, setAccChargeModes] = useState<Record<number, "FREE" | "CHARGEABLE">>({});
  const [accQuantities, setAccQuantities] = useState<Record<number, string>>({});
  const [accPrices, setAccPrices] = useState<Record<number, string>>({});
  // Services: selection, charge mode override, and price override
  const [svcSelection, setSvcSelection] = useState<Record<number, boolean>>({});
  const [svcChargeModes, setSvcChargeModes] = useState<Record<number, "FREE" | "CHARGEABLE">>({});
  const [svcPrices, setSvcPrices] = useState<Record<number, string>>({});
  // Serial and warranty tracking (sale/contract)
  const [serials, setSerials] = useState<Record<number, string>>({});
  const [warranties, setWarranties] = useState<Record<number, number>>({});
  const [warrantyCards, setWarrantyCards] = useState<Record<number, string>>({});

  // Inline setup / link accessories & services right inside this panel
  const [setupOpen, setSetupOpen] = useState<boolean>(defaultOpenSetup);
  const [setupTab, setSetupTab] = useState<"link_acc" | "new_acc" | "link_svc">("link_acc");
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogAccessories, setCatalogAccessories] = useState<AccessoryRow[]>([]);
  const [catalogServices, setCatalogServices] = useState<ServiceCatalogItem[]>([]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);

  const [linkAccForm, setLinkAccForm] = useState({
    accessoryId: "",
    chargeMode: "FREE" as "FREE" | "CHARGEABLE",
    salePrice: "0.00",
    quantity: "1.000",
    isDefaultIncluded: true,
  });
  const [newAccForm, setNewAccForm] = useState({
    name: "",
    productCode: "",
    basePrice: "0.00",
    unitOfMeasure: "PCS",
    chargeMode: "FREE" as "FREE" | "CHARGEABLE",
    salePrice: "0.00",
    quantity: "1.000",
    isDefaultIncluded: true,
  });
  const [linkSvcForm, setLinkSvcForm] = useState({
    mode: "existing" as "existing" | "new",
    serviceId: "",
    newName: "",
    newCode: "",
    newStandardPrice: "0.00",
    chargeMode: "FREE" as "FREE" | "CHARGEABLE",
    salePrice: "0.00",
    isDefaultIncluded: true,
  });

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBillingAccessoryOptions(productId, itemId ? { itemId } : undefined);
      setData(res);

      const accDefaults: Record<number, number | null> = {};
      const accModeDefaults: Record<number, "FREE" | "CHARGEABLE"> = {};
      const qtyDefaults: Record<number, string> = {};
      const priceDefaults: Record<number, string> = {};

      for (const opt of res.accessory_options) {
        const defaultVarId = opt.selected_variant_id ?? opt.variants[0]?.id ?? null;
        const defaultVar = opt.variants.find((v) => v.id === defaultVarId) ?? opt.variants[0];

        const shouldSelectByDefault =
          mode === "purchase"
            ? Boolean(opt.is_supplied_with_parent && opt.charge_mode === "FREE" && opt.variants.length <= 1)
            : Boolean(opt.is_required || (opt.is_default_included && opt.charge_mode === "FREE"));

        accDefaults[opt.link_id] = shouldSelectByDefault ? defaultVarId : null;
        accModeDefaults[opt.link_id] = opt.charge_mode === "CHARGEABLE" ? "CHARGEABLE" : "FREE";
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
      setAccChargeModes(accModeDefaults);
      setAccQuantities(qtyDefaults);
      setAccPrices(priceDefaults);

      const svcDefaults: Record<number, boolean> = {};
      const svcModeDefaults: Record<number, "FREE" | "CHARGEABLE"> = {};
      const svcPriceDefaults: Record<number, string> = {};
      for (const svc of res.service_options) {
        svcDefaults[svc.link_id] = svc.is_default_included;
        const cMode = svc.charge_mode === "CHARGEABLE" ? "CHARGEABLE" : "FREE";
        svcModeDefaults[svc.link_id] = cMode;
        const rawPrice = Number(svc.sale_price || svc.standard_price || 0);
        svcPriceDefaults[svc.link_id] = cMode === "CHARGEABLE" ? rawPrice.toFixed(2) : "0.00";
      }
      setSvcSelection(svcDefaults);
      setSvcChargeModes(svcModeDefaults);
      setSvcPrices(svcPriceDefaults);
    } catch {
      setError("Failed to load variant and accessory options.");
    } finally {
      setLoading(false);
    }
  }, [productId, itemId, mode, parentQuantity]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!setupOpen || catalogLoaded) return;
    let active = true;
    Promise.all([
      listAccessories({ page_size: 100 }).catch(() => ({ results: [] as AccessoryRow[] })),
      listServiceCatalog({ page_size: 100 }).catch(() => ({ results: [] as ServiceCatalogItem[] })),
    ]).then(([accRes, svcRes]) => {
      if (!active) return;
      setCatalogAccessories(accRes.results ?? []);
      setCatalogServices(svcRes.results ?? []);
      setCatalogLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [setupOpen, catalogLoaded]);

  function resolveChargeableVariantPrice(opt: BillingAccessoryOption, variant?: BillingAccessoryVariant): string {
    const linkPrice = Number(opt.sale_price || 0);
    const variantPrice = Number(variant?.base_price || 0);
    if (opt.variants.length > 1) {
      return (variantPrice > 0 ? variantPrice : linkPrice).toFixed(2);
    }
    return (linkPrice > 0 ? linkPrice : variantPrice).toFixed(2);
  }

  function handleSelectVariant(opt: BillingAccessoryOption, variantId: number | null) {
    setAccSelection((prev) => ({ ...prev, [opt.link_id]: variantId }));
    if (variantId !== null) {
      const variant = opt.variants.find((v) => v.id === variantId);
      if (variant) {
        const effectiveMode = accChargeModes[opt.link_id] ?? opt.charge_mode;
        const nextPrice =
          mode === "purchase"
            ? resolveDefaultPurchaseCost(opt, variant)
            : effectiveMode === "FREE"
              ? "0.00"
              : resolveChargeableVariantPrice(opt, variant);
        setAccPrices((prev) => ({ ...prev, [opt.link_id]: nextPrice }));
      }
    }
  }

  function handleAccChargeModeChange(opt: BillingAccessoryOption, nextMode: "FREE" | "CHARGEABLE") {
    setAccChargeModes((prev) => ({ ...prev, [opt.link_id]: nextMode }));
    if (nextMode === "FREE") {
      setAccPrices((prev) => ({ ...prev, [opt.link_id]: "0.00" }));
      return;
    }
    const selectedId = accSelection[opt.link_id];
    const variant = opt.variants.find((v) => v.id === selectedId) ?? opt.variants[0];
    const currentEntered = Number(accPrices[opt.link_id] || 0);
    if (currentEntered <= 0) {
      setAccPrices((prev) => ({
        ...prev,
        [opt.link_id]: resolveChargeableVariantPrice(opt, variant),
      }));
    }
  }

  function handleSvcChargeModeChange(svc: BillingServiceOption, nextMode: "FREE" | "CHARGEABLE") {
    setSvcChargeModes((prev) => ({ ...prev, [svc.link_id]: nextMode }));
    if (nextMode === "FREE") {
      setSvcPrices((prev) => ({ ...prev, [svc.link_id]: "0.00" }));
      return;
    }
    const currentEntered = Number(svcPrices[svc.link_id] || 0);
    if (currentEntered <= 0) {
      const fallback = Number(svc.sale_price || svc.standard_price || 0);
      setSvcPrices((prev) => ({ ...prev, [svc.link_id]: fallback.toFixed(2) }));
    }
  }

  async function handleSetupSubmit() {
    const fgId = data?.inventory_item_id || itemId;
    if (!fgId) {
      setSetupError("Finished Good inventory profile is required before linking accessories or services.");
      return;
    }
    setSetupSaving(true);
    setSetupError(null);
    setSetupSuccess(null);
    try {
      if (setupTab === "link_acc") {
        if (!linkAccForm.accessoryId) {
          setSetupError("Select an accessory to link.");
          setSetupSaving(false);
          return;
        }
        await addFGAccessoryLink(fgId, {
          accessory: Number(linkAccForm.accessoryId),
          charge_mode: linkAccForm.chargeMode,
          sale_price: linkAccForm.chargeMode === "FREE" ? "0.00" : Number(linkAccForm.salePrice || 0).toFixed(2),
          quantity: linkAccForm.quantity || "1.000",
          is_default_included: linkAccForm.isDefaultIncluded,
        });
        setLinkAccForm({
          accessoryId: "",
          chargeMode: "FREE",
          salePrice: "0.00",
          quantity: "1.000",
          isDefaultIncluded: true,
        });
        setSetupSuccess("Accessory linked to this finished good.");
      } else if (setupTab === "new_acc") {
        if (!newAccForm.name.trim() || !newAccForm.productCode.trim()) {
          setSetupError("Accessory name and product code are required.");
          setSetupSaving(false);
          return;
        }
        await quickCreateAndLinkAccessory(fgId, {
          name: newAccForm.name.trim(),
          product_code: newAccForm.productCode.trim().toUpperCase(),
          base_price: Number(newAccForm.basePrice || 0).toFixed(2),
          unit_of_measure: newAccForm.unitOfMeasure || "PCS",
          charge_mode: newAccForm.chargeMode,
          sale_price: newAccForm.chargeMode === "FREE" ? "0.00" : Number(newAccForm.salePrice || 0).toFixed(2),
          is_default_included: newAccForm.isDefaultIncluded,
        });
        setNewAccForm({
          name: "",
          productCode: "",
          basePrice: "0.00",
          unitOfMeasure: "PCS",
          chargeMode: "FREE",
          salePrice: "0.00",
          quantity: "1.000",
          isDefaultIncluded: true,
        });
        setCatalogLoaded(false);
        setSetupSuccess("New accessory created and linked.");
      } else {
        let svcId = linkSvcForm.serviceId ? Number(linkSvcForm.serviceId) : 0;
        if (linkSvcForm.mode === "new") {
          if (!linkSvcForm.newName.trim() || !linkSvcForm.newCode.trim()) {
            setSetupError("Service name and code are required.");
            setSetupSaving(false);
            return;
          }
          const createdSvc = await createServiceCatalogItem({
            name: linkSvcForm.newName.trim(),
            code: linkSvcForm.newCode.trim().toUpperCase(),
            service_type: "ADDON",
            standard_price: Number(linkSvcForm.newStandardPrice || 0).toFixed(2),
            status: "ACTIVE",
          });
          svcId = createdSvc.id;
          setCatalogLoaded(false);
        }
        if (!svcId) {
          setSetupError("Select a service to link.");
          setSetupSaving(false);
          return;
        }
        await addFGServiceLink(fgId, {
          service: svcId,
          charge_mode: linkSvcForm.chargeMode,
          sale_price: linkSvcForm.chargeMode === "FREE" ? "0.00" : Number(linkSvcForm.salePrice || 0).toFixed(2),
          is_default_included: linkSvcForm.isDefaultIncluded,
        });
        setLinkSvcForm({
          mode: "existing",
          serviceId: "",
          newName: "",
          newCode: "",
          newStandardPrice: "0.00",
          chargeMode: "FREE",
          salePrice: "0.00",
          isDefaultIncluded: true,
        });
        setSetupSuccess("Service linked to this finished good.");
      }
      await loadOptions();
      onOptionsChanged?.();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Failed to save accessory/service link.");
    } finally {
      setSetupSaving(false);
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

      const effectiveChargeMode = accChargeModes[opt.link_id] ?? opt.charge_mode;
      const enteredVal = accPrices[opt.link_id];
      const fallbackPrice =
        mode === "purchase"
          ? resolveDefaultPurchaseCost(opt, variant)
          : effectiveChargeMode === "FREE"
            ? "0.00"
            : resolveChargeableVariantPrice(opt, variant);
      const effectiveVal =
        enteredVal !== undefined && enteredVal !== ""
          ? Number(enteredVal || 0).toFixed(2)
          : fallbackPrice;
      const finalChargeMode: "FREE" | "CHARGEABLE" =
        mode === "purchase"
          ? Number(effectiveVal) > 0
            ? "CHARGEABLE"
            : "FREE"
          : Number(effectiveVal) > 0
            ? "CHARGEABLE"
            : effectiveChargeMode;

      accessories.push({
        linkId: opt.link_id,
        inventoryItemId: variant.id,
        productId: variant.product_id,
        productName: variant.product_name,
        productCode: variant.product_code,
        sku: variant.sku || variant.product_code,
        variantLabel: variant.variant_label || variant.product_name,
        unitOfMeasure: variant.unit_of_measure || "PCS",
        chargeMode: finalChargeMode,
        salePrice:
          mode === "purchase"
            ? resolveEffectiveSalePrice(opt, variant)
            : finalChargeMode === "FREE"
              ? "0.00"
              : effectiveVal,
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
        const chosenMode = svcChargeModes[svc.link_id] ?? svc.charge_mode;
        const rawSvcPrice = Number(svcPrices[svc.link_id] ?? svc.sale_price ?? svc.standard_price ?? 0);
        const finalSvcMode: "FREE" | "CHARGEABLE" =
          chosenMode === "FREE" && rawSvcPrice <= 0 ? "FREE" : rawSvcPrice > 0 || chosenMode === "CHARGEABLE" ? "CHARGEABLE" : "FREE";
        services.push({
          linkId: svc.link_id,
          serviceId: svc.service_id,
          serviceName: svc.service_name,
          serviceCode: svc.service_code,
          chargeMode: finalSvcMode,
          salePrice: finalSvcMode === "CHARGEABLE" ? rawSvcPrice.toFixed(2) : "0.00",
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

  const resolvedFgItemId = data?.inventory_item_id || itemId;
  const parentVariants = data?.parent_variants ?? [];
  const selectedAccCount = Object.values(accSelection).filter((v) => v !== null && v !== undefined).length;
  const selectedSvcCount = Object.values(svcSelection).filter(Boolean).length;
  const resolvedConfirmLabel =
    confirmLabel ||
    (mode === "purchase"
      ? `Apply Selected Accessories (${selectedAccCount})`
      : mode === "contract"
        ? `Apply to Contract (${selectedAccCount + selectedSvcCount})`
        : "Add to Bill");

  const setupSection =
    mode !== "purchase" ? (
      <section className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Setup / Link Accessories &amp; Services to {data?.product_name || "Finished Good"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Link existing accessories, quick-create a new accessory, or attach services as Free or Chargeable.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSetupOpen((v) => !v);
              setSetupError(null);
              setSetupSuccess(null);
            }}
            className="rounded-md border border-primary/40 bg-background px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            {setupOpen ? "Hide Setup" : "+ Setup / Link"}
          </button>
        </div>

        {setupOpen && (
          <div className="space-y-3 border-t border-border/70 pt-3">
            {!resolvedFgItemId ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                Initialize an inventory profile for this finished good (via Opening Stock or Products) before linking accessories/services.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["link_acc", "Link Existing Accessory"],
                      ["new_acc", "+ New Accessory & Link"],
                      ["link_svc", "Link / Create Service"],
                    ] as const
                  ).map(([tabKey, tabLabel]) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => {
                        setSetupTab(tabKey);
                        setSetupError(null);
                        setSetupSuccess(null);
                      }}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        setupTab === tabKey
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:border-primary/40"
                      }`}
                    >
                      {tabLabel}
                    </button>
                  ))}
                </div>

                {setupTab === "link_acc" && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs sm:col-span-2">
                      <span className="font-medium text-muted-foreground">Accessory Item</span>
                      <select
                        value={linkAccForm.accessoryId}
                        onChange={(e) => {
                          const accId = e.target.value;
                          const matched = catalogAccessories.find((a) => String(a.id) === accId);
                          setLinkAccForm((prev) => ({
                            ...prev,
                            accessoryId: accId,
                            salePrice:
                              prev.chargeMode === "CHARGEABLE" && matched?.base_price
                                ? Number(matched.base_price).toFixed(2)
                                : prev.salePrice,
                          }));
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="">Select accessory…</option>
                        {catalogAccessories.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.product_code} — {acc.name || acc.product_name} (₹{Number(acc.base_price || 0).toFixed(2)} · Stock: {acc.available_qty ?? acc.physical_qty ?? "0"})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Charge Mode</span>
                      <select
                        value={linkAccForm.chargeMode}
                        onChange={(e) => {
                          const nextMode = e.target.value as "FREE" | "CHARGEABLE";
                          const matched = catalogAccessories.find((a) => String(a.id) === linkAccForm.accessoryId);
                          setLinkAccForm((prev) => ({
                            ...prev,
                            chargeMode: nextMode,
                            salePrice:
                              nextMode === "FREE"
                                ? "0.00"
                                : Number(prev.salePrice || 0) > 0
                                  ? prev.salePrice
                                  : Number(matched?.base_price || 0).toFixed(2),
                          }));
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="FREE">Free / Included</option>
                        <option value="CHARGEABLE">Chargeable (Paid Add-on)</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Qty per Unit</span>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={linkAccForm.quantity}
                        onChange={(e) => setLinkAccForm((prev) => ({ ...prev, quantity: e.target.value }))}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                      />
                    </label>
                    {linkAccForm.chargeMode === "CHARGEABLE" && (
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">Sale Price (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={linkAccForm.salePrice}
                          onChange={(e) => setLinkAccForm((prev) => ({ ...prev, salePrice: e.target.value }))}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-xs sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={linkAccForm.isDefaultIncluded}
                        onChange={(e) => setLinkAccForm((prev) => ({ ...prev, isDefaultIncluded: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span>Pre-select on new Direct Sales &amp; Contracts</span>
                    </label>
                  </div>
                )}

                {setupTab === "new_acc" && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Accessory Name *</span>
                      <input
                        type="text"
                        placeholder="e.g. Hydraulic Lift Kit"
                        value={newAccForm.name}
                        onChange={(e) => setNewAccForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Product Code *</span>
                      <input
                        type="text"
                        placeholder="e.g. ACC-HYD-001"
                        value={newAccForm.productCode}
                        onChange={(e) => setNewAccForm((prev) => ({ ...prev, productCode: e.target.value.toUpperCase() }))}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Individual Base Price (₹)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newAccForm.basePrice}
                        onChange={(e) => setNewAccForm((prev) => ({ ...prev, basePrice: e.target.value }))}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Charge Mode with FG</span>
                      <select
                        value={newAccForm.chargeMode}
                        onChange={(e) => {
                          const nextMode = e.target.value as "FREE" | "CHARGEABLE";
                          setNewAccForm((prev) => ({
                            ...prev,
                            chargeMode: nextMode,
                            salePrice: nextMode === "FREE" ? "0.00" : prev.salePrice !== "0.00" ? prev.salePrice : prev.basePrice,
                          }));
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="FREE">Free / Included</option>
                        <option value="CHARGEABLE">Chargeable (Paid Add-on)</option>
                      </select>
                    </label>
                    {newAccForm.chargeMode === "CHARGEABLE" && (
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">Add-on Sale Price (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newAccForm.salePrice}
                          onChange={(e) => setNewAccForm((prev) => ({ ...prev, salePrice: e.target.value }))}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                        />
                      </label>
                    )}
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Unit</span>
                      <input
                        type="text"
                        value={newAccForm.unitOfMeasure}
                        onChange={(e) => setNewAccForm((prev) => ({ ...prev, unitOfMeasure: e.target.value.toUpperCase() }))}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                      />
                    </label>
                  </div>
                )}

                {setupTab === "link_svc" && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => setLinkSvcForm((prev) => ({ ...prev, mode: "existing" }))}
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${linkSvcForm.mode === "existing" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        Existing Service
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkSvcForm((prev) => ({ ...prev, mode: "new" }))}
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${linkSvcForm.mode === "new" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        + Create New Service
                      </button>
                    </div>
                    {linkSvcForm.mode === "existing" ? (
                      <label className="grid gap-1 text-xs sm:col-span-2">
                        <span className="font-medium text-muted-foreground">Service</span>
                        <select
                          value={linkSvcForm.serviceId}
                          onChange={(e) => {
                            const sid = e.target.value;
                            const matched = catalogServices.find((s) => String(s.id) === sid);
                            setLinkSvcForm((prev) => ({
                              ...prev,
                              serviceId: sid,
                              salePrice:
                                prev.chargeMode === "CHARGEABLE"
                                  ? Number(matched?.standard_price || matched?.price || 0).toFixed(2)
                                  : prev.salePrice,
                            }));
                          }}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        >
                          <option value="">Select service…</option>
                          {catalogServices.map((svc) => (
                            <option key={svc.id} value={svc.id}>
                              {svc.code || `SVC-${svc.id}`} — {svc.name || svc.service_name} (₹{Number(svc.standard_price || svc.price || 0).toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-muted-foreground">Service Name *</span>
                          <input
                            type="text"
                            placeholder="e.g. Home Installation"
                            value={linkSvcForm.newName}
                            onChange={(e) => setLinkSvcForm((prev) => ({ ...prev, newName: e.target.value }))}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-muted-foreground">Service Code *</span>
                          <input
                            type="text"
                            placeholder="e.g. SVC-INST-01"
                            value={linkSvcForm.newCode}
                            onChange={(e) => setLinkSvcForm((prev) => ({ ...prev, newCode: e.target.value.toUpperCase() }))}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          <span className="font-medium text-muted-foreground">Standard Price (₹)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={linkSvcForm.newStandardPrice}
                            onChange={(e) => setLinkSvcForm((prev) => ({ ...prev, newStandardPrice: e.target.value }))}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                          />
                        </label>
                      </>
                    )}
                    <label className="grid gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Charge Mode</span>
                      <select
                        value={linkSvcForm.chargeMode}
                        onChange={(e) => {
                          const nextMode = e.target.value as "FREE" | "CHARGEABLE";
                          const matched = catalogServices.find((s) => String(s.id) === linkSvcForm.serviceId);
                          setLinkSvcForm((prev) => ({
                            ...prev,
                            chargeMode: nextMode,
                            salePrice:
                              nextMode === "FREE"
                                ? "0.00"
                                : prev.mode === "new"
                                  ? prev.newStandardPrice
                                  : Number(matched?.standard_price || matched?.price || 0).toFixed(2),
                          }));
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      >
                        <option value="FREE">Free / Included</option>
                        <option value="CHARGEABLE">Chargeable</option>
                      </select>
                    </label>
                    {linkSvcForm.chargeMode === "CHARGEABLE" && (
                      <label className="grid gap-1 text-xs">
                        <span className="font-medium text-muted-foreground">Sale Price (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={linkSvcForm.salePrice}
                          onChange={(e) => setLinkSvcForm((prev) => ({ ...prev, salePrice: e.target.value }))}
                          className="h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                        />
                      </label>
                    )}
                  </div>
                )}

                {setupError && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {setupError}
                  </div>
                )}
                {setupSuccess && (
                  <div className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                    {setupSuccess}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={setupSaving}
                    onClick={() => void handleSetupSubmit()}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {setupSaving ? "Saving…" : "Save & Link"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    ) : null;

  if (!data || !data.has_options) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground text-center">
          No variants, accessories, or services are mapped to this product yet.
        </div>
        {setupSection}
        {onCancel && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {setupSection}
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
                chargeMode={accChargeModes[opt.link_id] ?? opt.charge_mode}
                quantity={accQuantities[opt.link_id] ?? "1"}
                price={accPrices[opt.link_id] ?? "0.00"}
                onChange={(variantId) => handleSelectVariant(opt, variantId)}
                onChargeModeChange={(nextMode) => handleAccChargeModeChange(opt, nextMode)}
                onQuantityChange={(val) => setAccQuantities((prev) => ({ ...prev, [opt.link_id]: val }))}
                onPriceChange={(val) => {
                  setAccPrices((prev) => ({ ...prev, [opt.link_id]: val }));
                  if (mode !== "purchase") {
                    if (Number(val || 0) > 0) {
                      setAccChargeModes((prev) => ({ ...prev, [opt.link_id]: "CHARGEABLE" }));
                    } else if (val !== "") {
                      setAccChargeModes((prev) => ({ ...prev, [opt.link_id]: "FREE" }));
                    }
                  }
                }}
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
                chargeMode={svcChargeModes[svc.link_id] ?? svc.charge_mode}
                price={svcPrices[svc.link_id] ?? (svc.charge_mode === "CHARGEABLE" ? svc.sale_price : "0.00")}
                onChange={(v) => setSvcSelection((prev) => ({ ...prev, [svc.link_id]: v }))}
                onChargeModeChange={(nextMode) => handleSvcChargeModeChange(svc, nextMode)}
                onPriceChange={(val) => {
                  setSvcPrices((prev) => ({ ...prev, [svc.link_id]: val }));
                  if (Number(val || 0) > 0) {
                    setSvcChargeModes((prev) => ({ ...prev, [svc.link_id]: "CHARGEABLE" }));
                  } else if (val !== "") {
                    setSvcChargeModes((prev) => ({ ...prev, [svc.link_id]: "FREE" }));
                  }
                }}
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
  chargeMode: "FREE" | "CHARGEABLE";
  quantity: string;
  price: string;
  onChange: (variantId: number | null) => void;
  onChargeModeChange: (nextMode: "FREE" | "CHARGEABLE") => void;
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
  chargeMode,
  quantity,
  price,
  onChange,
  onChargeModeChange,
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
            <ChargeBadge mode={chargeMode} />
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
                  ({mode === "purchase" ? `Cost ₹${vPrice}` : chargeMode === "FREE" ? "Free" : `₹${vPrice}`}
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
                : chargeMode === "FREE"
                  ? "₹0.00 (Included)"
                  : `₹${opt.variants[0] ? resolveEffectiveSalePrice(opt, opt.variants[0]) : opt.sale_price}`}
              {opt.variants[0]?.available_stock !== undefined
                ? ` · Stock: ${Number(opt.variants[0].available_stock)}`
                : ""}
            </span>
          </span>
        </label>
      )}

      {/* Editable Qty, Charge Mode, Price/Cost & Serial/Warranty when selected */}
      {selected !== null && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-dashed border-border mt-1">
          {mode !== "purchase" && (
            <div className="inline-flex rounded-md border border-border overflow-hidden text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => onChargeModeChange("FREE")}
                className={`px-2 py-1 transition-colors ${
                  chargeMode === "FREE"
                    ? "bg-emerald-600 text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Free / Included
              </button>
              <button
                type="button"
                onClick={() => onChargeModeChange("CHARGEABLE")}
                className={`px-2 py-1 transition-colors ${
                  chargeMode === "CHARGEABLE"
                    ? "bg-amber-600 text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Chargeable
              </button>
            </div>
          )}
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
  chargeMode: "FREE" | "CHARGEABLE";
  price: string;
  onChange: (v: boolean) => void;
  onChargeModeChange: (nextMode: "FREE" | "CHARGEABLE") => void;
  onPriceChange: (val: string) => void;
};

function ServiceOptionRow({
  svc,
  selected,
  chargeMode,
  price,
  onChange,
  onChargeModeChange,
  onPriceChange,
}: ServiceOptionRowProps) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-colors ${
        selected ? "border-primary/50 bg-primary/[0.02]" : "border-border bg-background"
      }`}
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{svc.service_name}</span>
            <ChargeBadge mode={chargeMode} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {svc.service_category && (
              <span className="text-xs text-muted-foreground">{svc.service_category}</span>
            )}
            {chargeMode === "CHARGEABLE" && parseFloat(price) > 0 && (
              <span className="text-xs font-mono text-muted-foreground">₹{parseFloat(price).toFixed(2)}</span>
            )}
            {svc.hsn_sac_code && (
              <span className="text-xs text-muted-foreground">SAC: {svc.hsn_sac_code}</span>
            )}
          </div>
          {svc.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{svc.notes}</p>}
        </div>
      </label>

      {selected && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-dashed border-border">
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => onChargeModeChange("FREE")}
              className={`px-2 py-1 transition-colors ${
                chargeMode === "FREE"
                  ? "bg-emerald-600 text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Free / Included
            </button>
            <button
              type="button"
              onClick={() => onChargeModeChange("CHARGEABLE")}
              className={`px-2 py-1 transition-colors ${
                chargeMode === "CHARGEABLE"
                  ? "bg-amber-600 text-white"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Chargeable
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Service Price (₹):</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="h-7 w-24 rounded border border-border bg-background px-1.5 text-xs font-mono outline-none focus:border-ring"
            />
          </div>
        </div>
      )}
    </div>
  );
}
