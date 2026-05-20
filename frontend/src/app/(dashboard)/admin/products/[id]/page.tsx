"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DataTableShell } from "@/components/ui/operations";
import { apiFetch, toArray } from "@/lib/api";
import { resolveApiMediaUrl } from "@/lib/media";
import { prepareProductInventoryProfile } from "@/services/products";

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
  inventory_profile_id?: number | null;
  inventory_ready?: boolean;
  inventory_stock_tracking_enabled?: boolean;
  inventory_delivery_stock_bridge_enabled?: boolean;
  is_active?: boolean;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_rent_ready?: boolean;
  is_lease_ready?: boolean;
  // Phase 2
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: string | null;
};

type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "WON"
  | "COMPLETED"
  | "CANCELLED"
  | "DEFAULTED"
  | "UNKNOWN";

type SubscriptionUsageRow = {
  id: number;
  subscription_number: string;
  customer_name?: string;
  batch_code?: string | null;
  lucky_number?: number | null;
  plan_type?: string;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
  start_date?: string | null;
};

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

function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (value === null) return null;
  return undefined;
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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load product detail.";
}

function normalizeSubscriptionStatus(
  raw: Record<string, unknown>
): SubscriptionStatus {
  const status = String(raw.status ?? raw.subscription_status ?? "").toUpperCase();
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "PENDING") return "PENDING";
  if (status === "WON") return "WON";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "DEFAULTED") return "DEFAULTED";
  return "UNKNOWN";
}

function normalizeProductDetail(
  raw: Record<string, unknown>
): ProductDetailRecord {
  return {
    id: toNumber(raw.id),
    name: toStringValue(raw.name) || "Unnamed product",
    product_code:
      toNullableString(raw.product_code) ??
      toNullableString(raw.code),
    sku: toNullableString(raw.sku),
    unit_of_measure: toNullableString(raw.unit_of_measure),
    category: toNullableString(raw.category),
    subcategory:
      toNullableString(raw.subcategory) ??
      toNullableString(raw.sub_category),
    description: toNullableString(raw.description),
    base_price: toMoneyString(raw.base_price ?? raw.price ?? raw.total_amount),
    image:
      resolveApiMediaUrl(
        toNullableString(raw.image) ??
          toNullableString(raw.image_url)
      ) ?? null,
    created_at: toNullableString(raw.created_at),
    inventory_profile_id:
      typeof raw.inventory_profile_id === "number"
        ? raw.inventory_profile_id
        : raw.inventory_profile_id === null
          ? null
          : undefined,
    inventory_ready: toBoolean(raw.inventory_ready, false),
    inventory_stock_tracking_enabled: toBoolean(raw.inventory_stock_tracking_enabled, false),
    inventory_delivery_stock_bridge_enabled: toBoolean(raw.inventory_delivery_stock_bridge_enabled, false),
    is_active: toBoolean(raw.is_active, true),
    is_emi_enabled: toBoolean(raw.is_emi_enabled, true),
    is_rent_enabled: toBoolean(raw.is_rent_enabled, false),
    is_lease_enabled: toBoolean(raw.is_lease_enabled, false),
    is_rent_ready: toBoolean(raw.is_rent_ready, false),
    is_lease_ready: toBoolean(raw.is_lease_ready, false),
    is_direct_sale_enabled: toBoolean(raw.is_direct_sale_enabled, true),
    lifecycle_status: typeof raw.lifecycle_status === "string" ? raw.lifecycle_status : "ACTIVE",
  };
}

function normalizeSubscriptionUsage(
  raw: Record<string, unknown>
): SubscriptionUsageRow {
  const id = toNumber(raw.id);
  const luckyNumber =
    toNullableNumber(raw.lucky_number) ?? toNullableNumber(raw.lucky_no);

  return {
    id,
    subscription_number:
      toStringValue(raw.subscription_number) ||
      toStringValue(raw.subscription_code) ||
      `SUB-${id}`,
    customer_name:
      toStringValue(raw.customer_name) ||
      toStringValue(raw.customer_display_name) ||
      undefined,
    batch_code:
      toNullableString(raw.batch_code) ??
      toNullableString(raw.batch_number),
    lucky_number: luckyNumber,
    plan_type:
      toStringValue(raw.plan_type) ||
      toStringValue(raw.subscription_type) ||
      undefined,
    total_amount: toMoneyString(
      raw.total_amount ?? raw.contract_value ?? raw.amount
    ),
    monthly_amount: toMoneyString(
      raw.monthly_amount ?? raw.emi_amount ?? raw.installment_amount
    ),
    status: normalizeSubscriptionStatus(raw),
    start_date:
      toNullableString(raw.start_date) ??
      toNullableString(raw.created_date),
  };
}

function extractNestedArray(
  payload: Record<string, unknown>,
  keys: string[]
): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return toArray<Record<string, unknown>>(value);
    }
  }
  return [];
}

function capabilityTone(enabled: boolean): string {
  return enabled
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-700";
}

export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [product, setProduct] = useState<ProductDetailRecord | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionUsageRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryPreparing, setInventoryPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!productId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [productResult, subscriptionsResult] = await Promise.allSettled([
          apiFetch<Record<string, unknown>>(`/admin/products/${productId}/`),
          apiFetch<unknown>(`/admin/subscriptions/?product=${productId}`),
        ]);

        if (productResult.status !== "fulfilled") {
          throw productResult.reason;
        }

        const basePayload = productResult.value;
        const normalizedProduct = normalizeProductDetail(basePayload);
        const nextWarnings: string[] = [];

        let nextSubscriptions: SubscriptionUsageRow[] = [];

        if (subscriptionsResult.status === "fulfilled") {
          nextSubscriptions = toArray<Record<string, unknown>>(subscriptionsResult.value)
            .map(normalizeSubscriptionUsage)
            .sort((a, b) => {
              const aDate = Date.parse(a.start_date || "") || 0;
              const bDate = Date.parse(b.start_date || "") || 0;
              return bDate - aDate;
            });
        } else {
          nextSubscriptions = extractNestedArray(basePayload, [
            "subscriptions",
            "subscription_rows",
            "subscription_usage",
          ])
            .map(normalizeSubscriptionUsage)
            .sort((a, b) => {
              const aDate = Date.parse(a.start_date || "") || 0;
              const bDate = Date.parse(b.start_date || "") || 0;
              return bDate - aDate;
            });

          nextWarnings.push(
            "Subscription usage was loaded from product detail payload because the filtered subscription endpoint did not return successfully."
          );
        }

        setProduct(normalizedProduct);
        setSubscriptions(nextSubscriptions);
        setWarnings(nextWarnings);
        setError(null);
        setInventoryMessage(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setProduct(null);
          setSubscriptions([]);
          setWarnings([]);
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

  const activeSubscriptionCount = useMemo(
    () => subscriptions.filter((row) => row.status === "ACTIVE").length,
    [subscriptions]
  );

  const totalContractValue = useMemo(
    () =>
      subscriptions.reduce(
        (sum, row) => sum + Number(row.total_amount || 0),
        0
      ),
    [subscriptions]
  );

  const latestSubscription = useMemo(
    () => subscriptions[0] ?? null,
    [subscriptions]
  );

  async function handlePrepareInventoryProfile() {
    if (!product) return;
    setInventoryPreparing(true);
    setInventoryMessage(null);
    try {
      const payload = await prepareProductInventoryProfile(product.id, {
        stock_tracking_enabled: true,
      });
      setProduct((current) =>
        current
          ? {
              ...current,
              inventory_profile_id: payload.inventory_profile.id,
              inventory_ready: true,
              sku: payload.inventory_profile.sku ?? current.sku,
              unit_of_measure:
                payload.inventory_profile.unit_of_measure || current.unit_of_measure,
            }
          : current
      );
      setInventoryMessage(
        payload.created
          ? "Inventory profile prepared from product master."
          : "Inventory profile already existed and was resynced from product master."
      );
    } catch (err) {
      setInventoryMessage(toErrorMessage(err));
    } finally {
      setInventoryPreparing(false);
    }
  }

  const actions = useMemo(() => {
    const nextActions: Array<{
      href: string;
      label: string;
      variant?: "primary" | "secondary" | "ghost" | "danger";
    }> = [
      {
        href: "/admin/products",
        label: "Back to Register",
        variant: "secondary",
      },
      {
        href: productId ? `/admin/products/${productId}/edit` : "/admin/products",
        label: "Edit Product",
        variant: "primary",
      },
      {
        href: "/admin/products/create",
        label: "Create Product",
        variant: "secondary",
      },
      {
        href: "/admin/products/masters",
        label: "Manage Masters",
        variant: "secondary",
      },
      {
        href: productId ? `/admin/subscriptions/advance-emi/create?product=${productId}` : "/admin/subscriptions/advance-emi/create",
        label: "Use in Subscription",
        variant: "secondary",
      },
    ];

    return nextActions;
  }, [productId]);

  return (
    <ERPPageShell
      title={product?.name || `Product #${productId ?? "—"}`}
      subtitle="Inspect full product master data, pricing basis, catalog structure, image state, and downstream subscription usage."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: product?.name || `Product #${productId ?? "—"}` },
      ]}
      actions={actions}
      stats={[
        {
          label: "Base Price",
          value: money(product?.base_price),
          tone: "success",
        },
        {
          label: "Linked Subscriptions",
          value: String(subscriptions.length),
        },
        {
          label: "Active Usage",
          value: String(activeSubscriptionCount),
          tone: activeSubscriptionCount > 0 ? "success" : undefined,
        },
        {
          label: "Contract Value",
          value: money(totalContractValue),
        },
        {
          label: "Inventory",
          value: product?.inventory_ready ? "Ready" : "Pending",
          tone: product?.inventory_ready ? "success" : "warning",
        },
      ]}
      statusBadge={{
        label: product?.is_active ? "Active Product" : "Inactive Product",
        tone: product?.is_active ? "success" : "warning",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <ERPLoadingState label="Loading product detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load product detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !product ? (
          <ERPEmptyState
            title="Product not available"
            description="The requested product could not be loaded."
          />
        ) : null}

        {!loading && !error && product ? (
          <>
            {warnings.length > 0 ? (
              <ERPSectionShell
                title="Data source note"
                description="The detail page loaded with fallback sources for some child data."
              >
                <div className="space-y-2">
                  {warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              </ERPSectionShell>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              <ERPSectionShell
                title="Product overview"
                description="Primary product master fields used in contract pricing and subscription creation."
              >
                <ERPDetailGrid
                  columns={2}
                  items={[
                    { label: "Product ID", value: `#${product.id}` },
                    { label: "Name", value: product.name },
                    { label: "Product Code", value: product.product_code || "—" },
                    { label: "Base Price", value: money(product.base_price) },
                    { label: "Category", value: product.category || "—" },
                    { label: "Subcategory", value: product.subcategory || "—" },
                    { label: "SKU", value: product.sku || "—" },
                    { label: "Unit", value: product.unit_of_measure || "PCS" },
                    {
                      label: "Inventory Profile",
                      value: product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Not prepared",
                    },
                    { label: "Created At", value: formatDateTime(product.created_at) },
                    {
                      label: "Latest Linked Subscription",
                      value: latestSubscription ? latestSubscription.subscription_number : "No usage yet",
                    },
                  ]}
                />
              </ERPSectionShell>

              <ERPSectionShell
                title="Inventory readiness"
                description="Prepare a stock profile only when this product should participate in inventory workflows. This keeps product master truth shared while leaving delivery, EMI, and payment behavior unchanged."
              >
                <div className="space-y-4">
                  <ERPDetailGrid
                    columns={2}
                    items={[
                      {
                        label: "Status",
                        value: product.inventory_ready ? "Inventory profile ready" : "Needs product-to-stock preparation",
                      },
                      {
                        label: "Stock Tracking",
                        value: product.inventory_ready ? "Enabled in inventory module" : "Not yet activated",
                      },
                      { label: "Stock Quantity Control", value: "Use opening stock and stock movements only" },
                    ]}
                  />

                  {inventoryMessage ? (
                    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
                      {inventoryMessage}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePrepareInventoryProfile()}
                      disabled={inventoryPreparing || !product.is_active}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inventoryPreparing
                        ? "Preparing..."
                        : !product.is_active
                          ? "Inactive Product"
                          : product.inventory_ready
                            ? "Prepare Inventory Profile (Recheck)"
                            : "Prepare Inventory Profile"}
                    </button>
                    <Link
                      href="/admin/products/masters"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Manage Product Masters
                    </Link>
                    <Link
                      href={product.inventory_profile_id ? `/admin/inventory/profiles/${product.inventory_profile_id}` : "/admin/inventory/profiles"}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      {product.inventory_profile_id ? "Open Inventory Profile" : "Open Inventory Profiles"}
                    </Link>
                  </div>
                  {!product.is_active ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Inventory profile cannot be prepared while the product is inactive.
                    </div>
                  ) : null}
                </div>
              </ERPSectionShell>

              <ERPSectionShell
                title="Image & operational state"
                description="Single-image product master with capability visibility for EMI now and rent/lease expansion later."
              >
                <div className="grid gap-4">
                  <ERPDetailGrid
                    columns={2}
                    items={[
                      { label: "Image State", value: product.image ? "Image attached" : "No image attached" },
                      { label: "Product State", value: product.is_active ? "Active" : "Inactive" },
                    ]}
                  />

                  {product.image ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-72 w-full object-cover"
                      />
                    </div>
                  ) : (
                    <ERPEmptyState
                      title="No product image"
                      description="This product currently has no attached image. Use Edit Product to add or remove the single image for this item."
                    />
                  )}

                  {/* Phase 2: lifecycle status badge */}
                  {product.lifecycle_status && (
                    <div className="mb-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        product.lifecycle_status === "ACTIVE"
                          ? "border-green-300 bg-green-50 text-green-800"
                          : product.lifecycle_status === "DISCONTINUED"
                          ? "border-red-300 bg-red-50 text-red-800"
                          : product.lifecycle_status === "MAINTENANCE"
                          ? "border-yellow-300 bg-yellow-50 text-yellow-800"
                          : "border-blue-300 bg-blue-50 text-blue-800"
                      }`}>
                        Lifecycle: {product.lifecycle_status}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.is_emi_enabled)),
                      ].join(" ")}
                    >
                      EMI {product.is_emi_enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.is_rent_enabled)),
                      ].join(" ")}
                    >
                      Rent {product.is_rent_enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.is_lease_enabled)),
                      ].join(" ")}
                    >
                      Lease {product.is_lease_enabled ? "Enabled" : "Disabled"}
                    </span>
                    {/* Phase 2: Direct Sale eligibility */}
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(product.is_direct_sale_enabled !== false),
                      ].join(" ")}
                    >
                      Direct Sale {product.is_direct_sale_enabled !== false ? "Enabled" : "Disabled"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.is_rent_ready)),
                      ].join(" ")}
                    >
                      Rent Ready {product.is_rent_ready ? "Yes" : "No"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.is_lease_ready)),
                      ].join(" ")}
                    >
                      Lease Ready {product.is_lease_ready ? "Yes" : "No"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.inventory_ready)),
                      ].join(" ")}
                    >
                      Inventory Profile {product.inventory_ready ? "Ready" : "Not Ready"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.inventory_stock_tracking_enabled)),
                      ].join(" ")}
                    >
                      Stock Tracking {product.inventory_stock_tracking_enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        capabilityTone(Boolean(product.inventory_delivery_stock_bridge_enabled)),
                      ].join(" ")}
                    >
                      Delivery Bridge {product.inventory_delivery_stock_bridge_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Changes affect future onboarding and billing only. Existing contracts keep their saved pricing and plan snapshots.
                  </p>
                </div>
              </ERPSectionShell>
            </section>

            <ERPSectionShell
              title="Description"
              description="Full product description used for internal clarity and future catalog enrichment."
            >
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">
                {product.description?.trim() || "No description available."}
              </div>
            </ERPSectionShell>

            <ERPSectionShell
              title="Pricing rule"
              description="Base price is the total contract price. EMI is derived later from base price and tenure months."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Contract Basis
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {money(product.base_price)}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Default EMI Formula
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    base price / tenure months
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Single Image Rule
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    One image per product
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Edit Workflow
                  </div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    Update fields, replace image, or remove image from edit page
                  </div>
                </div>
              </div>
            </ERPSectionShell>

            <ERPSectionShell
              title="Subscription usage"
              description="Linked subscriptions show how this product is currently used in active and historical contracts."
            >
              {subscriptions.length === 0 ? (
                <ERPEmptyState
                  title="No linked subscriptions"
                  description="No subscription rows were returned for this product."
                />
              ) : (
                <DataTableShell>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer / Batch
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Financials
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {subscriptions.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.subscription_number}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Start {formatDate(row.start_date)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.plan_type || "—"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.batch_code || "No batch"}
                              {typeof row.lucky_number === "number"
                                ? ` · Lucky #${row.lucky_number}`
                                : ""}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            <div className="font-semibold">
                              {money(row.total_amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              EMI {money(row.monthly_amount)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <ERPStatusBadge status={row.status} hideIcon />
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/admin/subscriptions/${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Subscription
                              </Link>

                              <Link
                                href={productId ? `/admin/subscriptions/advance-emi/create?product=${productId}` : "/admin/subscriptions/advance-emi/create"}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Create Another
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </DataTableShell>
              )}
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
