"use client";
import { Controller, useFormContext } from "react-hook-form";
import { ProductCreationFormDataWithVariants } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { getProductCatalogOptions, type ProductCatalogOptions } from "@/services/products";
import { generateProductCodes } from "@/lib/utils/product-codes";
import { useEffect, useMemo, useState } from "react";
import { Wand2 } from "lucide-react";

export default function BasicIdentityTab() {
  const { control, formState: { errors }, watch, setValue } = useFormContext<ProductCreationFormDataWithVariants>();
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>({
    categories: [],
    subcategories: [],
    unit_of_measure_masters: [],
    unit_of_measure_options: ["PCS"],
    item_type_choices: [],
    stock_type_choices: [],
  });

  const categoryValue = watch("category");
  const subcategoryValue = watch("subcategory");
  const unitValue = watch("unit_of_measure");

  useEffect(() => {
    getProductCatalogOptions()
      .then(setCatalogOptions)
      .catch(() => {
        setCatalogOptions({
          categories: [],
          subcategories: [],
          unit_of_measure_masters: [],
          unit_of_measure_options: ["PCS"],
          item_type_choices: [],
          stock_type_choices: [],
        });
      });
  }, []);

  const suggestedSubcategories = useMemo(
    () =>
      catalogOptions.subcategories.filter((item) =>
        !categoryValue
          ? true
          : item.category_name.toLowerCase() === categoryValue.toLowerCase()
      ),
    [catalogOptions.subcategories, categoryValue]
  );

  const selectedUnitMaster = useMemo(
    () =>
      catalogOptions.unit_of_measure_masters.find(
        (item) => item.code.toLowerCase() === (unitValue || "PCS").toLowerCase()
      ) ?? null,
    [catalogOptions.unit_of_measure_masters, unitValue]
  );

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Product Identity"
        description="Name, code, and classification that uniquely identify this product in the system."
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Product Code */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Product Code <span className="text-destructive">*</span>
            </label>
            <Controller
              name="product_code"
              control={control}
              render={({ field }) => (
                <div>
                  <input
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    type="text"
                    placeholder="e.g., CHAIR-001, SOFA-BLUE-M"
                    className={`w-full h-10 rounded-lg border px-3 py-2 text-sm bg-background outline-none transition ${
                      errors.product_code
                        ? "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
                        : "border-border focus:border-ring focus:ring-1 focus:ring-ring"
                    }`}
                  />
                  {errors.product_code && (
                    <p className="mt-1 text-xs text-destructive">{errors.product_code.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Product Name <span className="text-destructive">*</span>
            </label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <div>
                  <input
                    {...field}
                    type="text"
                    placeholder="e.g., Leather Office Chair, Blue Sofa"
                    className={`w-full h-10 rounded-lg border px-3 py-2 text-sm bg-background outline-none transition ${
                      errors.name
                        ? "border-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
                        : "border-border focus:border-ring focus:ring-1 focus:ring-ring"
                    }`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* SKU */}
          <div>
            <label className="block text-sm font-medium mb-2">SKU (Optional)</label>
            <Controller
              name="sku"
              control={control}
              render={({ field }) => (
                <div>
                  <div className="flex gap-2">
                    <input
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      type="text"
                      placeholder="e.g., SKU-12345"
                      className="flex-1 h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (watch("product_code")) {
                          const codes = generateProductCodes(watch("product_code"));
                          setValue("sku", codes.sku);
                        }
                      }}
                      disabled={!watch("product_code")}
                      className="px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium flex items-center gap-1"
                      title="Auto-generate SKU from product code"
                    >
                      <Wand2 className="h-4 w-4" />
                      Generate
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Format: SKU-{watch("product_code") ? watch("product_code").toUpperCase() : "CODE"}-001
                  </p>
                </div>
              )}
            />
          </div>

          {/* Unit of Measure */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Unit of Measure <span className="text-destructive">*</span>
            </label>
            <Controller
              name="unit_of_measure"
              control={control}
              render={({ field }) => (
                <div>
                  <input
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    type="text"
                    placeholder="PCS, KG, LTR, etc."
                    list="unit-options"
                    className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <datalist id="unit-options">
                    {catalogOptions.unit_of_measure_options.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                  {selectedUnitMaster && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Matched: {selectedUnitMaster.name}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2">Category (Optional)</label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <div>
                  <input
                    {...field}
                    type="text"
                    placeholder="Type to search or select"
                    list="category-options"
                    className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <datalist id="category-options">
                    {catalogOptions.categories.map((cat) => (
                      <option key={cat.id} value={cat.name} />
                    ))}
                  </datalist>
                </div>
              )}
            />
          </div>

          {/* Subcategory */}
          <div>
            <label className="block text-sm font-medium mb-2">Subcategory (Optional)</label>
            <Controller
              name="subcategory"
              control={control}
              render={({ field }) => (
                <div>
                  <input
                    {...field}
                    type="text"
                    placeholder="Type to search or select"
                    list="subcategory-options"
                    disabled={!categoryValue}
                    className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
                  />
                  <datalist id="subcategory-options">
                    {suggestedSubcategories.map((subcat) => (
                      <option key={subcat.id} value={subcat.name} />
                    ))}
                  </datalist>
                </div>
              )}
            />
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Product Classification"
        description="Type and inventory classification determine availability for different fulfillment modes."
      >
        <div className="grid grid-cols-2 gap-6">
          {/* Item Type */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Item Type <span className="text-destructive">*</span>
            </label>
            <Controller
              name="item_type"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  {catalogOptions.item_type_choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          {/* Stock Type */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Stock Type <span className="text-destructive">*</span>
            </label>
            <Controller
              name="stock_type"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  className="w-full h-10 rounded-lg border border-border px-3 py-2 text-sm bg-background outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  {catalogOptions.stock_type_choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Status"
        description="Control whether this product is available for new transactions."
      >
        <div className="flex items-center gap-3">
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm">Active product (available for orders and subscriptions)</span>
              </label>
            )}
          />
        </div>
      </ERPSectionShell>
    </div>
  );
}
