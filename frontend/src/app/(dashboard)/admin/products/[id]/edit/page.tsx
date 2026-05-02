"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import { DetailPanel, FormSection } from "@/components/ui/operations";
import { DetailItem as DetailValue } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";
import { invalidateAfterProductInventoryMutation } from "@/lib/operational-query-invalidation";
import { resolveApiMediaUrl } from "@/lib/media";
import {
  listStockLocations,
  updateInventoryItem,
  type InventoryItem,
  type StockLocation,
} from "@/services/inventory";
import { getProductCatalogOptions, type ProductCatalogOptions } from "@/services/products";

type ProductDetailRecord = {
  id: number;
  name: string;
  product_code?: string | null;
  sku?: string | null;
  unit_of_measure?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  base_price: string;
  image?: string | null;
  created_at?: string | null;
  is_active?: boolean;
  plan_type_default?: "EMI" | "RENT" | "LEASE";
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
};

type UpdateProductResponse = {
  id: number;
  name?: string;
  product_code?: string | null;
  sku?: string | null;
  unit_of_measure?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  base_price?: string;
  image?: string | null;
  is_active?: boolean;
  plan_type_default?: "EMI" | "RENT" | "LEASE";
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
};

type FieldErrors = Partial<
  Record<
    | "name"
    | "product_code"
    | "sku"
    | "unit_of_measure"
    | "category"
    | "subcategory"
    | "description"
    | "base_price"
    | "image"
    | "is_active"
    | "plan_type_default"
    | "is_emi_enabled",
    string
  >
>;

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePlanType(value: unknown): "EMI" | "RENT" | "LEASE" {
  return value === "RENT" || value === "LEASE" ? value : "EMI";
}

function normalizeProductDetail(
  raw: Record<string, unknown>
): ProductDetailRecord {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed product",
    product_code: toNullableString(raw.product_code) ?? toNullableString(raw.code),
    sku: toNullableString(raw.sku),
    unit_of_measure: toNullableString(raw.unit_of_measure),
    category: toNullableString(raw.category),
    subcategory:
      toNullableString(raw.subcategory) ?? toNullableString(raw.sub_category),
    description: toNullableString(raw.description),
    base_price: toMoneyString(raw.base_price ?? raw.price ?? raw.total_amount),
    image:
      resolveApiMediaUrl(
        toNullableString(raw.image) ?? toNullableString(raw.image_url)
      ) ?? null,
    created_at: toNullableString(raw.created_at),
    is_active: toBoolean(raw.is_active, true),
    plan_type_default: normalizePlanType(raw.plan_type_default),
    is_emi_enabled: toBoolean(raw.is_emi_enabled, true),
    is_rent_enabled: toBoolean(raw.is_rent_enabled, false),
    is_lease_enabled: toBoolean(raw.is_lease_enabled, false),
    is_direct_sale_enabled: toBoolean(raw.is_direct_sale_enabled, true),
  };
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

    pick("name");
    pick("product_code", ["product_code", "code"]);
    pick("sku");
    pick("unit_of_measure");
    pick("category");
    pick("subcategory", ["subcategory", "sub_category"]);
    pick("description");
    pick("base_price", ["base_price", "price"]);
    pick("image");
    pick("is_emi_enabled");
    pick("plan_type_default");

    return next;
  } catch {
    return {};
  }
}

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to update product.";

  const raw = error.message.trim();
  if (!raw) return "Failed to update product.";

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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p tabIndex={-1} data-field-error="" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

export default function AdminProductEditPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [product, setProduct] = useState<ProductDetailRecord | null>(null);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
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
  const [basePrice, setBasePrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [planTypeDefault, setPlanTypeDefault] = useState<"EMI" | "RENT" | "LEASE">("EMI");
  const [isEmiEnabled, setIsEmiEnabled] = useState(true);
  const [isRentEnabled, setIsRentEnabled] = useState(false);
  const [isLeaseEnabled, setIsLeaseEnabled] = useState(false);
  const [isDirectSaleEnabled, setIsDirectSaleEnabled] = useState(true);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(
    null
  );
  const [removeExistingImage, setRemoveExistingImage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inventorySaving, setInventorySaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [inventoryRecord, setInventoryRecord] = useState<InventoryItem | null>(null);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [inventoryForm, setInventoryForm] = useState({
    is_active: true,
    stock_tracking_enabled: true,
    delivery_stock_bridge_enabled: true,
    reorder_level_qty: "0.000",
    standard_unit_cost: "0.00",
    default_stock_location: "",
  });

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
    let cancelled = false;
    async function loadStockLocations() {
      try {
        const payload = await listStockLocations();
        if (!cancelled) {
          setStockLocations(payload.results || []);
        }
      } catch {
        if (!cancelled) {
          setStockLocations([]);
        }
      }
    }
    void loadStockLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!productId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await apiFetch<Record<string, unknown>>(
          `/admin/products/${productId}/`
        );
        const normalized = normalizeProductDetail(payload);

        setProduct(normalized);
        setName(normalized.name || "");
        setProductCode(normalized.product_code || "");
        setSku(normalized.sku || "");
        setUnitOfMeasure(normalized.unit_of_measure || "PCS");
        setCategory(normalized.category || "");
        setSubcategory(normalized.subcategory || "");
        setDescription(normalized.description || "");
        setBasePrice(normalized.base_price || "");
        setIsActive(normalized.is_active !== false);
        setPlanTypeDefault(normalized.plan_type_default || "EMI");
        setIsEmiEnabled(normalized.is_emi_enabled !== false);
        setIsRentEnabled(Boolean(normalized.is_rent_enabled));
        setIsLeaseEnabled(Boolean(normalized.is_lease_enabled));
        setIsDirectSaleEnabled(normalized.is_direct_sale_enabled !== false);
        setSelectedImageFile(null);
        setSelectedImagePreview(null);
        setRemoveExistingImage(false);
        const inventoryProfileId =
          typeof payload.inventory_profile_id === "number"
            ? payload.inventory_profile_id
            : null;
        if (inventoryProfileId) {
          const inventoryPayload = await apiFetch<InventoryItem>(
            `/inventory/items/${inventoryProfileId}/`
          );
          setInventoryRecord(inventoryPayload);
          setInventoryForm({
            is_active: Boolean(inventoryPayload.is_active),
            stock_tracking_enabled: Boolean(
              inventoryPayload.stock_tracking_enabled
            ),
            delivery_stock_bridge_enabled: Boolean(
              inventoryPayload.delivery_stock_bridge_enabled
            ),
            reorder_level_qty: inventoryPayload.reorder_level_qty || "0.000",
            standard_unit_cost: inventoryPayload.standard_unit_cost || "0.00",
            default_stock_location: inventoryPayload.default_stock_location
              ? String(inventoryPayload.default_stock_location)
              : "",
          });
        } else {
          setInventoryRecord(null);
        }

        setError(null);
        setFieldErrors({});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product.");
        if (mode === "initial") {
          setProduct(null);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [productId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

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

  const trimmedName = name.trim();
  const trimmedProductCode = productCode.trim();
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

  const effectiveImagePreview = removeExistingImage
    ? selectedImagePreview
    : selectedImagePreview || product?.image || null;

  const canSave = useMemo(() => {
    const price = Number(trimmedBasePrice);
    return (
      trimmedName.length > 0 &&
      trimmedProductCode.length > 0 &&
      Number.isFinite(price) &&
      price > 0
    );
  }, [trimmedName, trimmedProductCode, trimmedBasePrice]);

  function resetFormToLoadedProduct() {
    if (!product) return;

    setName(product.name || "");
    setProductCode(product.product_code || "");
    setSku(product.sku || "");
    setUnitOfMeasure(product.unit_of_measure || "PCS");
    setCategory(product.category || "");
    setSubcategory(product.subcategory || "");
    setDescription(product.description || "");
    setBasePrice(product.base_price || "");
    setIsActive(product.is_active !== false);
    setPlanTypeDefault(product.plan_type_default || "EMI");
    setIsEmiEnabled(product.is_emi_enabled !== false);
    setIsRentEnabled(Boolean(product.is_rent_enabled));
    setIsLeaseEnabled(Boolean(product.is_lease_enabled));
    setIsDirectSaleEnabled(product.is_direct_sale_enabled !== false);
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    setRemoveExistingImage(false);
    setFieldErrors({});
    setError(null);
    setSaveSuccess(null);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSelectedImageFile(file);
    setRemoveExistingImage(false);
    setFieldErrors((current) => ({ ...current, image: undefined }));
    setError(null);
    setSaveSuccess(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const price = Number(trimmedBasePrice);

    if (!trimmedName) {
      next.name = "Product name is required.";
    }

    if (!trimmedProductCode) {
      next.product_code = "Product code is required.";
    }

    if (!trimmedBasePrice) {
      next.base_price = "Base price is required.";
    } else if (!Number.isFinite(price) || price <= 0) {
      next.base_price = "Enter a valid base price greater than zero.";
    }

    if (!isEmiEnabled && !isRentEnabled && !isLeaseEnabled && !isDirectSaleEnabled) {
      next.is_emi_enabled = "At least one product mode must remain enabled.";
    }

    if (planTypeDefault === "EMI" && !isEmiEnabled) {
      next.plan_type_default = "Default plan type EMI requires EMI to be enabled.";
    }

    if (planTypeDefault === "RENT" && !isRentEnabled) {
      next.plan_type_default = "Default plan type RENT requires rent to be enabled.";
    }

    if (planTypeDefault === "LEASE" && !isLeaseEnabled) {
      next.plan_type_default = "Default plan type LEASE requires lease to be enabled.";
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
    if (!productId) return;
    if (saving) return;

    setError(null);
    setSaveSuccess(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[data-field-error]")?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      });
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("product_code", trimmedProductCode);
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
      formData.append("base_price", trimmedBasePrice);
      formData.append("is_active", String(isActive));
      formData.append("plan_type_default", planTypeDefault);
      formData.append("is_emi_enabled", String(isEmiEnabled));
      formData.append("is_rent_enabled", String(isRentEnabled));
      formData.append("is_lease_enabled", String(isLeaseEnabled));
      formData.append("is_direct_sale_enabled", String(isDirectSaleEnabled));

      if (removeExistingImage) {
        formData.append("clear_image", "true");
      }

      if (selectedImageFile) {
        formData.append("image", selectedImageFile);
      }

      const updated = await apiFetch<UpdateProductResponse>(
        `/admin/products/${productId}/`,
        {
          method: "PATCH",
          body: formData,
        }
      );

      setProduct((current) => {
        const base =
          current ??
          ({
            id: Number(productId),
            name: trimmedName,
            product_code: trimmedProductCode,
            sku: trimmedSku,
            unit_of_measure: trimmedUnitOfMeasure,
            category: trimmedCategory,
            subcategory: trimmedSubcategory,
            description: trimmedDescription,
            base_price: trimmedBasePrice,
            image: null,
            created_at: null,
            is_active: isActive,
            plan_type_default: planTypeDefault,
            is_emi_enabled: isEmiEnabled,
            is_rent_enabled: isRentEnabled,
            is_lease_enabled: isLeaseEnabled,
            is_direct_sale_enabled: isDirectSaleEnabled,
          } as ProductDetailRecord);

        return {
          ...base,
          name: typeof updated.name === "string" ? updated.name : trimmedName,
          product_code:
            updated.product_code !== undefined
              ? updated.product_code
              : trimmedProductCode,
          sku: updated.sku !== undefined ? updated.sku : trimmedSku,
          unit_of_measure:
            updated.unit_of_measure !== undefined
              ? updated.unit_of_measure
              : trimmedUnitOfMeasure,
          category:
            updated.category !== undefined ? updated.category : trimmedCategory,
          subcategory:
            updated.subcategory !== undefined
              ? updated.subcategory
              : trimmedSubcategory,
          description:
            updated.description !== undefined
              ? updated.description
              : trimmedDescription,
          base_price:
            updated.base_price !== undefined
              ? toMoneyString(updated.base_price)
              : toMoneyString(trimmedBasePrice),
          image:
            updated.image !== undefined
              ? resolveApiMediaUrl(updated.image) ?? null
              : removeExistingImage
                ? null
                : base.image,
          is_active: updated.is_active ?? isActive,
          plan_type_default: updated.plan_type_default ?? planTypeDefault,
          is_emi_enabled: updated.is_emi_enabled ?? isEmiEnabled,
          is_rent_enabled: updated.is_rent_enabled ?? isRentEnabled,
          is_lease_enabled: updated.is_lease_enabled ?? isLeaseEnabled,
          is_direct_sale_enabled: updated.is_direct_sale_enabled ?? isDirectSaleEnabled,
        };
      });

      setSelectedImageFile(null);
      setSelectedImagePreview(null);
      setRemoveExistingImage(false);
      setFieldErrors({});
      setSaveSuccess("Product updated successfully.");
      await invalidateAfterProductInventoryMutation(queryClient, { productId });
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInventory() {
    if (!inventoryRecord?.id) return;
    if (inventorySaving) return;
    setInventorySaving(true);
    setError(null);
    setSaveSuccess(null);
    try {
      const updated = await updateInventoryItem(inventoryRecord.id, {
        is_active: inventoryForm.is_active,
        stock_tracking_enabled: inventoryForm.stock_tracking_enabled,
        delivery_stock_bridge_enabled: inventoryForm.delivery_stock_bridge_enabled,
        reorder_level_qty: inventoryForm.reorder_level_qty,
        standard_unit_cost: inventoryForm.standard_unit_cost || null,
        default_stock_location: inventoryForm.default_stock_location
          ? Number(inventoryForm.default_stock_location)
          : null,
      });
      setInventoryRecord(updated);
      setSaveSuccess("Inventory profile settings updated.");
      await invalidateAfterProductInventoryMutation(queryClient, {
        productId: productId ?? undefined,
        inventoryItemId: inventoryRecord.id,
      });
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setInventorySaving(false);
    }
  }

  return (
    <PortalPage
      title={
        product?.name
          ? `Edit ${product.name}`
          : `Edit Product #${productId ?? "—"}`
      }
      subtitle="Update product master data safely. Base price remains the total contract price, and image replacement or removal is handled from this edit workflow."
      helperNote="Changes affect future onboarding and billing only. Existing contracts keep saved pricing and plan snapshots."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        {
          label: product?.name || `Product #${productId ?? "—"}`,
          href: productId ? `/admin/products/${productId}` : "/admin/products",
        },
        { label: "Edit" },
      ]}
      actions={[
        {
          href: productId ? `/admin/products/${productId}` : "/admin/products",
          label: "Back to Product",
          variant: "secondary",
        },
        {
          href: "/admin/products/masters",
          label: "Manage Masters",
          variant: "secondary",
        },
        {
          href: "/admin/products",
          label: "Back to Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Base Price",
          value: money(basePrice || product?.base_price),
          tone: "success",
        },
        {
          label: "Category",
          value: category.trim() || "—",
        },
        {
          label: "Subcategory",
          value: subcategory.trim() || "—",
        },
        {
          label: "SKU",
          value: sku.trim() || "—",
        },
        {
          label: "Image",
          value: removeExistingImage
            ? "Marked for removal"
            : effectiveImagePreview
              ? "Attached"
              : "Not attached",
        },
      ]}
      statusBadge={{
        label: "Product Edit",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <DetailPanel
          title="Editing rule"
          description="Product base price is the total contract price used by subscription creation. Update carefully to avoid future contract inconsistencies."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailValue label="Base Price Meaning" value="Total contract price" />
            <DetailValue label="EMI Dependency" value="base price / tenure months" />
            <DetailValue label="Image Workflow" value="Attach, replace, or remove from this page" />
            <DetailValue label="Mutation Scope" value="Product master only" />
          </div>
        </DetailPanel>

        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading || saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading product edit form..." /> : null}

        {!loading && error && !product ? (
          <ErrorState
            title="Unable to load product"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !product ? (
          <EmptyState
            title="Product not available"
            description="The requested product could not be loaded."
          />
        ) : null}

        {!loading && product ? (
          <>
            <section className="grid gap-6 xl:grid-cols-2">
              <FormSection
                title="Product fields"
                description="Update the catalog structure and contract pricing fields used by admin and subscription workflows."
              >
                <div className="grid gap-4">
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
                        setSaveSuccess(null);
                      }}
                      placeholder="Enter product name"
                      disabled={saving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <FieldError message={fieldErrors.name} />
                  </div>

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
                        setProductCode(event.target.value);
                        setError(null);
                        setSaveSuccess(null);
                      }}
                      placeholder="Enter product code"
                      disabled={saving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <FieldError message={fieldErrors.product_code} />
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
                          setSaveSuccess(null);
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
                          setSaveSuccess(null);
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
                        Maintain unit master values from{" "}
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
                          setSaveSuccess(null);
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
                          setSaveSuccess(null);
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
                        setSaveSuccess(null);
                      }}
                      placeholder="Enter base price"
                      disabled={saving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <FieldError message={fieldErrors.base_price} />
                  </div>

                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Product Capabilities</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Changes affect future onboarding and billing only. Existing contracts keep their saved pricing and plan snapshots.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(event) => {
                            setIsActive(event.target.checked);
                            setError(null);
                            setSaveSuccess(null);
                          }}
                          disabled={saving}
                        />
                        Active
                      </label>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-foreground">Default Plan Type</span>
                        <select
                          value={planTypeDefault}
                          onChange={(event) => {
                            setPlanTypeDefault(event.target.value as "EMI" | "RENT" | "LEASE");
                            setError(null);
                            setSaveSuccess(null);
                          }}
                          disabled={saving}
                          className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="EMI">EMI</option>
                          <option value="RENT">Rent</option>
                          <option value="LEASE">Lease</option>
                        </select>
                        <FieldError message={fieldErrors.plan_type_default} />
                      </label>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["EMI", isEmiEnabled, setIsEmiEnabled],
                          ["Rent", isRentEnabled, setIsRentEnabled],
                          ["Lease", isLeaseEnabled, setIsLeaseEnabled],
                          ["Direct Sale", isDirectSaleEnabled, setIsDirectSaleEnabled],
                        ].map(([label, checked, setter]) => (
                          <label
                            key={String(label)}
                            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(checked)}
                              onChange={(event) => {
                                (setter as (value: boolean) => void)(event.target.checked);
                                setError(null);
                                setSaveSuccess(null);
                              }}
                              disabled={saving}
                            />
                            {String(label)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <FieldError message={fieldErrors.is_emi_enabled} />
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
                        setSaveSuccess(null);
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
                title="Image attachment"
                description="Attach a new image, replace the current one, or remove the existing image."
              >
                <div className="space-y-4">
                  {effectiveImagePreview ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={effectiveImagePreview}
                        alt={name || product.name}
                        className="h-80 w-full object-cover"
                      />
                    </div>
                  ) : (
                    <EmptyState
                      title="No product image"
                      description="This product currently has no attached image."
                    />
                  )}

                  {product?.image && !selectedImageFile ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveExistingImage((current) => !current);
                          setError(null);
                          setSaveSuccess(null);
                        }}
                        disabled={saving}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-destructive/30 bg-background px-3 text-sm font-medium text-destructive transition hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {removeExistingImage
                          ? "Keep Existing Image"
                          : "Remove Existing Image"}
                      </button>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="product-image"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Attach / Replace Image
                    </label>
                    <input
                      id="product-image"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleImageChange}
                      disabled={saving}
                      className="block w-full text-sm text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <FieldError message={fieldErrors.image} />
                  </div>

                  {selectedImageFile ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <div className="text-sm font-medium text-foreground">
                        Selected file: {selectedImageFile.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {(selectedImageFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImageFile(null);
                            setSelectedImagePreview(null);
                            setFieldErrors((current) => ({
                              ...current,
                              image: undefined,
                            }));
                          }}
                          disabled={saving}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Clear Selected File
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailValue
                        label="Current Image State"
                        value={
                          removeExistingImage
                            ? "Marked for removal"
                            : product.image
                              ? "Image attached"
                              : "No image attached"
                        }
                      />
                      <DetailValue
                        label="New Upload State"
                        value={
                          selectedImageFile
                            ? "Ready to replace"
                            : "No new file selected"
                        }
                      />
                    </div>
                  </div>
                </div>
              </FormSection>
            </section>

            <FormSection
              title="Inventory item controls"
              description="Control stock tracking, bridge behavior, reorder threshold, costing, and default location for future inventory operations. Stock tracking affects operational stock visibility. It does not rewrite historical invoices or receipts."
            >
              {!inventoryRecord ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Inventory profile is not ready yet. Prepare inventory profile from product detail page before editing inventory controls.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inventoryForm.is_active}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                      disabled={inventorySaving}
                    />
                    Inventory item active
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inventoryForm.stock_tracking_enabled}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          stock_tracking_enabled: event.target.checked,
                        }))
                      }
                      disabled={inventorySaving}
                    />
                    Stock tracking enabled
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inventoryForm.delivery_stock_bridge_enabled}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          delivery_stock_bridge_enabled: event.target.checked,
                        }))
                      }
                      disabled={inventorySaving}
                    />
                    Delivery stock bridge enabled
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-foreground">Reorder level</span>
                    <input
                      value={inventoryForm.reorder_level_qty}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          reorder_level_qty: event.target.value,
                        }))
                      }
                      disabled={inventorySaving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-foreground">Standard unit cost</span>
                    <input
                      value={inventoryForm.standard_unit_cost}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          standard_unit_cost: event.target.value,
                        }))
                      }
                      disabled={inventorySaving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-foreground">Default stock location</span>
                    <select
                      value={inventoryForm.default_stock_location}
                      onChange={(event) =>
                        setInventoryForm((current) => ({
                          ...current,
                          default_stock_location: event.target.value,
                        }))
                      }
                      disabled={inventorySaving}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                    >
                      <option value="">No default location</option>
                      {stockLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} · {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveInventory()}
                      disabled={inventorySaving}
                      className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inventorySaving ? "Saving inventory..." : "Save Inventory Settings"}
                    </button>
                  </div>
                </div>
              )}
            </FormSection>

            {error ? (
              <ErrorState
                title="Unable to update product"
                description={error}
              />
            ) : null}

            {saveSuccess ? (
              <DetailPanel
                title="Update successful"
                description="The product master has been updated successfully."
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {saveSuccess}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/products/${product.id}`}
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
                </div>
              </DetailPanel>
            ) : null}

            <FormSection
              title="Save changes"
              description="Save only after confirming catalog fields, pricing, and image replacement."
            >
              <FormActions
                align="between"
                submitLabel="Save Product"
                submitLoadingLabel="Saving Product..."
                onSubmitClick={handleSave}
                submitting={saving}
                submitDisabled={!canSave}
                cancel={{
                  label: "Cancel",
                  href: productId ? `/admin/products/${productId}` : "/admin/products",
                }}
                extraActions={
                  <button
                    type="button"
                    onClick={resetFormToLoadedProduct}
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reset Changes
                  </button>
                }
              />
            </FormSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
