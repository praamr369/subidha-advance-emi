"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import Link from "next/link";
import { pimService, type PimCategory, type PimSubcategory, type PimCategoryAttribute } from "@/services/pim";

// Legacy type alias kept so callers don't need to change
export type CatalogCategory = { id: number; name: string; slug: string; path: string; parent: number | null; is_active: boolean };
export type AttributeDefinition = { id: number; category: number; name: string; code: string; input_type: string; options: string[]; unit: string; is_variant_attribute: boolean; is_spec_attribute: boolean; is_required: boolean; sort_order: number; min_value: string | null; max_value: string | null; is_active: boolean };

type Props = {
  categoryId: number | null;
  values: Record<string, unknown>;
  onCategoryChange: (categoryId: number | null) => void;
  onValuesChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
  error?: string;
};

function fc() {
  return "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60";
}

function matchCat(cats: PimCategory[], text: string): PimCategory | undefined {
  if (!text) return undefined;
  const q = text.trim().toLowerCase();
  return cats.find((c) => c.name.toLowerCase() === q || c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
}

export default function CatalogSpecificationFields({ categoryId, values, onCategoryChange, onValuesChange, disabled = false, error }: Props) {
  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [subcategories, setSubcategories] = useState<PimSubcategory[]>([]);
  const [attributes, setAttributes] = useState<PimCategoryAttribute[]>([]);
  const [subcategoryId, setSubcategoryId] = useState<number | "">(() => {
    const v = values.__pim_subcategory_id;
    return typeof v === "number" ? v : "";
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load PIM categories (not old catalog categories)
  useEffect(() => {
    pimService.getCategories()
      .then(setCategories)
      .catch(() => setLoadError("PIM categories could not be loaded."));
  }, []);

  // Load subcategories and category-level attributes when category changes
  useEffect(() => {
    if (!categoryId) { setSubcategories([]); setAttributes([]); return; }
    Promise.all([
      pimService.getSubcategories(categoryId),
      pimService.getAttributes(categoryId, undefined),
    ]).then(([subs, attrs]) => {
      setSubcategories(subs);
      setAttributes(attrs);
    }).catch(() => setLoadError("PIM attributes could not be loaded."));
  }, [categoryId]);

  // Reload attributes when subcategory changes
  useEffect(() => {
    if (!categoryId) return;
    pimService.getAttributes(categoryId, subcategoryId ? Number(subcategoryId) : undefined)
      .then(setAttributes)
      .catch(() => {});
  }, [categoryId, subcategoryId]);

  function selectCategory(next: number | null) {
    onCategoryChange(next);
    setSubcategoryId("");
    // Preserve __pim_ metadata keys, clear spec values
    const meta: Record<string, unknown> = { __pim_category_id: next, __pim_subcategory_id: "" };
    onValuesChange(meta);
  }

  function selectSubcategory(id: number | "") {
    setSubcategoryId(id);
    const meta: Record<string, unknown> = { ...values, __pim_subcategory_id: id };
    // clear old attribute values on subcategory change
    for (const attr of attributes) delete meta[attr.slug];
    onValuesChange(meta);
  }

  function setVal(slug: string, value: unknown) {
    onValuesChange({ ...values, [slug]: value });
  }

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4 md:col-span-2">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-primary" />
            PIM classification &amp; specifications
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Category-specific product specs (dimensions, material, capacity, etc.) stored in base_specs.
          </p>
        </div>
        <Link href="/admin/pim/categories/manage" className="text-xs text-primary hover:underline shrink-0">
          Manage categories →
        </Link>
      </div>

      {/* Category */}
      <label className="text-sm text-muted-foreground">
        PIM category
        <select
          className={fc()}
          value={categoryId ?? ""}
          disabled={disabled}
          onChange={(e) => selectCategory(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— No PIM category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </label>

      {/* Subcategory */}
      {categoryId && subcategories.length > 0 && (
        <label className="mt-3 block text-sm text-muted-foreground">
          Subcategory
          <select
            className={fc()}
            value={subcategoryId}
            disabled={disabled}
            onChange={(e) => selectSubcategory(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— All / None —</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      )}

      {loadError && <p className="mt-2 text-xs text-destructive">{loadError}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* Attribute fields */}
      {categoryId && attributes.length === 0 && !loadError && (
        <p className="mt-3 text-sm text-muted-foreground">
          No attributes defined for this category yet.{" "}
          <Link href="/admin/pim/categories/manage" className="text-primary hover:underline">Add attributes →</Link>
        </p>
      )}

      {attributes.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {attributes.map((attr) => {
            const val = values[attr.slug];
            const labelEl = (
              <span>
                {attr.name}
                {attr.is_required && <span className="text-destructive"> *</span>}
              </span>
            );
            const common = "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring disabled:opacity-60";

            if (attr.data_type === "CHOICE") {
              return (
                <label key={attr.id} className="text-sm text-muted-foreground">
                  {labelEl}
                  <select className={common} value={typeof val === "string" ? val : ""} disabled={disabled} onChange={(e) => setVal(attr.slug, e.target.value)}>
                    <option value="">Select {attr.name}</option>
                    {attr.options.map((opt) => <option key={opt.id} value={opt.value}>{opt.display_name}</option>)}
                  </select>
                </label>
              );
            }
            if (attr.data_type === "MULTI_CHOICE") {
              const selected = typeof val === "string" ? val.split(",").filter(Boolean) : [];
              return (
                <fieldset key={attr.id} className="rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm text-muted-foreground">{labelEl}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {attr.options.map((opt) => (
                      <label key={opt.id} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={selected.includes(opt.value)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...selected, opt.value] : selected.filter((v) => v !== opt.value);
                            setVal(attr.slug, next.join(","));
                          }}
                        />
                        {opt.display_name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            }
            if (attr.data_type === "BOOLEAN") {
              return (
                <label key={attr.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                  {labelEl}
                  <input type="checkbox" disabled={disabled} checked={val === true} onChange={(e) => setVal(attr.slug, e.target.checked)} />
                </label>
              );
            }
            if (attr.data_type === "NUMBER" || attr.data_type === "DECIMAL") {
              return (
                <label key={attr.id} className="text-sm text-muted-foreground">
                  {labelEl}
                  <input className={common} type="number" step={attr.data_type === "DECIMAL" ? "0.01" : "1"} value={val == null ? "" : String(val)} disabled={disabled} min={attr.min_value ?? undefined} max={attr.max_value ?? undefined} onChange={(e) => setVal(attr.slug, e.target.value)} />
                </label>
              );
            }
            if (attr.data_type === "DATE") {
              return (
                <label key={attr.id} className="text-sm text-muted-foreground">
                  {labelEl}
                  <input className={common} type="date" value={typeof val === "string" ? val : ""} disabled={disabled} onChange={(e) => setVal(attr.slug, e.target.value)} />
                </label>
              );
            }
            // TEXT default
            return (
              <label key={attr.id} className="text-sm text-muted-foreground">
                {labelEl}
                <input className={common} value={typeof val === "string" ? val : ""} disabled={disabled} onChange={(e) => setVal(attr.slug, e.target.value)} />
              </label>
            );
          })}
        </div>
      )}

      {categories.length === 0 && !loadError && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No PIM categories found. <Link href="/admin/pim/categories/manage" className="underline font-medium">Create categories →</Link>
        </div>
      )}
    </section>
  );
}
