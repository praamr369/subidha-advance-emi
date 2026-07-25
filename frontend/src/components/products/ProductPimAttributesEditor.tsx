"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import {
  getProductPim,
  listPimCategoryOptions,
  saveProductPimAttributes,
  setProductPimCategory,
  type PimAttributeRow,
  type PimCategoryOption,
  type ProductPimDetail,
} from "@/services/product-pim";

type Props = {
  productId: number | string;
};

// Edit a product's PIM attributes right inside the product module. Saves write to
// the shared linked PIM record, so changes reflect in the PIM module immediately.
export default function ProductPimAttributesEditor({ productId }: Props) {
  const [detail, setDetail] = useState<ProductPimDetail | null>(null);
  const [categories, setCategories] = useState<PimCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Record<number, PimAttributeRow>>({});

  const hydrate = useCallback((data: ProductPimDetail) => {
    setDetail(data);
    setValues(Object.fromEntries(data.attributes.map((a) => [a.attribute_id, a])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, cats] = await Promise.all([
        getProductPim(productId),
        listPimCategoryOptions().catch(() => []),
      ]);
      hydrate(data);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product attributes.");
    } finally {
      setLoading(false);
    }
  }, [productId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeCategory = async (categoryId: number) => {
    setNotice(null);
    try {
      const data = await setProductPimCategory(productId, { category_id: categoryId });
      hydrate(data);
      setNotice("Category updated — its attributes are now available below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set category.");
    }
  };

  const updateValue = (attributeId: number, patch: Partial<PimAttributeRow>) => {
    setValues((prev) => ({ ...prev, [attributeId]: { ...prev[attributeId], ...patch } }));
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload = Object.values(values).map((a) => ({
        attribute_id: a.attribute_id,
        value_text: a.value_text ?? "",
        value_number: a.value_number,
        value_boolean: a.value_boolean,
        value_date: a.value_date,
      }));
      const result = await saveProductPimAttributes(productId, payload);
      setValues(Object.fromEntries(result.attributes.map((a) => [a.attribute_id, a])));
      setNotice(`Saved ${result.saved} attribute(s). Reflected in the PIM module.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attributes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading product attributes…" />;
  if (error && !detail) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const attributeRows = Object.values(values).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-foreground">Product category (drives attributes)</span>
          <select
            className="h-10 min-w-[220px] rounded border border-border bg-background px-3"
            value={detail.category_id ?? ""}
            onChange={(e) => void changeCategory(Number(e.target.value))}
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs text-muted-foreground">
          {detail.code} · {attributeRows.length} attribute(s) for this category
        </div>
      </div>

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {attributeRows.length === 0 ? (
        <EmptyState
          title="No attributes for this category"
          description="Pick a category above (e.g. Furniture, Electronics) to load its attribute set, or define attributes for this category in the PIM module."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {attributeRows.map((attr) => (
            <label key={attr.attribute_id} className="grid gap-1 text-sm">
              <span className="font-medium text-foreground">
                {attr.name}
                {attr.is_required ? <span className="text-destructive"> *</span> : null}
                <span className="ml-1 text-xs font-normal text-muted-foreground">({attr.data_type})</span>
              </span>
              {attr.data_type === "BOOLEAN" ? (
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={attr.value_boolean ?? false}
                  onChange={(e) => updateValue(attr.attribute_id, { value_boolean: e.target.checked })}
                />
              ) : attr.data_type === "NUMBER" || attr.data_type === "DECIMAL" ? (
                <input
                  type="number"
                  className="h-10 rounded border border-border bg-background px-3"
                  value={attr.value_number ?? ""}
                  onChange={(e) => updateValue(attr.attribute_id, { value_number: e.target.value })}
                />
              ) : (attr.data_type === "CHOICE" || attr.data_type === "MULTI_CHOICE") && attr.options.length > 0 ? (
                <select
                  className="h-10 rounded border border-border bg-background px-3"
                  value={attr.value_text ?? ""}
                  onChange={(e) => updateValue(attr.attribute_id, { value_text: e.target.value })}
                >
                  <option value="">—</option>
                  {attr.options.map((o) => (
                    <option key={o.id} value={o.value}>
                      {o.display_name || o.value}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="h-10 rounded border border-border bg-background px-3"
                  value={attr.value_text ?? ""}
                  onChange={(e) => updateValue(attr.attribute_id, { value_text: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {attributeRows.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-10 rounded bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save attributes"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
