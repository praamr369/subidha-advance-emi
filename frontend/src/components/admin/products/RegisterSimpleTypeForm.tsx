"use client";
/**
 * Full-workflow register forms for Raw Material, Accessory, and Service types.
 * Each type has type-specific sections — only the fields that matter for that type.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Save, Info, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Package, Wrench, Tag, Puzzle,
} from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { z } from "zod";

type ProductType = "RAW_MATERIAL" | "ACCESSORY" | "SERVICE";

const TYPE_META = {
  RAW_MATERIAL: {
    label: "Raw Material",
    icon: <Wrench className="h-5 w-5" />,
    eyebrow: "Raw Materials",
    color: "amber",
    hint: "Raw materials are purchased inputs used in manufacturing. They are tracked in inventory, used in Bill of Materials (BOM), and costed into finished goods. Not sold to customers.",
    codePlaceholder: "RM-TEAK-001",
    namePlaceholder: "Teak Wood — Grade A",
    showPrice: false,
    showCost: true,
    showSku: true,
    showHsn: true,
    showSac: false,
    unitOptions: ["KG", "G", "L", "ML", "Metres", "Sq Ft", "Sq Metres", "Pcs", "Bundle", "Roll", "Sheet", "Nos", "Box"],
    extraSections: ["procurement", "quality"] as const,
  },
  ACCESSORY: {
    label: "Accessory",
    icon: <Puzzle className="h-5 w-5" />,
    eyebrow: "Accessories",
    color: "indigo",
    hint: "Accessories are add-on items sold alongside or separately from finished goods. They are stocked in inventory and available for direct sale. Set up PIM for catalog listing.",
    codePlaceholder: "ACC-BRACKET-001",
    namePlaceholder: "Wall Mount Bracket — Heavy Duty",
    showPrice: true,
    showCost: true,
    showSku: true,
    showHsn: true,
    showSac: false,
    unitOptions: ["Pcs", "Set", "Pair", "Pack", "Box"],
    extraSections: ["sale"] as const,
  },
  SERVICE: {
    label: "Service",
    icon: <Tag className="h-5 w-5" />,
    eyebrow: "Services",
    color: "teal",
    hint: "Services are non-stock offerings (installation, delivery, AMC) billed to customers. No inventory is tracked. Use SAC code for GST classification. Multiple rate tiers can be defined.",
    codePlaceholder: "SVC-INSTALL-001",
    namePlaceholder: "Assembly & Installation Service",
    showPrice: true,
    showCost: false,
    showSku: false,
    showHsn: false,
    showSac: true,
    unitOptions: ["Per Hour", "Per Visit", "Per Job", "Per Day", "Per Item", "Per Sq Ft", "Fixed"],
    extraSections: ["service-tiers", "terms"] as const,
  },
} as const;

const GST_RATES = ["0", "5", "12", "18", "28"];
const QUALITY_GRADES = ["A+", "A", "B+", "B", "C", "Standard", "Premium", "Industrial"];
const STOCK_TYPES = [
  { value: "STOCK_ITEM", label: "Stock Item" },
  { value: "LOT_TRACKED", label: "Lot Tracked" },
  { value: "MAKE_TO_ORDER", label: "Make to Order" },
];

const schema = z.object({
  product_code: z.string().min(2, "Code required"),
  name: z.string().min(2, "Name required"),
  unit_of_measure: z.string().min(1, "Unit required"),
});

interface ServiceTier {
  label: string;
  rate: string;
  unit: string;
}

interface RegisterProduct {
  id: number;
  product_code: string;
  name: string;
  description?: string;
  base_price?: string;
  cost_price?: string;
  sku?: string;
  unit_of_measure?: string;
  hsn_sac_code?: string;
  gst_rate?: string;
  is_active?: boolean;
  item_type?: string;
  stock_type?: string;
}

interface Props {
  productType: ProductType;
  productId?: number;
}

function CollapsibleSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-muted/30 transition"
      >
        <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{title}</h3>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  );
}

export default function RegisterSimpleTypeForm({ productType, productId }: Props) {
  const router = useRouter();
  const meta = TYPE_META[productType];
  const isEdit = Boolean(productId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Core fields
  const [form, setForm] = useState<{
    product_code: string; name: string; description: string;
    base_price: string; cost_price: string; sku: string;
    unit_of_measure: string; hsn_sac_code: string; gst_rate: string;
    is_active: boolean; stock_type: string;
  }>({
    product_code: "",
    name: "",
    description: "",
    base_price: "",
    cost_price: "",
    sku: "",
    unit_of_measure: meta.unitOptions[0] as string,
    hsn_sac_code: "",
    gst_rate: "18",
    is_active: true,
    stock_type: "STOCK_ITEM",
  });

  // Raw material extra fields
  const [qualityGrade, setQualityGrade] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [minOrderQty, setMinOrderQty] = useState("");
  const [storageConditions, setStorageConditions] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");

  // Service extra fields
  const [serviceTiers, setServiceTiers] = useState<ServiceTier[]>([
    { label: "Standard", rate: "", unit: meta.unitOptions[0] as string },
  ]);
  const [serviceScope, setServiceScope] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const [termsConditions, setTermsConditions] = useState("");

  const typeSlug = productType === "RAW_MATERIAL" ? "raw-materials"
    : productType === "SERVICE" ? "services" : "accessories";

  useEffect(() => {
    if (isEdit && productId) {
      apiFetch<RegisterProduct>(`/api/v1/admin/products/${productId}/`)
        .then((p) => {
          setForm({
            product_code: p.product_code || "",
            name: p.name || "",
            description: p.description || "",
            base_price: p.base_price || "",
            cost_price: p.cost_price || "",
            sku: p.sku || "",
            unit_of_measure: p.unit_of_measure || meta.unitOptions[0],
            hsn_sac_code: p.hsn_sac_code || "",
            gst_rate: p.gst_rate || "18",
            is_active: p.is_active !== false,
            stock_type: p.stock_type || "STOCK_ITEM",
          });
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isEdit, productId, meta.unitOptions]);

  const set = (field: string, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach((err) => { if (err.path[0]) errs[String(err.path[0])] = err.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        product_code: form.product_code,
        name: form.name,
        description: form.description,
        base_price: form.base_price || "0",
        unit_of_measure: form.unit_of_measure,
        hsn_sac_code: form.hsn_sac_code,
        gst_rate: form.gst_rate,
        is_active: form.is_active,
        item_type: productType,
        is_emi_enabled: false,
        is_rent_enabled: false,
        is_lease_enabled: false,
        is_direct_sale_enabled: productType === "ACCESSORY",
      };
      if (meta.showSku) payload.sku = form.sku;
      if (meta.showCost) payload.cost_price = form.cost_price || undefined;
      if (productType === "RAW_MATERIAL") {
        payload.stock_type = form.stock_type;
        payload.notes = [
          qualityGrade && `Quality Grade: ${qualityGrade}`,
          leadTimeDays && `Lead Time: ${leadTimeDays} days`,
          reorderLevel && `Reorder Level: ${reorderLevel} ${form.unit_of_measure}`,
          minOrderQty && `Min Order Qty: ${minOrderQty}`,
          storageConditions && `Storage: ${storageConditions}`,
          supplierNotes && `Supplier Notes: ${supplierNotes}`,
        ].filter(Boolean).join(" | ");
      }
      if (productType === "SERVICE") {
        payload.notes = [
          serviceScope && `Scope: ${serviceScope}`,
          estimatedDuration && `Estimated Duration: ${estimatedDuration}`,
          warrantyTerms && `Warranty Terms: ${warrantyTerms}`,
          termsConditions && `Terms: ${termsConditions}`,
          serviceTiers.length > 1 && `Tiers: ${serviceTiers.map(t => `${t.label}=₹${t.rate}/${t.unit}`).join(", ")}`,
        ].filter(Boolean).join(" | ");
      }

      if (isEdit && productId) {
        await apiFetch(`/api/v1/admin/products/${productId}/`, { method: "PATCH", body: payload });
        setToast({ type: "success", msg: "Saved successfully" });
      } else {
        const data = await apiFetch<{ id: number }>("/api/v1/admin/products/", { method: "POST", body: payload });
        router.push(`/admin/products/${typeSlug}/${data.id}/edit`);
      }
    } catch {
      setToast({ type: "error", msg: "Save failed — check required fields." });
    } finally {
      setSaving(false);
    }
  }

  const bannerColors: Record<string, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/10 dark:border-amber-800 dark:text-amber-300",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-900/10 dark:border-indigo-800 dark:text-indigo-300",
    teal: "bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-900/10 dark:border-teal-800 dark:text-teal-300",
  };

  if (loading) return <ERPLoadingState label="Loading…" />;

  return (
    <ERPPageShell
      eyebrow={`Products · ${meta.eyebrow}`}
      title={isEdit ? form.name || meta.label : `New ${meta.label}`}
      subtitle={isEdit ? form.product_code : `Register a new ${meta.label.toLowerCase()} in the product master`}
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Products", href: ROUTES.admin.products },
        { label: meta.eyebrow, href: `/admin/products/${typeSlug}` },
        { label: isEdit ? (form.name || `#${productId}`) : "New" },
      ]}
      statusBadge={{ label: meta.label, tone: "info" as const }}
    >
      {toast && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {toast.msg}
        </div>
      )}

      <div className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${bannerColors[meta.color]}`}>
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{meta.hint}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Identity ── */}
        <CollapsibleSection title="Identity">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-meta-label-code" className="block text-sm font-medium mb-1">{meta.label} Code <span className="text-destructive">*</span></label>
              <input id="f-meta-label-code"
                value={form.product_code}
                onChange={(e) => set("product_code", e.target.value)}
                placeholder={meta.codePlaceholder}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              {errors.product_code && <p className="text-xs text-destructive mt-1">{errors.product_code}</p>}
            </div>
            <div>
              <label htmlFor="f-name" className="block text-sm font-medium mb-1">Name <span className="text-destructive">*</span></label>
              <input id="f-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={meta.namePlaceholder}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {meta.showSku && (
              <div>
                <label htmlFor="f-sku-barcode" className="block text-sm font-medium mb-1">SKU / Barcode</label>
                <input id="f-sku-barcode"
                  value={form.sku}
                  onChange={(e) => set("sku", e.target.value)}
                  placeholder="Optional SKU or barcode"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
            <div>
              <label htmlFor="f-producttype-service-billing-unit-unit-of" className="block text-sm font-medium mb-1">
                {productType === "SERVICE" ? "Billing Unit" : "Unit of Measure"} <span className="text-destructive">*</span>
              </label>
              <select id="f-producttype-service-billing-unit-unit-of"
                value={form.unit_of_measure}
                onChange={(e) => set("unit_of_measure", e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {meta.unitOptions.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="f-description" className="block text-sm font-medium mb-1">Description</label>
            <textarea id="f-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder={productType === "RAW_MATERIAL"
                ? "Material specifications, origin, grade details…"
                : productType === "SERVICE"
                ? "What this service includes, scope of work, deliverables…"
                : "Product description, compatibility, usage…"}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </CollapsibleSection>

        {/* ── Tax Classification ── */}
        <CollapsibleSection title="Tax Classification">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-meta-showsac-sac-code-hsn-code" className="block text-sm font-medium mb-1">{meta.showSac ? "SAC Code" : "HSN Code"}</label>
              <input id="f-meta-showsac-sac-code-hsn-code"
                value={form.hsn_sac_code}
                onChange={(e) => set("hsn_sac_code", e.target.value)}
                placeholder={meta.showSac ? "e.g. 9987" : "e.g. 4409"}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {meta.showSac ? "Service Accounting Code for GST" : "Harmonised System of Nomenclature code"}
              </p>
            </div>
            <div>
              <label htmlFor="f-gst-rate" className="block text-sm font-medium mb-1">GST Rate (%)</label>
              <select id="f-gst-rate"
                value={form.gst_rate}
                onChange={(e) => set("gst_rate", e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Pricing / Cost ── */}
        {(meta.showPrice || meta.showCost) && (
          <CollapsibleSection title={productType === "RAW_MATERIAL" ? "Procurement Cost" : "Pricing"}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meta.showPrice && (
                <div>
                  <label htmlFor="f-producttype-service-base-service-rate-sa" className="block text-sm font-medium mb-1">
                    {productType === "SERVICE" ? "Base Service Rate (₹)" : "Sale Price (₹)"}
                  </label>
                  <input id="f-producttype-service-base-service-rate-sa"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.base_price}
                    onChange={(e) => set("base_price", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  {productType === "SERVICE" && (
                    <p className="text-xs text-muted-foreground mt-1">Default rate — can be overridden with service tiers below</p>
                  )}
                </div>
              )}
              {meta.showCost && (
                <div>
                  <label htmlFor="f-producttype-raw-material-purchase-landed" className="block text-sm font-medium mb-1">
                    {productType === "RAW_MATERIAL" ? "Purchase / Landed Cost (₹)" : "Cost Price (₹)"}
                  </label>
                  <input id="f-producttype-raw-material-purchase-landed"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(e) => set("cost_price", e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Used for BOM costing and inventory valuation</p>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* ── Raw Material: Stock & Inventory ── */}
        {productType === "RAW_MATERIAL" && (
          <CollapsibleSection title="Stock & Inventory">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-stock-type" className="block text-sm font-medium mb-1">Stock Type</label>
                <select id="f-stock-type"
                  value={form.stock_type}
                  onChange={(e) => set("stock_type", e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {STOCK_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-reorder-level-form-unit-of-measure" className="block text-sm font-medium mb-1">Reorder Level ({form.unit_of_measure})</label>
                <input id="f-reorder-level-form-unit-of-measure"
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">Alert when stock falls below this level</p>
              </div>
              <div>
                <label htmlFor="f-min-order-quantity-form-unit-of-measure" className="block text-sm font-medium mb-1">Min Order Quantity ({form.unit_of_measure})</label>
                <input id="f-min-order-quantity-form-unit-of-measure"
                  type="number"
                  min="0"
                  value={minOrderQty}
                  onChange={(e) => setMinOrderQty(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-lead-time-days" className="block text-sm font-medium mb-1">Lead Time (days)</label>
                <input id="f-lead-time-days"
                  type="number"
                  min="0"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  placeholder="e.g. 7"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="f-storage-conditions" className="block text-sm font-medium mb-1">Storage Conditions</label>
              <input id="f-storage-conditions"
                value={storageConditions}
                onChange={(e) => setStorageConditions(e.target.value)}
                placeholder="e.g. Dry area, avoid direct sunlight, 20–30°C"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </CollapsibleSection>
        )}

        {/* ── Raw Material: Quality & Procurement ── */}
        {productType === "RAW_MATERIAL" && (
          <CollapsibleSection title="Quality & Procurement" defaultOpen={false}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-quality-grade" className="block text-sm font-medium mb-1">Quality Grade</label>
                <select id="f-quality-grade"
                  value={qualityGrade}
                  onChange={(e) => setQualityGrade(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Not specified</option>
                  {QUALITY_GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="f-supplier-notes" className="block text-sm font-medium mb-1">Supplier Notes</label>
              <textarea id="f-supplier-notes"
                value={supplierNotes}
                onChange={(e) => setSupplierNotes(e.target.value)}
                rows={2}
                placeholder="Preferred supplier, sourcing notes, quality requirements…"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          </CollapsibleSection>
        )}

        {/* ── Service: Tiers ── */}
        {productType === "SERVICE" && (
          <CollapsibleSection title="Service Rate Tiers">
            <p className="text-xs text-muted-foreground mb-3">
              Define multiple rate tiers (e.g. Standard, Express, Weekend). The base rate above is used when no tier is specified.
            </p>
            <div className="space-y-3">
              {serviceTiers.map((tier, i) => (
                <div key={i} className="grid grid-cols-3 gap-3 items-end">
                  <div>
                    <label htmlFor="f-tier-name" className="block text-xs font-medium mb-1">Tier Name</label>
                    <input id="f-tier-name"
                      value={tier.label}
                      onChange={(e) => setServiceTiers(tiers => tiers.map((t, j) => j === i ? { ...t, label: e.target.value } : t))}
                      placeholder="e.g. Standard"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-rate" className="block text-xs font-medium mb-1">Rate (₹)</label>
                    <input id="f-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.rate}
                      onChange={(e) => setServiceTiers(tiers => tiers.map((t, j) => j === i ? { ...t, rate: e.target.value } : t))}
                      placeholder="0.00"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-per-unit" className="block text-xs font-medium mb-1">Per Unit</label>
                    <select id="f-per-unit"
                      value={tier.unit}
                      onChange={(e) => setServiceTiers(tiers => tiers.map((t, j) => j === i ? { ...t, unit: e.target.value } : t))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      {meta.unitOptions.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setServiceTiers(t => [...t, { label: "", rate: "", unit: meta.unitOptions[0] }])}
                className="text-xs text-primary hover:underline"
              >
                + Add tier
              </button>
            </div>
          </CollapsibleSection>
        )}

        {/* ── Service: Scope & Terms ── */}
        {productType === "SERVICE" && (
          <CollapsibleSection title="Scope & Terms" defaultOpen={false}>
            <div className="space-y-4">
              <div>
                <label htmlFor="f-scope-of-work" className="block text-sm font-medium mb-1">Scope of Work</label>
                <textarea id="f-scope-of-work"
                  value={serviceScope}
                  onChange={(e) => setServiceScope(e.target.value)}
                  rows={3}
                  placeholder="Describe what is included in this service — what the team will do, what materials are supplied, etc."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="f-estimated-duration" className="block text-sm font-medium mb-1">Estimated Duration</label>
                  <input id="f-estimated-duration"
                    value={estimatedDuration}
                    onChange={(e) => setEstimatedDuration(e.target.value)}
                    placeholder="e.g. 2–4 hours, 1 day"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="f-warranty-guarantee" className="block text-sm font-medium mb-1">Warranty / Guarantee</label>
                  <input id="f-warranty-guarantee"
                    value={warrantyTerms}
                    onChange={(e) => setWarrantyTerms(e.target.value)}
                    placeholder="e.g. 30-day workmanship guarantee"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="f-terms-conditions" className="block text-sm font-medium mb-1">Terms & Conditions</label>
                <textarea id="f-terms-conditions"
                  value={termsConditions}
                  onChange={(e) => setTermsConditions(e.target.value)}
                  rows={2}
                  placeholder="Cancellation policy, prerequisites, exclusions…"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ── Status ── */}
        <CollapsibleSection title="Status">
          <button
            type="button"
            onClick={() => set("is_active", !form.is_active)}
            className="flex items-center gap-3 w-full text-left"
          >
            {form.is_active ? (
              <ToggleRight className="h-6 w-6 text-green-600" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
            <div>
              <div className="text-sm font-medium">{form.is_active ? "Active" : "Inactive"}</div>
              <div className="text-xs text-muted-foreground">
                {form.is_active
                  ? productType === "RAW_MATERIAL"
                    ? "Available for procurement and BOM use"
                    : productType === "SERVICE"
                    ? "Available for booking and invoicing"
                    : "Available for sale and inventory"
                  : "Disabled — not available for operations"}
              </div>
            </div>
          </button>
        </CollapsibleSection>

        {/* ── Submit ── */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/products/${typeSlug}`)}
            className="px-4 py-2 rounded-lg border text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : isEdit ? "Save Changes" : `Create ${meta.label}`}
          </button>
        </div>
      </form>
    </ERPPageShell>
  );
}
