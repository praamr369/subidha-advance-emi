"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import { prepareProductInventoryProfile, updateProduct } from "@/services/products";

type QuickProduct = {
  id: number;
  name: string;
  product_code?: string | null;
  sku?: string | null;
  unit_of_measure?: string | null;
  category?: string | null;
  subcategory?: string | null;
  base_price?: string | number | null;
  is_active?: boolean;
  plan_type_default?: "EMI" | "RENT" | "LEASE" | string | null;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  inventory_profile_id?: number | null;
  inventory_ready?: boolean;
  inventory_stock_tracking_enabled?: boolean;
  image?: string | null;
};

type Props = {
  product: QuickProduct;
  mode?: "compact" | "detail";
  onChanged?: () => Promise<void> | void;
};

function moneyInput(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "";
}

function supportedDefault(defaultValue: string | null | undefined, emi: boolean, rent: boolean, lease: boolean): "EMI" | "RENT" | "LEASE" {
  if (defaultValue === "RENT" && rent) return "RENT";
  if (defaultValue === "LEASE" && lease) return "LEASE";
  if (emi) return "EMI";
  if (rent) return "RENT";
  if (lease) return "LEASE";
  return "EMI";
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Changes affect future onboarding and billing only. Existing contracts keep saved price and plan snapshots.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function fieldClass() {
  return "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring";
}

function checkboxLabel(label: string, checked: boolean, onChange: (checked: boolean) => void) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function ProductQuickActions({ product, mode = "compact", onChanged }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(product.name || "");
  const [productCode, setProductCode] = useState(product.product_code || "");
  const [sku, setSku] = useState(product.sku || "");
  const [unit, setUnit] = useState(product.unit_of_measure || "PCS");
  const [category, setCategory] = useState(product.category || "");
  const [subcategory, setSubcategory] = useState(product.subcategory || "");
  const [basePrice, setBasePrice] = useState(moneyInput(product.base_price));
  const [active, setActive] = useState(product.is_active !== false);
  const [emi, setEmi] = useState(product.is_emi_enabled !== false);
  const [rent, setRent] = useState(Boolean(product.is_rent_enabled));
  const [lease, setLease] = useState(Boolean(product.is_lease_enabled));
  const [directSale, setDirectSale] = useState(product.is_direct_sale_enabled !== false);
  const [planTypeDefault, setPlanTypeDefault] = useState<"EMI" | "RENT" | "LEASE">(supportedDefault(product.plan_type_default, product.is_emi_enabled !== false, Boolean(product.is_rent_enabled), Boolean(product.is_lease_enabled)));
  const [trackStock, setTrackStock] = useState(product.inventory_stock_tracking_enabled !== false);
  const [openingStock, setOpeningStock] = useState("0.000");

  useEffect(() => {
    setName(product.name || "");
    setProductCode(product.product_code || "");
    setSku(product.sku || "");
    setUnit(product.unit_of_measure || "PCS");
    setCategory(product.category || "");
    setSubcategory(product.subcategory || "");
    setBasePrice(moneyInput(product.base_price));
    setActive(product.is_active !== false);
    setEmi(product.is_emi_enabled !== false);
    setRent(Boolean(product.is_rent_enabled));
    setLease(Boolean(product.is_lease_enabled));
    setDirectSale(product.is_direct_sale_enabled !== false);
    setPlanTypeDefault(supportedDefault(product.plan_type_default, product.is_emi_enabled !== false, Boolean(product.is_rent_enabled), Boolean(product.is_lease_enabled)));
    setTrackStock(product.inventory_stock_tracking_enabled !== false);
  }, [product]);

  const canUseSubscription = Boolean(product.product_code || product.sku) && Number(product.base_price || 0) > 0 && product.is_active !== false && product.is_emi_enabled !== false;
  const badges = useMemo(() => [
    product.image ? "Catalog Image" : "No Image",
    product.sku ? "SKU Ready" : "SKU Pending",
    product.inventory_ready ? "Inventory Ready" : "Stock Profile Pending",
    product.is_emi_enabled !== false ? "Subscription Ready" : "EMI Disabled",
    product.is_direct_sale_enabled !== false ? "Direct Sale Ready" : "Direct Sale Disabled",
    product.is_rent_enabled || product.is_lease_enabled ? "Rent/Lease Ready" : "Rent/Lease Disabled",
  ], [product]);

  async function submitQuickEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const safeDefault = supportedDefault(planTypeDefault, emi, rent, lease);
    try {
      await updateProduct(product.id, {
        name,
        product_code: productCode,
        sku: sku || null,
        unit_of_measure: unit || "PCS",
        category,
        subcategory,
        base_price: basePrice,
        is_active: active,
        is_emi_enabled: emi,
        is_rent_enabled: rent,
        is_lease_enabled: lease,
        is_direct_sale_enabled: directSale,
        plan_type_default: safeDefault,
      });
      setMessage("Product updated for future onboarding. Existing contract snapshots are unchanged.");
      setEditOpen(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product quick update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPrepareInventory() {
    setPreparing(true);
    setError(null);
    setMessage(null);
    try {
      const qty = Number(openingStock || 0);
      if (qty > 0) {
        throw new Error("Opening stock is not posted from quick prepare. Prepare the profile now, then use the controlled Opening Stock workflow for stock quantity.");
      }
      const payload = await prepareProductInventoryProfile(product.id, { stock_tracking_enabled: trackStock });
      setMessage(payload.created ? `Inventory profile #${payload.inventory_profile.id} prepared.` : `Inventory profile #${payload.inventory_profile.id} already existed and was refreshed.`);
      setPrepareOpen(false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inventory preparation failed.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">Quick Edit</button>
      <button type="button" onClick={() => setPrepareOpen(true)} className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100">Prepare Inventory</button>
      <Link href={`/admin/products/${product.id}`} className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">Open</Link>
      <Link href={`/admin/products/${product.id}/edit`} className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">Edit full page</Link>
      <Link href={canUseSubscription ? `/admin/subscriptions/advance-emi/create?product=${product.id}` : `/admin/products/${product.id}`} aria-disabled={!canUseSubscription} className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition ${canUseSubscription ? "border-border bg-background text-foreground hover:bg-muted" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{canUseSubscription ? "Use in Subscription" : "Subscription setup needed"}</Link>
      {mode === "detail" ? <Link href={`/admin/products/${product.id}/edit#image`} className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted">Upload Image</Link> : null}
      {message ? <span className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</span> : null}
      {error ? <span className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</span> : null}

      {editOpen ? (
        <Drawer title={`Quick edit ${product.name}`} onClose={() => setEditOpen(false)}>
          <form className="space-y-4" onSubmit={submitQuickEdit}>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Safe master edit: future onboarding and billing only. Existing contracts, invoices, receipts, and subscription pricing snapshots are not recalculated.</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">Name<input className={fieldClass()} value={name} onChange={(event) => setName(event.target.value)} required /></label>
              <label className="text-sm text-muted-foreground">Product code<input className={fieldClass()} value={productCode} onChange={(event) => setProductCode(event.target.value)} required /></label>
              <label className="text-sm text-muted-foreground">SKU<input className={fieldClass()} value={sku} onChange={(event) => setSku(event.target.value)} /></label>
              <label className="text-sm text-muted-foreground">Unit<input className={fieldClass()} value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
              <label className="text-sm text-muted-foreground">Category<input className={fieldClass()} value={category} onChange={(event) => setCategory(event.target.value)} /></label>
              <label className="text-sm text-muted-foreground">Subcategory<input className={fieldClass()} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} /></label>
              <label className="text-sm text-muted-foreground">Base price<input className={fieldClass()} type="number" min="0" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} required /></label>
              <label className="text-sm text-muted-foreground">Default plan<select className={fieldClass()} value={planTypeDefault} onChange={(event) => setPlanTypeDefault(event.target.value as "EMI" | "RENT" | "LEASE")}><option value="EMI">EMI</option><option value="RENT">Rent</option><option value="LEASE">Lease</option></select></label>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {checkboxLabel("Active", active, setActive)}
              {checkboxLabel("EMI", emi, setEmi)}
              {checkboxLabel("Rent", rent, setRent)}
              {checkboxLabel("Lease", lease, setLease)}
              {checkboxLabel("Direct Sale", directSale, setDirectSale)}
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Saving..." : "Save quick edit"}</button></div>
          </form>
        </Drawer>
      ) : null}

      {prepareOpen ? (
        <Drawer title="Prepare inventory profile" onClose={() => setPrepareOpen(false)}>
          <div className="space-y-4">
            <div className="grid gap-2 rounded-xl border border-border bg-card p-3 text-sm">
              <div><span className="text-muted-foreground">Product:</span> <span className="font-semibold">{product.name}</span></div>
              <div><span className="text-muted-foreground">SKU/code:</span> {product.sku || product.product_code || "SKU pending"}</div>
              <div><span className="text-muted-foreground">Unit:</span> {product.unit_of_measure || "PCS"}</div>
              <div><span className="text-muted-foreground">Profile:</span> {product.inventory_profile_id ? `#${product.inventory_profile_id}` : "Not prepared"}</div>
            </div>
            <div className="flex flex-wrap gap-2">{badges.map((badge) => <span key={badge} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">{badge}</span>)}</div>
            {checkboxLabel("Enable stock tracking on profile", trackStock, setTrackStock)}
            <label className="text-sm text-muted-foreground">Opening stock preview<input className={fieldClass()} type="number" min="0" step="0.001" value={openingStock} onChange={(event) => setOpeningStock(event.target.value)} /><span className="mt-1 block text-xs">Quick prepare does not create stock ledger movement. Use Opening Stock workflow after profile creation for non-zero stock.</span></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setPrepareOpen(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" disabled={preparing || product.is_active === false} onClick={() => void submitPrepareInventory()} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{preparing ? "Preparing..." : product.inventory_ready ? "Recheck Inventory Profile" : "Prepare Inventory Profile"}</button></div>
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
