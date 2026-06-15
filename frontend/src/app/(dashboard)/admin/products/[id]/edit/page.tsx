"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import ProductQuickActions from "@/components/admin/products/ProductQuickActions";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { shouldBypassNextImageOptimization } from "@/lib/media";
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

function check(label: string, ok: boolean) {
  return <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm"><span>{label}</span><ERPStatusBadge status={ok ? "AVAILABLE" : "PENDING"} label={ok ? "Ready" : "Missing"} /></div>;
}

export default function AdminProductEditPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>({ categories: [], subcategories: [], unit_of_measure_masters: [], unit_of_measure_options: ["PCS"] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [active, setActive] = useState(true);
  const [planType, setPlanType] = useState<"EMI" | "RENT" | "LEASE">("EMI");
  const [emi, setEmi] = useState(true);
  const [rent, setRent] = useState(false);
  const [lease, setLease] = useState(false);
  const [directSale, setDirectSale] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [clearImage, setClearImage] = useState(false);

  function hydrate(next: ProductRecord) {
    setProduct(next);
    setName(next.name || "");
    setProductCode(next.product_code || "");
    setSku(next.sku || "");
    setUnit(next.unit_of_measure || "PCS");
    setCategory(next.category || "");
    setSubcategory(next.subcategory || "");
    setDescription(next.description || "");
    setBasePrice(Number(next.base_price || 0).toFixed(2));
    setActive(next.is_active !== false);
    setPlanType(safePlan(next.plan_type_default));
    setEmi(next.is_emi_enabled !== false);
    setRent(Boolean(next.is_rent_enabled));
    setLease(Boolean(next.is_lease_enabled));
    setDirectSale(next.is_direct_sale_enabled !== false);
    setImageFile(null);
    setImagePreview(null);
    setClearImage(false);
  }

  const loadPage = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [productPayload, optionsPayload] = await Promise.allSettled([getProduct(productId), getProductCatalogOptions()]);
      if (productPayload.status !== "fulfilled") throw productPayload.reason;
      hydrate(productPayload.value);
      if (optionsPayload.status === "fulfilled") setCatalogOptions(optionsPayload.value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product edit form.");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setClearImage(false);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

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
      const hasImage = Boolean(imageFile || clearImage);
      const payload = hasImage ? new FormData() : {
        name,
        product_code: productCode,
        sku: sku || null,
        unit_of_measure: unit || "PCS",
        category,
        subcategory,
        description,
        base_price: basePrice,
        is_active: active,
        plan_type_default: effectiveDefault(),
        is_emi_enabled: emi,
        is_rent_enabled: rent,
        is_lease_enabled: lease,
        is_direct_sale_enabled: directSale,
      };
      if (payload instanceof FormData) {
        payload.set("name", name);
        payload.set("product_code", productCode);
        if (sku) payload.set("sku", sku); else payload.set("sku", "");
        payload.set("unit_of_measure", unit || "PCS");
        payload.set("category", category);
        payload.set("subcategory", subcategory);
        payload.set("description", description);
        payload.set("base_price", basePrice);
        payload.set("is_active", String(active));
        payload.set("plan_type_default", effectiveDefault());
        payload.set("is_emi_enabled", String(emi));
        payload.set("is_rent_enabled", String(rent));
        payload.set("is_lease_enabled", String(lease));
        payload.set("is_direct_sale_enabled", String(directSale));
        if (imageFile) payload.set("image", imageFile);
        if (clearImage) payload.set("clear_image", "true");
      }
      const updated = await updateProduct(productId, payload);
      hydrate(updated);
      setMessage("Product saved. Existing contracts keep their saved pricing and plan snapshots.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  const readiness = useMemo(() => ({
    inventory: Boolean(product?.inventory_ready),
    image: Boolean(product?.image || imagePreview),
    sku: Boolean(sku || productCode),
    catalog: Boolean(category || subcategory),
    subscription: active && emi && Number(basePrice || 0) > 0,
    directSale: active && directSale,
    rentLease: active && (rent || lease),
  }), [active, basePrice, category, directSale, emi, imagePreview, lease, product?.image, product?.inventory_ready, productCode, rent, sku, subcategory]);

  return (
    <ERPPageShell
      title={product ? `Edit ${product.name}` : `Edit Product #${productId ?? "—"}`}
      subtitle="Safe product master editing for future catalog, subscription, rent/lease, direct-sale, and inventory onboarding."
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
              <div className="sticky top-0 z-10 flex flex-wrap justify-end gap-2 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
                <Link href={`/admin/products/${product.id}`} className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium">Cancel</Link>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Save Product"}</button>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Changes affect future onboarding and billing only. Existing contracts, invoices, receipts, payments, and subscription pricing snapshots are not mutated.</div>

              <FormCard title="Identity" description="Core product identity used by staff search and document references.">
                <label className="text-sm text-muted-foreground">Name<input className={fieldClass()} value={name} onChange={(event) => setName(event.target.value)} required /></label>
                <label className="text-sm text-muted-foreground">Product code<input className={fieldClass()} value={productCode} onChange={(event) => setProductCode(event.target.value)} required /></label>
                <label className="text-sm text-muted-foreground">SKU<input className={fieldClass()} value={sku} onChange={(event) => setSku(event.target.value)} /></label>
                <label className="text-sm text-muted-foreground">Unit<input className={fieldClass()} value={unit} onChange={(event) => setUnit(event.target.value)} list="unit-options" /><datalist id="unit-options">{catalogOptions.unit_of_measure_options.map((item) => <option key={item} value={item} />)}</datalist></label>
              </FormCard>

              <FormCard title="Pricing" description="Product base price is the future contract total. Historical snapshots are preserved.">
                <label className="text-sm text-muted-foreground">Base price<input className={fieldClass()} type="number" min="0" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} required /></label>
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Current display: {formatRupee(basePrice)}</div>
              </FormCard>

              <FormCard title="Category / Master data" description="Catalog fields improve shop search, public display, and future purchase planning.">
                <label className="text-sm text-muted-foreground">Category<input className={fieldClass()} value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" /><datalist id="category-options">{catalogOptions.categories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
                <label className="text-sm text-muted-foreground">Subcategory<input className={fieldClass()} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} list="subcategory-options" /><datalist id="subcategory-options">{catalogOptions.subcategories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
                <label className="text-sm text-muted-foreground md:col-span-2">Description<textarea className={areaClass()} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              </FormCard>

              <FormCard title="Capabilities" description="Controls future use in EMI, rent, lease, and direct-sale workflows.">
                <label className="text-sm text-muted-foreground">Default plan<select className={fieldClass()} value={planType} onChange={(event) => setPlanType(event.target.value as "EMI" | "RENT" | "LEASE")}><option value="EMI">EMI</option><option value="RENT">Rent</option><option value="LEASE">Lease</option></select></label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Active<input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">EMI<input type="checkbox" checked={emi} onChange={(event) => setEmi(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Rent<input type="checkbox" checked={rent} onChange={(event) => setRent(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Lease<input type="checkbox" checked={lease} onChange={(event) => setLease(event.target.checked)} /></label>
                <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Direct Sale<input type="checkbox" checked={directSale} onChange={(event) => setDirectSale(event.target.checked)} /></label>
              </FormCard>

              <ERPSectionShell title="Image" description="Single image used for catalog completeness and daily product lookup." id="image">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3"><input type="file" accept="image/*" onChange={onImageChange} className={fieldClass()} /><label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">Remove existing image<input type="checkbox" checked={clearImage} onChange={(event) => { setClearImage(event.target.checked); if (event.target.checked) setImageFile(null); }} /></label></div>
                  <div className="relative h-56 overflow-hidden rounded-2xl border border-border bg-muted/30">{imagePreview || (product.image && !clearImage) ? <Image src={imagePreview || product.image || ""} alt={name} fill sizes="(min-width: 1280px) 360px, (min-width: 768px) 50vw, 100vw" className="object-cover" unoptimized={Boolean(imagePreview) || shouldBypassNextImageOptimization(product.image)} /> : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No image selected</div>}</div>
                </div>
              </ERPSectionShell>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <ERPSectionShell title="Readiness panel" description="Fast checks before using this product operationally.">
                <div className="space-y-2">{check("Inventory ready", readiness.inventory)}{check("Image attached", readiness.image)}{check("SKU/code ready", readiness.sku)}{check("Cataloged", readiness.catalog)}{check("Subscription-ready", readiness.subscription)}{check("Direct sale-ready", readiness.directSale)}{check("Rent/lease-ready", readiness.rentLease)}</div>
              </ERPSectionShell>
              <ERPSectionShell title="Inventory readiness" description="Prepare/recheck profile from this edit page without posting stock movements.">
                <div className="space-y-3"><div className="text-sm text-muted-foreground">Profile: {product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Pending"}</div><ProductQuickActions product={{ ...product, name, product_code: productCode, sku, unit_of_measure: unit, category, subcategory, base_price: basePrice, is_active: active, is_emi_enabled: emi, is_rent_enabled: rent, is_lease_enabled: lease, is_direct_sale_enabled: directSale }} mode="detail" onChanged={() => loadPage()} /></div>
              </ERPSectionShell>
              <ERPSectionShell title="Safe edit boundary" description="What this page does not do.">
                <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Does not recalculate EMI.</li><li>Does not mutate active contracts.</li><li>Does not change invoices, receipts, payments, or delivery records.</li><li>Does not post stock ledger opening quantity.</li></ul>
              </ERPSectionShell>
            </aside>
          </form>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
