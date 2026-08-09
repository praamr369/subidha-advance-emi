import { z } from "zod";

export type ProductItemType = "FINISHED_GOOD" | "RAW_MATERIAL" | "ACCESSORY" | "SERVICE" | "ADD_ON";
export type ProductStockType = "STOCK_ITEM" | "MADE_TO_ORDER" | "NON_STOCK";

export const productCreationSchema = z.object({
  product_code: z
    .string()
    .min(1, "Product code is required")
    .min(2, "Product code must be at least 2 characters")
    .regex(/^[A-Z0-9\-]+$/, "Product code must contain only uppercase letters, numbers, and hyphens"),

  name: z
    .string()
    .min(1, "Product name is required")
    .min(2, "Product name must be at least 2 characters")
    .max(255, "Product name must be at most 255 characters"),

  base_price: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const num = Number(val);
        return Number.isFinite(num);
      },
      "Base price must be a valid number"
    ),

  sku: z.string().optional(),

  unit_of_measure: z
    .string()
    .min(1, "Unit of measure is required")
    .default("PCS"),

  category: z.string().optional(),
  subcategory: z.string().optional(),
  catalog_category: z.number().nullable().optional(),

  description: z.string().optional(),

  hsn_sac_code: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return /^[0-9]{4,8}$/.test(val.trim());
      },
      "HSN/SAC code must be 4-8 digits"
    ),

  gst_rate: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const num = Number(val);
        return Number.isFinite(num) && num >= 0 && num <= 28;
      },
      "GST rate must be between 0 and 28"
    ),

  item_type: z
    .string()
    .default("FINISHED_GOOD")
    .refine((val) => ["FINISHED_GOOD", "RAW_MATERIAL", "ACCESSORY", "SERVICE", "ADD_ON"].includes(val)),

  stock_type: z
    .string()
    .default("STOCK_ITEM")
    .refine((val) => ["STOCK_ITEM", "MADE_TO_ORDER", "NON_STOCK"].includes(val)),

  is_active: z.boolean().default(true),

  is_emi_enabled: z.boolean().default(true),
  is_rent_enabled: z.boolean().default(false),
  is_lease_enabled: z.boolean().default(false),
  is_direct_sale_enabled: z.boolean().default(true),

  base_specs: z.record(z.unknown()).default({}),

  image: z
    .instanceof(File)
    .nullable()
    .optional()
    .refine(
      (file) => {
        if (!file) return true;
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
        return allowedTypes.includes(file.type);
      },
      "Use JPG, PNG, or WEBP image files only"
    )
    .refine(
      (file) => {
        if (!file) return true;
        return file.size <= 5 * 1024 * 1024;
      },
      "Image size must be 5 MB or smaller"
    ),

  sync_to_pim: z.boolean().default(true),
});

export type ProductCreationFormData = z.infer<typeof productCreationSchema>;

// Product variant schema
export const productVariantSchema = z.object({
  id: z.string().optional(),
  variant_code: z.string().min(1, "Variant code required").max(50),
  variant_name: z.string().min(1, "Variant name required").max(255),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  variant_price: z.string().optional(),
  is_active: z.boolean().default(true),
});

export type ProductVariant = z.infer<typeof productVariantSchema>;

export const productCreationSchemaWithVariants = productCreationSchema.extend({
  has_variants: z.boolean().default(false),
  variants: z.array(productVariantSchema).default([]),
});

export type ProductCreationFormDataWithVariants = z.infer<typeof productCreationSchemaWithVariants>;

// Refined schema with conditional validation for price
export const productCreationSchemaWithPriceValidation = productCreationSchemaWithVariants.refine(
  (data) => {
    const requiresPrice = data.item_type !== "SERVICE" && data.item_type !== "ADD_ON";
    if (!requiresPrice) return true;
    const price = Number(data.base_price || 0);
    return price > 0;
  },
  {
    message: "Base price must be greater than zero for this product type",
    path: ["base_price"],
  }
);
