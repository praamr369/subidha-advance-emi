"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Eye, EyeOff, ToggleLeft, ToggleRight, RefreshCw, CheckSquare, Square } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getVariantPublishControl,
  patchVariantPublishControl,
  type PimVariantPublishControl,
  type PimVariantPublishRow,
} from "@/services/product-pim";

function PublishBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
      <Eye className="h-3 w-3" />
      Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
      <EyeOff className="h-3 w-3" />
      Draft
    </span>
  );
}

export default function VariantPublishControlPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [data, setData] = useState<PimVariantPublishControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // local draft of per-variant flags before saving
  const [localVariants, setLocalVariants] = useState<PimVariantPublishRow[]>([]);
  const [basePublished, setBasePublished] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    getVariantPublishControl(productId)
      .then((d) => {
        setData(d);
        setLocalVariants(d.variants);
        setBasePublished(d.base.is_published);
        setDirty(false);
      })
      .catch((e) => setError(e?.message ?? "Failed to load variant publish control."))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!productId) return;
    setSaving(true);
    try {
      const result = await patchVariantPublishControl(productId, {
        base_published: basePublished,
        variants: localVariants.map((v) => ({ id: v.id, is_published: v.is_published })),
      });
      setData(result);
      setLocalVariants(result.variants);
      setBasePublished(result.base.is_published);
      setDirty(false);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function applyAll(flag: boolean) {
    if (!productId) return;
    setSaving(true);
    try {
      const result = await patchVariantPublishControl(productId, { all: flag });
      setData(result);
      setLocalVariants(result.variants);
      setBasePublished(result.base.is_published);
      setDirty(false);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Bulk toggle failed.");
    } finally {
      setSaving(false);
    }
  }

  function toggleVariant(id: number) {
    setLocalVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, is_published: !v.is_published } : v))
    );
    setDirty(true);
  }

  function toggleBase() {
    setBasePublished((prev) => !prev);
    setDirty(true);
  }

  const allPublished = localVariants.length > 0 && localVariants.every((v) => v.is_published);
  const nonePublished = localVariants.every((v) => !v.is_published);
  const publishedCount = localVariants.filter((v) => v.is_published).length;

  return (
    <ERPPageShell
      eyebrow="PIM"
      title={data ? `${data.base.name || data.base.code} — Variant Publish Control` : "Variant Publish Control"}
      subtitle="Toggle which variants are visible to the public. Each variant can be published or kept as a draft independently."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "PIM Products", href: ROUTES.admin.pimProducts },
        { label: data?.base.code ?? `Product #${productId}`, href: `/admin/pim/products/${productId}/edit` },
        { label: "Publish Control" },
      ]}
    >
      {loading ? (
        <ERPLoadingState label="Loading publish control…" />
      ) : error ? (
        <ERPErrorState title="Failed to load" description={error} onRetry={load} />
      ) : !data ? (
        <ERPEmptyState title="No data" description="No variant publish control data available." />
      ) : (
        <div className="space-y-6">
          {/* Base product row */}
          <WorkspaceSection
            title="Base product"
            description="The root PIM record. Publishing the base makes the product discoverable; variants are controlled individually below."
          >
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{data.base.code}</span>
                  <PublishBadge published={basePublished} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{data.base.name}</p>
              </div>
              <button
                type="button"
                onClick={toggleBase}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${
                  basePublished
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                }`}
              >
                {basePublished ? (
                  <><EyeOff className="h-4 w-4" /> Set to draft</>
                ) : (
                  <><Eye className="h-4 w-4" /> Publish</>
                )}
              </button>
            </div>
          </WorkspaceSection>

          {/* Variants table */}
          <WorkspaceSection
            title={`Variants (${publishedCount} / ${localVariants.length} published)`}
            description="Toggle each SKU independently. Use the bulk buttons to publish or draft all at once."
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyAll(true)}
                  disabled={saving || allPublished}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-40"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Publish all
                </button>
                <button
                  type="button"
                  onClick={() => applyAll(false)}
                  disabled={saving || nonePublished}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
                >
                  <Square className="h-3.5 w-3.5" />
                  Draft all
                </button>
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>
            }
          >
            {localVariants.length === 0 ? (
              <ERPEmptyState
                title="No variants"
                description="This product has no generated variants. Generate variants from the PIM editor first."
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-5 py-3 bg-muted/40">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">SKU / Name</div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Price</div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status</div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Toggle</div>
                </div>

                {localVariants.map((variant) => (
                  <div
                    key={variant.id}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-foreground truncate">{variant.sku}</p>
                      <p className="text-xs text-muted-foreground truncate">{variant.name}</p>
                    </div>
                    <div className="text-sm text-foreground">
                      {variant.price ? `₹${Number(variant.price).toLocaleString("en-IN")}` : "—"}
                    </div>
                    <div>
                      <PublishBadge published={variant.is_published} />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleVariant(variant.id)}
                        className="transition hover:scale-110"
                        title={variant.is_published ? "Click to set draft" : "Click to publish"}
                      >
                        {variant.is_published ? (
                          <ToggleRight className="h-7 w-7 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </WorkspaceSection>

          {/* Save bar */}
          {dirty && (
            <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
              <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={load}
                  disabled={saving}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </ERPPageShell>
  );
}
