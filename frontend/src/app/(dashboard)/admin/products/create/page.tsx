"use client";
import { formatRupee } from "@/lib/utils/currency";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Upload, X, CheckCircle2, Package, Wrench, Puzzle, Zap, PlusCircle,
  ChevronRight, ArrowRight, Layers, Tag, Star, Home, Truck, ShoppingCart,
} from "lucide-react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import SmartSuggestField from "@/components/forms/SmartSuggestField";
import CatalogSpecificationFields from "@/components/admin/products/CatalogSpecificationFields";
import RelatedProductsSection from "@/components/admin/products/RelatedProductsSection";
import { apiFetch } from "@/lib/api";
import {
  getProductCatalogOptions,
  createProductCategoryMaster,
  createProductSubcategoryMaster,
  type ProductCatalogOptions,
} from "@/services/products";
import { pimService } from "@/services/pim";
import QuickCreateInventoryDrawer from "@/components/inventory/QuickCreateInventoryDrawer";

// ── Types ──────────────────────────────────────────────────────────────────

type CreatedProductResponse = {
  id: number;
  product_code?: string | null;
  name?: string;
  base_price?: string;
  sku?: string | null;
  unit_of_measure?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

type FieldErrors = Partial<Record<
  "product_code" | "name" | "base_price" | "sku" | "unit_of_measure" |
  "category" | "subcategory" | "description" | "hsn_sac_code" | "gst_rate" |
  "image" | "is_emi_enabled" | "is_rent_enabled" | "is_lease_enabled" |
  "catalog_category" | "base_specs",
  string
>>;

type Step = 1 | 2 | 3;

// ── Error helpers ──────────────────────────────────────────────────────────

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to create product.";
  const raw = error.message.trim();
  if (!raw) return "Failed to create product.";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
    if (Array.isArray(parsed.non_field_errors)) return String(parsed.non_field_errors[0]);
    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) return `${field}: ${String(value[0])}`;
      if (typeof value === "string" && value.trim()) return `${field}: ${value}`;
    }
    return raw;
  } catch { return raw; }
}

function parseFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof Error)) return {};
  try {
    const parsed = JSON.parse(error.message.trim()) as Record<string, unknown>;
    const next: FieldErrors = {};
    const pick = (key: keyof FieldErrors) => {
      const value = parsed[key];
      if (Array.isArray(value) && value.length > 0) next[key] = String(value[0]);
      else if (typeof value === "string" && value.trim()) next[key] = value;
    };
    (["product_code","name","base_price","sku","unit_of_measure","category","subcategory",
      "catalog_category","base_specs","description","image","is_emi_enabled","is_rent_enabled","is_lease_enabled",
    ] as (keyof FieldErrors)[]).forEach(pick);
    return next;
  } catch { return {}; }
}

// ── Sub-components ────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function Field({ label, hint, error, required, children }: {
  label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

const INPUT = "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";
const SELECT = `${INPUT} cursor-pointer`;
const TEXTAREA = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60 resize-none";

// Item type card definitions
const ITEM_TYPES = [
  {
    value: "FINISHED_GOOD",
    label: "Finished Good",
    icon: Package,
    desc: "Ready-to-sell product delivered to customer. Supports EMI, rent, lease, direct sale.",
    color: "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20",
    activeColor: "border-blue-500 bg-blue-100 ring-2 ring-blue-400 dark:border-blue-400 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    value: "RAW_MATERIAL",
    label: "Raw Material",
    icon: Wrench,
    desc: "Input material used in production. Inventory-tracked. Not sold directly.",
    color: "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20",
    activeColor: "border-amber-500 bg-amber-100 ring-2 ring-amber-400 dark:border-amber-400 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    value: "ACCESSORY",
    label: "Accessory",
    icon: Puzzle,
    desc: "Sold alongside a main product as an optional add-on item.",
    color: "border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-900/20",
    activeColor: "border-purple-500 bg-purple-100 ring-2 ring-purple-400 dark:border-purple-400 dark:bg-purple-900/40",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    value: "SERVICE",
    label: "Service",
    icon: Zap,
    desc: "Labour or service charge. No physical stock tracking.",
    color: "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20",
    activeColor: "border-green-500 bg-green-100 ring-2 ring-green-400 dark:border-green-400 dark:bg-green-900/40",
    iconColor: "text-green-600 dark:text-green-400",
  },
  {
    value: "ADD_ON",
    label: "Add-on",
    icon: PlusCircle,
    desc: "Optional upgrade bundled with a base product.",
    color: "border-pink-300 bg-pink-50 dark:border-pink-700 dark:bg-pink-900/20",
    activeColor: "border-pink-500 bg-pink-100 ring-2 ring-pink-400 dark:border-pink-400 dark:bg-pink-900/40",
    iconColor: "text-pink-600 dark:text-pink-400",
  },
] as const;

function ItemTypeCards({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ITEM_TYPES.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => !disabled && onChange(t.value)}
            disabled={disabled}
            className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition cursor-pointer ${active ? t.activeColor : t.color} disabled:opacity-60`}
          >
            {active && (
              <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-primary" />
            )}
            <t.icon className={`h-6 w-6 ${t.iconColor}`} />
            <div className="font-semibold text-sm text-foreground">{t.label}</div>
            <div className="text-[11px] text-muted-foreground leading-snug">{t.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

function StepIndicator({ step, steps }: { step: Step; steps: { label: string; desc: string }[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const active = step === n;
        return (
          <div key={s.label} className="flex items-center">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl transition ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-white/20" : done ? "bg-emerald-500 text-white" : "bg-background"}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-semibold leading-none">{s.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{s.desc}</div>
              </div>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

function CapabilityToggle({ label, desc, checked, onChange, disabled }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${checked ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/10" : "border-border bg-background hover:bg-muted/40"}`}>
      <div className={`mt-0.5 h-5 w-9 rounded-full transition-colors relative shrink-0 ${checked ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
        onClick={() => !disabled && onChange(!checked)}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </label>
  );
}

function ImageUploadZone({ preview, onFileChange, onClear, disabled, error }: {
  preview: string | null; onFileChange: (f: File | null) => void;
  onClear: () => void; disabled: boolean; error?: string;
}) {
  if (preview) {
    return (
      <div className="relative overflow-hidden rounded-xl border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Product preview" className="h-72 w-full object-cover" />
        {!disabled && (
          <button type="button" onClick={onClear}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="absolute bottom-2 left-2 rounded-lg bg-black/50 px-2 py-1 text-xs text-white">Product Image</div>
      </div>
    );
  }
  return (
    <label className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition hover:border-primary/50 hover:bg-muted/30 ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} disabled={disabled} className="hidden" />
      <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Click to upload product image</p>
      <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WEBP · max 5 MB</p>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </label>
  );
}

// Blueprint Preview Card — live sidebar
function BlueprintPreview({ name, code, category, subcategory, price, itemType, isEmi, isDirect, isRent, isLease, image }: {
  name: string; code: string; category: string; subcategory: string;
  price: string; itemType: string; isEmi: boolean; isDirect: boolean;
  isRent: boolean; isLease: boolean; image: string | null;
}) {
  const typeInfo = ITEM_TYPES.find((t) => t.value === itemType);
  return (
    <div className="rounded-xl border bg-background overflow-hidden shadow-sm">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-40 w-full object-cover" />
      ) : (
        <div className="h-40 w-full bg-muted/40 flex items-center justify-center">
          {typeInfo ? <typeInfo.icon className={`h-12 w-12 ${typeInfo.iconColor} opacity-30`} /> : <Package className="h-12 w-12 text-muted-foreground/30" />}
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          {typeInfo && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${typeInfo.color}`}>
              <typeInfo.icon className="h-3 w-3" /> {typeInfo.label}
            </span>
          )}
          <h3 className="mt-1.5 font-bold text-base leading-tight">{name || <span className="text-muted-foreground/50 italic text-sm">Product name…</span>}</h3>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">{code || "CODE-0001"}</p>
        </div>
        {(category || subcategory) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" />
            {category}{subcategory ? ` / ${subcategory}` : ""}
          </div>
        )}
        <div className="text-xl font-bold">{price ? formatRupee(price) : <span className="text-sm text-muted-foreground">Price via PIM</span>}</div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { ok: isEmi, label: "EMI", icon: Star },
            { ok: isDirect, label: "Direct", icon: ShoppingCart },
            { ok: isRent, label: "Rent", icon: Home },
            { ok: isLease, label: "Lease", icon: Truck },
          ].map(({ ok, label, icon: Icon }) => ok ? (
            <span key={label} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
              <Icon className="h-2.5 w-2.5" /> {label}
            </span>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

// Auto-generate product code from name
function autoCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.slice(0, 4))
    .join("-") || "";
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AdminProductCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Fields
  const [productCode, setProductCode] = useState("");
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [sku, setSku] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("PCS");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [catalogCategoryId, setCatalogCategoryId] = useState<number | null>(null);
  const [baseSpecs, setBaseSpecs] = useState<Record<string, unknown>>({});
  const [description, setDescription] = useState("");
  const [hsnSacCode, setHsnSacCode] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [itemType, setItemType] = useState("FINISHED_GOOD");
  const [stockType, setStockType] = useState("STOCK_ITEM");
  const [isActive, setIsActive] = useState(true);
  const [isEmiEnabled, setIsEmiEnabled] = useState(true);
  const [isRentEnabled, setIsRentEnabled] = useState(false);
  const [isLeaseEnabled, setIsLeaseEnabled] = useState(false);
  const [isDirectSaleEnabled, setIsDirectSaleEnabled] = useState(true);
  const [syncToPim, setSyncToPim] = useState(true);
  const [planType, setPlanType] = useState<"EMI" | "RENT" | "LEASE">("EMI");
  const [warrantyEnabled, setWarrantyEnabled] = useState(true);
  const [warrantyManufacturing, setWarrantyManufacturing] = useState("12");
  const [warrantyStructural, setWarrantyStructural] = useState("36");
  const [warrantyExtendedMax, setWarrantyExtendedMax] = useState("12");
  const [extendedWarrantyCostPct, setExtendedWarrantyCostPct] = useState("7.50");

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedVideoPreview, setSelectedVideoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedProductResponse | null>(null);
  const [quickCreateType, setQuickCreateType] = useState<"ACCESSORY" | "RAW_MATERIAL" | null>(null);

  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>({
    categories: [], subcategories: [], unit_of_measure_masters: [],
    unit_of_measure_options: ["PCS"], item_type_choices: [], stock_type_choices: [],
  });
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [isCreatingSubcategory, setIsCreatingSubcategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [creatingSubcategory, setCreatingSubcategory] = useState(false);

  useEffect(() => {
    getProductCatalogOptions().then(setCatalogOptions).catch(() => {});
  }, []);

  // Auto-generate product code from name unless operator manually edited it
  useEffect(() => {
    if (!codeManuallyEdited && name) {
      setProductCode(autoCode(name));
    }
  }, [name, codeManuallyEdited]);

  // Image preview URL lifecycle
  useEffect(() => {
    if (!selectedImageFile) { setSelectedImagePreview(null); return; }
    const url = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedImageFile]);

  useEffect(() => {
    if (!selectedVideoFile) { setSelectedVideoPreview(null); return; }
    const url = URL.createObjectURL(selectedVideoFile);
    setSelectedVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedVideoFile]);

  // Derived
  const trimmedProductCode = productCode.trim().toUpperCase();
  const trimmedName = name.trim();
  const trimmedSku = sku.trim().toUpperCase();
  const trimmedUnitOfMeasure = unitOfMeasure.trim().toUpperCase() || "PCS";
  const trimmedCategory = category.trim();
  const trimmedSubcategory = subcategory.trim();
  const trimmedDescription = description.trim();
  const trimmedBasePrice = basePrice.trim();

  const suggestedSubcategories = useMemo(() =>
    catalogOptions.subcategories.filter((s) =>
      !trimmedCategory || s.category_name.toLowerCase() === trimmedCategory.toLowerCase()
    ), [catalogOptions.subcategories, trimmedCategory]);

  const selectedCategoryMaster = useMemo(() =>
    catalogOptions.categories.find((c) => c.name.toLowerCase() === trimmedCategory.toLowerCase()) ?? null,
    [catalogOptions.categories, trimmedCategory]);

  const selectedSubcategoryMaster = useMemo(() =>
    suggestedSubcategories.find((s) => s.name.toLowerCase() === trimmedSubcategory.toLowerCase()) ?? null,
    [suggestedSubcategories, trimmedSubcategory]);

  const selectedUnitMaster = useMemo(() =>
    catalogOptions.unit_of_measure_masters.find((u) => u.code.toLowerCase() === trimmedUnitOfMeasure.toLowerCase()) ?? null,
    [catalogOptions.unit_of_measure_masters, trimmedUnitOfMeasure]);

  const isSaleItem = ["FINISHED_GOOD", "ADD_ON", "ACCESSORY"].includes(itemType);
  const isEmiEligible = itemType === "FINISHED_GOOD";
  const canSave = trimmedProductCode.length > 0 && trimmedName.length > 0;

  function effectiveDefault(): "EMI" | "RENT" | "LEASE" {
    if (planType === "RENT" && isRentEnabled) return "RENT";
    if (planType === "LEASE" && isLeaseEnabled) return "LEASE";
    if (isEmiEnabled) return "EMI";
    if (isRentEnabled) return "RENT";
    return "LEASE";
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      await createProductCategoryMaster({ name: newCategoryName.trim(), is_active: true });
      const payload = await getProductCatalogOptions();
      setCatalogOptions(payload);
      setCategory(newCategoryName.trim());
      setSubcategory("");
      setNewCategoryName("");
      setIsCreatingCategory(false);
    } catch (err: unknown) {
      setError((err as Error)?.message || "Failed to create category.");
    } finally { setCreatingCategory(false); }
  }

  async function handleCreateSubcategory() {
    if (!newSubcategoryName.trim() || !selectedCategoryMaster) return;
    setCreatingSubcategory(true);
    try {
      await createProductSubcategoryMaster({ category: selectedCategoryMaster.id, name: newSubcategoryName.trim(), is_active: true });
      const payload = await getProductCatalogOptions();
      setCatalogOptions(payload);
      setSubcategory(newSubcategoryName.trim());
      setNewSubcategoryName("");
      setIsCreatingSubcategory(false);
    } catch (err: unknown) {
      setError((err as Error)?.message || "Failed to create subcategory.");
    } finally { setCreatingSubcategory(false); }
  }

  async function handleSave() {
    setError(null);
    if (!canSave) return;
    setSaving(true);
    setLoadingLabel("Creating product blueprint…");
    try {
      const fd = new FormData();
      fd.append("product_code", trimmedProductCode);
      fd.append("name", trimmedName);
      if (brand.trim()) fd.append("brand", brand.trim());
      fd.append("base_price", trimmedBasePrice || "0");
      fd.append("sku", trimmedSku);
      if (selectedUnitMaster) fd.append("unit_of_measure_master", String(selectedUnitMaster.id));
      fd.append("unit_of_measure", trimmedUnitOfMeasure);
      if (selectedCategoryMaster) fd.append("category_master", String(selectedCategoryMaster.id));
      fd.append("category", trimmedCategory);
      if (selectedSubcategoryMaster) fd.append("subcategory_master", String(selectedSubcategoryMaster.id));
      fd.append("subcategory", trimmedSubcategory);
      if (catalogCategoryId) fd.append("catalog_category", String(catalogCategoryId));
      fd.append("base_specs", JSON.stringify(baseSpecs));
      fd.append("description", trimmedDescription);
      if (hsnSacCode.trim()) fd.append("hsn_sac_code", hsnSacCode.trim().toUpperCase());
      if (gstRate.trim()) fd.append("gst_rate", gstRate.trim());
      fd.append("item_type", itemType);
      fd.append("stock_type", stockType);
      fd.append("is_active", String(isActive));
      fd.append("is_emi_enabled", String(isEmiEligible ? isEmiEnabled : false));
      fd.append("is_rent_enabled", String(isEmiEligible ? isRentEnabled : false));
      fd.append("is_lease_enabled", String(isEmiEligible ? isLeaseEnabled : false));
      fd.append("is_direct_sale_enabled", String(isSaleItem ? isDirectSaleEnabled : false));
      fd.append("plan_type_default", effectiveDefault());
      fd.append("warranty_enabled", String(warrantyEnabled));
      if (warrantyEnabled) {
        fd.append("warranty_months_manufacturing", warrantyManufacturing);
        fd.append("warranty_months_structural", warrantyStructural);
        fd.append("warranty_months_extended_max", warrantyExtendedMax);
        fd.append("extended_warranty_cost_percentage", extendedWarrantyCostPct);
      }
      if (selectedVideoFile) fd.append("video", selectedVideoFile);
      if (selectedImageFile) fd.append("image", selectedImageFile);

      const payload = await apiFetch<CreatedProductResponse>("/admin/products/", { method: "POST", body: fd });

      if (syncToPim) {
        setLoadingLabel("Syncing to PIM catalog…");
        try { await pimService.syncFromRegister({ product_ids: [payload.id] }); } catch { /* non-fatal */ }
      }

      setCreated(payload);
      setFieldErrors({});
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
      setLoadingLabel(null);
    }
  }

  // ── Render: Success ───────────────────────────────────────────────────────
  if (created) {
    return (
      <ERPPageShell
        eyebrow="Products"
        title="Blueprint Created"
        subtitle="Product master created successfully. Add PIM attributes and publish to unlock all operations."
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products", href: "/admin/products" }, { label: "Created" }]}
        actions={[{ href: "/admin/products", label: "Back to Register", variant: "secondary" }]}
        stats={[
          { label: "Product ID", value: `#${created.id}` },
          { label: "Code", value: created.product_code || trimmedProductCode },
          { label: "Base Price", value: formatRupee(created.base_price || trimmedBasePrice || "0"), tone: "success" },
          { label: "PIM Sync", value: syncToPim ? "Synced" : "Skipped", tone: syncToPim ? "success" : undefined },
        ]}
        statusBadge={{ label: "Product Created", tone: "success" }}
      >
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/10 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold">{created.name || trimmedName}</h3>
                <p className="text-sm text-muted-foreground font-mono">{created.product_code || trimmedProductCode}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              The product blueprint is ready. Next: open the Blueprint to add PIM attribute specs and variant SKUs, then publish to enable subscriptions and sales operations.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href={`/admin/products/${created.id}`}
              className="flex items-center justify-between rounded-xl border-2 border-primary bg-primary/5 p-4 hover:bg-primary/10 transition group">
              <div>
                <div className="font-semibold text-sm">Open Blueprint</div>
                <div className="text-xs text-muted-foreground mt-0.5">View detail, add PIM specs, operations</div>
              </div>
              <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link href={`/admin/pim/products`}
              className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted transition group">
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5"><Layers className="h-4 w-4 text-violet-500" /> PIM Editor</div>
                <div className="text-xs text-muted-foreground mt-0.5">Add attributes, variants, publish</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link href={`/admin/subscriptions/advance-emi/create?product=${created.id}`}
              className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted transition group">
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-500" /> Create Subscription</div>
                <div className="text-xs text-muted-foreground mt-0.5">Start EMI or advance EMI contract</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link href="/admin/products/create"
              className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted transition group">
              <div>
                <div className="font-semibold text-sm">Create Another</div>
                <div className="text-xs text-muted-foreground mt-0.5">Add another product blueprint</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-bold mb-4">Attach Accessories & Raw Materials</h3>
            <div className="rounded-xl border bg-background p-6">
              <RelatedProductsSection productId={created.id} productName={created.name || trimmedName} saving={false} />
            </div>
          </div>
        </div>
      </ERPPageShell>
    );
  }

  // ── Render: Form ──────────────────────────────────────────────────────────
  const STEPS = [
    { label: "Blueprint Type", desc: "What are you making?" },
    { label: "Identity & Catalog", desc: "Name, code, category" },
    { label: "Operations & Media", desc: "Modes, price, image" },
  ];

  return (
    <ERPPageShell
      eyebrow="Products"
      title="Create Product Blueprint"
      subtitle="Define the product master. PIM attributes and variant SKUs are added after creation."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Products", href: "/admin/products" },
        { label: "Create Blueprint" },
      ]}
      actions={[{ href: "/admin/products", label: "← Register", variant: "secondary" }]}
      stats={[
        { label: "Step", value: `${step} of 3` },
        { label: "Code", value: trimmedProductCode || "—" },
        { label: "Item Type", value: ITEM_TYPES.find((t) => t.value === itemType)?.label ?? itemType },
        { label: "Base Price", value: basePrice ? formatRupee(basePrice) : "Via PIM" },
      ]}
      statusBadge={{ label: "New Blueprint", tone: "info" }}
    >
      <div className="space-y-6">
        {/* Step indicator */}
        <StepIndicator step={step} steps={STEPS} />

        <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
          {/* ── Left: form steps ─────────────────────────────────────────── */}
          <div className="space-y-6 min-w-0">

            {/* ── STEP 1: Type ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="rounded-xl border bg-background p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold">What type of product are you creating?</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      The type controls which operations (EMI, inventory tracking, direct sale) are available.
                    </p>
                  </div>
                  <ItemTypeCards value={itemType} onChange={(v) => { setItemType(v); setError(null); }} disabled={saving} />
                </div>

                <div className="rounded-xl border bg-background p-6 space-y-4">
                  <h3 className="text-base font-semibold">Stock behaviour</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { value: "STOCK_ITEM", label: "Stock Item", desc: "Kept in warehouse. Tracked by inventory.", color: "border-green-300 bg-green-50 dark:bg-green-900/10" },
                      { value: "MADE_TO_ORDER", label: "Made to Order", desc: "Manufactured after order is placed.", color: "border-orange-300 bg-orange-50 dark:bg-orange-900/10" },
                      { value: "NON_STOCK", label: "Non-Stock", desc: "Services or items not physically tracked.", color: "border-gray-200 bg-gray-50 dark:bg-gray-900/10" },
                    ].map((s) => (
                      <button key={s.value} type="button"
                        onClick={() => setStockType(s.value)}
                        className={`rounded-xl border p-4 text-left transition ${stockType === s.value ? `${s.color} ring-2 ring-primary` : "border-border hover:bg-muted/40"}`}>
                        {stockType === s.value && <CheckCircle2 className="h-4 w-4 text-primary mb-2" />}
                        <div className="font-semibold text-sm">{s.label}</div>
                        <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Next: Identity & Catalog <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Identity & Catalog ── */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="rounded-xl border bg-background p-6 space-y-5">
                  <h3 className="text-base font-semibold">Product identity</h3>

                  <Field label="Product Name" required error={fieldErrors.name}>
                    <input className={INPUT} value={name} disabled={saving} placeholder="e.g. Sagwan King Size Bed"
                      onChange={(e) => { setName(e.target.value); setFieldErrors((f) => ({ ...f, name: undefined })); }} />
                  </Field>

                  <Field label="Product Code" required hint="Auto-generated from name — editable" error={fieldErrors.product_code}>
                    <div className="relative">
                      <input className={`${INPUT} font-mono uppercase pr-24`} value={productCode} disabled={saving}
                        placeholder="e.g. SAGWAN-KING-BED"
                        onChange={(e) => {
                          setProductCode(e.target.value.toUpperCase());
                          setCodeManuallyEdited(true);
                          setFieldErrors((f) => ({ ...f, product_code: undefined }));
                        }} />
                      {codeManuallyEdited && (
                        <button type="button" onClick={() => { setCodeManuallyEdited(false); setProductCode(autoCode(name)); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline px-2">
                          Reset
                        </button>
                      )}
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Brand / Manufacturer" hint="Optional — e.g. Godrej, Nilkamal">
                      <input className={INPUT} value={brand} disabled={saving} placeholder="e.g. Subidha"
                        onChange={(e) => setBrand(e.target.value)} />
                    </Field>
                    <Field label="SKU" hint="Optional — leave blank to set via PIM" error={fieldErrors.sku}>
                      <input className={`${INPUT} font-mono uppercase`} value={sku} disabled={saving} placeholder="e.g. BED-KING-001"
                        onChange={(e) => setSku(e.target.value.toUpperCase())} />
                    </Field>
                  </div>

                  <Field label="Unit of Measure">
                    <select className={SELECT} value={unitOfMeasure} disabled={saving}
                      onChange={(e) => setUnitOfMeasure(e.target.value.toUpperCase())}>
                      {catalogOptions.unit_of_measure_masters.length > 0
                        ? catalogOptions.unit_of_measure_masters.map((u) => <option key={u.id} value={u.code}>{u.code} · {u.name}</option>)
                        : catalogOptions.unit_of_measure_options.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="rounded-xl border bg-background p-6 space-y-5">
                  <h3 className="text-base font-semibold">Catalog classification</h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Category */}
                    <Field label="Category" error={fieldErrors.category}>
                      <div className="space-y-2">
                        {isCreatingCategory ? (
                          <div className="flex gap-2">
                            <input autoFocus className={`${INPUT} flex-1`} value={newCategoryName} placeholder="New category name"
                              disabled={creatingCategory || saving} onChange={(e) => setNewCategoryName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && !creatingCategory && void handleCreateCategory()} />
                            <button type="button" disabled={!newCategoryName.trim() || creatingCategory}
                              onClick={() => void handleCreateCategory()}
                              className="rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                              {creatingCategory ? "…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setIsCreatingCategory(false)} className="rounded-xl border px-3 text-sm hover:bg-muted"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <select className={`${SELECT} flex-1`} value={category} disabled={saving}
                              onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}>
                              <option value="">Select category</option>
                              {catalogOptions.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <button type="button" disabled={saving} onClick={() => setIsCreatingCategory(true)}
                              className="rounded-xl border px-3 text-xs font-medium hover:bg-muted shrink-0">+ New</button>
                          </div>
                        )}
                      </div>
                    </Field>

                    {/* Subcategory */}
                    <Field label="Subcategory" error={fieldErrors.subcategory}>
                      <div className="space-y-2">
                        {isCreatingSubcategory ? (
                          <div className="flex gap-2">
                            <input autoFocus className={`${INPUT} flex-1`} value={newSubcategoryName} placeholder="New subcategory"
                              disabled={creatingSubcategory || saving} onChange={(e) => setNewSubcategoryName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && !creatingSubcategory && void handleCreateSubcategory()} />
                            <button type="button" disabled={!newSubcategoryName.trim() || creatingSubcategory}
                              onClick={() => void handleCreateSubcategory()}
                              className="rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                              {creatingSubcategory ? "…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setIsCreatingSubcategory(false)} className="rounded-xl border px-3 text-sm hover:bg-muted"><X className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <select className={`${SELECT} flex-1`} value={subcategory} disabled={saving || !category}
                              onChange={(e) => setSubcategory(e.target.value)}>
                              <option value="">Select subcategory</option>
                              {suggestedSubcategories.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                            <button type="button" disabled={saving || !selectedCategoryMaster} onClick={() => setIsCreatingSubcategory(true)}
                              className="rounded-xl border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 shrink-0">+ New</button>
                          </div>
                        )}
                      </div>
                    </Field>
                  </div>

                  <Field label="Description" hint="Product description shown in PIM and contracts">
                    <textarea className={TEXTAREA} rows={4} value={description} disabled={saving}
                      placeholder="Describe the product for catalog, sales, and customer reference…"
                      onChange={(e) => setDescription(e.target.value)} />
                  </Field>

                  <CatalogSpecificationFields categoryId={catalogCategoryId} values={baseSpecs}
                    onCategoryChange={setCatalogCategoryId} onValuesChange={setBaseSpecs}
                    disabled={saving} error={fieldErrors.base_specs || fieldErrors.catalog_category} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <SmartSuggestField id="product-hsn" label="HSN / SAC Code" value={hsnSacCode}
                      onChange={(v) => setHsnSacCode(v)}
                      sourceText={[name, category, subcategory, description].filter(Boolean).join(" ")}
                      fieldKey="product.hsn" placeholder="e.g. 9403" disabled={saving}
                      error={fieldErrors.hsn_sac_code}
                      onAccept={(s) => { if (s.gst_rate != null) setGstRate(String(s.gst_rate)); }} />
                    <Field label="GST Rate (%)" hint="Auto-filled from HSN suggestion">
                      <input type="number" className={INPUT} value={gstRate} min="0" step="0.01" disabled={saving}
                        placeholder="e.g. 18" onChange={(e) => setGstRate(e.target.value)} />
                    </Field>
                  </div>
                </div>

                <div className="flex justify-between">
                  <button type="button" onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                    ← Back
                  </button>
                  <button type="button" onClick={() => setStep(3)} disabled={!trimmedName}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    Next: Operations & Media <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Operations & Media ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="rounded-xl border bg-background p-6 space-y-5">
                  <h3 className="text-base font-semibold">Pricing</h3>
                  <Field label="Base Price (₹)" hint="Optional — variant pricing can be set via PIM. Enter now for single-SKU products." error={fieldErrors.base_price}>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">₹</span>
                      <input type="number" min="0" step="0.01" className={`${INPUT} pl-7`}
                        value={basePrice} disabled={saving} placeholder="0.00"
                        onChange={(e) => { setBasePrice(e.target.value); setFieldErrors((f) => ({ ...f, base_price: undefined })); }} />
                    </div>
                    {basePrice && <p className="text-sm font-semibold text-primary mt-1">{formatRupee(basePrice)}</p>}
                  </Field>
                </div>

                {isSaleItem && (
                  <div className="rounded-xl border bg-background p-6 space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">Sales & subscription capabilities</h3>
                      <p className="text-sm text-muted-foreground mt-1">Choose which operations this product supports. These can be changed later.</p>
                    </div>
                    {isEmiEligible && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <CapabilityToggle label="EMI / Subscription" desc="Eligible for monthly EMI subscription plans." checked={isEmiEnabled} onChange={setIsEmiEnabled} disabled={saving} />
                        <CapabilityToggle label="Rent" desc="Available for rental contracts." checked={isRentEnabled} onChange={setIsRentEnabled} disabled={saving} />
                        <CapabilityToggle label="Lease" desc="Eligible for long-term lease contracts." checked={isLeaseEnabled} onChange={setIsLeaseEnabled} disabled={saving} />
                        <CapabilityToggle label="Direct Sale" desc="One-time billing without EMI." checked={isDirectSaleEnabled} onChange={setIsDirectSaleEnabled} disabled={saving} />
                      </div>
                    )}
                    {!isEmiEligible && (
                      <CapabilityToggle label="Direct Sale" desc="One-time billing without EMI." checked={isDirectSaleEnabled} onChange={setIsDirectSaleEnabled} disabled={saving} />
                    )}
                    <Field label="Default plan type">
                      <select className={SELECT} value={planType} disabled={saving}
                        onChange={(e) => setPlanType(e.target.value as "EMI" | "RENT" | "LEASE")}>
                        <option value="EMI">EMI</option>
                        <option value="RENT">Rent</option>
                        <option value="LEASE">Lease</option>
                      </select>
                    </Field>
                  </div>
                )}

                {(itemType === "FINISHED_GOOD") && (
                  <div className="rounded-xl border bg-background p-6 space-y-4">
                    <CapabilityToggle label="Warranty coverage" desc="Enable manufacturing, structural, and extended warranty for this product." checked={warrantyEnabled} onChange={setWarrantyEnabled} disabled={saving} />
                    {warrantyEnabled && (
                      <div className="grid gap-4 sm:grid-cols-2 pt-2">
                        {[
                          { label: "Manufacturing warranty (months)", value: warrantyManufacturing, onChange: setWarrantyManufacturing },
                          { label: "Structural warranty (months)", value: warrantyStructural, onChange: setWarrantyStructural },
                          { label: "Max extended warranty (months)", value: warrantyExtendedMax, onChange: setWarrantyExtendedMax },
                          { label: "Extended warranty cost (%)", value: extendedWarrantyCostPct, onChange: setExtendedWarrantyCostPct },
                        ].map(({ label, value, onChange }) => (
                          <Field key={label} label={label}>
                            <input type="number" min="0" step="0.01" className={INPUT} value={value} disabled={saving} onChange={(e) => onChange(e.target.value)} />
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border bg-background p-6 space-y-4">
                  <h3 className="text-base font-semibold">Product image</h3>
                  <ImageUploadZone preview={selectedImagePreview} onFileChange={setSelectedImageFile}
                    onClear={() => setSelectedImageFile(null)} disabled={saving} error={fieldErrors.image} />
                </div>

                <div className="rounded-xl border bg-background p-6 space-y-4">
                  <h3 className="text-base font-semibold">Product video <span className="text-sm font-normal text-muted-foreground">(optional)</span></h3>
                  {selectedVideoPreview ? (
                    <div className="relative rounded-xl overflow-hidden border">
                      <video src={selectedVideoPreview} controls className="h-64 w-full object-cover" />
                      <button type="button" onClick={() => setSelectedVideoFile(null)}
                        className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <label className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition hover:border-primary/50 hover:bg-muted/30 ${saving ? "opacity-60 cursor-not-allowed" : ""}`}>
                      <input type="file" accept="video/mp4,video/webm" disabled={saving} className="hidden"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > 10 * 1024 * 1024) { alert("Max 10 MB"); return; }
                          setSelectedVideoFile(f);
                        }} />
                      <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                      <p className="text-sm font-medium">Upload short video</p>
                      <p className="text-xs text-muted-foreground mt-1">MP4 or WebM · max 10 MB</p>
                    </label>
                  )}
                </div>

                <div className="rounded-xl border bg-background p-6 space-y-3">
                  <h3 className="text-base font-semibold">Blueprint settings</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CapabilityToggle label="Sync to PIM catalog" desc="Auto-create a PIM entry for attributes and variant SKUs after save." checked={syncToPim} onChange={setSyncToPim} disabled={saving} />
                    <CapabilityToggle label="Product Active" desc="Inactive products stay in master data but are excluded from new subscriptions." checked={isActive} onChange={setIsActive} disabled={saving} />
                  </div>
                </div>

                {loadingLabel && <ERPLoadingState label={loadingLabel} />}
                {error && <ERPErrorState title="Unable to create product" description={error} onRetry={canSave ? handleSave : undefined} />}

                <div className="flex justify-between">
                  <button type="button" onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                    ← Back
                  </button>
                  <div className="flex gap-3">
                    <Link href="/admin/products" className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                      Cancel
                    </Link>
                    <button type="button" onClick={() => void handleSave()} disabled={saving || !canSave}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                      {saving ? "Creating…" : "Create Blueprint"}
                      {!saving && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Quick-create shortcuts */}
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-3">Quick-add companion items without leaving this page:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setQuickCreateType("ACCESSORY")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">
                      <Puzzle className="h-3.5 w-3.5" /> + Accessory
                    </button>
                    <button type="button" onClick={() => setQuickCreateType("RAW_MATERIAL")}
                      className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted">
                      <Wrench className="h-3.5 w-3.5" /> + Raw Material
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Live Blueprint Preview ────────────────────────────── */}
          <div className="space-y-4">
            <div className="sticky top-24 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Blueprint Preview</p>
              <BlueprintPreview
                name={trimmedName}
                code={trimmedProductCode}
                category={trimmedCategory}
                subcategory={trimmedSubcategory}
                price={trimmedBasePrice}
                itemType={itemType}
                isEmi={isEmiEligible ? isEmiEnabled : false}
                isDirect={isSaleItem ? isDirectSaleEnabled : false}
                isRent={isEmiEligible ? isRentEnabled : false}
                isLease={isEmiEligible ? isLeaseEnabled : false}
                image={selectedImagePreview}
              />

              {/* Step progress dots */}
              <div className="flex justify-center gap-2 pt-2">
                {([1, 2, 3] as Step[]).map((s) => (
                  <button key={s} type="button" onClick={() => step > s && setStep(s)}
                    className={`h-2 rounded-full transition-all ${step === s ? "w-6 bg-primary" : step > s ? "w-2 bg-emerald-400" : "w-2 bg-muted-foreground/20"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {quickCreateType && (
        <QuickCreateInventoryDrawer open={!!quickCreateType} itemType={quickCreateType}
          onClose={() => setQuickCreateType(null)}
          onCreated={(result) => { setQuickCreateType(null); alert(`Created: ${result.name || "Unknown"} (${result.product_code})`); }} />
      )}
    </ERPPageShell>
  );
}
