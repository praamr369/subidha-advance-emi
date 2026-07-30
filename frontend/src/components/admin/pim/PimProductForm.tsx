"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, Layers } from "lucide-react";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import DynamicAttributeForm, { type AttributeValues } from "./DynamicAttributeForm";
import VariantManager from "./VariantManager";
import {
  pimService,
  type PimCategory,
  type PimSubcategory,
  type PimCategoryAttribute,
  type PimProduct,
} from "@/services/pim";

interface Props {
  productId?: number;
}

interface AttrPayloadItem {
  attribute: number;
  value_text: string;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
}

function buildAttrPayload(attrs: PimCategoryAttribute[], values: AttributeValues): AttrPayloadItem[] {
  const result: AttrPayloadItem[] = [];
  for (const attr of attrs) {
    const v = values[attr.id];
    if (!v) continue;
    const hasValue = v.value_text !== "" || v.value_number !== "" || v.value_boolean !== null || v.value_date !== "";
    if (!hasValue) continue;
    result.push({
      attribute: attr.id,
      value_text: v.value_text || "",
      value_number: v.value_number ? Number(v.value_number) : null,
      value_boolean: v.value_boolean,
      value_date: v.value_date || null,
    });
  }
  return result;
}

export default function PimProductForm({ productId }: Props) {
  const router = useRouter();
  const isEdit = Boolean(productId);
  const pendingFetchRef = useRef<{ id: number; promise: Promise<PimProduct> } | null>(null);

  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [subcategories, setSubcategories] = useState<PimSubcategory[]>([]);
  const [attributes, setAttributes] = useState<PimCategoryAttribute[]>([]);
  const [product, setProduct] = useState<PimProduct | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");
  const [basePrice, setBasePrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [attrValues, setAttrValues] = useState<AttributeValues>({});
  const [variants, setVariants] = useState(product?.variants ?? []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load categories once
  useEffect(() => {
    pimService.getCategories().then(setCategories).catch(() => {});
  }, []);

  // Load subcategories when category changes
  useEffect(() => {
    if (!categoryId) { setSubcategories([]); setAttributes([]); return; }
    pimService.getSubcategories(Number(categoryId)).then(setSubcategories).catch(() => {});
    pimService.getAttributes(Number(categoryId), undefined).then((attrs) => {
      setAttributes(attrs);
    }).catch(() => {});
  }, [categoryId]);

  // Load subcategory-specific attributes
  useEffect(() => {
    if (!categoryId) return;
    pimService.getAttributes(Number(categoryId), subcategoryId ? Number(subcategoryId) : undefined)
      .then(setAttributes)
      .catch(() => {});
  }, [categoryId, subcategoryId]);

  // Load product data for edit mode (shared promise avoids React Strict Mode double-fetch)
  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    let stale = false;
    if (!pendingFetchRef.current || pendingFetchRef.current.id !== productId) {
      pendingFetchRef.current = { id: productId, promise: pimService.getProductWithAttributes(productId) };
    }
    const fetchPromise = pendingFetchRef.current.promise;
    setLoading(true);
    setError(null);
    fetchPromise
      .then((p) => {
        if (stale) return;
        setError(null);
        setProduct(p);
        setCode(p.code);
        setName(p.name);
        setDescription(p.description ?? "");
        setCategoryId(p.category);
        setSubcategoryId(p.subcategory ?? "");
        setBasePrice(p.base_price);
        setCostPrice(p.cost_price ?? "");
        setIsPublished(p.is_published);
        setVariants(p.variants ?? []);
        const prefilled: AttributeValues = {};
        for (const a of p.attributes ?? []) {
          prefilled[a.attribute] = {
            value_text: a.value_text ?? "",
            value_number: a.value_number ?? "",
            value_boolean: a.value_boolean,
            value_date: a.value_date ?? "",
          };
        }
        setAttrValues(prefilled);
      })
      .catch(() => { if (!stale) setError("Failed to load product"); })
      .finally(() => {
        if (!stale) setLoading(false);
        if (pendingFetchRef.current?.id === productId) pendingFetchRef.current = null;
      });
    return () => { stale = true; };
  }, [productId]);

  const refreshVariants = useCallback(async () => {
    if (!productId) return;
    const p = await pimService.getProductWithAttributes(productId);
    setVariants(p.variants ?? []);
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !categoryId || !basePrice) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code,
        name,
        description,
        category: Number(categoryId),
        subcategory: subcategoryId ? Number(subcategoryId) : null,
        base_price: basePrice,
        cost_price: costPrice || undefined,
        is_published: isPublished,
        attributes: buildAttrPayload(attributes, attrValues),
      };
      if (isEdit && productId) {
        await pimService.updateProduct(productId, payload);
      } else {
        const created = await pimService.createProduct(payload);
        router.push(`/admin/pim/products/${created.id}/edit`);
        return;
      }
      router.push("/admin/pim/products");
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const variantDefiningAttrs = attributes.filter((a) => a.is_variant_defining);

  if (loading) return <ERPLoadingState label="Loading…" />;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <section className="rounded-lg border p-5 space-y-4">
        <h3 className="font-semibold">Basic Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Product Code *</label>
            <input
              required
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BED-TEA-Q-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Product Name *</label>
            <input
              required
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teak Queen Bed with Storage"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed product description…"
            />
          </div>
        </div>
      </section>

      {/* Category */}
      <section className="rounded-lg border p-5 space-y-4">
        <h3 className="font-semibold">Category</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Category *</label>
            <select
              required
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value ? Number(e.target.value) : "");
                setSubcategoryId("");
                setAttrValues({});
              }}
            >
              <option value="">— Select Category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          {subcategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Subcategory</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={subcategoryId}
                onChange={(e) => {
                  setSubcategoryId(e.target.value ? Number(e.target.value) : "");
                  setAttrValues({});
                }}
              >
                <option value="">— All / No Subcategory —</option>
                {subcategories.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      {/* Pricing */}
      <section className="rounded-lg border p-5 space-y-4">
        <h3 className="font-semibold">Pricing</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Base Price (Selling Price) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <input
                required
                type="number"
                step="0.01"
                className="w-full pl-7 rounded-md border px-3 py-2 text-sm bg-background"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cost Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <input
                type="number"
                step="0.01"
                className="w-full pl-7 rounded-md border px-3 py-2 text-sm bg-background"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Attributes */}
      {categoryId && (
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Product Attributes</h3>
            {variantDefiningAttrs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                <Layers className="inline h-3.5 w-3.5 mr-1" />
                {variantDefiningAttrs.length} variant-defining attribute{variantDefiningAttrs.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <DynamicAttributeForm
            attributes={attributes}
            values={attrValues}
            onChange={setAttrValues}
            existingAttributes={product?.attributes}
          />
        </section>
      )}

      {/* Variants (edit mode only) */}
      {isEdit && productId && (
        <section className="rounded-lg border p-5 space-y-4">
          <h3 className="font-semibold">SKU Variants</h3>
          <p className="text-xs text-muted-foreground">
            Each variant is an individual SKU with its own stock, price, and variant-level attributes (color, size, storage, etc.)
          </p>
          <VariantManager
            productId={productId}
            productCode={code}
            variants={variants}
            allAttributes={attributes}
            onRefresh={refreshVariants}
          />
        </section>
      )}

      {/* Publish */}
      <section className="rounded-lg border p-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          <div>
            <span className="text-sm font-medium">Publish Product</span>
            <p className="text-xs text-muted-foreground">Unpublished products are saved as drafts and not visible externally.</p>
          </div>
        </label>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-8">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/pim/products")}
          className="inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>
    </form>
  );
}
