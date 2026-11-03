"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  ExternalLink,
  X,
  Search,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Filter,
  SlidersHorizontal,
  Save,
  RotateCcw,
} from "lucide-react";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import {
  getVariantPublishControl,
  patchVariantPublishControl,
  type PimVariantPublishControl,
  type PimVariantPublishRow,
} from "@/services/product-pim";
import { type PimProduct, pimService } from "@/services/pim";

// ============================================================================
// BADGE COMPONENTS
// ============================================================================

export function PublishBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 shadow-2xs">
      <Eye className="h-3 w-3" />
      Published (Live)
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 shadow-2xs">
      <EyeOff className="h-3 w-3" />
      Draft (Private)
    </span>
  );
}

// ============================================================================
// MAIN EDITOR COMPONENT (Reusable in both Pop-up and Full Page)
// ============================================================================

export interface PimVariantPublishControlEditorProps {
  productId: number | string;
  initialProduct?: PimProduct | null;
  onSaved?: (data: PimVariantPublishControl) => void;
  onCancel?: () => void;
  onOpenPimEditor?: (productId: number) => void;
  isModal?: boolean;
}

export function PimVariantPublishControlEditor({
  productId,
  initialProduct,
  onSaved,
  onCancel,
  onOpenPimEditor,
  isModal = false,
}: PimVariantPublishControlEditorProps) {
  const [data, setData] = useState<PimVariantPublishControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Local draft states
  const [localVariants, setLocalVariants] = useState<PimVariantPublishRow[]>([]);
  const [basePublished, setBasePublished] = useState(false);
  const [basePrice, setBasePrice] = useState<string>("");
  const [baseEmi, setBaseEmi] = useState(true);
  const [baseRent, setBaseRent] = useState(false);
  const [baseLease, setBaseLease] = useState(false);
  const [baseSale, setBaseSale] = useState(true);
  const [dirty, setDirty] = useState(false);

  // Filters & UX
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  const syncBase = useCallback((base: PimVariantPublishControl["base"]) => {
    setBasePublished(base.is_published);
    setBasePrice(base.base_price ?? "");
    setBaseEmi(base.is_emi_enabled);
    setBaseRent(base.is_rent_enabled);
    setBaseLease(base.is_lease_enabled);
    setBaseSale(base.is_direct_sale_enabled);
  }, []);

  const load = useCallback(() => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    getVariantPublishControl(productId)
      .then((d) => {
        setData(d);
        setLocalVariants(d.variants);
        syncBase(d.base);
        setDirty(false);
      })
      .catch((e) => setError(e?.message ?? "Failed to load variant publish control."))
      .finally(() => setLoading(false));
  }, [productId, syncBase]);

  useEffect(() => {
    load();
  }, [load]);

  // Flash notice timeout
  useEffect(() => {
    if (!successNotice) return;
    const timer = setTimeout(() => setSuccessNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [successNotice]);

  // Save changes handler
  const save = useCallback(async () => {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await patchVariantPublishControl(productId, {
        base_published: basePublished,
        base_price: basePrice || null,
        is_emi_enabled: baseEmi,
        is_rent_enabled: baseRent,
        is_lease_enabled: baseLease,
        is_direct_sale_enabled: baseSale,
        variants: localVariants.map((v) => ({
          id: v.id,
          is_published: v.is_published,
          is_emi_enabled: v.is_emi_enabled,
          is_rent_enabled: v.is_rent_enabled,
          is_lease_enabled: v.is_lease_enabled,
          is_direct_sale_enabled: v.is_direct_sale_enabled,
        })),
      });
      setData(result);
      setLocalVariants(result.variants);
      syncBase(result.base);
      setDirty(false);
      setSuccessNotice("Publish control and channel settings saved successfully!");
      onSaved?.(result);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [productId, basePublished, basePrice, baseEmi, baseRent, baseLease, baseSale, localVariants, syncBase, onSaved]);

  // Keyboard shortcut: Ctrl+S / Cmd+S saves
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) {
          void save();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save, dirty, saving]);

  // Bulk toggle all variants
  async function applyAll(flag: boolean) {
    if (!productId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await patchVariantPublishControl(productId, { all: flag });
      setData(result);
      setLocalVariants(result.variants);
      syncBase(result.base);
      setDirty(false);
      setSuccessNotice(flag ? "All variants and base published!" : "All variants and base drafted!");
      onSaved?.(result);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Bulk toggle failed.");
    } finally {
      setSaving(false);
    }
  }

  // Bulk channel toggles across all variants
  function toggleBulkChannel(
    channel: "is_emi_enabled" | "is_rent_enabled" | "is_lease_enabled" | "is_direct_sale_enabled",
    flag: boolean
  ) {
    setLocalVariants((prev) =>
      prev.map((v) => ({
        ...v,
        [channel]: flag,
      }))
    );
    if (channel === "is_emi_enabled") setBaseEmi(flag);
    if (channel === "is_rent_enabled") setBaseRent(flag);
    if (channel === "is_lease_enabled") setBaseLease(flag);
    if (channel === "is_direct_sale_enabled") setBaseSale(flag);
    setDirty(true);
  }

  function toggleVariant(id: number) {
    setLocalVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const nextPublished = !v.is_published;
        return { ...v, is_published: nextPublished };
      })
    );
    // If a variant is published, base should automatically be marked published
    const target = localVariants.find((v) => v.id === id);
    if (target && !target.is_published && !basePublished) {
      setBasePublished(true);
    }
    setDirty(true);
  }

  function toggleBase() {
    setBasePublished((prev) => !prev);
    setDirty(true);
  }

  function toggleMode(
    id: number,
    field: "is_emi_enabled" | "is_rent_enabled" | "is_lease_enabled" | "is_direct_sale_enabled"
  ) {
    setLocalVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: !v[field] } : v))
    );
    setDirty(true);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedSku(text);
    setTimeout(() => setCopiedSku(null), 2000);
  }

  // Filtered variants
  const filteredVariants = useMemo(() => {
    return localVariants.filter((variant) => {
      // Status filter
      if (statusFilter === "published" && !variant.is_published) return false;
      if (statusFilter === "draft" && variant.is_published) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const skuMatch = variant.sku?.toLowerCase().includes(q);
        const nameMatch = variant.name?.toLowerCase().includes(q);
        const codeMatch = variant.code?.toLowerCase().includes(q);
        if (!skuMatch && !nameMatch && !codeMatch) return false;
      }
      return true;
    });
  }, [localVariants, statusFilter, searchQuery]);

  const allPublished = localVariants.length > 0 && localVariants.every((v) => v.is_published);
  const nonePublished = localVariants.every((v) => !v.is_published);
  const publishedCount = localVariants.filter((v) => v.is_published).length;
  const draftCount = localVariants.length - publishedCount;

  if (loading) {
    return <ERPLoadingState label="Loading variant publish & channel control…" />;
  }

  if (error && !data) {
    return <ERPErrorState title="Failed to load publish control" description={error} onRetry={load} />;
  }

  if (!data) {
    return <ERPEmptyState title="No data" description="No variant publish control data available." />;
  }

  const baseName = data.base.name || initialProduct?.name || data.base.code;
  const baseCode = data.base.code || initialProduct?.code;

  return (
    <div className="space-y-5">
      {/* Success Notification Banner */}
      {successNotice && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-200 shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Error Notification Banner */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40 px-4 py-3 text-xs font-semibold text-rose-800 dark:text-rose-300 animate-in fade-in duration-200 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Blueprint Status
          </span>
          <div className="mt-1 flex items-center justify-between">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                basePublished
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              }`}
            >
              {basePublished ? "Live (Published)" : "Draft (Private)"}
            </span>
            <button
              type="button"
              onClick={toggleBase}
              className="text-xs text-primary font-semibold hover:underline"
              title="Click to toggle blueprint visibility"
            >
              Toggle
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Base Price (MRP)
          </span>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-xs text-muted-foreground font-semibold">₹</span>
            <span className="text-sm font-bold font-mono text-foreground">
              {basePrice ? Number(basePrice).toLocaleString("en-IN") : "Not set"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Variant SKUs
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-bold font-mono text-foreground">
              {localVariants.length}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ({publishedCount} live, {draftCount} draft)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Channels Active
          </span>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            {baseEmi && (
              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                SFEMI
              </span>
            )}
            {baseSale && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
                Sale
              </span>
            )}
            {baseRent && (
              <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                Rent
              </span>
            )}
            {baseLease && (
              <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800">
                Lease
              </span>
            )}
            {!baseEmi && !baseSale && !baseRent && !baseLease && (
              <span className="text-[11px] text-muted-foreground">None enabled</span>
            )}
          </div>
        </div>
      </div>

      {/* BASE PRODUCT ROW CARD */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5 border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Root Blueprint / Base Product
            </span>
            <span className="text-[11px] text-muted-foreground">
              (Root PIM record — controls discoverability and fallback commercial lines)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PublishBadge published={basePublished} />
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_auto] gap-4 items-center">
          {/* Identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded border text-foreground">
                {baseCode}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(baseCode || "")}
                className="text-muted-foreground hover:text-foreground text-[11px] inline-flex items-center gap-1"
                title="Copy code"
              >
                {copiedSku === baseCode ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
            <h3 className="font-bold text-sm text-foreground truncate mt-1">{baseName}</h3>
            <p className="text-xs text-muted-foreground">
              Publishing the base product makes it discoverable in billing, EMI subscriptions, and inventory.
            </p>
          </div>

          {/* Pricing & Commercial Channels */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Base Price:</span>
              <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-2xs">
                <span className="text-muted-foreground text-xs font-bold">₹</span>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => {
                    setBasePrice(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="Base Price"
                  className="w-28 bg-transparent text-xs font-bold font-mono tabular-nums text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Commercial Line Permissions:
              </span>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  { field: "is_emi_enabled", label: "SFEMI (EMI)", val: baseEmi, setVal: setBaseEmi },
                  { field: "is_direct_sale_enabled", label: "Direct Sale", val: baseSale, setVal: setBaseSale },
                  { field: "is_rent_enabled", label: "Furniture Rent", val: baseRent, setVal: setBaseRent },
                  { field: "is_lease_enabled", label: "Furniture Lease", val: baseLease, setVal: setBaseLease },
                ].map(({ label, val, setVal }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setVal(!val);
                      setDirty(true);
                    }}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition border ${
                      val
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {val ? <Check className="h-3 w-3 text-emerald-600" /> : <X className="h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-muted/30 border border-border/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Live Visibility
            </span>
            <button
              type="button"
              onClick={toggleBase}
              className="transition hover:scale-105 cursor-pointer"
              title={basePublished ? "Click to set Draft" : "Click to set Live"}
            >
              {basePublished ? (
                <ToggleRight className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ToggleLeft className="h-8 w-8 text-slate-400 dark:text-slate-600" />
              )}
            </button>
            <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">
              {basePublished ? "LIVE" : "DRAFT"}
            </span>
          </div>
        </div>
      </div>

      {/* VARIANTS WORKBENCH SECTION */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {/* Header & Bulk Actions Toolbar */}
        <div className="p-4 border-b border-border bg-muted/30 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">
                  Variant SKUs Control
                </h4>
                <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {publishedCount} / {localVariants.length} Live
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toggle each SKU independently or use bulk action controls below.
              </p>
            </div>

            {/* Bulk Actions Button Group */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyAll(true)}
                disabled={saving || allPublished || localVariants.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-100 disabled:opacity-40"
                title="Publish blueprint and all variants immediately"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Publish all
              </button>

              <button
                type="button"
                onClick={() => applyAll(false)}
                disabled={saving || nonePublished || localVariants.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-100 disabled:opacity-40"
                title="Draft all variants immediately"
              >
                <Square className="h-3.5 w-3.5" />
                Draft all
              </button>

              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
                title="Reload from server"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Search, Filter Tabs & Bulk Channel Bar */}
          {localVariants.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-border/60">
              {/* Search input */}
              <div className="relative min-w-[200px] flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search variant SKU or name…"
                  className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 py-1 rounded font-semibold transition ${
                    statusFilter === "all"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({localVariants.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("published")}
                  className={`px-2.5 py-1 rounded font-semibold transition ${
                    statusFilter === "published"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Published ({publishedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("draft")}
                  className={`px-2.5 py-1 rounded font-semibold transition ${
                    statusFilter === "draft"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Draft ({draftCount})
                </button>
              </div>

              {/* Quick Bulk Channel Controls */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="font-semibold">Bulk channels:</span>
                <button
                  type="button"
                  onClick={() => toggleBulkChannel("is_emi_enabled", true)}
                  className="px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-100"
                  title="Enable SFEMI across all variants"
                >
                  +SFEMI
                </button>
                <button
                  type="button"
                  onClick={() => toggleBulkChannel("is_direct_sale_enabled", true)}
                  className="px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100"
                  title="Enable Direct Sale across all variants"
                >
                  +Sale
                </button>
                <button
                  type="button"
                  onClick={() => toggleBulkChannel("is_rent_enabled", true)}
                  className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100"
                  title="Enable Furniture Rent across all variants"
                >
                  +Rent
                </button>
                <button
                  type="button"
                  onClick={() => toggleBulkChannel("is_lease_enabled", true)}
                  className="px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold hover:bg-purple-100"
                  title="Enable Furniture Lease across all variants"
                >
                  +Lease
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Variants List or Empty State */}
        {localVariants.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-2xs">
              <Layers className="h-6 w-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h5 className="text-sm font-bold text-foreground">No variant SKUs generated yet</h5>
              <p className="text-xs text-muted-foreground mt-1">
                This blueprint currently operates as a standalone product with 0 variants. You can publish or draft the base product above, or launch the PIM Editor to generate variants.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={toggleBase}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs"
              >
                {basePublished ? <EyeOff className="h-3.5 w-3.5 text-amber-600" /> : <Eye className="h-3.5 w-3.5 text-emerald-600" />}
                {basePublished ? "Draft Base Product" : "Publish Base Product Now"}
              </button>
              {onOpenPimEditor ? (
                <button
                  type="button"
                  onClick={() => onOpenPimEditor(Number(productId))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-2xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Open PIM Editor to Generate Variants
                </button>
              ) : (
                <Link
                  href={`/admin/pim/products/${productId}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-2xs"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Open PIM Editor to Generate Variants
                </Link>
              )}
            </div>
          </div>
        ) : filteredVariants.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No variants match your current filter query (&ldquo;{searchQuery}&rdquo;).
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="ml-2 text-primary font-semibold hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-x-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_auto] gap-4 px-5 py-2.5 bg-muted/40 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground min-w-[650px]">
              <div>SKU / Variant Name</div>
              <div>Price</div>
              <div>Commercial Channels</div>
              <div>Status</div>
              <div className="text-right">Live Toggle</div>
            </div>

            {/* Variant Rows */}
            {filteredVariants.map((variant) => (
              <div
                key={variant.id}
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 transition hover:bg-muted/20 min-w-[650px]"
              >
                {/* SKU and name */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-foreground truncate">
                      {variant.sku}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(variant.sku)}
                      className="text-muted-foreground hover:text-foreground text-[10px]"
                      title="Copy SKU"
                    >
                      {copiedSku === variant.sku ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{variant.name}</p>
                </div>

                {/* Price */}
                <div className="text-xs font-mono font-semibold text-foreground">
                  {variant.price ? `₹${Number(variant.price).toLocaleString("en-IN")}` : "—"}
                </div>

                {/* Commercial Channels Pills */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {(
                    [
                      ["is_emi_enabled", "SFEMI", variant.is_emi_enabled] as const,
                      ["is_direct_sale_enabled", "Sale", variant.is_direct_sale_enabled] as const,
                      ["is_rent_enabled", "Rent", variant.is_rent_enabled] as const,
                      ["is_lease_enabled", "Lease", variant.is_lease_enabled] as const,
                    ]
                  ).map(([field, labelText, enabled]) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => toggleMode(variant.id, field)}
                      className={`rounded px-1.5 py-0.5 font-semibold transition border ${
                        enabled
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                      title={`Toggle ${labelText} channel for this variant`}
                    >
                      {enabled ? "✓" : "×"} {labelText}
                    </button>
                  ))}
                </div>

                {/* Status Badge */}
                <div>
                  <PublishBadge published={variant.is_published} />
                </div>

                {/* Live Toggle Switch */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => toggleVariant(variant.id)}
                    className="transition hover:scale-110 cursor-pointer"
                    title={variant.is_published ? "Click to set Draft" : "Click to Publish"}
                  >
                    {variant.is_published ? (
                      <ToggleRight className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-slate-400 dark:text-slate-600" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STICKY SAVE / DISCARD BAR */}
      {dirty && (
        <div
          className={`${
            isModal ? "sticky bottom-0" : "sticky bottom-4"
          } z-20 flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-card/95 backdrop-blur-md px-5 py-3 shadow-xl animate-in slide-in-from-bottom-2 duration-150`}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              You have unsaved publish & channel changes.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={load}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Save Changes <span className="opacity-75 text-[10px] hidden sm:inline">(Ctrl+S)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// POP-UP MODAL SHELL COMPONENT
// ============================================================================

export interface PimVariantPublishControlModalProps {
  productId: number;
  initialProduct?: PimProduct | null;
  onClose: () => void;
  onSaved?: (data: PimVariantPublishControl) => void;
  onOpenPimEditor?: (productId: number) => void;
}

export default function PimVariantPublishControlModal({
  productId,
  initialProduct,
  onClose,
  onSaved,
  onOpenPimEditor,
}: PimVariantPublishControlModalProps) {
  const [product, setProduct] = useState<PimProduct | null>(initialProduct || null);

  useEffect(() => {
    let active = true;
    pimService
      .getProduct(productId)
      .then((p) => {
        if (active) setProduct(p);
      })
      .catch((err) => {
        console.warn("Could not load product details for publish control header", err);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Keyboard shortcut: Escape closes modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const displayName = product?.name || initialProduct?.name || `Product #${productId}`;
  const code = product?.code || initialProduct?.code;
  const isPublished = product?.is_published ?? initialProduct?.is_published;
  const productType = product?.product_type || initialProduct?.product_type || "FINISHED_GOOD";
  const categoryPath = [
    product?.category_name || initialProduct?.category_name,
    product?.subcategory_name || initialProduct?.subcategory_name,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-publish-control-title"
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5 bg-muted/40 shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0 shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300 border border-violet-500/20">
                  <SlidersHorizontal className="h-3 w-3" /> Publish & Channel Control Pop-up Window
                </span>
                {code && (
                  <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded border text-foreground">
                    {code}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isPublished
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  {isPublished ? "Published (Live)" : "Draft (Private)"}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {productType.replace(/_/g, " ")}
                </span>
              </div>
              <h2
                id="modal-publish-control-title"
                className="text-base sm:text-lg font-bold text-foreground truncate mt-0.5"
              >
                {displayName}
              </h2>
              {categoryPath && (
                <p className="text-xs text-muted-foreground truncate">{categoryPath}</p>
              )}
            </div>
          </div>

          {/* Action buttons on header: Full Page Window option + Close */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/admin/pim/products/${productId}/variants/publish-control`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors shadow-2xs"
              title="Open full page publish control window in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full Page Window
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close Pop-up Window"
              title="Close Pop-up Window (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6">
          <PimVariantPublishControlEditor
            productId={productId}
            initialProduct={product || initialProduct}
            isModal={true}
            onCancel={onClose}
            onSaved={(savedData) => {
              if (product) {
                setProduct({
                  ...product,
                  is_published: savedData.base.is_published,
                  base_price: savedData.base.base_price ?? "",
                });
              }
              onSaved?.(savedData);
            }}
            onOpenPimEditor={onOpenPimEditor}
          />
        </div>
      </div>
    </div>
  );
}
