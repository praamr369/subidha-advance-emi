// frontend/src/app/(dashboard)/admin/products/create/page.tsx
"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  Upload,
  X,
} from "lucide-react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPMetricStrip from "@/components/erp/ERPMetricStrip";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import FormActions from "@/components/ui/FormActions";
import { FormSection } from "@/components/ui/operations";
import { apiFetch } from "@/lib/api";
import { getProductCatalogOptions, type ProductCatalogOptions } from "@/services/products";

type CreatedProductResponse = {
  id: number;
  product_code?: string | null;
  name?: string;
  base_price?: string;
  sku?: string | null;
  unit_of_measure?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  image?: string | null;
  is_active?: boolean;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  created_at?: string | null;
};

type FieldErrors = Partial<
  Record<
    | "product_code"
    | "name"
    | "base_price"
    | "sku"
    | "unit_of_measure"
    | "category"
    | "subcategory"
    | "description"
    | "image"
    | "is_emi_enabled"
    | "is_rent_enabled"
    | "is_lease_enabled",
    string
  >
>;


function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to create product.";

  const raw = error.message.trim();
  if (!raw) return "Failed to create product.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }

    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }

    if (
      Array.isArray(parsed.non_field_errors) &&
      parsed.non_field_errors.length > 0
    ) {
      return String(parsed.non_field_errors[0]);
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function parseFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof Error)) return {};

  const raw = error.message.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: FieldErrors = {};

    const pick = (
      key: keyof FieldErrors,
      sourceKeys: string[] = [key]
    ) => {
      for (const sourceKey of sourceKeys) {
        const value = parsed[sourceKey];
        if (Array.isArray(value) && value.length > 0) {
          next[key] = String(value[0]);
          return;
        }
        if (typeof value === "string" && value.trim()) {
          next[key] = value;
          return;
        }
      }
    };

    pick("product_code");
    pick("name");
    pick("base_price");
    pick("sku");
    pick("unit_of_measure");
    pick("category");
    pick("subcategory");
    pick("description");
    pick("image");
    pick("is_emi_enabled");
    pick("is_rent_enabled");
    pick("is_lease_enabled");

    return next;
  } catch {
    return {};
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function ImageUploadZone({
  preview,
  onFileChange,
  onClear,
  disabled,
  error,
}: {
  preview: string | null;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
  disabled: boolean;
  error?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onFileChange(file);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    onFileChange(file);
  };

  if (preview) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt="Product preview"
          className="h-80 w-full object-cover"
        />
        {!disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      onClick={() => !disabled && document.getElementById("product-image")?.click()}
    >
      <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-foreground">Click or drag image to upload</p>
      <p className="mt-1 text-xs text-muted-foreground">
        JPG, PNG, WEBP up to 5MB
      </p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <input
        id="product-image"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleFileInput}
        disabled={disabled}
        className="hidden"
      />
    </div>
  );
}

export default function AdminProductCreatePage() {
  const [productCode, setProductCode] = useState("");
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [sku, setSku] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("PCS");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>({
    categories: [],
    subcategories: [],
    unit_of_measure_masters: [],
    unit_of_measure_options: ["PCS"],
  });

  const [isActive, setIsActive] = useState(true);
  const [isEmiEnabled, setIsEmiEnabled] = useState(true);
  const [isRentEnabled, setIsRentEnabled] = useState(false);
  const [isLeaseEnabled, setIsLeaseEnabled] = useState(false);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedProductResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogOptions() {
      try {
        const payload = await getProductCatalogOptions();
        if (!cancelled) {
          setCatalogOptions(payload);
        }
      } catch {
        if (!cancelled) {
          setCatalogOptions({
            categories: [],
            subcategories: [],
            unit_of_measure_masters: [],
            unit_of_measure_options: ["PCS"],
          });
        }
      }
    }

    void loadCatalogOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreview(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedImageFile]);

  const trimmedProductCode = productCode.trim().toUpperCase();
  const trimmedName = name.trim();
  const trimmedSku = sku.trim().toUpperCase();
  const trimmedUnitOfMeasure = unitOfMeasure.trim().toUpperCase() || "PCS";
  const trimmedCategory = category.trim();
  const trimmedSubcategory = subcategory.trim();
  const trimmedDescription = description.trim();
  const trimmedBasePrice = basePrice.trim();
  const suggestedSubcategories = useMemo(
    () =>
      catalogOptions.subcategories.filter((item) =>
        !trimmedCategory
          ? true
          : item.category_name.toLowerCase() === trimmedCategory.toLowerCase()
      ),
    [catalogOptions.subcategories, trimmedCategory]
  );
  const selectedCategoryMaster = useMemo(
    () =>
      catalogOptions.categories.find(
        (item) => item.name.toLowerCase() === trimmedCategory.toLowerCase()
      ) ?? null,
    [catalogOptions.categories, trimmedCategory]
  );
  const selectedSubcategoryMaster = useMemo(
    () =>
      suggestedSubcategories.find(
        (item) => item.name.toLowerCase() === trimmedSubcategory.toLowerCase()
      ) ?? null,
    [suggestedSubcategories, trimmedSubcategory]
  );
  const selectedUnitMaster = useMemo(
    () =>
      catalogOptions.unit_of_measure_masters.find(
        (item) => item.code.toLowerCase() === trimmedUnitOfMeasure.toLowerCase()
      ) ?? null,
    [catalogOptions.unit_of_measure_masters, trimmedUnitOfMeasure]
  );

  const currentPrice = useMemo(() => Number(trimmedBasePrice || 0), [trimmedBasePrice]);

  const canSave = useMemo(() => {
    return (
      trimmedProductCode.length > 0 &&
      trimmedName.length > 0 &&
      Number.isFinite(currentPrice) &&
      currentPrice > 0 &&
      isEmiEnabled
    );
  }, [trimmedProductCode, trimmedName, currentPrice, isEmiEnabled]);

  function resetForm() {
    setProductCode("");
    setName("");
    setBasePrice("");
    setSku("");
    setUnitOfMeasure("PCS");
    setCategory("");
    setSubcategory("");
    setDescription("");
    setIsActive(true);
    setIsEmiEnabled(true);
    setIsRentEnabled(false);
    setIsLeaseEnabled(false);
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    setError(null);
    setFieldErrors({});
    setCreated(null);
  }

  function handleImageChange(file: File | null) {
    setSelectedImageFile(file);
    setFieldErrors((current) => ({ ...current, image: undefined }));
    setError(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const price = Number(trimmedBasePrice);

    if (!trimmedProductCode) {
      next.product_code = "Product code is required.";
    }

    if (!trimmedName) {
      next.name = "Product name is required.";
    }

    if (!trimmedBasePrice) {
      next.base_price = "Base price is required.";
    } else if (!Number.isFinite(price) || price <= 0) {
      next.base_price = "Base price must be greater than zero.";
    }

    if (!isEmiEnabled && !isRentEnabled && !isLeaseEnabled) {
      next.is_emi_enabled = "At least one product mode must be enabled.";
    }

    if (!isEmiEnabled) {
      next.is_emi_enabled =
        "Current backend default plan type is EMI, so EMI must remain enabled at product creation.";
    }

    if (selectedImageFile) {
      const allowedTypes = new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
      ]);

      if (!allowedTypes.has(selectedImageFile.type)) {
        next.image = "Use JPG, PNG, or WEBP image files only.";
      }

      const maxBytes = 5 * 1024 * 1024;
      if (selectedImageFile.size > maxBytes) {
        next.image = "Image size must be 5 MB or smaller.";
      }
    }

    return next;
  }

  async function handleSave() {
    setError(null);
    setCreated(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    setLoadingLabel("Creating product master and uploading image...");

    try {
      const formData = new FormData();
      formData.append("product_code", trimmedProductCode);
      formData.append("name", trimmedName);
      formData.append("base_price", trimmedBasePrice);
      formData.append("sku", trimmedSku);
      if (selectedUnitMaster) {
        formData.append("unit_of_measure_master", String(selectedUnitMaster.id));
      }
      formData.append("unit_of_measure", trimmedUnitOfMeasure);
      if (selectedCategoryMaster) {
        formData.append("category_master", String(selectedCategoryMaster.id));
      }
      formData.append("category", trimmedCategory);
      if (selectedSubcategoryMaster) {
        formData.append("subcategory_master", String(selectedSubcategoryMaster.id));
      }
      formData.append("subcategory", trimmedSubcategory);
      formData.append("description", trimmedDescription);
      formData.append("is_active", String(isActive));
      formData.append("is_emi_enabled", String(isEmiEnabled));
      formData.append("is_rent_enabled", String(isRentEnabled));
      formData.append("is_lease_enabled", String(isLeaseEnabled));

      if (selectedImageFile) {
        formData.append("image", selectedImageFile);
      }

      const payload = await apiFetch<CreatedProductResponse>("/admin/products/", {
        method: "POST",
        body: formData,
      });

      setCreated(payload);
      setFieldErrors({});
      setSelectedImageFile(null);
      setSelectedImagePreview(null);
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
      setLoadingLabel(null);
    }
  }

  // Stats for the portal page - now with correct literal types
  const stats: Array<{ label: string; value: string | number; tone?: "danger" | "success" | "warning" | "default" | "info" }> = [
    {
      label: "Base Price",
      value: formatRupee(basePrice || 0),
      tone: "success",
    },
    {
      label: "EMI Enabled",
      value: isEmiEnabled ? "Yes" : "No",
      tone: isEmiEnabled ? "success" : "danger",
    },
    {
      label: "Rent Enabled",
      value: isRentEnabled ? "Yes" : "No",
      tone: isRentEnabled ? "warning" : "default",
    },
    {
      label: "Lease Enabled",
      value: isLeaseEnabled ? "Yes" : "No",
      tone: isLeaseEnabled ? "warning" : "default",
    },
  ];

  return (
    <ERPPageShell
      title="Create Product"
      subtitle="Create product master data for contract pricing, product lookup, and downstream subscription creation."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Create" },
      ]}
      actions={[
        {
          href: "/admin/products",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: "/admin/products/masters",
          label: "Manage Masters",
          variant: "secondary",
        },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={stats}
      statusBadge={{
        label: "Product Onboarding",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <ERPMetricStrip
          metrics={[
            {
              label: "Base Price",
              value: formatRupee(basePrice || 0),
              detail: "Total contract price for this product.",
            },
            {
              label: "EMI Mode",
              value: isEmiEnabled ? "Enabled" : "Disabled",
              detail: "Locked on for current backend default plan behavior.",
            },
            {
              label: "Rent Mode",
              value: isRentEnabled ? "Enabled" : "Disabled",
              detail: "Rent-capable flag for supported workflows.",
            },
            {
              label: "Lease Mode",
              value: isLeaseEnabled ? "Enabled" : "Disabled",
              detail: "Lease-capable flag for supported workflows.",
            },
          ]}
        />

        <ERPSectionShell
          title="Product rule"
          description="Product base price is the total contract price. Default EMI is derived later from base price and tenure months."
        >
          <ERPDetailGrid
            columns={4}
            items={[
              { label: "Pricing Meaning", value: "Base price = total contract price" },
              { label: "Image Rule", value: "One image per product" },
              { label: "Contract Usage", value: "Used in subscription creation" },
              { label: "Current Backend Constraint", value: "EMI remains enabled at create time" },
            ]}
          />
        </ERPSectionShell>

        <div className="grid gap-6 xl:grid-cols-2">
          <FormSection
            title="Product fields"
            description="Create the product master fields used by admin and subscription workflows."
          >
            <div className="grid gap-4">
              <div>
                <label
                  htmlFor="product-code"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Product Code
                </label>
                <input
                  id="product-code"
                  type="text"
                  value={productCode}
                  onChange={(event) => {
                    setProductCode(event.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="e.g. BED-0001"
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <FieldError message={fieldErrors.product_code} />
              </div>

              <div>
                <label
                  htmlFor="product-name"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Product Name
                </label>
                <input
                  id="product-name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Enter product name"
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <FieldError message={fieldErrors.name} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="product-sku"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    SKU
                  </label>
                  <input
                    id="product-sku"
                    type="text"
                    value={sku}
                    onChange={(event) => {
                      setSku(event.target.value.toUpperCase());
                      setError(null);
                    }}
                    placeholder="e.g. BED-KING-001"
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={fieldErrors.sku} />
                </div>

                <div>
                  <label
                    htmlFor="product-uom"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Unit of Measure
                  </label>
                  <select
                    id="product-uom"
                    value={unitOfMeasure}
                    onChange={(event) => {
                      setUnitOfMeasure(event.target.value.toUpperCase());
                      setError(null);
                    }}
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {catalogOptions.unit_of_measure_masters.map((option) => (
                      <option key={option.id} value={option.code}>
                        {option.code} · {option.name}
                      </option>
                    ))}
                    {catalogOptions.unit_of_measure_masters.length === 0
                      ? catalogOptions.unit_of_measure_options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))
                      : null}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Maintain units from{" "}
                    <Link href="/admin/products/masters" className="font-medium text-primary hover:underline">
                      Product Masters
                    </Link>
                    .
                  </p>
                  <FieldError message={fieldErrors.unit_of_measure} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="product-category"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Category
                  </label>
                  <select
                    id="product-category"
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setSubcategory("");
                      setError(null);
                    }}
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select category</option>
                    {catalogOptions.categories.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <FieldError message={fieldErrors.category} />
                </div>

                <div>
                  <label
                    htmlFor="product-subcategory"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Subcategory
                  </label>
                  <select
                    id="product-subcategory"
                    value={subcategory}
                    onChange={(event) => {
                      setSubcategory(event.target.value);
                      setError(null);
                    }}
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select subcategory</option>
                    {suggestedSubcategories.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    New category or subcategory needed? Add it in{" "}
                    <Link href="/admin/products/masters" className="font-medium text-primary hover:underline">
                      Product Masters
                    </Link>
                    .
                  </p>
                  <FieldError message={fieldErrors.subcategory} />
                </div>
              </div>

              <div>
                <label
                  htmlFor="product-base-price"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Base Price (Total Contract Price)
                </label>
                <input
                  id="product-base-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={basePrice}
                  onChange={(event) => {
                    setBasePrice(event.target.value);
                    setError(null);
                  }}
                  placeholder="Enter base price"
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <FieldError message={fieldErrors.base_price} />
              </div>

              <div>
                <label
                  htmlFor="product-description"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Description
                </label>
                <textarea
                  id="product-description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setError(null);
                  }}
                  rows={6}
                  placeholder="Enter product description"
                  disabled={saving}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <FieldError message={fieldErrors.description} />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Image and product modes"
            description="Attach the single product image and choose the operational capability flags supported by current backend rules."
          >
            <div className="space-y-5">
              <ImageUploadZone
                preview={selectedImagePreview}
                onFileChange={handleImageChange}
                onClear={() => handleImageChange(null)}
                disabled={saving}
                error={fieldErrors.image}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                      disabled={saving}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Product Active
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Inactive products remain in master data but should not be used for routine onboarding.
                      </div>
                    </div>
                  </div>
                </label>

                <label className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isEmiEnabled}
                      onChange={() => {
                        setIsEmiEnabled(true);
                        setError(null);
                      }}
                      disabled
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        EMI Enabled
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Locked on for current backend default plan behavior.
                      </div>
                      <FieldError message={fieldErrors.is_emi_enabled} />
                    </div>
                  </div>
                </label>

                <label className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isRentEnabled}
                      onChange={(event) => {
                        setIsRentEnabled(event.target.checked);
                        setError(null);
                      }}
                      disabled={saving}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Rent Enabled
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Marks the product as rent-capable for later workflow expansion.
                      </div>
                    </div>
                  </div>
                </label>

                <label className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isLeaseEnabled}
                      onChange={(event) => {
                        setIsLeaseEnabled(event.target.checked);
                        setError(null);
                      }}
                      disabled={saving}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Lease Enabled
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Marks the product as lease-capable for future platform growth.
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </FormSection>
        </div>

        {loadingLabel ? <ERPLoadingState label={loadingLabel} /> : null}

        {error ? (
          <ERPErrorState
            title="Unable to create product"
            description={error}
            onRetry={canSave ? handleSave : undefined}
          />
        ) : null}

        {created ? (
          <ERPSectionShell
            title="Product created"
            description="The product master was created successfully and is ready for register, detail, and subscription workflows."
          >
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "Product ID", value: `#${created.id}` },
                { label: "Product Code", value: created.product_code || trimmedProductCode },
                { label: "Name", value: created.name || trimmedName },
                { label: "Base Price", value: formatRupee(created.base_price || trimmedBasePrice) },
                { label: "SKU", value: created.sku || trimmedSku || "—" },
                { label: "Unit", value: created.unit_of_measure || trimmedUnitOfMeasure },
              ]}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/products/${created.id}`}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Open Product
              </Link>

              <Link
                href="/admin/products"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Back to Register
              </Link>

              <Link
                href="/admin/subscriptions/advance-emi/create"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Use in Subscription
              </Link>

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Create Another
              </button>
            </div>
          </ERPSectionShell>
        ) : null}

        <FormSection
          title="Create product"
          description="Save only after confirming product code, pricing, catalog structure, and optional image."
        >
          <FormActions
            align="between"
            submitLabel="Create Product"
            submitLoadingLabel="Creating Product..."
            onSubmitClick={handleSave}
            submitting={saving}
            submitDisabled={!canSave}
            cancel={{ label: "Cancel", href: "/admin/products" }}
            extraActions={
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Form
              </button>
            }
          />
        </FormSection>
      </div>
    </ERPPageShell>
  );
}
