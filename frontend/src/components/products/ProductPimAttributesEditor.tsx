"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Lock, Unlock, Layers } from "lucide-react";

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

function LockToggle({
  isLocked,
  isVariantDefining,
  onToggle,
}: {
  isLocked: boolean;
  isVariantDefining: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={isLocked ? "Click to unlock this field" : "Click to lock this field"}
      onClick={onToggle}
      className={`ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        isLocked
          ? isVariantDefining
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {isLocked ? (
        <><Lock className="h-2.5 w-2.5" />{isVariantDefining ? "Variant key" : "Locked"}</>
      ) : (
        <><Unlock className="h-2.5 w-2.5" />Unlock</>
      )}
    </button>
  );
}

export interface ProductPimAttributesEditorHandle {
  save: () => Promise<boolean>;
}

const ProductPimAttributesEditor = forwardRef<ProductPimAttributesEditorHandle, Props>(function ProductPimAttributesEditor({ productId }, ref) {
  const [detail, setDetail] = useState<ProductPimDetail | null>(null);
  const [categories, setCategories] = useState<PimCategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Record<number, PimAttributeRow>>({});
  // Session-only lock overrides; does not persist to backend from this view
  const [sessionLocked, setSessionLocked] = useState<Set<number>>(new Set());

  const hydrate = useCallback((data: ProductPimDetail) => {
    setDetail(data);
    setValues(Object.fromEntries(data.attributes.map((a) => [a.attribute_id, a])));
    // Default: lock all variant-defining attributes that already have a value
    setSessionLocked(
      new Set(
        data.attributes
          .filter((a) => a.is_variant_defining && (a.value_text || a.value_number !== null || a.value_boolean !== null))
          .map((a) => a.attribute_id)
      )
    );
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

  const toggleLock = (id: number) => {
    setSessionLocked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // Expose save() so the parent form can trigger a PIM attribute save on "Save Product"
  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!detail || Object.keys(values).length === 0) return true;
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
        setNotice(`Saved ${result.saved} attribute(s).`);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save attributes.");
        return false;
      } finally {
        setSaving(false);
      }
    },
  }), [detail, productId, values]);

  if (loading) return <LoadingBlock label="Loading product attributes…" />;
  if (error && !detail) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const attributeRows = Object.values(values).sort((a, b) => a.name.localeCompare(b.name));
  const lockedCount = sessionLocked.size;

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
            <option value="" disabled>Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{detail.code} · {attributeRows.length} attribute(s)</span>
          {lockedCount > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 font-semibold">
              {lockedCount} locked
            </span>
          )}
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
        <>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Layers className="h-3 w-3 text-primary" />
            Click the lock badge next to any attribute to lock or unlock it for this editing session.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {attributeRows.map((attr) => {
              const isLocked = sessionLocked.has(attr.attribute_id);

              if (isLocked) {
                const displayVal =
                  (attr.data_type === "CHOICE" || attr.data_type === "MULTI_CHOICE")
                    ? (attr.options.find((o) => o.value === attr.value_text)?.display_name ?? attr.value_text)
                    : attr.data_type === "BOOLEAN"
                    ? attr.value_boolean === true ? "Yes" : "No"
                    : attr.value_number ?? attr.value_text ?? "—";
                return (
                  <div key={attr.attribute_id} className="grid gap-1 text-sm">
                    <span className="font-medium text-foreground flex items-center gap-1 flex-wrap">
                      {attr.name}
                      {attr.is_variant_defining && (
                        <Layers className="h-3 w-3 text-primary shrink-0" />
                      )}
                      <LockToggle isLocked isVariantDefining={attr.is_variant_defining} onToggle={() => toggleLock(attr.attribute_id)} />
                    </span>
                    <div className="flex items-center gap-2 h-10 rounded border border-dashed bg-muted/40 px-3">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{String(displayVal || "—")}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={attr.attribute_id} className="grid gap-1 text-sm">
                  <span className="font-medium text-foreground flex items-center gap-1 flex-wrap">
                    {attr.name}
                    {attr.is_required ? <span className="text-destructive">*</span> : null}
                    {attr.is_variant_defining && (
                      <Layers className="h-3 w-3 text-primary shrink-0" />
                    )}
                    <LockToggle isLocked={false} isVariantDefining={attr.is_variant_defining} onToggle={() => toggleLock(attr.attribute_id)} />
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
                </div>
              );
            })}
          </div>
        </>
      )}

      {attributeRows.length > 0 ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-10 rounded bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save attributes"}
          </button>
          <span className="text-xs text-muted-foreground">Also saved automatically when you click "Save Product" above.</span>
        </div>
      ) : null}
    </div>
  );
});

export default ProductPimAttributesEditor;
