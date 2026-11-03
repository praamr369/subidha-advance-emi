"use client";

import { useEffect, useState, useCallback } from "react";
import {
  History,
  RotateCw,
  Clock,
  User,
  ArrowRight,
  ShieldCheck,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Calendar,
} from "lucide-react";
import DrawerShell from "@/components/ui/DrawerShell";
import { pimService, type PimVariant, type VariantAuditEntry } from "@/services/pim";

interface VariantHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  variant?: PimVariant | null;
  product?: any | null;
}

function formatCurrency(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(num)) return String(val);
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatFieldValue(field: string, val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (field === "price" || field === "cost_price") {
    return formatCurrency(val);
  }
  if (field === "is_active") {
    return val ? "Active" : "Inactive";
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

function fieldDisplayName(field: string): string {
  const map: Record<string, string> = {
    price: "Price",
    cost_price: "Cost Price",
    base_price: "Base Price",
    sku: "SKU Code",
    code: "Product Code",
    name: "Product Name",
    variant_name: "Variant Name",
    barcode: "Barcode",
    quantity_on_hand: "Stock On Hand",
    reorder_level: "Reorder Level",
    is_active: "Active Status",
    is_published: "Public Catalog Visibility",
    brand: "Brand",
    category_id: "Category ID",
    subcategory_id: "Subcategory ID",
    product_type: "Product Type",
    description: "Description",
    warranty_enabled: "Warranty Coverage",
    warranty_months_manufacturing: "Manufacturing Defect Warranty",
    warranty_months_structural: "Structural Frame Warranty",
    image: "Image Asset",
    video: "Video Asset",
    attributes: "Specifications / Attributes",
  };
  return map[field] || field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VariantHistoryDrawer({
  open,
  onClose,
  variant,
  product,
}: VariantHistoryDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<VariantAuditEntry[]>([]);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Record<number, boolean>>({});
  const [includeVariants, setIncludeVariants] = useState(true);

  const loadTimeline = useCallback(async () => {
    if (!variant?.id && !product?.id) return;
    setLoading(true);
    setError(null);
    try {
      let res: VariantAuditEntry[] = [];
      if (variant?.id) {
        res = await pimService.getVariantTimeline(variant.id);
      } else if (product?.id) {
        res = await pimService.getProductTimeline(product.id, includeVariants);
      }
      const list = Array.isArray(res) ? res : (res as any)?.results || [];
      setEntries(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load audit history.");
    } finally {
      setLoading(false);
    }
  }, [variant?.id, product?.id, includeVariants]);

  useEffect(() => {
    if (open && (variant?.id || product?.id)) {
      void loadTimeline();
    } else {
      setEntries([]);
      setError(null);
    }
  }, [open, variant?.id, product?.id, loadTimeline]);

  const toggleSnapshot = (id: number) => {
    setExpandedSnapshots((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const title = variant
    ? `Edit History: ${variant.sku}`
    : product
    ? `Edit History: ${product.code}`
    : "Edit History";

  const subtitle = variant
    ? `${variant.variant_name || variant.product_name || "Variant SKU"} · Current Price: ${formatCurrency(variant.price)}`
    : product
    ? `${product.name} · ${product.parent_id ? "Child Variant Product" : "Base Product"} · Base Price: ${formatCurrency(product.base_price)}`
    : undefined;

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      size="wide"
      footer={
        <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
          <span>{entries.length} revision{entries.length === 1 ? "" : "s"} recorded</span>
          <button
            type="button"
            onClick={loadTimeline}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Variant Info Pill Banner */}
        {variant && (
          <div className="rounded-xl border bg-muted/30 p-3.5 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <span className="font-mono font-semibold text-foreground">{variant.sku}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  variant.is_active
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {variant.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>On Hand: <strong className="text-foreground">{variant.quantity_on_hand}</strong></span>
              <span>Reorder: <strong className="text-foreground">{variant.reorder_level}</strong></span>
              {variant.barcode && (
                <span className="font-mono">BC: {variant.barcode}</span>
              )}
            </div>
          </div>
        )}

        {/* Product Info Pill Banner */}
        {product && !variant && (
          <div className="rounded-xl border bg-muted/30 p-3.5 flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <span className="font-mono font-semibold text-foreground">{product.code}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  product.parent_id
                    ? "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                }`}
              >
                {product.parent_id ? "Child Variant Product" : "Base Product"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  product.is_published
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {product.is_published ? "Published" : "Draft"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              {product.category_name && <span>Category: <strong className="text-foreground">{product.category_name}</strong></span>}
              {!product.parent_id && (
                <button
                  type="button"
                  onClick={() => setIncludeVariants((v) => !v)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                    includeVariants
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {includeVariants ? "✓ Include Variant SKUs" : "+ Include Variant SKUs"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
            <RotateCw className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Loading variant audit trail…</p>
            <p className="text-xs text-muted-foreground">Retrieving revision snapshots and field diffs</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">Unable to load audit history</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</p>
              <button
                type="button"
                onClick={loadTimeline}
                className="mt-2 text-xs font-semibold text-red-800 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && entries.length === 0 && (
          <div className="py-12 rounded-xl border border-dashed flex flex-col items-center justify-center text-center p-6 bg-muted/10">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
              <History className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">No Edit History Recorded Yet</h4>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Field-level before/after diffs and snapshots are captured automatically whenever this variant’s price,
              stock, specifications, or attributes are edited.
            </p>
          </div>
        )}

        {/* Timeline List */}
        {!loading && !error && entries.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Revision History (Newest First)</span>
              <span>Audited by Subidha ERP Security</span>
            </div>

            <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border space-y-4">
              {entries.map((entry, idx) => {
                const dateObj = new Date(entry.created_at);
                const dateStr = isNaN(dateObj.getTime())
                  ? entry.created_at
                  : dateObj.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                const timeStr = isNaN(dateObj.getTime())
                  ? ""
                  : dateObj.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    });

                const isCreated = entry.action_type === "PRODUCT_VARIANT_CREATED";
                const changes = entry.metadata?.changes || {};
                const snapshot = entry.metadata?.snapshot || {};
                const hasChanges = Object.keys(changes).length > 0;
                const isSnapshotOpen = Boolean(expandedSnapshots[entry.id]);

                return (
                  <div key={entry.id} className="relative group">
                    {/* Timeline Node Icon */}
                    <div
                      className={`absolute -left-6 top-1 h-5 w-5 rounded-full border-2 bg-background flex items-center justify-center ${
                        isCreated
                          ? "border-emerald-500 text-emerald-600"
                          : "border-primary text-primary"
                      }`}
                    >
                      {isCreated ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-2.5 w-2.5" />
                      )}
                    </div>

                    {/* Revision Card */}
                    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3 hover:border-foreground/20 transition-colors">
                      {/* Card Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                              isCreated
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300"
                            }`}
                          >
                            {isCreated ? "Variant Created" : "Variant Updated"}
                          </span>

                          <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                            <User className="h-3 w-3" />
                            {entry.performed_by_username || "Admin Staff"}
                          </span>

                          {entry.metadata?.event && (
                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded border">
                              {entry.metadata.event}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                          <Calendar className="h-3 w-3" />
                          <span>{dateStr}</span>
                          <span>·</span>
                          <span>{timeStr}</span>
                        </div>
                      </div>

                      {/* Field Diff Section */}
                      {hasChanges && !isCreated && (
                        <div className="rounded-lg border overflow-hidden bg-background">
                          <div className="bg-muted/40 px-3 py-1.5 border-b text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                            <Layers className="h-3 w-3 text-primary" />
                            Changed Fields & Before/After Snapshot
                          </div>
                          <div className="divide-y text-xs">
                            {Object.entries(changes).map(([field, diff]) => {
                              if (field === "attributes" && typeof diff === "object") {
                                const oldAttrs = (diff?.old || {}) as Record<string, unknown>;
                                const newAttrs = (diff?.new || {}) as Record<string, unknown>;
                                const allKeys = Array.from(new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]));

                                return (
                                  <div key={field} className="p-3 bg-muted/10 space-y-1.5">
                                    <div className="font-semibold text-foreground text-[11px]">
                                      Attributes / Specifications Changed:
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                      {allKeys.map((attrKey) => (
                                        <div key={attrKey} className="rounded border bg-background p-2">
                                          <div className="text-[10px] font-medium text-muted-foreground uppercase">{attrKey}</div>
                                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <span className="line-through text-red-600 bg-red-50 dark:bg-red-950/40 px-1 py-0.5 rounded text-[11px]">
                                              {String(oldAttrs[attrKey] ?? "—")}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.5 rounded text-[11px]">
                                              {String(newAttrs[attrKey] ?? "—")}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={field} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                                  <span className="font-medium text-muted-foreground min-w-[120px]">
                                    {fieldDisplayName(field)}
                                  </span>
                                  <div className="flex items-center gap-2 flex-wrap text-right font-mono text-xs">
                                    <span className="line-through text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                                      {formatFieldValue(field, diff?.old)}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                                      {formatFieldValue(field, diff?.new)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Initial Created State Banner */}
                      {isCreated && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/50 p-3 text-xs text-emerald-900 dark:text-emerald-300">
                          Initial SKU registered with Price: <strong>{formatCurrency(snapshot.price)}</strong>,
                          Stock: <strong>{String(snapshot.quantity_on_hand ?? 0)} units</strong>.
                        </div>
                      )}

                      {/* Full Snapshot Collapsible */}
                      {Boolean(snapshot && Object.keys(snapshot).length > 0) && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleSnapshot(entry.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                          >
                            <FileCode className="h-3.5 w-3.5" />
                            <span>{isSnapshotOpen ? "Hide Complete Snapshot" : "View Complete Revision Snapshot"}</span>
                          </button>

                          {isSnapshotOpen && (
                            <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">Price</span>
                                  <span className="font-mono font-semibold">{formatCurrency(snapshot.price)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">Cost Price</span>
                                  <span className="font-mono">{formatCurrency(snapshot.cost_price)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">Stock on Hand</span>
                                  <span className="font-mono font-semibold">{String(snapshot.quantity_on_hand ?? 0)}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">SKU</span>
                                  <span className="font-mono">{String(snapshot.sku || "—")}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">Barcode</span>
                                  <span className="font-mono">{String(snapshot.barcode || "—")}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block">Status</span>
                                  <span className="font-medium">{snapshot.is_active ? "Active" : "Inactive"}</span>
                                </div>
                              </div>

                              {Boolean(snapshot.attributes && typeof snapshot.attributes === "object" && Object.keys(snapshot.attributes).length > 0) && (
                                <div className="border-t pt-2 mt-2">
                                  <span className="text-[10px] text-muted-foreground uppercase block mb-1">Specifications</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries((snapshot.attributes || {}) as Record<string, unknown>).map(([k, v]) => (
                                      <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border bg-background text-[11px]">
                                        <span className="text-muted-foreground">{k}:</span>
                                        <span className="font-medium">{String(v)}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
