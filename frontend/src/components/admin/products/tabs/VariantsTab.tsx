"use client";
import { Controller, useFormContext, useFieldArray } from "react-hook-form";
import { ProductCreationFormDataWithVariants } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { Trash2, Plus, Wand2 } from "lucide-react";
import { useState } from "react";
import { generateProductCodes, generateVariantSKUs } from "@/lib/utils/product-codes";

export default function VariantsTab() {
  const { control, formState: { errors }, watch } = useFormContext<ProductCreationFormDataWithVariants>();
  const productCode = watch("product_code");
  const hasVariants = watch("has_variants");
  const basePrice = watch("base_price");

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  const [autoGenerating, setAutoGenerating] = useState(false);

  async function handleAddVariant() {
    append({
      variant_code: "",
      variant_name: "",
      sku: "",
      barcode: "",
      variant_price: basePrice,
      is_active: true,
    });
  }

  async function handleAutoGenerateSKUs() {
    if (!productCode || fields.length === 0) return;

    setAutoGenerating(true);
    try {
      const skus = generateVariantSKUs(
        productCode,
        fields.map((f) => ({
          code: f.variant_code || `VAR${fields.indexOf(f) + 1}`,
          name: f.variant_name || `Variant ${fields.indexOf(f) + 1}`,
        }))
      );

      fields.forEach((field, idx) => {
        const sku = skus[idx]?.sku;
        const codes = generateProductCodes(productCode, field.variant_code);
        control._formValues.variants![idx] = {
          ...field,
          sku: sku || field.sku,
          barcode: codes.barcode,
        };
      });
    } finally {
      setAutoGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Product Variants"
        description="Manage different sizes, colors, or configurations of this product."
      >
        <div className="space-y-4">
          <Controller
            name="has_variants"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...field}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm">This product has multiple variants (sizes, colors, etc.)</span>
              </label>
            )}
          />

          {hasVariants && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Each variant gets a unique SKU and barcode. You can generate them automatically or enter manually.
                </p>
                <button
                  type="button"
                  onClick={handleAutoGenerateSKUs}
                  disabled={autoGenerating || !productCode}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                >
                  <Wand2 className="h-4 w-4" />
                  Auto-Generate All SKUs & Barcodes
                </button>
              </div>

              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold mb-3">Variant {idx + 1}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Variant Code */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Code</label>
                            <Controller
                              name={`variants.${idx}.variant_code`}
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                  type="text"
                                  placeholder="e.g., BLU, RED, L, M, S"
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-background outline-none focus:border-ring focus:ring-1"
                                />
                              )}
                            />
                          </div>

                          {/* Variant Name */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Name</label>
                            <Controller
                              name={`variants.${idx}.variant_name`}
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="text"
                                  placeholder="e.g., Blue, Red, Large"
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-background outline-none focus:border-ring focus:ring-1"
                                />
                              )}
                            />
                          </div>

                          {/* SKU */}
                          <div>
                            <label className="block text-xs font-medium mb-1">SKU</label>
                            <Controller
                              name={`variants.${idx}.sku`}
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="text"
                                  placeholder="Auto-generated"
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-muted/50 outline-none focus:border-ring focus:ring-1"
                                  readOnly
                                />
                              )}
                            />
                          </div>

                          {/* Barcode */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Barcode</label>
                            <Controller
                              name={`variants.${idx}.barcode`}
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="text"
                                  placeholder="Auto-generated"
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-muted/50 outline-none focus:border-ring focus:ring-1"
                                  readOnly
                                />
                              )}
                            />
                          </div>

                          {/* Variant Price */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Price (Optional)</label>
                            <Controller
                              name={`variants.${idx}.variant_price`}
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  placeholder={basePrice || "Same as base"}
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-background outline-none focus:border-ring focus:ring-1"
                                />
                              )}
                            />
                          </div>

                          {/* Active */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Status</label>
                            <Controller
                              name={`variants.${idx}.is_active`}
                              control={control}
                              render={({ field }) => (
                                <select
                                  {...field}
                                  value={field.value ? "active" : "inactive"}
                                  onChange={(e) => field.onChange(e.target.value === "active")}
                                  className="w-full h-8 rounded-lg border border-border px-2 py-1 text-xs bg-background outline-none focus:border-ring focus:ring-1"
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="ml-2 p-2 rounded-lg border border-destructive/30 hover:bg-destructive/10 text-destructive transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Variant Button */}
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="w-full px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-sm font-medium text-foreground transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Variant
                </button>
              </div>
            </div>
          )}
        </div>
      </ERPSectionShell>

      {!hasVariants && (
        <ERPSectionShell title="Single Product" description="This product has no variants.">
          <p className="text-sm text-muted-foreground">
            A base SKU and barcode will be generated automatically for this product during creation.
          </p>
        </ERPSectionShell>
      )}
    </div>
  );
}
