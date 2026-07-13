"use client";

/**
 * Accessory + Service selection panel for billing / contract workspace.
 * Given a finished-good product ID, renders:
 *   • Variant groups  → radio-select one variant per group
 *   • Single accessories → checkbox
 *   • Services → checkbox
 * Calls onConfirm with the selections so the caller can add DraftLines.
 */

import { useEffect, useState } from "react";
import {
  fetchBillingAccessoryOptions,
  type BillingAccessoryOption,
  type BillingAccessoryOptionsResponse,
  type BillingServiceOption,
} from "@/services/inventory";

type SelectedAccessory = {
  linkId: number;
  inventoryItemId: number;
  productId: number;
  productName: string;
  productCode: string;
  variantLabel: string;
  unitOfMeasure: string;
  chargeMode: "FREE" | "CHARGEABLE";
  salePrice: string;
};

type SelectedService = {
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

type Props = {
  productId: number;
  onConfirm: (result: AccessorySelectionResult) => void;
  onCancel?: () => void;
};

export default function AccessorySelectionPanel({ productId, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingAccessoryOptionsResponse | null>(null);

  // For each accessory option: selected variant id (null = not included)
  const [accSelection, setAccSelection] = useState<Record<number, number | null>>({});
  // For each service option link_id: included or not
  const [svcSelection, setSvcSelection] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);
    fetchBillingAccessoryOptions(productId)
      .then((res) => {
        setData(res);
        // Pre-populate defaults
        const accDefaults: Record<number, number | null> = {};
        for (const opt of res.accessory_options) {
          if (opt.is_default_included) {
            accDefaults[opt.link_id] = opt.selected_variant_id;
          } else {
            accDefaults[opt.link_id] = null;
          }
        }
        setAccSelection(accDefaults);

        const svcDefaults: Record<number, boolean> = {};
        for (const svc of res.service_options) {
          svcDefaults[svc.link_id] = svc.is_default_included;
        }
        setSvcSelection(svcDefaults);
      })
      .catch(() => setError("Failed to load accessory options."))
      .finally(() => setLoading(false));
  }, [productId]);

  function handleConfirm() {
    if (!data) return;

    const accessories: SelectedAccessory[] = [];
    for (const opt of data.accessory_options) {
      const selectedVariantId = accSelection[opt.link_id];
      if (!selectedVariantId) continue;
      const variant = opt.variants.find((v) => v.id === selectedVariantId);
      if (!variant) continue;
      accessories.push({
        linkId: opt.link_id,
        inventoryItemId: variant.id,
        productId: variant.product_id,
        productName: variant.product_name,
        productCode: variant.product_code,
        variantLabel: variant.variant_label,
        unitOfMeasure: variant.unit_of_measure,
        chargeMode: opt.charge_mode,
        salePrice: opt.charge_mode === "CHARGEABLE" ? opt.sale_price || variant.base_price : "0.00",
      });
    }

    const services: SelectedService[] = [];
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

    onConfirm({ accessories, services });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Loading accessory options…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data || !data.has_options) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
        No accessories or services are mapped to this product.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {data.accessory_options.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-2">Accessories</h4>
          <div className="space-y-3">
            {data.accessory_options.map((opt) => (
              <AccessoryOptionRow
                key={opt.link_id}
                opt={opt}
                selected={accSelection[opt.link_id] ?? null}
                onChange={(variantId) =>
                  setAccSelection((prev) => ({ ...prev, [opt.link_id]: variantId }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {data.service_options.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-2">Services</h4>
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
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add to Bill
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            Skip
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
        FREE
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
      CHARGEABLE
    </span>
  );
}

type AccessoryOptionRowProps = {
  opt: BillingAccessoryOption;
  selected: number | null;
  onChange: (variantId: number | null) => void;
};

function AccessoryOptionRow({ opt, selected, onChange }: AccessoryOptionRowProps) {
  const isGroup = opt.link_type === "group";
  const label = isGroup ? (opt.group_name ?? "Accessory Group") : (opt.variants[0]?.product_name ?? "Accessory");
  const sub = [opt.group_category, opt.group_subcategory].filter(Boolean).join(" › ");

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <ChargeBadge mode={opt.charge_mode} />
            {opt.is_required && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">Required</span>
            )}
          </div>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          {opt.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{opt.notes}</p>}
          {opt.charge_mode === "CHARGEABLE" && parseFloat(opt.sale_price) > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Price: ₹{parseFloat(opt.sale_price).toFixed(2)}</p>
          )}
        </div>
      </div>

      {/* Variants */}
      {isGroup ? (
        <div className="flex flex-wrap gap-2">
          {/* Deselect option */}
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
          {opt.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={[
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                selected === v.id
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-foreground hover:border-primary/40",
              ].join(" ")}
            >
              {v.variant_label || v.product_name}
              {v.unit_of_measure && v.unit_of_measure !== "PCS" && (
                <span className="ml-1 text-muted-foreground">({v.unit_of_measure})</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        // Single item — checkbox style
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected !== null}
            onChange={(e) => onChange(e.target.checked ? (opt.variants[0]?.id ?? null) : null)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-xs text-foreground">
            {opt.variants[0]?.variant_label || opt.variants[0]?.product_name}
            {opt.variants[0]?.unit_of_measure && opt.variants[0].unit_of_measure !== "PCS" && (
              <span className="ml-1 text-muted-foreground">({opt.variants[0].unit_of_measure})</span>
            )}
          </span>
        </label>
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
