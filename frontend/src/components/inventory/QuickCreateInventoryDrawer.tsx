"use client";

/**
 * Quick-create drawer for creating an Accessory or Raw Material
 * inline, without navigating away from the product creation page.
 */

import { useState } from "react";
import { quickCreateAccessory, quickCreateRawMaterial, type QuickCreateResult } from "@/services/inventory";

type ItemType = "ACCESSORY" | "RAW_MATERIAL";

type Props = {
  open: boolean;
  itemType: ItemType;
  onClose: () => void;
  onCreated?: (result: QuickCreateResult) => void;
};

const TITLES: Record<ItemType, string> = {
  ACCESSORY: "Quick Create — Accessory",
  RAW_MATERIAL: "Quick Create — Raw Material",
};

const UOM_OPTIONS = ["PCS", "NOS", "SFT", "RFT", "KG", "LTR", "MTR", "BOX", "SET", "PAIR"];

export default function QuickCreateInventoryDrawer({ open, itemType, onClose, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [uom, setUom] = useState("PCS");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [variantLabel, setVariantLabel] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCode("");
    setName("");
    setBasePrice("");
    setUom("PCS");
    setCategory("");
    setSubcategory("");
    setDescription("");
    setSku("");
    setUnitCost("");
    setReorderQty("");
    setVariantLabel("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !basePrice) {
      setError("Code, Name, and Base Price are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        product_code: code.trim().toUpperCase(),
        name: name.trim(),
        base_price: basePrice,
        unit_of_measure: uom,
        category: category.trim(),
        subcategory: subcategory.trim(),
        description: description.trim(),
        sku: sku.trim() || undefined,
        standard_unit_cost: unitCost || undefined,
        reorder_level_qty: reorderQty || undefined,
        variant_label: variantLabel.trim() || undefined,
      };
      const result = itemType === "ACCESSORY"
        ? await quickCreateAccessory(payload)
        : await quickCreateRawMaterial(payload);
      reset();
      onCreated?.(result);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to create item. Check if the code already exists.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-background shadow-2xl border-l border-border flex flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{TITLES[itemType]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Item Code *" htmlFor="qc-code">
                <input
                  id="qc-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. ACC-SDRAIL-TEK"
                  maxLength={50}
                  required
                  className={INPUT}
                />
              </Field>
              <Field label="Unit of Measure" htmlFor="qc-uom">
                <select id="qc-uom" value={uom} onChange={(e) => setUom(e.target.value)} className={INPUT}>
                  {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Name *" htmlFor="qc-name">
              <input
                id="qc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Side Rail – Teak 6ft"
                maxLength={255}
                required
                className={INPUT}
              />
            </Field>

            {itemType === "ACCESSORY" && (
              <Field label="Variant Label" htmlFor="qc-vlabel">
                <input
                  id="qc-vlabel"
                  value={variantLabel}
                  onChange={(e) => setVariantLabel(e.target.value)}
                  placeholder="e.g. Teak 6ft (shown on billing)"
                  maxLength={120}
                  className={INPUT}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Short label shown when selecting a variant in billing (e.g. "Teak 6ft").
                </p>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Base Price (₹) *" htmlFor="qc-price">
                <input
                  id="qc-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="0.00"
                  required
                  className={INPUT}
                />
              </Field>
              <Field label="Standard Cost (₹)" htmlFor="qc-cost">
                <input
                  id="qc-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" htmlFor="qc-cat">
                <input
                  id="qc-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Side Rail"
                  maxLength={120}
                  className={INPUT}
                />
              </Field>
              <Field label="Subcategory" htmlFor="qc-subcat">
                <input
                  id="qc-subcat"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="e.g. Wood"
                  maxLength={120}
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU" htmlFor="qc-sku">
                <input
                  id="qc-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Optional"
                  maxLength={60}
                  className={INPUT}
                />
              </Field>
              <Field label="Reorder Qty" htmlFor="qc-reorder">
                <input
                  id="qc-reorder"
                  type="number"
                  min="0"
                  step="0.001"
                  value={reorderQty}
                  onChange={(e) => setReorderQty(e.target.value)}
                  placeholder="0"
                  className={INPUT}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="qc-desc">
              <textarea
                id="qc-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes…"
                className={`${INPUT} resize-none`}
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 border-t border-border px-5 py-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Creating…" : `Create ${itemType === "ACCESSORY" ? "Accessory" : "Raw Material"}`}
            </button>
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "block w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
