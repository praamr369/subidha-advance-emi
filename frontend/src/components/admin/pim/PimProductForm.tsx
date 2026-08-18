"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Save, ArrowLeft, Layers, Box, Send, CheckCircle2, X, Plus, Search, Trash2, Factory, Wrench, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import DynamicAttributeForm, { type AttributeValues } from "./DynamicAttributeForm";
import VariantManager from "./VariantManager";
import {
  pimService,
  type PimCategory,
  type PimSubcategory,
  type PimCategoryAttribute,
  type PimProduct,
  type PimVariant,
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

// ---------------------------------------------------------------------------
// BOM & Manufacturing panel (shown per-variant on base product edit page)
// ---------------------------------------------------------------------------

type BomLine = { product_code: string; name: string; qty: string; unit: string; wastage_pct: string; notes: string };
type BomRecord = { id: number; bom_no: string; status: string; revision_no: number; is_default: boolean; lines: BomLine[] };
type SvcRecord = { service_code: string; service_name: string; service_type: string; charge_mode: string; price: string; is_default: boolean };

function BomVariantRow({ variant, productId }: { variant: PimVariant; productId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [services, setServices] = useState<SvcRecord[]>([]);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);

  // Find the child PimProduct id for this variant — we need to call auto_bom on the child
  // pimService.autoBom expects the child PimProduct id. We use the variant's sku to find it.
  // The child PimProduct has code == variant.sku.
  // We'll store the child pim id from bom_status response via inventory_item mapping.

  const loadBomStatus = async (childPimId: number) => {
    setLoading(true);
    try {
      const data = await pimService.getBomStatus(childPimId);
      setBoms(data.boms ?? []);
      setServices(data.services ?? []);
    } catch {
      setBoms([]); setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!open) {
      setOpen(true);
      // Find child PimProduct by searching; use variant sku → pim products list
      // The child PIM product has `parent_id = productId` and `code = variant.sku`
      try {
        const res = await pimService.getProducts({ search: variant.sku, page_size: 5 });
        const child = res.results.find((p) => p.code === variant.sku && p.parent_id === productId);
        if (child) await loadBomStatus(child.id);
      } catch { /* ignore */ }
    } else {
      setOpen(false);
    }
  };

  const handleGenerateBom = async () => {
    setGenerating(true);
    setGenResult(null);
    setGenWarnings([]);
    try {
      const res = await pimService.getProducts({ search: variant.sku, page_size: 5 });
      const child = res.results.find((p) => p.code === variant.sku && p.parent_id === productId);
      if (!child) { setGenResult("Child PIM product not found — adopt orphans first."); return; }
      const result = await pimService.autoBom(child.id);
      setGenResult(result.created
        ? `BOM created: ${result.bom_no} with ${result.lines} material lines`
        : `BOM updated: ${result.bom_no} — ${result.lines} lines`);
      setGenWarnings(result.warnings ?? []);
      await loadBomStatus(child.id);
      setOpen(true);
    } catch (e: unknown) {
      setGenResult((e as { message?: string })?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const latestBom = boms[0];
  const hasBom = boms.length > 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={handleToggle} className="flex items-center gap-2 min-w-0">
            {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="font-mono text-xs font-semibold truncate">{variant.sku}</span>
          </button>
          <span className="text-xs text-muted-foreground truncate hidden sm:block">{variant.variant_label}</span>
          <span className="text-xs font-semibold text-foreground">₹{Number(variant.price).toLocaleString("en-IN")}</span>
          {hasBom ? (
            <span className="rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-semibold px-2 py-0.5">
              BOM {latestBom.status}
            </span>
          ) : (
            <span className="rounded-full bg-muted text-muted-foreground text-[10px] font-semibold px-2 py-0.5">No BOM</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleGenerateBom()}
          disabled={generating}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generating…" : hasBom ? "Re-generate BOM" : "Generate BOM"}
        </button>
      </div>

      {/* Result / warnings */}
      {genResult && (
        <div className="mx-4 mb-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
          {genResult}
          {genWarnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {genWarnings.map((w, i) => <li key={i} className="text-amber-700 dark:text-amber-400">⚠ {w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Expanded BOM detail */}
      {open && (
        <div className="border-t px-4 py-3 space-y-4">
          {loading && <p className="text-xs text-muted-foreground">Loading BOM…</p>}

          {!loading && latestBom && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">BOM {latestBom.bom_no}</span>
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${latestBom.status === "ACTIVE" ? "bg-green-100 text-green-700" : latestBom.status === "DRAFT" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                  {latestBom.status}
                </span>
                <span className="text-[10px] text-muted-foreground">Rev {latestBom.revision_no}</span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-left font-semibold">Raw Material</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-left font-semibold">Unit</th>
                      <th className="px-3 py-2 text-left font-semibold hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestBom.lines.map((line, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="font-medium">{line.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{line.product_code}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                        <td className="px-3 py-2 text-muted-foreground">{line.unit}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{line.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && !latestBom && !genResult && (
            <p className="text-xs text-muted-foreground">No BOM yet. Click <strong>Generate BOM</strong> to auto-build from this variant&apos;s attributes.</p>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-primary" />Linked Services</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {services.map((svc) => (
                  <div key={svc.service_code} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/20">
                    <div>
                      <div className="text-xs font-medium">{svc.service_name}</div>
                      <div className="text-[10px] text-muted-foreground">{svc.service_type}</div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {Number(svc.price) > 0
                        ? <span className="text-xs font-semibold text-amber-700">+₹{Number(svc.price).toLocaleString("en-IN")}</span>
                        : <span className="text-[10px] text-green-700 font-semibold">Included</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BomManufacturingPanel({ productId, variants }: { productId: number; variants: PimVariant[] }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <section className="rounded-lg border border-violet-200 dark:border-violet-800 p-5 space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Factory className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <h3 className="font-semibold text-sm">BOM & Manufacturing</h3>
          <span className="text-[10px] font-semibold rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5">
            {variants.length} variant{variants.length !== 1 ? "s" : ""}
          </span>
        </div>
        {collapsed
          ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {!collapsed && (
        <>
          <p className="text-xs text-muted-foreground">
            Each variant can have its own Bill of Materials. Click <strong>Generate BOM</strong> on any variant
            to auto-build material requirements from its attribute values (wood species, thickness, side rail,
            dasa, ply). Polish add-ons are linked as service items. Activate a BOM to use it in production jobs.
          </p>
          <div className="space-y-3">
            {variants.map((v) => (
              <BomVariantRow key={v.id} variant={v} productId={productId} />
            ))}
          </div>
        </>
      )}
    </section>
  );
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

  // Operator-controlled attribute locks
  const [lockedAttributes, setLockedAttributes] = useState<Set<number>>(new Set());

  // Adopt orphan variants (child PIM products with no ProductVariant record)
  const [adopting, setAdopting] = useState(false);
  const [adoptResult, setAdoptResult] = useState<string | null>(null);

  // Push-to-variants panel
  const [showPushPanel, setShowPushPanel] = useState(false);
  const [pushDescription, setPushDescription] = useState(true);
  const [pushName, setPushName] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ updated: number; total_variants: number } | null>(null);

  // Attribute IDs removed from this product (will be deleted from DB on save)
  const [removedAttrIds, setRemovedAttrIds] = useState<Set<number>>(new Set());

  // Inline attribute panel state
  const [attrPanelOpen, setAttrPanelOpen] = useState(false);
  const [attrPanelTab, setAttrPanelTab] = useState<"create" | "existing">("create");
  const [allAttributes, setAllAttributes] = useState<PimCategoryAttribute[]>([]);
  const [attrSearch, setAttrSearch] = useState("");
  // Create-new form
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrType, setNewAttrType] = useState<PimCategoryAttribute["data_type"]>("TEXT");
  const [newAttrVariant, setNewAttrVariant] = useState(false);
  const [newAttrRequired, setNewAttrRequired] = useState(false);
  const [newAttrOptions, setNewAttrOptions] = useState<{ value: string; display_name: string; extra_cost: string }[]>([]);
  const [creatingAttr, setCreatingAttr] = useState(false);
  const [createAttrError, setCreateAttrError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ child_pim_published: number; variants_activated: number; total_variants: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    pimService.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!categoryId) { setSubcategories([]); setAttributes([]); return; }
    pimService.getSubcategories(Number(categoryId)).then(setSubcategories).catch(() => {});
    pimService.getAttributes(Number(categoryId), undefined).then(setAttributes).catch(() => {});
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId) return;
    pimService.getAttributes(Number(categoryId), subcategoryId ? Number(subcategoryId) : undefined)
      .then(setAttributes)
      .catch(() => {});
  }, [categoryId, subcategoryId]);

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
        // Restore operator-locked attributes from backend — only keep IDs
        // that actually have a saved value (backend also enforces this on save,
        // but we replicate the filter here so stale IDs never appear in the UI
        // even before the user hits Save).
        const savedAttrIds = new Set((p.attributes ?? []).map((a) => a.attribute));
        const validLocks = (p.locked_attributes ?? []).filter((id) => savedAttrIds.has(id));
        setLockedAttributes(new Set(validLocks));
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

  const handleToggleLock = useCallback((attrId: number) => {
    setLockedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) next.delete(attrId);
      else next.add(attrId);
      return next;
    });
  }, []);

  // Open panel + load all attributes for the "existing" tab
  const openAttrPanel = useCallback((tab: "create" | "existing" = "create") => {
    setAttrPanelTab(tab);
    setAttrPanelOpen(true);
    setCreateAttrError(null);
    if (allAttributes.length === 0) {
      pimService.getAllAttributes().then(setAllAttributes).catch(() => {});
    }
  }, [allAttributes.length]);

  const resetCreateForm = () => {
    setNewAttrName("");
    setNewAttrType("TEXT");
    setNewAttrVariant(false);
    setNewAttrRequired(false);
    setNewAttrOptions([]);
    setCreateAttrError(null);
  };

  const handleCreateAttribute = async () => {
    if (!newAttrName.trim() || !categoryId) return;
    setCreatingAttr(true);
    setCreateAttrError(null);
    try {
      const created = await pimService.createAttribute({
        category: Number(categoryId),
        subcategory: subcategoryId ? Number(subcategoryId) : null,
        name: newAttrName.trim(),
        data_type: newAttrType,
        is_required: newAttrRequired,
        is_variant_defining: newAttrVariant,
      });
      // Create options if any
      for (const opt of newAttrOptions.filter((o) => o.value.trim())) {
        await pimService.createAttributeOption(created.id, {
          value: opt.value.trim(),
          display_name: opt.display_name.trim() || opt.value.trim(),
          extra_cost: opt.extra_cost ? Number(opt.extra_cost) : 0,
        });
      }
      // Reload attributes for this category/subcategory to include the new one
      const refreshed = await pimService.getAttributes(
        Number(categoryId),
        subcategoryId ? Number(subcategoryId) : undefined,
      );
      setAttributes(refreshed);
      setAllAttributes([]);   // force reload next open
      resetCreateForm();
      setAttrPanelOpen(false);
    } catch (err: unknown) {
      setCreateAttrError((err as { message?: string })?.message ?? "Create failed");
    } finally {
      setCreatingAttr(false);
    }
  };

  const handleRemoveAttribute = useCallback((attrId: number) => {
    setAttributes((prev) => prev.filter((a) => a.id !== attrId));
    setLockedAttributes((prev) => { const n = new Set(prev); n.delete(attrId); return n; });
    setRemovedAttrIds((prev) => new Set([...prev, attrId]));
    setAttrValues((prev) => { const n = { ...prev }; delete n[attrId]; return n; });
  }, []);

  const handleAddExistingAttribute = (attr: PimCategoryAttribute) => {
    if (attributes.some((a) => a.id === attr.id)) return;
    setAttributes((prev) => [...prev, attr]);
    setRemovedAttrIds((prev) => { const n = new Set(prev); n.delete(attr.id); return n; });
    setAttrPanelOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Base product is a blueprint — only code, name, category are required.
    // Base price and attributes are optional (pricing lives on variants).
    if (!code || !name || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code,
        name,
        description,
        category: Number(categoryId),
        subcategory: subcategoryId ? Number(subcategoryId) : null,
        base_price: basePrice || "0",
        cost_price: costPrice || undefined,
        locked_attributes: Array.from(lockedAttributes),
        attributes: buildAttrPayload(attributes, attrValues),
        ...(removedAttrIds.size > 0 ? { remove_attributes: Array.from(removedAttrIds) } : {}),
      };
      if (isEdit && productId) {
        await pimService.updateProduct(productId, payload);
        setRemovedAttrIds(new Set());
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

  const handleAdoptOrphans = async () => {
    if (!productId) return;
    setAdopting(true);
    setAdoptResult(null);
    try {
      const result = await pimService.adoptOrphanVariants(productId);
      setAdoptResult(result.message);
      if (result.adopted.length > 0) await refreshVariants();
    } catch {
      setAdoptResult("Adopt failed — check backend logs");
    } finally {
      setAdopting(false);
    }
  };

  const handlePushToVariants = async () => {
    if (!productId) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result = await pimService.pushToVariants(productId, {
        push_description: pushDescription,
        push_name: pushName,
      });
      setPushResult(result);
    } catch {
      // ignore
    } finally {
      setPushing(false);
    }
  };

  const handlePublish = async () => {
    if (!productId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      const result = await pimService.publishBlueprint(productId);
      setIsPublished(true);
      setPublishResult({ child_pim_published: result.child_pim_published, variants_activated: result.variants_activated, total_variants: result.total_variants });
    } catch (err: unknown) {
      setPublishError((err as { message?: string })?.message ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!productId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      await pimService.unpublishBlueprint(productId);
      setIsPublished(false);
    } catch (err: unknown) {
      setPublishError((err as { message?: string })?.message ?? "Unpublish failed");
    } finally {
      setPublishing(false);
    }
  };

  const variantDefiningAttrs = attributes.filter((a) => a.is_variant_defining);
  const nonVariantAttrs = attributes.filter((a) => !a.is_variant_defining);

  // Lock all non-variant-defining attributes (variants will inherit base values for these)
  const handleLockAll = useCallback(() => {
    setLockedAttributes((prev) => {
      const next = new Set(prev);
      for (const attr of nonVariantAttrs) next.add(attr.id);
      return next;
    });
  }, [nonVariantAttrs]);

  // Unlock everything so all attributes can be overridden per variant
  const handleUnlockAll = useCallback(() => {
    setLockedAttributes(new Set());
  }, []);

  const allNonVariantLocked =
    nonVariantAttrs.length > 0 &&
    nonVariantAttrs.every((a) => lockedAttributes.has(a.id));

  if (loading) return <ERPLoadingState label="Loading…" />;

  const categoryLabel = categories.find((c) => c.id === categoryId)?.name;
  const subcategoryLabel = subcategories.find((s) => s.id === subcategoryId)?.name;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">

      {/* Parent product identity banner — edit mode only */}
      {isEdit && product && (
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0 rounded-lg bg-muted p-2.5">
                <Box className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-muted-foreground">
                    {product.code}
                  </span>
                  {categoryLabel && (
                    <span className="text-xs text-muted-foreground">
                      {categoryLabel}{subcategoryLabel ? ` / ${subcategoryLabel}` : ""}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      product.is_published
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {product.is_published ? "Published" : "Draft"}
                  </span>
                  <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 text-[10px] font-semibold">
                    Base Product
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{product.name}</div>
              </div>
            </div>
            {variants.length > 0 && (
              <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-right">
                <div className="text-lg font-bold tabular-nums leading-none">{variants.length}</div>
                <div className="text-xs text-muted-foreground">
                  variant{variants.length !== 1 ? "s" : ""} linked
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {variants.filter((v) => v.is_active).length} active ·{" "}
                  {variants.reduce((s, v) => s + v.quantity_on_hand, 0)} total stock
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">Description</label>
              {isEdit && variants.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setShowPushPanel((v) => !v); setPushResult(null); }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    showPushPanel ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Send className="h-3 w-3" />
                  Push to variants
                </button>
              )}
            </div>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed product description…"
            />

            {/* Push-to-variants panel */}
            {showPushPanel && isEdit && productId && (
              <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                    Push parent fields to {variants.length} linked variant{variants.length !== 1 ? "s" : ""}
                  </p>
                  <button type="button" onClick={() => setShowPushPanel(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={pushDescription} onChange={(e) => setPushDescription(e.target.checked)} className="accent-primary" />
                    Sync description to all variants
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={pushName} onChange={(e) => setPushName(e.target.checked)} className="accent-primary" />
                    Sync name to all variants
                  </label>
                </div>
                {pushResult ? (
                  <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Updated {pushResult.updated} of {pushResult.total_variants} variant operational product{pushResult.total_variants !== 1 ? "s" : ""}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handlePushToVariants}
                    disabled={pushing || (!pushDescription && !pushName)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    {pushing ? "Pushing…" : "Push now"}
                  </button>
                )}
              </div>
            )}
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
        <div>
          <h3 className="font-semibold">Pricing</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Base product is a blueprint — leave price at ₹0 if pricing is defined per variant SKU.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Base Price
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional — set per variant</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full pl-7 rounded-md border px-3 py-2 text-sm bg-background"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="0.00 — set via variant pricing"
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
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">Product Attributes</h3>
              {variantDefiningAttrs.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <Layers className="inline h-3 w-3 mr-1 text-primary" />
                  {variantDefiningAttrs.length} variant-defining · locked attributes are inherited by all variants
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lockedAttributes.size > 0 && (
                <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-xs font-semibold">
                  {lockedAttributes.size} locked
                </span>
              )}
              {nonVariantAttrs.length > 0 && (
                allNonVariantLocked ? (
                  <button
                    type="button"
                    onClick={handleUnlockAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    title="Unlock all base attributes — allow per-variant overrides"
                  >
                    🔓 Unlock All
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLockAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors"
                    title="Lock all base attributes — all variants inherit these values"
                  >
                    🔒 Lock All Base
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => openAttrPanel("existing")}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-solid transition-colors"
                title="Add an existing attribute from the library"
              >
                <Search className="h-3 w-3" /> Map Existing
              </button>
              <button
                type="button"
                onClick={() => openAttrPanel("create")}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                title="Create a brand-new attribute for this category"
              >
                <Plus className="h-3 w-3" /> New Attribute
              </button>
            </div>
          </div>
          <DynamicAttributeForm
            attributes={attributes}
            values={attrValues}
            onChange={setAttrValues}
            existingAttributes={product?.attributes}
            lockedAttributes={lockedAttributes}
            onToggleLock={handleToggleLock}
            onRemove={handleRemoveAttribute}
          />

          {/* Inline attribute panel */}
          {attrPanelOpen && (
            <div className="rounded-xl border border-primary/20 bg-muted/30 p-4 space-y-4">
              {/* Tab bar */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1 rounded-lg border bg-background p-0.5">
                  {(["create", "existing"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setAttrPanelTab(tab)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        attrPanelTab === tab
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "create" ? "Create New Attribute" : "Add Existing"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setAttrPanelOpen(false); resetCreateForm(); }}
                  className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ── CREATE NEW ── */}
              {attrPanelTab === "create" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium block mb-1">Attribute Name *</label>
                      <input
                        className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        placeholder="e.g. Frame Color"
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Data Type *</label>
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        value={newAttrType}
                        onChange={(e) => {
                          setNewAttrType(e.target.value as PimCategoryAttribute["data_type"]);
                          if (!["CHOICE", "MULTI_CHOICE"].includes(e.target.value)) setNewAttrOptions([]);
                        }}
                      >
                        <option value="TEXT">Text</option>
                        <option value="NUMBER">Number</option>
                        <option value="DECIMAL">Decimal</option>
                        <option value="CHOICE">Single Choice</option>
                        <option value="MULTI_CHOICE">Multi Choice</option>
                        <option value="BOOLEAN">Yes / No</option>
                        <option value="DATE">Date</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={newAttrVariant} onChange={(e) => setNewAttrVariant(e.target.checked)} className="accent-primary" />
                      <Layers className="h-3 w-3 text-primary" />
                      Variant-defining (creates separate SKUs)
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={newAttrRequired} onChange={(e) => setNewAttrRequired(e.target.checked)} className="accent-primary" />
                      Required
                    </label>
                  </div>

                  {/* Options (only for CHOICE / MULTI_CHOICE) */}
                  {(newAttrType === "CHOICE" || newAttrType === "MULTI_CHOICE") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium">Options</label>
                        <button
                          type="button"
                          onClick={() => setNewAttrOptions((prev) => [...prev, { value: "", display_name: "", extra_cost: "" }])}
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium hover:bg-muted"
                        >
                          <Plus className="h-2.5 w-2.5" /> Add Option
                        </button>
                      </div>
                      {newAttrOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground">No options yet — click &quot;Add Option&quot;.</p>
                      )}
                      {newAttrOptions.map((opt, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_80px_28px] gap-2 items-center">
                          <input
                            className="rounded border px-2 py-1 text-xs bg-background"
                            placeholder="Value (stored)"
                            value={opt.value}
                            onChange={(e) => setNewAttrOptions((prev) => prev.map((o, i) => i === idx ? { ...o, value: e.target.value } : o))}
                          />
                          <input
                            className="rounded border px-2 py-1 text-xs bg-background"
                            placeholder="Display name"
                            value={opt.display_name}
                            onChange={(e) => setNewAttrOptions((prev) => prev.map((o, i) => i === idx ? { ...o, display_name: e.target.value } : o))}
                          />
                          <input
                            type="number"
                            className="rounded border px-2 py-1 text-xs bg-background"
                            placeholder="+₹ cost"
                            value={opt.extra_cost}
                            onChange={(e) => setNewAttrOptions((prev) => prev.map((o, i) => i === idx ? { ...o, extra_cost: e.target.value } : o))}
                          />
                          <button
                            type="button"
                            onClick={() => setNewAttrOptions((prev) => prev.filter((_, i) => i !== idx))}
                            className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {createAttrError && (
                    <p className="text-xs text-destructive">{createAttrError}</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={creatingAttr || !newAttrName.trim()}
                      onClick={() => void handleCreateAttribute()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {creatingAttr ? "Creating…" : "Create & Add to Form"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { resetCreateForm(); setAttrPanelOpen(false); }}
                      className="rounded-lg border px-4 py-2 text-xs hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── ADD EXISTING ── */}
              {attrPanelTab === "existing" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      className="w-full rounded-md border pl-8 pr-3 py-2 text-sm bg-background"
                      placeholder="Search attributes…"
                      value={attrSearch}
                      onChange={(e) => setAttrSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {allAttributes
                      .filter((a) =>
                        !attributes.some((x) => x.id === a.id) &&
                        (attrSearch === "" || a.name.toLowerCase().includes(attrSearch.toLowerCase()))
                      )
                      .map((attr) => (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => handleAddExistingAttribute(attr)}
                          className="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-muted/60 transition-colors group"
                        >
                          <div>
                            <div className="text-xs font-medium flex items-center gap-1.5">
                              {attr.name}
                              {attr.is_variant_defining && <Layers className="h-3 w-3 text-primary" />}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {attr.data_type}
                              {attr.options.length > 0 && ` · ${attr.options.length} options`}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            + Add
                          </span>
                        </button>
                      ))}
                    {allAttributes.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Loading attributes…</p>
                    )}
                    {allAttributes.length > 0 &&
                      allAttributes.filter((a) => !attributes.some((x) => x.id === a.id)).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          All available attributes are already mapped to this product.
                        </p>
                      )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Variants (edit mode only) */}
      {isEdit && productId && (
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold">SKU Variants</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each variant is an individual SKU inheriting this base product — with its own stock, price, and variant-level attributes.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {adoptResult && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1">{adoptResult}</span>
              )}
              <button
                type="button"
                onClick={handleAdoptOrphans}
                disabled={adopting}
                title="Link any PIM child products that exist in the product register but aren't yet listed as SKU variants under this base product"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-solid disabled:opacity-50"
              >
                <Layers className="h-3.5 w-3.5" />
                {adopting ? "Adopting…" : "Adopt Orphan Variants"}
              </button>
              {variants.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
                  <Box className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{variants.length}</span> linked
                </div>
              )}
            </div>
          </div>
          <VariantManager
            productId={productId}
            productCode={code}
            productName={name}
            basePrice={basePrice}
            variants={variants}
            allAttributes={attributes}
            onRefresh={refreshVariants}
            lockedAttributes={lockedAttributes}
            parentAttrValues={attrValues}
          />
        </section>
      )}

      {/* BOM & Manufacturing (edit mode, variant SKUs only) */}
      {isEdit && productId && variants.length > 0 && (
        <BomManufacturingPanel productId={productId} variants={variants} />
      )}

      {/* Publish */}
      {isEdit && (
        <section className={`rounded-lg border p-5 ${isPublished ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/10" : "border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/10"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${isPublished ? "text-green-600" : "text-amber-500"}`} />
                <span className="text-sm font-semibold">
                  {isPublished ? "Blueprint Published" : "Blueprint is a Draft"}
                </span>
              </div>
              {isPublished ? (
                <p className="text-xs text-muted-foreground">
                  This blueprint and all its variant SKUs are live on the public catalogue.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Publishing will make all variant SKUs public and activate their operational records.
                  Save your changes first, then publish.
                </p>
              )}
              {publishResult && (
                <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-1">
                  Published — {publishResult.total_variants} variant{publishResult.total_variants !== 1 ? "s" : ""} live
                  {publishResult.child_pim_published > 0 && ` · ${publishResult.child_pim_published} PIM child(ren) updated`}
                  {publishResult.variants_activated > 0 && ` · ${publishResult.variants_activated} variant(s) activated`}
                </p>
              )}
              {publishError && (
                <p className="text-xs text-destructive mt-1">{publishError}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {isPublished ? (
                <button type="button" disabled={publishing}
                  onClick={() => void handleUnpublish()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white dark:bg-background px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                  {publishing ? "…" : "Unpublish"}
                </button>
              ) : (
                <button type="button" disabled={publishing || saving || !variants.length}
                  onClick={() => void handlePublish()}
                  title={!variants.length ? "Add at least one variant SKU before publishing" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                  {publishing ? "Publishing…" : `Publish ${variants.length ? `(${variants.length} variant${variants.length !== 1 ? "s" : ""})` : ""}`}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

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
