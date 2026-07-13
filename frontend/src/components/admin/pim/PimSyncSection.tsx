"use client";
import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Layers, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import DynamicAttributeForm, { type AttributeValues } from "./DynamicAttributeForm";
import {
  pimService,
  type PimCategory,
  type PimSubcategory,
  type PimCategoryAttribute,
  type PimProduct,
} from "@/services/pim";

interface Props {
  /** Subscription product code — used as PIM product code for linking */
  productCode: string;
  productName: string;
  /** Free-text category name from subscription product (e.g. "Furniture") */
  categoryText: string;
  /** Free-text subcategory name from subscription product (e.g. "Beds") */
  subcategoryText: string;
  basePrice: string;
}

function buildAttrPayload(attrs: PimCategoryAttribute[], values: AttributeValues) {
  return attrs.flatMap((attr) => {
    const v = values[attr.id];
    if (!v) return [];
    const hasValue = v.value_text !== "" || v.value_number !== "" || v.value_boolean !== null || v.value_date !== "";
    if (!hasValue) return [];
    return [{
      attribute: attr.id,
      value_text: v.value_text || "",
      value_number: v.value_number ? Number(v.value_number) : null,
      value_boolean: v.value_boolean,
      value_date: v.value_date || null,
    }];
  });
}

function matchByName(list: { name: string }[], text: string): number {
  if (!text) return -1;
  const q = text.trim().toLowerCase();
  return list.findIndex((item) => item.name.toLowerCase() === q || item.name.toLowerCase().includes(q) || q.includes(item.name.toLowerCase()));
}

export default function PimSyncSection({ productCode, productName, categoryText, subcategoryText, basePrice }: Props) {
  const [allCategories, setAllCategories] = useState<PimCategory[]>([]);
  const [subcategories, setSubcategories] = useState<PimSubcategory[]>([]);
  const [attributes, setAttributes] = useState<PimCategoryAttribute[]>([]);
  const [pimProduct, setPimProduct] = useState<PimProduct | null>(null);

  const [selectedCatId, setSelectedCatId] = useState<number | "">("");
  const [selectedSubId, setSelectedSubId] = useState<number | "">("");
  const [attrValues, setAttrValues] = useState<AttributeValues>({});

  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Load categories once
  useEffect(() => {
    pimService.getCategories().then(setAllCategories).catch(() => {});
  }, []);

  // Auto-match category when categoryText or allCategories changes
  useEffect(() => {
    if (!allCategories.length || !categoryText) return;
    const idx = matchByName(allCategories, categoryText);
    if (idx >= 0) setSelectedCatId(allCategories[idx].id);
  }, [allCategories, categoryText]);

  // Load subcategories and category-level attributes when category changes
  useEffect(() => {
    if (!selectedCatId) { setSubcategories([]); setAttributes([]); return; }
    pimService.getSubcategories(Number(selectedCatId)).then(setSubcategories).catch(() => {});
    pimService.getAttributes(Number(selectedCatId), undefined).then(setAttributes).catch(() => {});
  }, [selectedCatId]);

  // Auto-match subcategory when subcategories or subcategoryText changes
  useEffect(() => {
    if (!subcategories.length || !subcategoryText) return;
    const idx = matchByName(subcategories, subcategoryText);
    if (idx >= 0) setSelectedSubId(subcategories[idx].id);
  }, [subcategories, subcategoryText]);

  // Reload attributes when subcategory changes
  useEffect(() => {
    if (!selectedCatId) return;
    pimService.getAttributes(Number(selectedCatId), selectedSubId ? Number(selectedSubId) : undefined)
      .then(setAttributes).catch(() => {});
  }, [selectedCatId, selectedSubId]);

  // Look up existing PIM product by code
  const loadPimProduct = useCallback(async () => {
    if (!productCode) return;
    setStatus("loading");
    try {
      const results = await pimService.getProducts({ search: productCode });
      const match = results.find((p) => p.code === productCode);
      if (match) {
        const full = await pimService.getProductWithAttributes(match.id);
        setPimProduct(full);
        // Pre-fill attribute values
        const prefilled: AttributeValues = {};
        for (const a of full.attributes ?? []) {
          prefilled[a.attribute] = {
            value_text: a.value_text ?? "",
            value_number: a.value_number ?? "",
            value_boolean: a.value_boolean,
            value_date: a.value_date ?? "",
          };
        }
        setAttrValues(prefilled);
        // Auto-select category/subcategory from existing PIM product
        setSelectedCatId(full.category);
        setSelectedSubId(full.subcategory ?? "");
      } else {
        setPimProduct(null);
      }
      setStatus("idle");
    } catch {
      setStatus("idle");
    }
  }, [productCode]);

  useEffect(() => {
    void loadPimProduct();
  }, [loadPimProduct]);

  const saveToPim = async () => {
    if (!selectedCatId || !productCode || !productName || !basePrice) {
      setMsg("Category and base price are required for PIM sync.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setMsg(null);
    try {
      const payload = {
        code: productCode,
        name: productName,
        category: Number(selectedCatId),
        subcategory: selectedSubId ? Number(selectedSubId) : null,
        base_price: basePrice,
        is_active: true,
        is_published: false,
        attributes: buildAttrPayload(attributes, attrValues),
      };
      if (pimProduct) {
        await pimService.updateProduct(pimProduct.id, payload);
        setMsg(`PIM product #${pimProduct.id} updated.`);
      } else {
        const created = await pimService.createProduct(payload);
        setPimProduct(created);
        setMsg(`PIM product created (ID ${created.id}).`);
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMsg(e?.message ?? "PIM save failed");
      setStatus("error");
    }
  };

  const linked = Boolean(pimProduct);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-primary shrink-0" />
          <div>
            <span className="text-sm font-semibold">PIM Specifications</span>
            <span className="ml-3 text-xs text-muted-foreground">
              {linked
                ? `Linked — PIM #${pimProduct!.id} · ${pimProduct!.category_name}`
                : "Not linked to PIM — expand to sync"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {linked && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Synced
            </span>
          )}
          <span className="text-muted-foreground text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-5 space-y-5">
          {/* Info banner */}
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            PIM spec data (dimensions, material, capacity, etc.) is stored separately from subscription billing. Both systems use{" "}
            <strong>product code</strong> as the link key.{" "}
            {linked && (
              <Link href={`/admin/pim/products/${pimProduct!.id}/edit`} className="text-primary inline-flex items-center gap-1 hover:underline">
                Open full PIM editor <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {/* Category selector */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">PIM Category</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
                value={selectedCatId}
                onChange={(e) => {
                  setSelectedCatId(e.target.value ? Number(e.target.value) : "");
                  setSelectedSubId("");
                  setAttrValues({});
                }}
              >
                <option value="">— Select PIM Category —</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              {!selectedCatId && categoryText && (
                <p className="mt-1 text-xs text-amber-600">No match found for "{categoryText}" — please select manually.</p>
              )}
            </div>
            {subcategories.length > 0 && (
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">PIM Subcategory</label>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
                  value={selectedSubId}
                  onChange={(e) => {
                    setSelectedSubId(e.target.value ? Number(e.target.value) : "");
                    setAttrValues({});
                  }}
                >
                  <option value="">— All / None —</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dynamic attributes */}
          {selectedCatId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Specification Attributes ({attributes.length})
                </p>
              </div>
              {attributes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attributes defined for this category yet.</p>
              ) : (
                <DynamicAttributeForm
                  attributes={attributes}
                  values={attrValues}
                  onChange={setAttrValues}
                  existingAttributes={pimProduct?.attributes}
                />
              )}
            </div>
          )}

          {/* Status / message */}
          {msg && (
            <div className={`rounded-lg px-3 py-2 text-xs ${status === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {msg}
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void saveToPim()}
              disabled={status === "saving" || !selectedCatId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "saving" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
              {status === "saving" ? "Syncing…" : linked ? "Update PIM Specs" : "Create PIM Entry"}
            </button>
            <button
              type="button"
              onClick={() => void loadPimProduct()}
              disabled={status === "loading"}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {linked && (
              <Link
                href={`/admin/pim/products/${pimProduct!.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                Full PIM Edit <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
