"use client";
import { Controller, useFormContext } from "react-hook-form";
import { ProductCreationFormData } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import CatalogSpecificationFields from "@/components/admin/products/CatalogSpecificationFields";

export default function SpecificationsTab() {
  const { control, formState: { errors }, watch } = useFormContext<ProductCreationFormData>();
  const catalogCategoryId = watch("catalog_category");
  const baseSpecs = watch("base_specs");

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Product Specifications"
        description="Dynamic attributes and details specific to the product category."
      >
        <Controller
          name="catalog_category"
          control={control}
          render={({ field }) => (
            <div>
              <label className="block text-sm font-medium mb-2">
                Catalog Category (Optional)
              </label>
              <input
                {...field}
                type="number"
                placeholder="Select a PIM category to unlock dynamic specs"
                className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Dynamic specification fields will appear once you select a PIM category
              </p>
            </div>
          )}
        />
      </ERPSectionShell>

      {catalogCategoryId && (
        <ERPSectionShell
          title="Dynamic Attributes"
          description="Fields defined by the selected catalog category."
        >
          <Controller
            name="base_specs"
            control={control}
            render={({ field }) => (
              <div>
                <CatalogSpecificationFields
                  categoryId={catalogCategoryId}
                  value={baseSpecs as Record<string, unknown>}
                  onChange={field.onChange}
                />
              </div>
            )}
          />
        </ERPSectionShell>
      )}

      <ERPSectionShell
        title="Description"
        description="General notes about this product (internal use)."
      >
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <div>
              <textarea
                {...field}
                rows={6}
                placeholder="e.g., Premium leather office chair, suitable for executive use. Ergonomic back support."
                className={`w-full rounded-lg border px-3 py-2 text-sm bg-background outline-none transition resize-none ${
                  errors.description
                    ? "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
                    : "border-border focus:border-ring focus:ring-1 focus:ring-ring"
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Internal notes — not visible to customers
              </p>
            </div>
          )}
        />
      </ERPSectionShell>
    </div>
  );
}
