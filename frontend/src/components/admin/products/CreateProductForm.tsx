// @ts-nocheck
"use client";
import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Check } from "lucide-react";

import { ProductCreationFormDataWithVariants, productCreationSchemaWithPriceValidation } from "@/lib/schemas/product-creation";
import BasicIdentityTab from "./tabs/BasicIdentityTab";
import FinancialsTab from "./tabs/FinancialsTab";
import FulfillmentTab from "./tabs/FulfillmentTab";
import SpecificationsTab from "./tabs/SpecificationsTab";
import ImageTab from "./tabs/ImageTab";
import VariantsTab from "./tabs/VariantsTab";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { apiFetch } from "@/lib/api";
import { pimService } from "@/services/pim";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { formatRupee } from "@/lib/utils/currency";

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
  item_type?: string;
  created_at?: string | null;
};

const TABS = [
  { id: "basic", label: "Basic Identity", description: "Name, code, and classification" },
  { id: "financials", label: "Financials", description: "Price and tax details" },
  { id: "fulfillment", label: "Fulfillment", description: "EMI, rent, lease, sale" },
  { id: "specifications", label: "Specifications", description: "Catalog attributes" },
  { id: "variants", label: "Variants", description: "Sizes, colors, configurations" },
  { id: "image", label: "Image", description: "Product photograph" },
];

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

export default function CreateProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "basic";

  const [saving, setSaving] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedProductResponse | null>(null);

  const form = useForm<ProductCreationFormDataWithVariants>({
    resolver: zodResolver(productCreationSchemaWithPriceValidation),
    mode: "onChange",
    defaultValues: {
      product_code: "",
      name: "",
      base_price: "",
      sku: "",
      unit_of_measure: "PCS",
      category: "",
      subcategory: "",
      catalog_category: null,
      description: "",
      hsn_sac_code: "",
      gst_rate: "",
      item_type: "FINISHED_GOOD",
      stock_type: "STOCK_ITEM",
      is_active: true,
      is_emi_enabled: true,
      is_rent_enabled: false,
      is_lease_enabled: false,
      is_direct_sale_enabled: true,
      base_specs: {},
      image: null,
      sync_to_pim: true,
      has_variants: false,
      variants: [],
    },
  });

  // Auto-save form state to localStorage
  const { clearDraft } = useFormPersistence(form.watch, form.setValue);

  const { handleSubmit, formState: { isValid }, watch } = form;
  const itemType = watch("item_type");

  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.replaceState({}, "", url.toString());
  };

  const currentTabIndex = TABS.findIndex((t) => t.id === currentTab);

  async function onSubmit(data: ProductCreationFormDataWithVariants) {
    setError(null);
    setCreated(null);
    setSaving(true);
    setLoadingLabel("Creating product master and uploading image...");

    try {
      const formData = new FormData();
      formData.append("product_code", data.product_code.trim().toUpperCase());
      formData.append("name", data.name.trim());
      if (data.base_price) {
        formData.append("base_price", data.base_price.toString());
      }
      formData.append("sku", (data.sku || "").trim().toUpperCase());
      formData.append("unit_of_measure", data.unit_of_measure || "PCS");
      formData.append("category", data.category || "");
      formData.append("subcategory", data.subcategory || "");
      if (data.catalog_category) {
        formData.append("catalog_category", String(data.catalog_category));
      }
      formData.append("base_specs", JSON.stringify(data.base_specs || {}));
      formData.append("description", data.description || "");
      if (data.hsn_sac_code?.trim()) {
        formData.append("hsn_sac_code", data.hsn_sac_code.trim().toUpperCase());
      }
      if (data.gst_rate?.trim()) {
        formData.append("gst_rate", data.gst_rate.trim());
      }
      formData.append("item_type", data.item_type);
      formData.append("stock_type", data.stock_type);
      formData.append("is_active", String(data.is_active));

      const isEmiEligible = data.item_type === "FINISHED_GOOD";
      const isSaleItem = ["FINISHED_GOOD", "ADD_ON", "ACCESSORY"].includes(data.item_type);

      formData.append("is_emi_enabled", String(isEmiEligible && data.is_emi_enabled));
      formData.append("is_rent_enabled", String(isEmiEligible && data.is_rent_enabled));
      formData.append("is_lease_enabled", String(isEmiEligible && data.is_lease_enabled));
      formData.append("is_direct_sale_enabled", String(isSaleItem && data.is_direct_sale_enabled));

      // Add variant data if present
      if (data.has_variants && data.variants && data.variants.length > 0) {
        formData.append("has_variants", "true");
        formData.append("variants", JSON.stringify(
          data.variants.map((v) => ({
            variant_code: v.variant_code,
            variant_name: v.variant_name,
            sku: v.sku || "",
            barcode: v.barcode || "",
            variant_price: v.variant_price || null,
            is_active: v.is_active,
          }))
        ));
      }

      if (data.image) {
        formData.append("image", data.image);
      }

      const payload = await apiFetch<CreatedProductResponse>("/admin/products/", {
        method: "POST",
        body: formData,
      });

      if (data.sync_to_pim) {
        setLoadingLabel("Syncing to PIM Catalog...");
        try {
          await pimService.syncFromRegister({ product_ids: [payload.id] });
        } catch (e) {
          console.error("Failed to sync to PIM:", e);
        }
      }

      setCreated(payload);
      form.reset();
      clearDraft(); // Clear localStorage draft after successful submission
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
      setLoadingLabel(null);
    }
  }

  if (loadingLabel) {
    return <ERPLoadingState label={loadingLabel} />;
  }

  if (created) {
    return (
      <ERPPageShell
        title="Product Created Successfully"
        subtitle={`${created.name} has been added to the product register.`}
        actions={[
          {
            href: `/admin/products/${created.id}`,
            label: "View Product",
            variant: "primary" as const,
          },
          {
            href: "/admin/products/create",
            label: "Create Another",
            variant: "secondary" as const,
          },
          {
            href: "/admin/products",
            label: "Back to Register",
            variant: "secondary" as const,
          },
        ]}
      >
        <div className="rounded-lg border border-border bg-muted/20 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 p-2 text-green-700">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{created.name}</p>
              {created.product_code && (
                <p className="text-sm text-muted-foreground">Code: {created.product_code}</p>
              )}
              {created.base_price && (
                <p className="text-sm text-muted-foreground">
                  Base Price: {formatRupee(Number(created.base_price))}
                </p>
              )}
              {created.item_type && (
                <p className="text-sm text-muted-foreground">Type: {created.item_type}</p>
              )}
            </div>
          </div>
          <div className="pt-2 border-t border-border text-xs text-muted-foreground">
            <p>Created at {created.created_at ? new Date(created.created_at).toLocaleString() : "just now"}</p>
          </div>
        </div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      title="Create New Product"
      subtitle="Add a new product to the Product Register. All products sync to PIM Catalog automatically."
      actions={[
        {
          href: "/admin/products",
          label: "Cancel",
          variant: "secondary" as const,
        },
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tab Navigation */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-1 rounded-lg border border-border bg-muted/30 p-2">
            {TABS.map((tab, idx) => {
              const isActive = tab.id === currentTab;
              const isCompleted = idx < currentTabIndex;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition ${
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        isActive
                          ? "bg-primary-foreground text-primary"
                          : isCompleted
                          ? "bg-green-500/20 text-green-700"
                          : "bg-muted-foreground/20"
                      }`}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tab.label}</p>
                      <p className={`text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {tab.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="lg:col-span-3">
          <FormProvider {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Error</p>
                    <p className="text-sm text-destructive/80 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Tab Content */}
              {currentTab === "basic" && <BasicIdentityTab />}
              {currentTab === "financials" && <FinancialsTab />}
              {currentTab === "fulfillment" && <FulfillmentTab />}
              {currentTab === "specifications" && <SpecificationsTab />}
              {currentTab === "variants" && <VariantsTab />}
              {currentTab === "image" && <ImageTab />}

              {/* Tab Navigation Buttons */}
              <div className="flex items-center justify-between gap-4 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    const prevTabId = TABS[currentTabIndex - 1]?.id;
                    if (prevTabId) handleTabChange(prevTabId);
                  }}
                  disabled={currentTabIndex === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>

                <div className="flex-1 text-center text-sm text-muted-foreground">
                  Step {currentTabIndex + 1} of {TABS.length}
                </div>

                {currentTabIndex < TABS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextTabId = TABS[currentTabIndex + 1]?.id;
                      if (nextTabId) handleTabChange(nextTabId);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!isValid || saving}
                    className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
                  >
                    {saving ? "Creating..." : "Create Product"}
                  </button>
                )}
              </div>
            </form>
          </FormProvider>
        </div>
      </div>
    </ERPPageShell>
  );
}
