"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import ProductQuickActions from "@/components/admin/products/ProductQuickActions";
import InventoryProfileCostEditor from "@/components/admin/inventory/InventoryProfileCostEditor";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import SmartSuggestField from "@/components/forms/SmartSuggestField";
import PimSyncSection, { type PimSyncSectionHandle } from "@/components/admin/pim/PimSyncSection";
import { pimService, type PimProduct } from "@/services/pim";
import { getProduct, getProductCatalogOptions, updateProduct, type ProductCatalogOptions, type ProductRecord } from "@/services/products";

function fieldClass() {
  return "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring";
}

function areaClass() {
  return "mt-1 min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-ring";
}

function safePlan(value: unknown): "EMI" | "RENT" | "LEASE" {
  return value === "RENT" || value === "LEASE" ? value : "EMI";
}

function FormCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <ERPSectionShell title={title} description={description}><div className="grid gap-4 md:grid-cols-2">{children}</div></ERPSectionShell>;
}

function PimStatusMini({ productCode }: { productCode: string }) {
  const [pimProduct, setPimProduct] = useState<PimProduct | null | undefined>(undefined);
  useEffect(() => {
    if (!productCode) { setPimProduct(null); return; }
    pimService.getProducts({ search: productCode }).then((res) => {
      const list = res.results;
      const match = list.find((p) => p.code === productCode);
      setPimProduct(match ?? null);
    }).catch(() => setPimProduct(null));
  }, [productCode]);
  if (pimProduct === undefined) return <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>PIM</span><span className="text-xs text-muted-foreground">Checking…</span></div>;
  if (!pimProduct) return (
    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <span>PIM</span>
      <Link href="/admin/pim/products" className="text-xs text-amber-600 hover:underline">Not synced</Link>
    </div>
  );
  return (
    <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-900 dark:bg-green-950/30">
      <span>PIM #{pimProduct.id}</span>
      <Link href={`/admin/pim/products/${pimProduct.id}/edit`} className="text-xs text-green-700 hover:underline dark:text-green-400">Edit PIM →</Link>
    </div>
  );
}

function check(label: string, ok: boolean) {
  return <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm"><span>{label}</span><ERPStatusBadge status={ok ? "AVAILABLE" : "PENDING"} label={ok ? "Ready" : "Missing"} /></div>;
}

/** Per item-type: which sections to show */
function itemTypeConfig(itemType: string) {
  const isFinished = itemType === "FINISHED_GOOD";
  const isConsumable = isFinished || itemType === "ADD_ON" || itemType === "ACCESSORY";
  return { showCapabilities: isConsumable, showEmi: isFinished, showWarranty: isFinished };
}

export default function AdminProductEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params?.id;
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>({ categories: [], subcategories: [], unit_of_measure_masters: [], unit_of_measure_options: ["PCS"], item_type_choices: [], stock_type_choices: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showCostEditor, setShowCostEditor] = useState(false);
  const pimSyncRef = useRef<PimSyncSectionHandle>(null);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [hsnSacCode, setHsnSacCode] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [basePrice, setBasePrice] = useState("0.00");
  const [active, setActive] = useState(true);
  const [planType, setPlanType] = useState<"EMI" | "RENT" | "LEASE">("EMI");
  const [emi, setEmi] = useState(true);
  const [rent, setRent] = useState(false);
  const [lease, setLease] = useState(false);
  const [directSale, setDirectSale] = useState(true);
  const [itemType, setItemType] = useState("FINISHED_GOOD");
  const [stockType, setStockType] = useState("STOCK_ITEM");
  const [warrantyEnabled, setWarrantyEnabled] = useState(true);
  const [warrantyManufacturing, setWarrantyManufacturing] = useState("12");
  const [warrantyStructural, setWarrantyStructural] = useState("36");
  const [warrantyExtendedMax, setWarrantyExtendedMax] = useState("12");
  const [extendedWarrantyCostPct, setExtendedWarrantyCostPct] = useState("7.50");

  function hydrate(next: ProductRecord) {
    setProduct(next);
    setName(next.name || "");
    setProductCode(next.product_code || "");
    setSku(next.sku || "");
    setUnit(next.unit_of_measure || "PCS");
    setCategory(next.category || "");
    setSubcategory(next.subcategory || "");
    setDescription(next.description || "");
    setHsnSacCode(next.hsn_sac_code || "");
    setGstRate(next.gst_rate != null ? String(next.gst_rate) : "");
    setBasePrice(Number(next.base_price || 0).toFixed(2));
    setActive(next.is_active !== false);
    setPlanType(safePlan(next.plan_type_default));
    setEmi(next.is_emi_enabled !== false);
    setRent(Boolean(next.is_rent_enabled));
    setLease(Boolean(next.is_lease_enabled));
    setDirectSale(next.is_direct_sale_enabled !== false);
    setItemType(next.item_type || "FINISHED_GOOD");
    setStockType(next.stock_type || "STOCK_ITEM");
    setWarrantyEnabled(next.warranty_enabled !== false);
    setWarrantyManufacturing(String(next.warranty_months_manufacturing ?? 12));
    setWarrantyStructural(String(next.warranty_months_structural ?? 36));
    setWarrantyExtendedMax(String(next.warranty_months_extended_max ?? 12));
    setExtendedWarrantyCostPct(next.extended_warranty_cost_percentage != null ? String(next.extended_warranty_cost_percentage) : "7.50");
  }

  const loadPage = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [productPayload, optionsPayload] = await Promise.allSettled([getProduct(productId), getProductCatalogOptions()]);
      if (productPayload.status !== "fulfilled") throw productPayload.reason;
      const prod = productPayload.value;
      // Redirect non-finished-good types to their type-specific edit pages
      const typeSlugMap: Record<string, string> = {
        RAW_MATERIAL: "raw-materials",
        ACCESSORY: "accessories",
        SERVICE: "services",
      };
      const typeSlug = typeSlugMap[prod.item_type ?? ""];
      if (typeSlug) {
        router.replace(`/admin/products/${typeSlug}/${productId}/edit`);
        return;
      }
      hydrate(prod);
      if (optionsPayload.status === "fulfilled") setCatalogOptions(optionsPayload.value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product edit form.");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId, router]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  function effectiveDefault(): "EMI" | "RENT" | "LEASE" {
    if (planType === "RENT" && rent) return "RENT";
    if (planType === "LEASE" && lease) return "LEASE";
    if (emi) return "EMI";
    if (rent) return "RENT";
    return "LEASE";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        name,
        product_code: productCode,
        sku: sku || null,
        unit_of_measure: unit || "PCS",
        category,
        subcategory,
        description,
        hsn_sac_code: hsnSacCode.trim().toUpperCase(),
        gst_rate: gstRate.trim() ? gstRate.trim() : null,
        base_price: basePrice,
        is_active: active,
        plan_type_default: effectiveDefault(),
        is_emi_enabled: itemType === "FINISHED_GOOD" ? emi : false,
        is_rent_enabled: itemType === "FINISHED_GOOD" ? rent : false,
        is_lease_enabled: itemType === "FINISHED_GOOD" ? lease : false,
        is_direct_sale_enabled: (itemType === "FINISHED_GOOD" || itemType === "ADD_ON" || itemType === "ACCESSORY") ? directSale : false,
        item_type: itemType,
        stock_type: stockType,
        warranty_enabled: itemType === "FINISHED_GOOD" ? warrantyEnabled : false,
        warranty_months_manufacturing: Number(warrantyManufacturing) || 12,
        warranty_months_structural: Number(warrantyStructural) || 36,
        warranty_months_extended_max: Number(warrantyExtendedMax) || 12,
        extended_warranty_cost_percentage: extendedWarrantyCostPct.trim() || "7.50",
      };
      const updated = await updateProduct(productId, payload);
      hydrate(updated);
      await pimSyncRef.current?.save();
      setMessage("Product saved. Existing contracts keep their saved pricing and plan snapshots.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  const { showCapabilities, showEmi, showWarranty } = itemTypeConfig(itemType);

  const readiness = useMemo(() => ({
    inventory: Boolean(product?.inventory_ready),
    image: Boolean(product?.image),
    sku: Boolean(sku || productCode),
    catalog: Boolean(category || subcategory),
    subscription: active && emi && Number(basePrice || 0) > 0,
    directSale: active && directSale,
    rentLease: active && (rent || lease),
    warranty: warrantyEnabled && Number(warrantyManufacturing) > 0,
  }), [active, basePrice, category, directSale, emi, lease, product?.image, product?.inventory_ready, productCode, rent, sku, subcategory, warrantyEnabled, warrantyManufacturing]);

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title={product ? `Edit ${product.name}` : `Edit Product #${productId ?? "—"}`}
      subtitle="Edit operational fields: classification, catalog data, and sales capabilities. Manage pricing, media, and related products in PIM."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products", href: "/admin/products" }, { label: product?.name || `#${productId}`, href: productId ? `/admin/products/${productId}` : "/admin/products" }, { label: "Edit" }]}
      actions={[{ href: productId ? `/admin/products/${productId}` : "/admin/products", label: "Cancel", variant: "secondary" }, { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" }]}
      statusBadge={{ label: "Safe Master Edit", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading product edit form..." /> : null}
        {!loading && error && !product ? <ERPErrorState title="Unable to load product" description={error} onRetry={() => void loadPage()} /> : null}
        {!loading && !error && !product ? <ERPEmptyState title="Product not available" description="The requested product could not be loaded." /> : null}

        {!loading && product ? (
          <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
              <div className="sticky top-0 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
                <Link href={`/admin/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium">Cancel</Link>
                <button type="button" onClick={() => setShowCostEditor(true)} disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition hover:bg-muted disabled:opacity-60">Costing</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Save Product"}</button>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Changes affect future onboarding and billing only. Existing contracts, invoices, receipts, payments, and subscription pricing snapshots are not mutated.</div>

              {/* Classification first — drives what sections appear below */}
              <FormCard title="Classification" description="Product type determines which operational fields and capabilities apply.">
                <label className="text-sm text-muted-foreground">
                  Item Type
                  <select className={fieldClass()} value={itemType} onChange={(event) => setItemType(event.target.value)}>
                    <option value="FINISHED_GOOD">Finished Good</option>
                    <option value="RAW_MATERIAL">Raw Material</option>
                    <option value="ACCESSORY">Accessory</option>
                    <option value="SERVICE">Service</option>
                    <option value="ADD_ON">Add-on</option>
                  </select>
                </label>
                <label className="text-sm text-muted-foreground">
                  Stock Type
                  <select className={fieldClass()} value={stockType} onChange={(event) => setStockType(event.target.value)}>
                    <option value="STOCK_ITEM">Stock Item</option>
                    <option value="MADE_TO_ORDER">Made to Order</option>
                    <option value="NON_STOCK">Non-Stock</option>
                  </select>
                </label>
                {/* Contextual hint per item type */}
                {itemType === "RAW_MATERIAL" && (
                  <p className="md:col-span-2 text-xs text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2">
                    Raw materials are tracked in inventory and used in Bills of Material. They do not have subscription, rent/lease, or warranty capabilities.
                  </p>
                )}
                {itemType === "SERVICE" && (
                  <p className="md:col-span-2 text-xs text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2">
                    Services are non-stock items billed as direct charges. No inventory tracking, EMI, or warranty.
                  </p>
                )}
                {itemType === "ACCESSORY" && (
                  <p className="md:col-span-2 text-xs text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2">
                    Accessories are sold as direct-sale add-ons. No EMI, rent/lease, or warranty capabilities.
                  </p>
                )}
                {itemType === "ADD_ON" && (
                  <p className="md:col-span-2 text-xs text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2">
                    Add-ons supplement a primary product sale. Direct-sale enabled; no EMI, rent/lease, or warranty.
                  </p>
                )}
              </FormCard>

              <FormCard title="Identity" description="Core product identity used by staff search and document references.">
                <label className="text-sm text-muted-foreground">Name<input className={fieldClass()} value={name} onChange={(event) => setName(event.target.value)} required /></label>
                <label className="text-sm text-muted-foreground">Product code<input className={fieldClass()} value={productCode} onChange={(event) => setProductCode(event.target.value)} required /></label>
                <label className="text-sm text-muted-foreground">SKU<input className={fieldClass()} value={sku} onChange={(event) => setSku(event.target.value)} /></label>
                <label className="text-sm text-muted-foreground">Unit<input className={fieldClass()} value={unit} onChange={(event) => setUnit(event.target.value)} list="unit-options" /><datalist id="unit-options">{catalogOptions.unit_of_measure_options.map((item) => <option key={item} value={item} />)}</datalist></label>
              </FormCard>

              <FormCard title="Category / Master data" description="Catalog fields improve shop search, public display, and future purchase planning.">
                <label className="text-sm text-muted-foreground">Category<input className={fieldClass()} value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" /><datalist id="category-options">{catalogOptions.categories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
                <label className="text-sm text-muted-foreground">Subcategory<input className={fieldClass()} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} list="subcategory-options" /><datalist id="subcategory-options">{catalogOptions.subcategories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
                <label className="text-sm text-muted-foreground md:col-span-2">Description<textarea className={areaClass()} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <div className="md:col-span-2">
                  <SmartSuggestField
                    id="edit-product-hsn"
                    label="HSN / SAC Code"
                    value={hsnSacCode}
                    onChange={setHsnSacCode}
                    sourceText={[name, category, subcategory, description].filter(Boolean).join(" ")}
                    fieldKey="product.hsn"
                    placeholder="e.g. 8450"
                    disabled={saving}
                    onAccept={(s) => {
                      if (s.gst_rate != null) setGstRate(String(s.gst_rate));
                    }}
                  />
                </div>
                <label className="text-sm text-muted-foreground">GST Rate (%)<input className={fieldClass()} type="number" min="0" step="0.01" value={gstRate} onChange={(event) => setGstRate(event.target.value)} /></label>
              </FormCard>

              {/* Capabilities — only for Finished Good / Add-on / Accessory */}
              {showCapabilities && (
                <FormCard title="Capabilities" description="Controls future use in EMI, rent, lease, and direct-sale workflows.">
                  <label className="text-sm text-muted-foreground">Default plan<select className={fieldClass()} value={planType} onChange={(event) => setPlanType(event.target.value as "EMI" | "RENT" | "LEASE")}><option value="EMI">EMI</option><option value="RENT">Rent</option><option value="LEASE">Lease</option></select></label>
                  <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Active<input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>
                  {showEmi && (
                    <>
                      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">EMI<input type="checkbox" checked={emi} onChange={(event) => setEmi(event.target.checked)} /></label>
                      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Rent<input type="checkbox" checked={rent} onChange={(event) => setRent(event.target.checked)} /></label>
                      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Lease<input type="checkbox" checked={lease} onChange={(event) => setLease(event.target.checked)} /></label>
                    </>
                  )}
                  <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Direct Sale<input type="checkbox" checked={directSale} onChange={(event) => setDirectSale(event.target.checked)} /></label>
                </FormCard>
              )}

              {/* Warranty — Finished Good only */}
              {showWarranty && (
                <ERPSectionShell title="Warranty Coverage" description="Configure warranty periods and extended warranty pricing. Applies to future deliveries only.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm md:col-span-2">
                      Warranty Enabled
                      <input type="checkbox" checked={warrantyEnabled} onChange={(e) => setWarrantyEnabled(e.target.checked)} />
                    </label>
                    {warrantyEnabled ? (
                      <>
                        <label className="text-sm text-muted-foreground">Manufacturing Warranty (months)<input className={fieldClass()} type="number" min="0" max="120" value={warrantyManufacturing} onChange={(e) => setWarrantyManufacturing(e.target.value)} /></label>
                        <label className="text-sm text-muted-foreground">Structural Warranty (months)<input className={fieldClass()} type="number" min="0" max="120" value={warrantyStructural} onChange={(e) => setWarrantyStructural(e.target.value)} /></label>
                        <label className="text-sm text-muted-foreground">Max Extended Warranty (months)<input className={fieldClass()} type="number" min="0" max="60" value={warrantyExtendedMax} onChange={(e) => setWarrantyExtendedMax(e.target.value)} /></label>
                        <label className="text-sm text-muted-foreground">Extended Warranty Cost (% of price)<input className={fieldClass()} type="number" min="0" max="100" step="0.01" value={extendedWarrantyCostPct} onChange={(e) => setExtendedWarrantyCostPct(e.target.value)} /></label>
                        <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
                          <div>Manufacturing: <strong>{warrantyManufacturing} months</strong> from delivery.</div>
                          <div>Structural: <strong>{warrantyStructural} months</strong> from delivery.</div>
                          {Number(warrantyExtendedMax) > 0 ? <div>Extended: up to <strong>{warrantyExtendedMax} months</strong> at <strong>{extendedWarrantyCostPct}%</strong> ({formatRupee(Number(basePrice || 0) * Number(extendedWarrantyCostPct || 0) / 100)}/month).</div> : null}
                        </div>
                      </>
                    ) : (
                      <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                        Warranty is disabled. No warranty tracking or claims for future deliveries.
                      </div>
                    )}
                  </div>
                </ERPSectionShell>
              )}

              {/* PIM Sync — auto-matches category/subcategory */}
              <PimSyncSection
                ref={pimSyncRef}
                productCode={productCode}
                productName={name}
                categoryText={category}
                subcategoryText={subcategory}
                basePrice={basePrice}
              />
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <ERPSectionShell title="Readiness panel" description="Fast checks before using this product operationally.">
                <div className="space-y-2">
                  {check("Inventory ready", readiness.inventory)}
                  {check("Image attached", readiness.image)}
                  {check("SKU/code ready", readiness.sku)}
                  {check("Cataloged", readiness.catalog)}
                  {showEmi && check("Subscription-ready", readiness.subscription)}
                  {showCapabilities && check("Direct sale-ready", readiness.directSale)}
                  {showEmi && check("Rent/lease-ready", readiness.rentLease)}
                  {showWarranty && check("Warranty configured", readiness.warranty)}
                </div>
              </ERPSectionShell>

              <ERPSectionShell title="Inventory readiness" description="Prepare/recheck profile from this edit page without posting stock movements.">
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">Profile: {product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Pending"}</div>
                  <ProductQuickActions product={{ ...product, name, product_code: productCode, sku, unit_of_measure: unit, category, subcategory, base_price: basePrice, is_active: active, is_emi_enabled: emi, is_rent_enabled: rent, is_lease_enabled: lease, is_direct_sale_enabled: directSale }} mode="detail" onChanged={() => loadPage()} />
                </div>
              </ERPSectionShell>

              <ERPSectionShell title="Module Links" description="This product across all 3 modules.">
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                    <span>Products Register</span>
                    <Link href={`/admin/products/${product.id}`} className="text-xs text-primary hover:underline">View</Link>
                  </div>
                  <PimStatusMini productCode={productCode} />
                  <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                    <span>Inventory</span>
                    {product.inventory_profile_id
                      ? <Link href={`/admin/inventory/profiles/${product.inventory_profile_id}`} className="text-xs text-primary hover:underline">Profile #{product.inventory_profile_id}</Link>
                      : <span className="text-xs text-amber-600">Not set up</span>
                    }
                  </div>
                  <Link href="/admin/pim/products" className="block rounded-xl border border-dashed px-3 py-2 text-center text-xs text-muted-foreground hover:border-primary hover:text-primary">
                    Open PIM Workbench →
                  </Link>
                </div>
              </ERPSectionShell>

              {/* PIM managed fields reminder */}
              <ERPSectionShell title="Managed in PIM" description="These fields are authoritative in the PIM module.">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center justify-between"><span>Pricing</span><Link href="/admin/pim/products" className="text-xs text-primary hover:underline">Open PIM →</Link></li>
                  <li className="flex items-center justify-between"><span>Media (images / video)</span><Link href="/admin/pim/products" className="text-xs text-primary hover:underline">Open PIM →</Link></li>
                  <li className="flex items-center justify-between"><span>Related / accessories</span><Link href="/admin/pim/products" className="text-xs text-primary hover:underline">Open PIM →</Link></li>
                  <li className="flex items-center justify-between"><span>Variant attributes</span><Link href="/admin/pim/products" className="text-xs text-primary hover:underline">Open PIM →</Link></li>
                </ul>
              </ERPSectionShell>

              <ERPSectionShell title="Safe edit boundary" description="What this page does not do.">
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Does not recalculate EMI.</li>
                  <li>Does not mutate active contracts.</li>
                  <li>Does not change invoices, receipts, payments, or delivery records.</li>
                  <li>Does not post stock ledger opening quantity.</li>
                </ul>
              </ERPSectionShell>
            </aside>
          </form>
        ) : null}

        {showCostEditor && product && (
          <InventoryProfileCostEditor
            productId={product.id}
            productName={product.name}
            itemType={itemType}
            onClose={() => setShowCostEditor(false)}
            onSave={() => void loadPage()}
          />
        )}
      </div>
    </ERPPageShell>
  );
}
