"use client";
import { Controller, useFormContext } from "react-hook-form";
import { ProductCreationFormDataWithVariants } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import SmartSuggestField from "@/components/forms/SmartSuggestField";
import { formatRupee } from "@/lib/utils/currency";

export default function FinancialsTab() {
  const { control, formState: { errors }, watch } = useFormContext<ProductCreationFormDataWithVariants>();
  const basePrice = watch("base_price");
  const itemType = watch("item_type");
  const productName = watch("name");
  const description = watch("description");

  const requiresPrice = itemType !== "SERVICE" && itemType !== "ADD_ON";
  const displayPrice = basePrice ? formatRupee(Number(basePrice)) : "—";
  const sourceText = `${productName} ${description}`.trim();

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Pricing & Tax"
        description="Base price and tax classification for accounting and compliance."
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Base Price */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Base Price {requiresPrice && <span className="text-destructive">*</span>}
            </label>
            <Controller
              name="base_price"
              control={control}
              render={({ field }) => (
                <div>
                  <div className="flex gap-2">
                    <input
                      {...field}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder={requiresPrice ? "e.g., 5000.00" : "Optional for services"}
                      className={`flex-1 h-10 rounded-lg border px-3 py-2 text-sm bg-background outline-none transition ${
                        errors.base_price
                          ? "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
                          : "border-border focus:border-ring focus:ring-1 focus:ring-ring"
                      }`}
                    />
                    <div className="flex items-center px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-medium min-w-[100px]">
                      {displayPrice}
                    </div>
                  </div>
                  {errors.base_price && (
                    <p className="mt-1 text-xs text-destructive">{errors.base_price.message}</p>
                  )}
                  {!requiresPrice && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Services and add-ons are quoted separately
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* HSN/SAC Code with AI Suggestion */}
          <div>
            <Controller
              name="hsn_sac_code"
              control={control}
              render={({ field }) => (
                <SmartSuggestField
                  id="hsn-code"
                  label="HSN/SAC Code (Optional)"
                  value={field.value || ""}
                  onChange={field.onChange}
                  sourceText={sourceText}
                  fieldKey="product.hsn"
                  placeholder="e.g., 94017090"
                  error={errors.hsn_sac_code?.message}
                />
              )}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Click "Suggest" to get AI-powered HSN/SAC code recommendations based on product name and description
            </p>
          </div>

          {/* GST Rate */}
          <div>
            <label className="block text-sm font-medium mb-2">GST Rate (Optional)</label>
            <Controller
              name="gst_rate"
              control={control}
              render={({ field }) => (
                <div>
                  <div className="flex gap-2">
                    <input
                      {...field}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max="28"
                      placeholder="e.g., 18"
                      className={`flex-1 h-10 rounded-lg border px-3 py-2 text-sm bg-background outline-none transition ${
                        errors.gst_rate
                          ? "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
                          : "border-border focus:border-ring focus:ring-1 focus:ring-ring"
                      }`}
                    />
                    <div className="flex items-center px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-medium">
                      %
                    </div>
                  </div>
                  {errors.gst_rate && (
                    <p className="mt-1 text-xs text-destructive">{errors.gst_rate.message}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">0–28% (0%, 5%, 12%, 18%, 28%)</p>
                </div>
              )}
            />
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Accounting Notes"
        description="Financial categorization used by accounting and reporting systems."
      >
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            • <strong>Base Price</strong> — The standard unit cost or invoice price. Services may be zero.
          </p>
          <p className="text-muted-foreground">
            • <strong>HSN/SAC Code</strong> — Required for GST compliance and invoice generation.
          </p>
          <p className="text-muted-foreground">
            • <strong>GST Rate</strong> — Automatically applied to invoices and GST returns.
          </p>
        </div>
      </ERPSectionShell>
    </div>
  );
}
