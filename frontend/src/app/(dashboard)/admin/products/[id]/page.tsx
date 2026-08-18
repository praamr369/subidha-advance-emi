"use client";
import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package, FileText, Zap, FileCheck, RefreshCw, ExternalLink,
  CheckCircle2, AlertCircle, Clock, Tag, Layers, Lock, BarChart3,
  ShoppingCart, Home, Truck, Star, ChevronRight, ArrowRight,
} from "lucide-react";

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
import { pimService, type PimProduct } from "@/services/pim";
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

type TabKey = "overview" | "blueprint" | "operations" | "contracts";

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString("en-IN");
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
    subscription: product.is_active !== false && product.is_emi_enabled !== false,
    directSale: product.is_active !== false && product.is_direct_sale_enabled !== false,
    rentLease: Boolean(product.is_rent_enabled || product.is_lease_enabled),
  };
}

function ReadinessChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      {label}
    </div>
  );
}

function SectionTab({ id, label, icon: Icon, active, onClick }: {
  id: TabKey; label: string; icon: typeof Package; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function OperationCard({
  icon: Icon, title, description, enabled, action, actionLabel, tone,
}: {
  icon: typeof ShoppingCart; title: string; description: string;
  enabled: boolean; action?: string; actionLabel: string;
  tone: "primary" | "emerald" | "violet" | "amber";
}) {
  const toneClass = {
    primary: "border-primary/20 bg-primary/5",
    emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10",
    violet: "border-violet-200 bg-violet-50 dark:border-violet-800/40 dark:bg-violet-900/10",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10",
  }[tone];
  const btnClass = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
    violet: "bg-violet-600 text-white hover:bg-violet-700",
    amber: "bg-amber-600 text-white hover:bg-amber-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${enabled ? toneClass : "border-border bg-muted/30 opacity-60"}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${enabled ? "bg-white dark:bg-background shadow-sm" : "bg-muted"}`}>
          <Icon className={`h-5 w-5 ${enabled ? "text-foreground" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{title}</h4>
            {enabled
              ? <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Enabled</span>
              : <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Disabled</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {enabled && action ? (
        <Link href={action} className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${btnClass}`}>
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : !enabled ? (
        <p className="text-xs text-muted-foreground">Enable this capability in product edit to unlock this operation.</p>
      ) : null}
    </div>
  );
}

export default function AdminProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params?.id;
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [pimProduct, setPimProduct] = useState<PimProduct | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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
      const prod = productPayload.value;
      setProduct(prod);
      if (subscriptionPayload.status === "fulfilled") {
        setSubscriptions(toArray<Record<string, unknown>>(subscriptionPayload.value).map(normalizeSub));
      }
      // Look up linked PIM product by code
      if (prod.product_code) {
        try {
          const { results } = await pimService.getProducts({ search: prod.product_code, page_size: 5 });
          const match = results.find((p) => p.code === prod.product_code);
          if (match) {
            const full = await pimService.getProductWithAttributes(match.id);
            setPimProduct(full);
          } else {
            setPimProduct(null);
          }
        } catch {
          setPimProduct(null);
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product detail.");
      if (mode === "initial") { setProduct(null); setSubscriptions([]); }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [productId]);

  useEffect(() => { void loadPage("initial"); }, [loadPage]);

  const state = product ? readiness(product) : null;
  const activeSubscriptions = useMemo(() => subscriptions.filter((r) => r.status === "ACTIVE").length, [subscriptions]);
  const contractValue = useMemo(() => subscriptions.reduce((s, r) => s + Number(r.total_amount || 0), 0), [subscriptions]);
  const pimPublished = Boolean(pimProduct?.is_published);
  const pimLinked = Boolean(pimProduct);

  const tabs: { id: TabKey; label: string; icon: typeof Package }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "blueprint", label: "Blueprint & Specs", icon: FileText },
    { id: "operations", label: "Operations", icon: Zap },
    { id: "contracts", label: "Contracts & Usage", icon: FileCheck },
  ];

  return (
    <ERPPageShell
      eyebrow="Products"
      title={product?.name || `Product #${productId ?? "—"}`}
      subtitle={
        pimPublished
          ? "PIM published — all operations available."
          : pimLinked
          ? "PIM draft — publish in PIM to unlock full operations."
          : "Blueprint command centre. Link to PIM to unlock attribute specs and variant SKUs."
      }
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: product?.name || `Product #${productId ?? "—"}` },
      ]}
      actions={[
        { href: "/admin/products", label: "← Register", variant: "secondary" },
        { href: productId ? `/admin/products/${productId}/edit` : "/admin/products", label: "Edit Blueprint", variant: "primary" },
      ]}
      stats={[
        { label: "Base Price", value: formatRupee(product?.base_price), tone: "success" },
        { label: "PIM Status", value: pimPublished ? "Published" : pimLinked ? "Draft" : "Not linked", tone: pimPublished ? "success" : "warning" },
        { label: "Linked Subscriptions", value: String(subscriptions.length) },
        { label: "Active Usage", value: String(activeSubscriptions), tone: activeSubscriptions ? "success" : undefined },
        { label: "Contract Value", value: formatRupee(contractValue) },
        { label: "Inventory", value: product?.inventory_ready ? "Ready" : "Pending", tone: product?.inventory_ready ? "success" : "warning" },
      ]}
      statusBadge={{ label: product?.is_active === false ? "Inactive" : "Active", tone: product?.is_active === false ? "warning" : "success" }}
    >
      {loading ? <ERPLoadingState label="Loading product blueprint..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load product" description={error} onRetry={() => void loadPage("initial")} /> : null}
      {!loading && !error && !product ? <ERPEmptyState title="Product not found" description="The requested product could not be loaded." /> : null}

      {!loading && !error && product && state ? (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex overflow-x-auto border-b border-border">
              {tabs.map((t) => (
                <SectionTab key={t.id} id={t.id} label={t.label} icon={t.icon} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {/* ── TAB: OVERVIEW ── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
                Changes affect future onboarding only. Existing contracts, invoices, and subscription pricing snapshots are preserved.
              </div>

              <ERPSectionShell title="Quick actions" description="Daily operation shortcuts. Full page edit for master data and image work.">
                <ProductQuickActions product={product} mode="detail" onChanged={() => void loadPage("refresh")} />
              </ERPSectionShell>

              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                <ReadinessChip ok={state.cataloged} label="Cataloged" />
                <ReadinessChip ok={state.image} label="Image" />
                <ReadinessChip ok={state.sku} label="SKU/Code" />
                <ReadinessChip ok={state.inventory} label="Inventory" />
                <ReadinessChip ok={state.subscription} label="Subscription" />
                <ReadinessChip ok={state.directSale} label="Direct Sale" />
                <ReadinessChip ok={state.rentLease} label="Rent / Lease" />
                <ReadinessChip ok={pimPublished} label="PIM Published" />
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <ERPSectionShell title="Product identity" description="Master data — code, pricing, category.">
                  <ERPDetailGrid columns={2} items={[
                    { label: "Product ID", value: `#${product.id}` },
                    { label: "Product Code", value: product.product_code || "—" },
                    { label: "SKU", value: product.sku || "—" },
                    { label: "Unit", value: product.unit_of_measure || "PCS" },
                    { label: "Base Price", value: formatRupee(product.base_price) },
                    { label: "Category", value: product.category || "—" },
                    { label: "Subcategory", value: product.subcategory || "—" },
                    { label: "Item Type", value: product.item_type?.replace(/_/g, " ") || "—" },
                    { label: "HSN/SAC", value: (product as Record<string, unknown>).hsn_sac_code as string || "—" },
                    { label: "GST Rate", value: (product as Record<string, unknown>).gst_rate ? `${(product as Record<string, unknown>).gst_rate}%` : "—" },
                    { label: "Inventory Profile", value: product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Not prepared" },
                    { label: "PIM Link", value: pimProduct ? `PIM #${pimProduct.id}` : "Not linked" },
                  ]} />
                </ERPSectionShell>

                <ERPSectionShell title="Image" description="Catalog image for shop and contract documents.">
                  {product.image ? (
                    <div className="relative h-64 overflow-hidden rounded-xl border bg-background">
                      <Image src={product.image} alt={product.name} fill sizes="50vw" className="object-cover" unoptimized={shouldBypassNextImageOptimization(product.image)} />
                    </div>
                  ) : (
                    <ERPEmptyState title="No product image" description="Attach a catalog image for complete readiness." action={
                      <Link href={`/admin/products/${product.id}/edit#image`} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                        Upload Image
                      </Link>
                    } />
                  )}
                </ERPSectionShell>
              </div>
            </div>
          )}

          {/* ── TAB: BLUEPRINT & SPECS ── */}
          {activeTab === "blueprint" && (
            <div className="space-y-6">
              {!pimLinked ? (
                <div className="rounded-xl border-2 border-dashed border-border p-10 text-center space-y-4">
                  <Layers className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <h3 className="text-base font-semibold">No PIM blueprint linked</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Open the Edit page and expand PIM Specifications to create or link a PIM blueprint.
                    Once linked, attribute specs, variant SKUs, and publish status appear here.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Link href={`/admin/products/${product.id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                      Edit Blueprint <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link href="/admin/pim/products" className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                      Open PIM <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {/* PIM status banner */}
                  <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${pimPublished ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10" : "border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10"}`}>
                    {pimPublished
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      : <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />}
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${pimPublished ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                        {pimPublished ? "PIM Published — all operations unlocked" : "PIM Draft — publish in PIM editor to unlock operations"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">PIM #{pimProduct!.id} · {pimProduct!.category_name || "—"}{pimProduct!.subcategory_name ? ` / ${pimProduct!.subcategory_name}` : ""}</p>
                    </div>
                    <Link href={`/admin/pim/products/${pimProduct!.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-background shrink-0">
                      PIM Editor <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>

                  {/* Description */}
                  {(pimProduct?.description || product.description) && (
                    <ERPSectionShell title="Description" description="Product blueprint description for sales and customer reference.">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {pimProduct?.description || (product as Record<string, unknown>).description as string}
                      </p>
                    </ERPSectionShell>
                  )}

                  {/* Attribute specifications */}
                  <ERPSectionShell title="Attribute specifications" description="Category attributes defined on this blueprint. Locked attributes cascade to all variant SKUs.">
                    {(pimProduct?.attributes?.length ?? 0) === 0 ? (
                      <ERPEmptyState
                        title="No attributes saved on blueprint"
                        description="Open the PIM editor to define attribute specifications for this product."
                        action={
                          <Link href={`/admin/pim/products/${pimProduct!.id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                            Open PIM Editor
                          </Link>
                        }
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm divide-y divide-border">
                          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3">Attribute</th>
                              <th className="px-4 py-3">Value</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Locked</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {pimProduct!.attributes!.map((attr) => {
                              const isLocked = pimProduct!.locked_attributes?.includes(attr.attribute);
                              return (
                                <tr key={attr.id}>
                                  <td className="px-4 py-3 font-medium">{attr.attribute_name}</td>
                                  <td className="px-4 py-3 text-muted-foreground">{attr.display_value || attr.value_text || String(attr.value_number ?? attr.value_boolean ?? "—")}</td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{attr.data_type}</td>
                                  <td className="px-4 py-3">
                                    {isLocked
                                      ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase"><Lock className="h-3 w-3" /> Locked</span>
                                      : <span className="text-muted-foreground text-xs">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </ERPSectionShell>

                  {/* Variant SKUs */}
                  <ERPSectionShell title="Variant SKUs" description="Stock-keeping units generated from this blueprint. Each variant has its own price, stock, and attribute values.">
                    {(pimProduct?.variants?.length ?? 0) === 0 ? (
                      <ERPEmptyState
                        title="No variant SKUs yet"
                        description="Open the PIM editor to add individual SKUs or auto-generate from attributes."
                        action={
                          <Link href={`/admin/pim/products/${pimProduct!.id}/edit`} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">
                            Open PIM Editor <ChevronRight className="h-4 w-4" />
                          </Link>
                        }
                      />
                    ) : (
                      <DataTableShell>
                        <table className="min-w-full text-sm divide-y divide-border">
                          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-4 py-3">SKU</th>
                              <th className="px-4 py-3">Attributes</th>
                              <th className="px-4 py-3 text-right">Price</th>
                              <th className="px-4 py-3 text-right">Stock</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {pimProduct!.variants!.map((v) => (
                              <tr key={v.id}>
                                <td className="px-4 py-3 font-mono font-semibold text-xs">{v.sku}</td>
                                <td className="px-4 py-3 text-muted-foreground text-xs">{v.variant_label || "—"}</td>
                                <td className="px-4 py-3 text-right font-semibold">{formatRupee(v.price)}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={v.is_low_stock ? "text-amber-600 font-semibold" : ""}>{v.quantity_on_hand}</span>
                                  {v.is_low_stock && <span className="ml-1 text-[10px] text-amber-600">low</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${v.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                    {v.is_active ? "Active" : "Inactive"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </DataTableShell>
                    )}
                  </ERPSectionShell>
                </>
              )}
            </div>
          )}

          {/* ── TAB: OPERATIONS ── */}
          {activeTab === "operations" && (
            <div className="space-y-6">
              {!pimPublished && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">PIM not published</p>
                    <p className="text-xs mt-0.5">
                      {pimLinked
                        ? "Publish the PIM product to confirm attribute specs before using in operations."
                        : "Link this product to a PIM blueprint first, then publish to unlock all operations."}
                      {pimLinked && (
                        <Link href={`/admin/pim/products/${pimProduct!.id}/edit`} className="ml-2 underline underline-offset-4">Open PIM Editor →</Link>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <OperationCard
                  icon={Star}
                  title="EMI / Advance EMI"
                  description="Create a subscription contract — monthly EMI, advance EMI, or custom plan."
                  enabled={state.subscription}
                  action={`/admin/subscriptions/advance-emi/create?product=${product.id}`}
                  actionLabel="Create Subscription"
                  tone="primary"
                />
                <OperationCard
                  icon={ShoppingCart}
                  title="Direct Sale"
                  description="Issue a direct sale invoice for this product without a subscription."
                  enabled={state.directSale}
                  action={`/admin/sales/direct/create?product=${product.id}`}
                  actionLabel="New Direct Sale"
                  tone="emerald"
                />
                <OperationCard
                  icon={Home}
                  title="Rent"
                  description="Create a rental contract — daily, weekly, or monthly rental billing."
                  enabled={Boolean(product.is_rent_enabled)}
                  action={`/admin/subscriptions/advance-emi/create?product=${product.id}&plan=RENT`}
                  actionLabel="Create Rent Contract"
                  tone="violet"
                />
                <OperationCard
                  icon={Truck}
                  title="Lease"
                  description="Create a long-term lease contract with defined lease period and terms."
                  enabled={Boolean(product.is_lease_enabled)}
                  action={`/admin/subscriptions/advance-emi/create?product=${product.id}&plan=LEASE`}
                  actionLabel="Create Lease Contract"
                  tone="amber"
                />
              </div>

              <ERPSectionShell title="Inventory operations" description="Prepare the inventory profile and manage opening stock.">
                <div className="flex flex-wrap gap-3">
                  <ProductQuickActions product={product} onChanged={() => void loadPage("refresh")} />
                  {product.inventory_profile_id && (
                    <Link href={`/admin/inventory/profiles/${product.inventory_profile_id}`} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                      <BarChart3 className="h-4 w-4" /> Inventory Profile
                    </Link>
                  )}
                  {product.product_code && (
                    <Link href={`/admin/inventory/stock-ledger?product=${product.product_code}`} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                      <FileText className="h-4 w-4" /> Stock Ledger
                    </Link>
                  )}
                </div>
              </ERPSectionShell>

              <ERPSectionShell title="Capability flags" description="Edit these in the Blueprint to enable/disable operations.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${product.is_emi_enabled !== false ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10" : "border-border bg-muted/30"}`}>
                    <span className="text-sm font-medium">EMI / Subscription</span>
                    {product.is_emi_enabled !== false
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${product.is_direct_sale_enabled !== false ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10" : "border-border bg-muted/30"}`}>
                    <span className="text-sm font-medium">Direct Sale</span>
                    {product.is_direct_sale_enabled !== false
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${product.is_rent_enabled ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10" : "border-border bg-muted/30"}`}>
                    <span className="text-sm font-medium">Rent</span>
                    {product.is_rent_enabled
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${product.is_lease_enabled ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/10" : "border-border bg-muted/30"}`}>
                    <span className="text-sm font-medium">Lease</span>
                    {product.is_lease_enabled
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                <Link href={`/admin/products/${product.id}/edit`} className="inline-flex items-center gap-2 mt-4 text-xs font-medium text-primary underline underline-offset-4">
                  Edit capabilities in Blueprint <ChevronRight className="h-3 w-3" />
                </Link>
              </ERPSectionShell>
            </div>
          )}

          {/* ── TAB: CONTRACTS & USAGE ── */}
          {activeTab === "contracts" && (
            <div className="space-y-6">
              <ERPSectionShell title={`Linked subscriptions (${subscriptions.length})`} description="Historical and active usage. Product master edits do not recalculate saved contract amounts.">
                {subscriptions.length === 0 ? (
                  <ERPEmptyState
                    title="No linked subscriptions"
                    description="This product has not been used in any subscription contract yet."
                    action={
                      state.subscription ? (
                        <Link href={`/admin/subscriptions/advance-emi/create?product=${product.id}`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                          Create First Subscription <ArrowRight className="h-4 w-4" />
                        </Link>
                      ) : undefined
                    }
                  />
                ) : (
                  <DataTableShell>
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Subscription</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3 text-right">Monthly</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {subscriptions.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-3">
                              <Link href={`/admin/subscriptions/${row.id}`} className="font-semibold text-primary underline underline-offset-4">{row.subscription_number}</Link>
                              <div className="text-xs text-muted-foreground">{dateText(row.start_date)}</div>
                            </td>
                            <td className="px-4 py-3">{row.customer_name || "—"}</td>
                            <td className="px-4 py-3">{row.plan_type || "—"}</td>
                            <td className="px-4 py-3 text-right">{formatRupee(row.total_amount)}</td>
                            <td className="px-4 py-3 text-right">{formatRupee(row.monthly_amount)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableShell>
                )}
              </ERPSectionShell>

              {/* Summary row */}
              {subscriptions.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Total Contracts", value: String(subscriptions.length) },
                    { label: "Active Now", value: String(activeSubscriptions), tone: "success" as const },
                    { label: "Total Contract Value", value: formatRupee(contractValue), tone: "success" as const },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl border px-5 py-4 bg-background">
                      <div className="text-xs text-muted-foreground">{m.label}</div>
                      <div className="text-xl font-bold mt-1">{m.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </ERPPageShell>
  );
}
