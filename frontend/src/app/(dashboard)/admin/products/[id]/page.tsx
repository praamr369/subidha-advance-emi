"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ProductQuickActions from "@/components/admin/products/ProductQuickActions";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DataTableShell } from "@/components/ui/operations";
import { toArray } from "@/lib/api";
import { shouldBypassNextImageOptimization } from "@/lib/media";
import { getProduct, type ProductRecord } from "@/services/products";
import { request } from "@/services/api";

type SubscriptionUsageRow = {
  id: number;
  subscription_number: string;
  customer_name?: string;
  plan_type?: string;
  total_amount: string;
  monthly_amount: string;
  status: string;
  start_date?: string | null;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString();
}

function boolBadge(label: string, ok: boolean) {
  return <ERPStatusBadge status={ok ? "AVAILABLE" : "PENDING"} label={label} />;
}

function normalizeSub(raw: Record<string, unknown>): SubscriptionUsageRow {
  const id = Number(raw.id || 0);
  return {
    id,
    subscription_number: String(raw.subscription_number || raw.subscription_code || `SUB-${id}`),
    customer_name: typeof raw.customer_name === "string" ? raw.customer_name : undefined,
    plan_type: typeof raw.plan_type === "string" ? raw.plan_type : undefined,
    total_amount: String(raw.total_amount || "0.00"),
    monthly_amount: String(raw.monthly_amount || "0.00"),
    status: String(raw.status || "UNKNOWN"),
    start_date: typeof raw.start_date === "string" ? raw.start_date : null,
  };
}

function readiness(product: ProductRecord) {
  return {
    cataloged: Boolean(product.category || product.subcategory),
    image: Boolean(product.image),
    sku: Boolean(product.sku || product.product_code),
    inventory: Boolean(product.inventory_ready),
    subscription: product.is_active !== false && product.is_emi_enabled !== false && Number(product.base_price || 0) > 0,
    directSale: product.is_active !== false && product.is_direct_sale_enabled !== false,
    rentLease: Boolean(product.is_rent_enabled || product.is_lease_enabled),
  };
}

export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!productId) return;
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [productPayload, subscriptionPayload] = await Promise.allSettled([
        getProduct(productId),
        request(`/admin/subscriptions/?product=${productId}`),
      ]);
      if (productPayload.status !== "fulfilled") throw productPayload.reason;
      setProduct(productPayload.value);
      if (subscriptionPayload.status === "fulfilled") {
        setSubscriptions(toArray<Record<string, unknown>>(subscriptionPayload.value).map(normalizeSub));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product detail.");
      if (mode === "initial") {
        setProduct(null);
        setSubscriptions([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const state = product ? readiness(product) : null;
  const activeSubscriptions = useMemo(() => subscriptions.filter((row) => row.status === "ACTIVE").length, [subscriptions]);
  const contractValue = useMemo(() => subscriptions.reduce((sum, row) => sum + Number(row.total_amount || 0), 0), [subscriptions]);

  return (
    <ERPPageShell
      title={product?.name || `Product #${productId ?? "—"}`}
      subtitle="Product operational cockpit for catalog, inventory profile, capabilities, and downstream usage. Product edits affect future onboarding only."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products", href: "/admin/products" }, { label: product?.name || `Product #${productId ?? "—"}` }]}
      actions={[{ href: "/admin/products", label: "Back to Register", variant: "secondary" }, { href: productId ? `/admin/products/${productId}/edit` : "/admin/products", label: "Edit full page", variant: "primary" }, { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" }]}
      stats={[{ label: "Base Price", value: money(product?.base_price), tone: "success" }, { label: "Linked Subscriptions", value: String(subscriptions.length) }, { label: "Active Usage", value: String(activeSubscriptions), tone: activeSubscriptions ? "success" : undefined }, { label: "Contract Value", value: money(contractValue) }, { label: "Inventory", value: product?.inventory_ready ? "Ready" : "Pending", tone: product?.inventory_ready ? "success" : "warning" }]}
      statusBadge={{ label: product?.is_active === false ? "Inactive Product" : "Active Product", tone: product?.is_active === false ? "warning" : "success" }}
    >
      <div className="space-y-6">
        <section className="flex justify-end"><button type="button" onClick={() => void loadPage("refresh")} disabled={refreshing || loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60">{refreshing ? "Refreshing..." : "Refresh"}</button></section>
        {loading ? <ERPLoadingState label="Loading product detail..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load product detail" description={error} onRetry={() => void loadPage("initial")} /> : null}
        {!loading && !error && !product ? <ERPEmptyState title="Product not available" description="The requested product could not be loaded." /> : null}

        {!loading && !error && product && state ? (
          <>
            <ERPSectionShell title="Quick actions" description="Use popup actions for daily operation. Full page edit remains available for detailed master cleanup and image work.">
              <div className="space-y-3">
                <ProductQuickActions product={product} mode="detail" onChanged={() => loadPage("refresh")} />
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Changes affect future onboarding and billing only. Existing contracts, invoices, receipts, payments, and subscription pricing snapshots are preserved.</div>
              </div>
            </ERPSectionShell>

            <section className="grid gap-6 xl:grid-cols-2">
              <ERPSectionShell title="Product readiness" description="Identity, pricing, and capability posture for sales and subscription staff.">
                <div className="space-y-4">
                  <ERPDetailGrid columns={2} items={[{ label: "Product ID", value: `#${product.id}` }, { label: "Product Code", value: product.product_code || "—" }, { label: "SKU", value: product.sku || "SKU pending" }, { label: "Unit", value: product.unit_of_measure || "PCS" }, { label: "Base Price", value: money(product.base_price) }, { label: "Category", value: product.category || "—" }, { label: "Subcategory", value: product.subcategory || "—" }, { label: "Inventory Profile", value: product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Not prepared" }]} />
                  <div className="flex flex-wrap gap-2">{boolBadge("Cataloged", state.cataloged)}{boolBadge("Image", state.image)}{boolBadge("SKU", state.sku)}{boolBadge("Inventory Ready", state.inventory)}{boolBadge("Subscription Ready", state.subscription)}{boolBadge("Direct Sale Ready", state.directSale)}{boolBadge("Rent/Lease Ready", state.rentLease)}</div>
                </div>
              </ERPSectionShell>

              <ERPSectionShell title="Inventory readiness" description="Prepare/recheck the one product inventory profile. Opening stock remains controlled by the stock workflow.">
                <div className="space-y-4">
                  <ERPDetailGrid columns={2} items={[{ label: "Profile ID", value: product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Missing" }, { label: "Stock Tracking", value: product.inventory_stock_tracking_enabled ? "Enabled" : "Pending/disabled" }, { label: "Quantity Control", value: "Opening stock + stock movements" }, { label: "Inventory State", value: product.inventory_ready ? "Ready" : "Prepare profile" }]} />
                  <div className="flex flex-wrap gap-2"><ProductQuickActions product={product} onChanged={() => loadPage("refresh")} /><Link href={product.inventory_profile_id ? `/admin/inventory/profiles/${product.inventory_profile_id}` : "/admin/inventory/profiles"} className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">{product.inventory_profile_id ? "Open Inventory Profile" : "Open Inventory Profiles"}</Link></div>
                </div>
              </ERPSectionShell>

              <ERPSectionShell title="Contract/subscription readiness" description="Capability switches control future onboarding only; existing subscription snapshots stay unchanged.">
                <div className="flex flex-wrap gap-2">{boolBadge("EMI", product.is_emi_enabled !== false)}{boolBadge("Rent", Boolean(product.is_rent_enabled))}{boolBadge("Lease", Boolean(product.is_lease_enabled))}{boolBadge("Direct Sale", product.is_direct_sale_enabled !== false)}</div>
              </ERPSectionShell>

              <ERPSectionShell title="Image/catalog readiness" description="Catalog completeness for public/product discovery and daily shop lookup.">
                {product.image ? (
                  <div className="relative h-72 overflow-hidden rounded-2xl border border-border bg-background"><Image src={product.image} alt={product.name} fill sizes="(min-width: 1280px) 50vw, 100vw" className="object-cover" unoptimized={shouldBypassNextImageOptimization(product.image)} /></div>
                ) : (
                  <ERPEmptyState title="No product image" description="Use quick action or full edit to attach a product image for catalog completeness." action={<Link href={`/admin/products/${product.id}/edit#image`} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">Upload Image</Link>} />
                )}
              </ERPSectionShell>
            </section>

            <ERPSectionShell title="Linked subscription usage" description="Historical and active usage is read-only. Product master edits do not recalculate these saved contract amounts.">
              {subscriptions.length === 0 ? <ERPEmptyState title="No linked subscriptions" description="This product is not yet used in subscriptions." /> : (
                <DataTableShell><table className="min-w-full divide-y divide-border text-sm"><thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Monthly</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border">{subscriptions.map((row) => <tr key={row.id}><td className="px-4 py-3"><Link href={`/admin/subscriptions/${row.id}`} className="font-semibold text-primary underline underline-offset-4">{row.subscription_number}</Link><div className="text-xs text-muted-foreground">{dateText(row.start_date)}</div></td><td className="px-4 py-3">{row.customer_name || "—"}</td><td className="px-4 py-3">{row.plan_type || "—"}</td><td className="px-4 py-3">{money(row.total_amount)}</td><td className="px-4 py-3">{money(row.monthly_amount)}</td><td className="px-4 py-3">{row.status}</td></tr>)}</tbody></table></DataTableShell>
              )}
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
