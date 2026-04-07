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

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem as DetailValue, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";
import { resolveApiMediaUrl } from "@/lib/media";

type ProductDetailRecord = {
  id: number;
  name: string;
  product_code?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  base_price: string;
  image?: string | null;
  created_at?: string | null;
};

type UpdateProductResponse = {
  id: number;
  name?: string;
  product_code?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  base_price?: string;
  image?: string | null;
};

type FieldErrors = Partial<
  Record<
    | "name"
    | "product_code"
    | "category"
    | "subcategory"
    | "description"
    | "base_price"
    | "image",
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

function normalizeProductDetail(
  raw: Record<string, unknown>
): ProductDetailRecord {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed product",
    product_code: toNullableString(raw.product_code) ?? toNullableString(raw.code),
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
    pick("category");
    pick("subcategory", ["subcategory", "sub_category"]);
    pick("description");
    pick("base_price", ["base_price", "price"]);
    pick("image");

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
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export default function AdminProductEditPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [product, setProduct] = useState<ProductDetailRecord | null>(null);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(
    null
  );
  const [removeExistingImage, setRemoveExistingImage] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

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
        setCategory(normalized.category || "");
        setSubcategory(normalized.subcategory || "");
        setDescription(normalized.description || "");
        setBasePrice(normalized.base_price || "");
        setSelectedImageFile(null);
        setSelectedImagePreview(null);
        setRemoveExistingImage(false);

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
  const trimmedCategory = category.trim();
  const trimmedSubcategory = subcategory.trim();
  const trimmedDescription = description.trim();
  const trimmedBasePrice = basePrice.trim();

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
    setCategory(product.category || "");
    setSubcategory(product.subcategory || "");
    setDescription(product.description || "");
    setBasePrice(product.base_price || "");
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

    setError(null);
    setSaveSuccess(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) return;

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("product_code", trimmedProductCode);
      formData.append("category", trimmedCategory);
      formData.append("subcategory", trimmedSubcategory);
      formData.append("description", trimmedDescription);
      formData.append("base_price", trimmedBasePrice);

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
            category: trimmedCategory,
            subcategory: trimmedSubcategory,
            description: trimmedDescription,
            base_price: trimmedBasePrice,
            image: null,
            created_at: null,
          } as ProductDetailRecord);

        return {
          ...base,
          name: typeof updated.name === "string" ? updated.name : trimmedName,
          product_code:
            updated.product_code !== undefined
              ? updated.product_code
              : trimmedProductCode,
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
        };
      });

      setSelectedImageFile(null);
      setSelectedImagePreview(null);
      setRemoveExistingImage(false);
      setFieldErrors({});
      setSaveSuccess("Product updated successfully.");
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
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
        <SectionCard
          title="Editing rule"
          description="Product base price is the total contract price used by subscription creation. Update carefully to avoid future contract inconsistencies."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailValue label="Base Price Meaning" value="Total contract price" />
            <DetailValue label="EMI Dependency" value="base price / tenure months" />
            <DetailValue label="Image Workflow" value="Attach, replace, or remove from this page" />
            <DetailValue label="Mutation Scope" value="Product master only" />
          </div>
        </SectionCard>

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
              <SectionCard
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
                        htmlFor="product-category"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Category
                      </label>
                      <input
                        id="product-category"
                        type="text"
                        value={category}
                        onChange={(event) => {
                          setCategory(event.target.value);
                          setError(null);
                          setSaveSuccess(null);
                        }}
                        placeholder="e.g. Bed"
                        disabled={saving}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <FieldError message={fieldErrors.category} />
                    </div>

                    <div>
                      <label
                        htmlFor="product-subcategory"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Subcategory
                      </label>
                      <input
                        id="product-subcategory"
                        type="text"
                        value={subcategory}
                        onChange={(event) => {
                          setSubcategory(event.target.value);
                          setError(null);
                          setSaveSuccess(null);
                        }}
                        placeholder="e.g. Wooden"
                        disabled={saving}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
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
              </SectionCard>

              <SectionCard
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
              </SectionCard>
            </section>

            {error ? (
              <ErrorState
                title="Unable to update product"
                description={error}
              />
            ) : null}

            {saveSuccess ? (
              <SectionCard
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
              </SectionCard>
            ) : null}

            <SectionCard
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
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
