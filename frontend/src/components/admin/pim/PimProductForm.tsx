"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Layers,
  Box,
  Send,
  CheckCircle2,
  X,
  Plus,
  Search,
  Trash2,
  Factory,
  Wrench,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  FolderCog,
  Settings2,
  Eye,
  EyeOff,
  Sparkles,
  Puzzle,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getVariantPublishControl, patchVariantPublishControl } from "@/services/product-pim";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import DynamicAttributeForm, { type AttributeValues } from "./DynamicAttributeForm";
import CategoryManageWorkbench from "./CategoryManageWorkbench";

const VariantManager = dynamic(() => import("./VariantManager"), {
  loading: () => <ERPLoadingState label="Loading variant manager..." />,
  ssr: false,
});
const RelatedProductsSection = dynamic(() => import("../products/RelatedProductsSection"), {
  loading: () => <ERPLoadingState label="Loading related products..." />,
  ssr: false,
});
const StockLedgerPanel = dynamic(() => import("@/components/inventory/StockLedgerPanel"), {
  loading: () => <ERPLoadingState label="Loading stock ledger..." />,
  ssr: false,
});
import PimProductAccessoriesPanel from "./PimProductAccessoriesPanel";
import ProductMediaGallery from "./ProductMediaGallery";
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
  defaultProductType?: "FINISHED_GOOD" | "RAW_MATERIAL" | "ACCESSORY" | "SERVICE";
  variant?: "page" | "drawer";
  onSaved?: (product: PimProduct) => void;
  onCancel?: () => void;
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
    const v = values[attr.id] || { value_text: "", value_number: "", value_boolean: null, value_date: "" };
    result.push({
      attribute: attr.id,
      value_text: v.value_text || "",
      value_number: v.value_number ? Number(v.value_number) : null,
      value_boolean: v.value_boolean !== undefined ? v.value_boolean : null,
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
          <button aria-expanded={open} type="button" onClick={handleToggle} className="flex items-center gap-2 min-w-0">
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

          {/* Related Products / Explicit BOM / Services */}
          <div className="pt-4 border-t mt-4">
            <RelatedProductsSection
              productId={productId}
              productName={variant.variant_label || variant.sku}
              saving={generating}
              lockedParentVariantSku={variant.sku}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory Management panel (shown on base product PIM edit page)
// ---------------------------------------------------------------------------

function PimInventoryPanel({
  variants,
  productCode,
  onRefresh,
}: {
  variants: PimVariant[];
  productCode: string;
  onRefresh?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [stockVal, setStockVal] = useState<string>("");
  const [savingStock, setSavingStock] = useState<boolean>(false);
  const [ledgerKey, setLedgerKey] = useState<number>(0);

  const handleStockSave = async (variantId: number) => {
    if (savingStock) return;
    setSavingStock(true);
    try {
      await pimService.updateStock(variantId, Number(stockVal));
      setEditingStockId(null);
      onRefresh?.();
      setLedgerKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to update variant stock", err);
    } finally {
      setSavingStock(false);
    }
  };

  return (
    <section className="rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Box className="h-4 w-4 text-primary" />
            Inventory Management
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Prepare stock profiles and view current on-hand quantities for each variant SKU.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-5">
          <div className="divide-y divide-border rounded-xl border overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_120px_1fr] gap-3 px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground">
              <span>SKU / Variant</span>
              <span className="text-right">On Hand</span>
              <span className="text-right">Actions</span>
            </div>
            {variants.map((v) => (
              <div key={v.id} className="grid grid-cols-[1fr_120px_1fr] gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                <div>
                  <span className="font-mono text-sm font-semibold">{v.sku}</span>
                  {v.variant_label && v.variant_label !== v.sku && (
                    <span className="ml-2 text-xs text-muted-foreground">{v.variant_label}</span>
                  )}
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {v.is_published ? (
                      <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 rounded-full px-1.5 py-0.5">Published</span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5">Draft</span>
                    )}
                    {v.is_low_stock && (
                      <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 rounded-full px-1.5 py-0.5">Low Stock</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {editingStockId === v.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        className="w-16 rounded border px-2 py-0.5 text-xs bg-background"
                        value={stockVal}
                        onChange={(e) => setStockVal(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleStockSave(v.id)}
                        disabled={savingStock}
                        className="text-green-600 hover:text-green-700 disabled:opacity-50"
                        title="Save Stock"
                      >
                        {savingStock ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingStockId(null)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group inline-flex flex-col items-end hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setEditingStockId(v.id);
                        setStockVal(String(v.quantity_on_hand));
                      }}
                      title="Click to adjust stock"
                    >
                      <span className={`text-sm font-semibold tabular-nums underline decoration-dashed underline-offset-2 ${v.quantity_on_hand === 0 ? "text-amber-600" : "text-foreground"}`}>
                        {v.quantity_on_hand}
                      </span>
                      <span className="text-[10px] text-muted-foreground">units (edit)</span>
                    </button>
                  )}
                </div>
                <div className="flex justify-end gap-2 flex-wrap items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedSku(selectedSku === v.sku ? "" : v.sku)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      selectedSku === v.sku
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    {selectedSku === v.sku ? "Showing in Ledger" : "Filter Ledger"}
                  </button>
                  {v.operational_product_id ? (
                    <>
                      <a
                        href={`/admin/products/${v.operational_product_id}/edit`}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Wrench className="h-3 w-3" />
                        Prepare Inventory
                      </a>
                      <a
                        href={`/admin/inventory/items?search=${encodeURIComponent(v.sku)}`}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                      >
                        <Box className="h-3 w-3" />
                        Open Stock
                      </a>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Not linked to register</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border overflow-hidden bg-background">
            <div className="border-b bg-muted/20 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-muted-foreground">
                Authoritative movement history from the same live inventory ledger used by Inventory → Stock Ledger.
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-muted-foreground mr-1">Filter Variant:</span>
                <button
                  type="button"
                  onClick={() => setSelectedSku("")}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                    !selectedSku ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({variants.length})
                </button>
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedSku(v.sku)}
                    className={`rounded-md px-2 py-0.5 text-xs font-mono transition-colors ${
                      selectedSku === v.sku ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v.sku}
                  </button>
                ))}
              </div>
            </div>
            <StockLedgerPanel
              key={`${ledgerKey}-${selectedSku}`}
              search={selectedSku || productCode}
              title={selectedSku ? `Live Inventory Ledger — SKU: ${selectedSku}` : "Live Inventory Ledger (All Variants)"}
            />
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl border px-4 py-3 space-y-1">
          <div><strong>On Hand (edit)</strong> — click the quantity to directly adjust stock. Updates are posted to the authoritative Stock Ledger in real time.</div>
          <div><strong>Filter Ledger</strong> — filters the Live Inventory Ledger table to movements for that specific SKU.</div>
          <div><strong>Prepare Inventory</strong> — opens the product register edit page where you can set up the inventory profile (cost price, reorder levels, bin location).</div>
          <div><strong>Open Stock</strong> — opens the stock ledger filtered to this SKU to view movements and post opening stock entries.</div>
        </div>
      )}
    </section>
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

export default function PimProductForm({
  productId,
  defaultProductType = "FINISHED_GOOD",
  variant = "page",
  onSaved,
  onCancel,
}: Props) {
  const router = useRouter();
  const [activeProductId, setActiveProductId] = useState<number | undefined>(productId);
  const isEdit = Boolean(activeProductId);
  const [productType, setProductType] = useState<"FINISHED_GOOD" | "RAW_MATERIAL" | "ACCESSORY" | "SERVICE">(defaultProductType);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<string>("ALL");
  const [searchResults, setSearchResults] = useState<PimProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [autoPublishOnCreate, setAutoPublishOnCreate] = useState(false);

  // Channel availability flags
  const [channelDirectSale, setChannelDirectSale] = useState(true);
  const [channelEmi, setChannelEmi] = useState(true);
  const [channelRent, setChannelRent] = useState(false);
  const [channelLease, setChannelLease] = useState(false);

  useEffect(() => {
    if (productId !== undefined) {
      setActiveProductId(productId);
    }
  }, [productId]);

  const pendingFetchRef = useRef<{ id: number; promise: Promise<PimProduct> } | null>(null);

  const [categories, setCategories] = useState<PimCategory[]>([]);
  const [subcategories, setSubcategories] = useState<PimSubcategory[]>([]);
  const [attributes, setAttributes] = useState<PimCategoryAttribute[]>([]);
  const [product, setProduct] = useState<PimProduct | null>(null);

  const [code, setCode] = useState("");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [subcategoryId, setSubcategoryId] = useState<number | "">("");
  const [basePrice, setBasePrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [rentYieldPercent, setRentYieldPercent] = useState("");
  const [leaseYieldPercent, setLeaseYieldPercent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  
  // Warranty State
  const [warrantyEnabled, setWarrantyEnabled] = useState(true);
  const [warrantyMonthsManufacturing, setWarrantyMonthsManufacturing] = useState<number>(12);
  const [warrantyMonthsStructural, setWarrantyMonthsStructural] = useState<number>(36);
  const [warrantyMonthsExtendedMax, setWarrantyMonthsExtendedMax] = useState<number>(12);
  const [extendedWarrantyCostPercentage, setExtendedWarrantyCostPercentage] = useState<string>("7.5");

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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manage Categories & Attributes Workbench modal
  const [manageWorkbenchOpen, setManageWorkbenchOpen] = useState(false);
  const [refreshingTaxonomy, setRefreshingTaxonomy] = useState(false);
  const [taxonomyNotice, setTaxonomyNotice] = useState<string | null>(null);

  // Session draft auto-save and recovery
  const draftKey = `pim_draft_${activeProductId ?? "new"}`;
  const [draftRestored, setDraftRestored] = useState(false);
  const draftSavedRef = useRef<NodeJS.Timeout | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ child_pim_published: number; variants_activated: number; total_variants: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // "View in your room" AR size (cm)
  const [arWidth, setArWidth] = useState("");
  const [arDepth, setArDepth] = useState("");
  const [arHeight, setArHeight] = useState("");
  const [arSuggesting, setArSuggesting] = useState(false);
  const [arHint, setArHint] = useState<string | null>(null);

  const handleSuggestArSize = async () => {
    if (!activeProductId) return;
    setArSuggesting(true);
    setArHint(null);
    try {
      const { suggestion } = await pimService.getArSizeSuggestion(activeProductId);
      if (!suggestion) {
        setArHint("No size found in this product's attributes. Enter it by hand.");
        return;
      }
      setArWidth(String(suggestion.width_cm));
      setArDepth(String(suggestion.depth_cm));
      setArHeight(suggestion.height_cm == null ? "" : String(suggestion.height_cm));
      setArHint(
        `Filled from ${suggestion.source}. Check it against the real product (bed sizes are mattress sizes; the frame is larger), then save.`,
      );
    } catch {
      setArHint("Could not read the attributes.");
    } finally {
      setArSuggesting(false);
    }
  };

  useEffect(() => {
    pimService.getCategories().then(setCategories).catch(() => {});
    pimService.getAllAttributes().then((attrs) => {
      setAllAttributes(attrs);
      setAttributes((prev) =>
        prev.map((attr) => {
          const match = attrs.find((a) => a.id === attr.id);
          if (match && (!attr.options || attr.options.length === 0) && match.options?.length > 0) {
            return { ...attr, options: match.options, data_type: match.data_type || attr.data_type };
          }
          return attr;
        })
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!categoryId) { setSubcategories([]); return; }
    pimService.getSubcategories(Number(categoryId)).then(setSubcategories).catch(() => {});
  }, [categoryId]);

  useEffect(() => {
    let active = true;
    const cid = categoryId ? Number(categoryId) : undefined;
    const sid = subcategoryId ? Number(subcategoryId) : undefined;
    
    const promise = cid ? pimService.getAttributes(cid, sid) : Promise.resolve([]);
    
    promise.then((fetchedAttrs) => {
        if (!active) return;
        setAttributes(prev => {
          // 1. All category attributes returned from API
          const categoryAttrMap = new Map<number, PimCategoryAttribute>();
          fetchedAttrs.forEach(a => {
            if (!removedAttrIds.has(a.id)) {
              categoryAttrMap.set(a.id, a);
            }
          });

          // 2. Any attributes stored directly in product.attributes that actually have values
          const extraAttrs: PimCategoryAttribute[] = [];
          if (product && product.attributes) {
            for (const a of product.attributes) {
              if (categoryAttrMap.has(a.attribute) || removedAttrIds.has(a.attribute)) continue;
              const hasVal = (a.value_text && a.value_text.trim() !== "") ||
                             (a.value_number !== null && a.value_number !== undefined) ||
                             (a.value_boolean !== null && a.value_boolean !== undefined) ||
                             (a.value_date && a.value_date.trim() !== "");
              if (!hasVal) continue; // Ignore empty phantom rows
              const globalAttr = allAttributes.find((ga) => ga.id === a.attribute);
              const prevAttr = prev.find((p) => p.id === a.attribute);
              if (globalAttr) {
                extraAttrs.push(globalAttr);
              } else if (prevAttr) {
                extraAttrs.push(prevAttr);
              } else {
                extraAttrs.push({
                  id: a.attribute,
                  name: a.attribute_name,
                  slug: a.attribute_slug,
                  data_type: (a.data_type || "TEXT") as PimCategoryAttribute["data_type"],
                  is_required: a.is_required ?? false,
                  is_variant_defining: a.is_variant_defining ?? false,
                  min_value: null,
                  max_value: null,
                  display_order: 999,
                  is_active: a.is_active ?? true,
                  options: a.options ?? [],
                });
              }
            }
          }

          // 4. Any attributes present on the product's variants (ProductVariant attribute_values)
          const variantAttrs: PimCategoryAttribute[] = [];
          if (product && product.variants) {
            for (const v of product.variants) {
              for (const av of v.attribute_values || []) {
                const aid = av.attribute;
                if (!aid || categoryAttrMap.has(aid) || removedAttrIds.has(aid)) continue;
                if (extraAttrs.some(ea => ea.id === aid) || variantAttrs.some(va => va.id === aid)) continue;
                const globalAttr = allAttributes.find((ga) => ga.id === aid);
                const prevAttr = prev.find((p) => p.id === aid);
                if (globalAttr) {
                  variantAttrs.push(globalAttr);
                } else if (prevAttr) {
                  variantAttrs.push(prevAttr);
                } else {
                  variantAttrs.push({
                    id: aid,
                    name: av.attribute_name || `Attribute #${aid}`,
                    slug: av.attribute_slug || `attr-${aid}`,
                    data_type: (av.data_type || "CHOICE") as PimCategoryAttribute["data_type"],
                    is_required: false,
                    is_variant_defining: av.is_variant_defining ?? true,
                    min_value: null,
                    max_value: null,
                    display_order: 999,
                    is_active: av.is_active ?? true,
                    options: [],
                  });
                }
              }
            }
          }

          // 5. Unsaved manual additions from current session
          const sessionExtraAttrs = prev.filter(
            a => !categoryAttrMap.has(a.id) && 
                 !extraAttrs.some(ea => ea.id === a.id) &&
                 !variantAttrs.some(va => va.id === a.id) &&
                 !removedAttrIds.has(a.id)
          );

          const finalAttrs = [
            ...Array.from(categoryAttrMap.values()),
            ...extraAttrs,
            ...variantAttrs,
            ...sessionExtraAttrs,
          ];

          return finalAttrs.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) || a.name.localeCompare(b.name));
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [categoryId, subcategoryId, activeProductId, product, removedAttrIds, allAttributes]);

  useEffect(() => {
    if (!activeProductId) { setLoading(false); return; }
    let stale = false;
    if (!pendingFetchRef.current || pendingFetchRef.current.id !== activeProductId) {
      pendingFetchRef.current = { id: activeProductId, promise: pimService.getProductWithAttributes(activeProductId) };
    }
    const fetchPromise = pendingFetchRef.current.promise;
    setLoading(true);
    setError(null);
    fetchPromise
      .then((p) => {
        if (stale) return;
        setProduct(p);
        setCode(p.code);
        setBrand(p.brand ?? "");
        setName(p.name);
        setDescription(p.description ?? "");
        setCategoryId(p.category);
        setSubcategoryId(p.subcategory ?? "");
        setBasePrice(p.base_price);
        setCostPrice(p.cost_price ?? "");
        setRentYieldPercent(p.rent_monthly_yield_percent ?? "");
        setLeaseYieldPercent(p.lease_monthly_yield_percent ?? "");
        setArWidth(p.ar_width_cm ?? "");
        setArDepth(p.ar_depth_cm ?? "");
        setArHeight(p.ar_height_cm ?? "");
        setIsPublished(p.is_published);
        if (p.product_type) {
          setProductType(p.product_type);
        }
        setWarrantyEnabled(p.warranty_enabled ?? true);
        setWarrantyMonthsManufacturing(p.warranty_months_manufacturing ?? 12);
        setWarrantyMonthsStructural(p.warranty_months_structural ?? 36);
        setWarrantyMonthsExtendedMax(p.warranty_months_extended_max ?? 12);
        setExtendedWarrantyCostPercentage(p.extended_warranty_cost_percentage?.toString() ?? "7.5");
        setVariants(p.variants ?? []);

        // Load channel flags for publish control
        getVariantPublishControl(activeProductId)
          .then((ctl) => {
            if (stale) return;
            setChannelDirectSale(ctl.base.is_direct_sale_enabled);
            setChannelEmi(ctl.base.is_emi_enabled);
            setChannelRent(ctl.base.is_rent_enabled);
            setChannelLease(ctl.base.is_lease_enabled);
          })
          .catch(() => {});

        // Restore operator-locked attributes from backend
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
        if (pendingFetchRef.current?.id === activeProductId) pendingFetchRef.current = null;
      });
    return () => { stale = true; };
  }, [activeProductId]);

  const refreshVariants = useCallback(async () => {
    if (!activeProductId) return;
    const p = await pimService.getProductWithAttributes(activeProductId);
    setVariants(p.variants ?? []);
  }, [activeProductId]);

  // Live product search for drawer mode
  useEffect(() => {
    if (!searchMode) return;
    let active = true;
    const q = searchQuery.trim();
    const timer = setTimeout(() => {
      setSearching(true);
      pimService
        .getProducts({
          search: q || undefined,
          roots_only: true,
          page_size: 25,
        })
        .then((res) => {
          if (!active) return;
          let list = res.results;
          if (searchFilter !== "ALL") {
            list = list.filter((item) => (item.product_type ?? "FINISHED_GOOD") === searchFilter);
          }
          setSearchResults(list);
        })
        .catch(() => {
          if (!active) return;
          setSearchResults([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchMode, searchQuery, searchFilter]);

  const handleUpdateChannel = async (channel: "sale" | "emi" | "rent" | "lease", val: boolean) => {
    if (!activeProductId) return;
    if (channel === "sale") setChannelDirectSale(val);
    if (channel === "emi") setChannelEmi(val);
    if (channel === "rent") setChannelRent(val);
    if (channel === "lease") setChannelLease(val);

    try {
      const payload: Record<string, boolean> = {};
      if (channel === "sale") payload.is_direct_sale_enabled = val;
      if (channel === "emi") payload.is_emi_enabled = val;
      if (channel === "rent") payload.is_rent_enabled = val;
      if (channel === "lease") payload.is_lease_enabled = val;
      await patchVariantPublishControl(activeProductId, payload);
    } catch {
      // rollback or ignore
    }
  };

  const handleToggleLock = useCallback((attrId: number) => {
    setLockedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) next.delete(attrId);
      else next.add(attrId);
      return next;
    });
  }, []);

  const handleToggleVariantDefining = useCallback(async (attrId: number) => {
    const target = attributes.find((a) => a.id === attrId);
    if (!target) return;
    const nextVal = !target.is_variant_defining;

    // 1. Optimistically update local attributes
    setAttributes((prev) =>
      prev.map((a) => (a.id === attrId ? { ...a, is_variant_defining: nextVal } : a))
    );
    setAllAttributes((prev) =>
      prev.map((a) => (a.id === attrId ? { ...a, is_variant_defining: nextVal } : a))
    );

    // 2. Persist to backend category attribute
    try {
      await pimService.patchAttribute(attrId, { is_variant_defining: nextVal });
    } catch (err: unknown) {
      // Revert on failure
      setAttributes((prev) =>
        prev.map((a) => (a.id === attrId ? { ...a, is_variant_defining: !nextVal } : a))
      );
      setAllAttributes((prev) =>
        prev.map((a) => (a.id === attrId ? { ...a, is_variant_defining: !nextVal } : a))
      );
      setError((err as { message?: string })?.message ?? "Failed to update variant-defining setting");
    }
  }, [attributes]);

  // Quick refresh taxonomy & presets without wiping unsaved form edits
  const quickRefreshTaxonomy = useCallback(async (msg?: string) => {
    setRefreshingTaxonomy(true);
    try {
      const [cats, allAttrs] = await Promise.all([
        pimService.getCategories(),
        pimService.getAllAttributes(),
      ]);
      setCategories(cats);
      setAllAttributes(allAttrs);

      const cid = categoryId ? Number(categoryId) : undefined;
      const sid = subcategoryId ? Number(subcategoryId) : undefined;
      if (cid) {
        const subcats = await pimService.getSubcategories(cid);
        setSubcategories(subcats);

        const fetchedAttrs = await pimService.getAttributes(cid, sid);
        setAttributes((prev) => {
          // Update existing attributes with fresh options and data type
          const updatedPrev = prev.map((p) => {
            const fresh = fetchedAttrs.find((f) => f.id === p.id) || allAttrs.find((a) => a.id === p.id);
            if (fresh) {
              return {
                ...p,
                options: fresh.options && fresh.options.length > 0 ? fresh.options : p.options,
                data_type: fresh.data_type || p.data_type,
                name: fresh.name || p.name,
              };
            }
            return p;
          });
          // Add any newly created attributes from fetchedAttrs that weren't in prev
          const newOnes = fetchedAttrs.filter(
            (f) => !prev.some((p) => p.id === f.id) && !removedAttrIds.has(f.id)
          );
          return [...updatedPrev, ...newOnes];
        });
      }
      setTaxonomyNotice(msg || "Categories, attributes & presets synchronized");
      setTimeout(() => setTaxonomyNotice(null), 3500);
    } catch (err) {
      console.error("Failed to quick-refresh taxonomy:", err);
    } finally {
      setRefreshingTaxonomy(false);
    }
  }, [categoryId, subcategoryId, removedAttrIds]);

  // Auto-save form inputs to sessionStorage (debounced)
  useEffect(() => {
    if (loading) return;
    if (draftSavedRef.current) clearTimeout(draftSavedRef.current);

    draftSavedRef.current = setTimeout(() => {
      try {
        const draft = {
          code,
          brand,
          name,
          description,
          categoryId,
          subcategoryId,
          basePrice,
          costPrice,
          rentYieldPercent,
          leaseYieldPercent,
          arWidth,
          arDepth,
          arHeight,
          warrantyEnabled,
          warrantyMonthsManufacturing,
          warrantyMonthsStructural,
          warrantyMonthsExtendedMax,
          extendedWarrantyCostPercentage,
          attrValues,
          timestamp: Date.now(),
        };
        sessionStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* storage full or unavailable */
      }
    }, 400);

    return () => {
      if (draftSavedRef.current) clearTimeout(draftSavedRef.current);
    };
  }, [
    draftKey, loading, code, brand, name, description, categoryId, subcategoryId,
    basePrice, costPrice, rentYieldPercent, leaseYieldPercent, arWidth, arDepth,
    arHeight, warrantyEnabled, warrantyMonthsManufacturing, warrantyMonthsStructural,
    warrantyMonthsExtendedMax, extendedWarrantyCostPercentage, attrValues,
  ]);

  // Restore draft on initial load if available
  useEffect(() => {
    if (loading) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && draft.timestamp) {
        let restoredAny = false;
        if (draft.code && draft.code !== code) { setCode(draft.code); restoredAny = true; }
        if (draft.brand !== undefined && draft.brand !== brand) { setBrand(draft.brand); restoredAny = true; }
        if (draft.name && draft.name !== name) { setName(draft.name); restoredAny = true; }
        if (draft.description !== undefined && draft.description !== description) { setDescription(draft.description); restoredAny = true; }
        if (draft.basePrice !== undefined && draft.basePrice !== basePrice) { setBasePrice(draft.basePrice); restoredAny = true; }
        if (draft.costPrice !== undefined && draft.costPrice !== costPrice) { setCostPrice(draft.costPrice); restoredAny = true; }
        if (draft.attrValues && Object.keys(draft.attrValues).length > 0) {
          setAttrValues((prev) => ({ ...prev, ...draft.attrValues }));
          restoredAny = true;
        }
        if (restoredAny) setDraftRestored(true);
      }
    } catch {
      /* ignore corrupted draft */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, loading]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(draftKey);
      setDraftRestored(false);
    } catch {
      /* silent */
    }
  }, [draftKey]);

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
      // Reload attributes for this category/subcategory and merge without wiping existing
      const [refreshed, freshAll] = await Promise.all([
        pimService.getAttributes(
          Number(categoryId),
          subcategoryId ? Number(subcategoryId) : undefined,
        ),
        pimService.getAllAttributes(),
      ]);
      setAllAttributes(freshAll);
      setAttributes((prev) => {
        const freshMap = new Map(refreshed.map((r) => [r.id, r]));
        const updated = prev.map((p) => freshMap.get(p.id) || p);
        const newOnes = refreshed.filter((r) => !prev.some((p) => p.id === r.id));
        return [...updated, ...newOnes];
      });
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

  // Every attribute in the catalogue: same-named attributes' values are offered as
  // templates in the value dropdowns.
  useEffect(() => {
    if (allAttributes.length > 0) return;
    pimService.getAllAttributes().then(setAllAttributes).catch(() => {});
  }, [allAttributes.length]);

  // Quick-add a value from an attribute's dropdown. An existing value (any case)
  // is reused instead of creating a duplicate.
  const handleQuickAddOption = useCallback(async (attr: PimCategoryAttribute, rawValue: string) => {
    const value = rawValue.trim();
    const pool = [...attr.options, ...(allAttributes.find((a) => a.id === attr.id)?.options ?? [])];
    const existing = pool.find((o) => o.value.trim().toLowerCase() === value.toLowerCase());
    if (existing) return existing;
    const created = await pimService.createAttributeOption(attr.id, {
      value,
      display_name: value,
      display_order: attr.options.length,
    });
    const withOption = (list: PimCategoryAttribute[]) =>
      list.map((a) => (a.id === attr.id ? { ...a, options: a.options.some((o) => o.id === created.id) ? a.options : [...a.options, created] } : a));
    setAttributes(withOption);
    setAllAttributes(withOption);
    return created;
  }, [allAttributes]);

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
        brand,
        warranty_enabled: warrantyEnabled,
        warranty_months_manufacturing: warrantyMonthsManufacturing,
        warranty_months_structural: warrantyMonthsStructural,
        warranty_months_extended_max: warrantyMonthsExtendedMax,
        extended_warranty_cost_percentage: extendedWarrantyCostPercentage,
        base_price: basePrice || "0",
        cost_price: costPrice || undefined,
        rent_monthly_yield_percent: rentYieldPercent || null,
        lease_monthly_yield_percent: leaseYieldPercent || null,
        ar_width_cm: arWidth || null,
        ar_depth_cm: arDepth || null,
        ar_height_cm: arHeight || null,
        locked_attributes: Array.from(lockedAttributes),
        attributes: buildAttrPayload(attributes, attrValues),
        ...(removedAttrIds.size > 0 ? {
          remove_attributes: Array.from(removedAttrIds)
        } : {}),
        product_type: productType,
      };
      if (isEdit && activeProductId) {
        await pimService.updateProduct(activeProductId, payload);
        clearDraft();
        const updatedProduct = await pimService.getProductWithAttributes(activeProductId);
        setProduct(updatedProduct);
        await refreshVariants();
        setRemovedAttrIds(new Set());
        setSuccessMsg("Product saved successfully.");
        onSaved?.(updatedProduct);
        setTimeout(() => setSuccessMsg(null), 3000);
        return;
      } else {
        const created = await pimService.createProduct(payload);
        clearDraft();
        if (autoPublishOnCreate) {
          try {
            await pimService.publishBlueprint(created.id);
            created.is_published = true;
          } catch (e) {
            console.warn("Auto-publish failed", e);
          }
        }
        onSaved?.(created);
        if (variant === "drawer") {
          setActiveProductId(created.id);
          setProduct(created);
          setIsPublished(created.is_published || autoPublishOnCreate);
          setSuccessMsg("Product created successfully! You can now configure variants, media, and publish control below.");
          setTimeout(() => setSuccessMsg(null), 5000);
          return;
        }
        const typeSlug = productType === "ACCESSORY" ? "accessories"
          : productType === "SERVICE" ? "services"
          : "finished-goods";
        router.push(`/admin/pim/products/${typeSlug}/${created.id}/edit`);
        return;
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAdoptOrphans = async () => {
    if (!activeProductId) return;
    setAdopting(true);
    setAdoptResult(null);
    try {
      const result = await pimService.adoptOrphanVariants(activeProductId);
      setAdoptResult(result.message);
      if (result.adopted.length > 0) await refreshVariants();
    } catch (err: unknown) {
      const e = err as { body?: { message?: string }, message?: string };
      const msg = e?.body?.message || e?.message || "Adopt failed — check backend logs";
      setAdoptResult(`Adopt failed: ${msg}`);
    } finally {
      setAdopting(false);
    }
  };

  const handlePushToVariants = async () => {
    if (!activeProductId) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result = await pimService.pushToVariants(activeProductId, {
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
    if (!activeProductId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      const result = await pimService.publishBlueprint(activeProductId);
      setIsPublished(true);
      setPublishResult({ child_pim_published: result.child_pim_published, variants_activated: result.variants_activated, total_variants: result.total_variants });
    } catch (err: unknown) {
      setPublishError((err as { message?: string })?.message ?? "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!activeProductId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    try {
      await pimService.unpublishBlueprint(activeProductId);
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

      {/* Drawer Mode & Search Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1 border border-border">
          <button
            type="button"
            onClick={() => {
              setSearchMode(false);
              if (activeProductId) {
                setActiveProductId(undefined);
                setProduct(null);
                setCode("");
                setName("");
                setBrand("");
                setDescription("");
                setBasePrice("");
                setCostPrice("");
                setVariants([]);
                setIsPublished(false);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
              !searchMode && !activeProductId
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            Create New Product
          </button>
          <button
            type="button"
            onClick={() => setSearchMode(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
              searchMode || activeProductId
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Search className="h-3.5 w-3.5 text-primary" />
            {activeProductId && product ? `Editing: ${product.code}` : "Search & Edit Existing"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeProductId && product && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded border text-foreground">
                {product.code}
              </span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                isPublished
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              )}>
                {isPublished ? "Published" : "Draft"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveProductId(undefined);
                  setProduct(null);
                  setSearchMode(false);
                }}
                className="text-xs text-primary hover:underline ml-1 font-medium cursor-pointer"
              >
                + Switch to Create
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setManageWorkbenchOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted shadow-sm transition-colors"
            title="Manage categories, subcategories, attributes, and preset options"
          >
            <FolderCog className="h-3.5 w-3.5 text-primary" /> Categories & Attributes
          </button>
          <button
            type="button"
            onClick={() => void quickRefreshTaxonomy()}
            disabled={refreshingTaxonomy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted shadow-sm transition-colors disabled:opacity-50"
            title="Sync categories, attributes, and presets"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshingTaxonomy ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            {refreshingTaxonomy ? "Syncing…" : "Sync"}
          </button>
        </div>
      </div>

      {/* Existing Product Search & Selection Panel */}
      {searchMode && (
        <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Select an Existing PIM Product to Edit</h4>
              <p className="text-xs text-muted-foreground">Pick any catalog product to edit in this drawer</p>
            </div>
            <button
              type="button"
              onClick={() => setSearchMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
            >
              Cancel search
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product by name, code, SKU, or category…"
              className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: "ALL", label: "All Items" },
              { id: "FINISHED_GOOD", label: "Finished Goods" },
              { id: "ACCESSORY", label: "Accessories" },
              { id: "RAW_MATERIAL", label: "Raw Materials" },
              { id: "SERVICE", label: "Services" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSearchFilter(f.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition text-xs font-medium whitespace-nowrap cursor-pointer",
                  searchFilter === f.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-border/60">
            {searching && (
              <p className="text-xs text-muted-foreground py-4 text-center">Searching catalog…</p>
            )}
            {!searching && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">
                {searchQuery.trim() ? "No matching products found." : "Type keywords to search existing products."}
              </p>
            )}
            {searchResults.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setActiveProductId(item.id);
                  setSearchMode(false);
                }}
                className="flex items-center justify-between gap-3 py-2 px-2.5 rounded-lg hover:bg-muted/60 cursor-pointer transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground">{item.code}</span>
                    <span className="truncate text-xs font-semibold text-foreground">{item.name}</span>
                    <span className={cn(
                      "rounded px-1.5 py-0.2 text-[10px] font-semibold",
                      item.is_published
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    )}>
                      {item.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                    <span>{item.category_name}</span>
                    <span>·</span>
                    <span>₹{item.base_price}</span>
                    {item.product_type && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-foreground">{item.product_type}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 cursor-pointer"
                >
                  Edit in Drawer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Type / Classification Selector */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Classification & Type</span>
            <p className="text-xs text-muted-foreground mt-0.5">Choose item category for inventory, billing, and workshop tracking</p>
          </div>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-bold",
            productType === "FINISHED_GOOD" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
            productType === "ACCESSORY" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
            productType === "RAW_MATERIAL" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          )}>
            {productType === "FINISHED_GOOD" ? "Finished Good (Normal Product)" :
             productType === "ACCESSORY" ? "Accessory" :
             productType === "RAW_MATERIAL" ? "Raw Material" : "Service"}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { type: "FINISHED_GOOD", label: "Finished Good", sub: "Furniture & retail products", icon: Box },
            { type: "ACCESSORY", label: "Accessory", sub: "Fittings, cushions, hardware", icon: Puzzle },
            { type: "RAW_MATERIAL", label: "Raw Material", sub: "Timber, fabric, foam, screws", icon: Factory },
            { type: "SERVICE", label: "Service", sub: "Labor, delivery, assembly", icon: Wrench },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = productType === item.type;
            return (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  setProductType(item.type as any);
                  if (!isEdit && (!code || ["FG-", "ACC-", "RAW-", "SRV-"].some(p => code.startsWith(p)))) {
                    const prefix = item.type === "FINISHED_GOOD" ? "FG-" : item.type === "ACCESSORY" ? "ACC-" : item.type === "RAW_MATERIAL" ? "RAW-" : "SRV-";
                    setCode(prefix);
                  }
                }}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-semibold", isSelected ? "text-foreground font-bold" : "text-foreground")}>
                    {item.label}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground leading-tight line-clamp-1">
                  {item.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Publish & Channel Control Card */}
      <div className={cn(
        "rounded-xl border p-4 space-y-3 transition-colors",
        isPublished
          ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20"
      )}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {isPublished ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Live & Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                  <EyeOff className="h-3.5 w-3.5" />
                  Draft (Private)
                </span>
              )}
              <span className="text-xs font-semibold text-foreground">
                {isPublished ? "Catalog Publication Active" : "Private Operational Record"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPublished
                ? "This product and active variants are visible in public catalogs, direct sale billing, and operations."
                : "Keep as draft while configuring attributes, media, or variants. Click Publish when ready for public catalog."}
            </p>
          </div>

          {/* Action button */}
          {activeProductId ? (
            <div className="flex items-center gap-2">
              {isPublished ? (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void handleUnpublish()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-background px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  {publishing ? "Updating…" : "Set to Draft"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void handlePublish()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {publishing ? "Publishing…" : "Publish Now"}
                </button>
              )}
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoPublishOnCreate}
                onChange={(e) => setAutoPublishOnCreate(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>Publish immediately upon creation</span>
            </label>
          )}
        </div>

        {/* Quick Channel Availability Flags */}
        {activeProductId && (
          <div className="pt-2 border-t border-border/60">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Sales Channel Availability
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-medium">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelDirectSale}
                  onChange={(e) => void handleUpdateChannel("sale", e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>Direct Sale (Retail)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelEmi}
                  onChange={(e) => void handleUpdateChannel("emi", e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>SFEMI (Advance EMI)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelRent}
                  onChange={(e) => void handleUpdateChannel("rent", e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>Furniture Rental</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelLease}
                  onChange={(e) => void handleUpdateChannel("lease", e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>Furniture Leasing</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Parent product identity banner — edit mode only */}
      {isEdit && product && (
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="shrink-0 rounded-lg bg-muted p-2.5">
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
                    {productType}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{product.name}</div>
              </div>
            </div>
            {variants.length > 0 && (
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
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

      {/* Taxonomy Notification */}
      {taxonomyNotice && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{taxonomyNotice}</span>
        </div>
      )}

      {/* Draft Restored Banner */}
      {draftRestored && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Auto-Restored:</span>
            <span>Your unsaved changes from the current session have been preserved.</span>
          </div>
          <button
            type="button"
            onClick={clearDraft}
            className="underline hover:no-underline text-[11px] font-semibold text-blue-900 dark:text-blue-200"
          >
            Discard Draft
          </button>
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
            <label htmlFor="f-product-code" className="block text-sm font-medium mb-1">Product Code *</label>
            <input id="f-product-code"
              required
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BED-TEA-Q-001"
            />
          </div>
          <div>
            <label htmlFor="f-product-name" className="block text-sm font-medium mb-1">Product Name *</label>
            <input id="f-product-name"
              required
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teak Queen Bed with Storage"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="f-product-brand" className="block text-sm font-medium mb-1">Brand</label>
            <input id="f-product-brand"
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Subidha Furniture"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="f-description" className="block text-sm font-medium">Description</label>
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

      {/* Warranty Information */}
      <section className="rounded-lg border p-5 space-y-4 bg-muted/20">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Warranty Information</h3>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input 
              type="checkbox" 
              checked={warrantyEnabled} 
              onChange={(e) => setWarrantyEnabled(e.target.checked)} 
              className="accent-primary h-4 w-4 rounded" 
            />
            Enable Warranty
          </label>
        </div>
        
        {warrantyEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Manufacturing (Months)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={warrantyMonthsManufacturing}
                onChange={(e) => setWarrantyMonthsManufacturing(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Structural (Months)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={warrantyMonthsStructural}
                onChange={(e) => setWarrantyMonthsStructural(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Extended Max (Months)</label>
              <input
                type="number"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={warrantyMonthsExtendedMax}
                onChange={(e) => setWarrantyMonthsExtendedMax(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Extended Cost (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={extendedWarrantyCostPercentage}
                onChange={(e) => setExtendedWarrantyCostPercentage(e.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      {/* Category */}
      <section className="rounded-lg border p-5 space-y-4">
        <h3 className="font-semibold">Category</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">Category *</label>
            <select id="f-category"
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
              <label htmlFor="f-subcategory" className="block text-sm font-medium mb-1">Subcategory</label>
              <select id="f-subcategory"
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
            <label htmlFor="f-base-price-optional-set-per-variant-setb" className="block text-sm font-medium mb-1">
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

      {/* Rent / Lease pricing */}
      <section className="rounded-lg border p-5 space-y-4">
        <div>
          <h3 className="font-semibold">Rent / Lease pricing</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monthly amount is calculated from product price × yield rate. Leave blank to use the business default rate.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Rent monthly yield rate (%)
            <input type="number" min="0.01" max="100" step="0.01" value={rentYieldPercent} onChange={(e) => setRentYieldPercent(e.target.value)} placeholder="Business default" className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
          </label>
          <label className="block text-sm font-medium">
            Lease monthly yield rate (%)
            <input type="number" min="0.01" max="100" step="0.01" value={leaseYieldPercent} onChange={(e) => setLeaseYieldPercent(e.target.value)} placeholder="Business default" className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
          </label>
        </div>
      </section>

      {/* Room view (AR) size */}
      <section className="rounded-lg border p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="font-semibold">Room view (AR) size</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Outer size in centimetres. With width and depth set, customers can place this product in their room at
              true size, even before a 3D model is uploaded (they see a block of this size with the product photo).
              Leave height blank to show only the floor space.
              {product?.parent_id ? " Leave all blank to use the base product's size." : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSuggestArSize()}
            disabled={!productId || arSuggesting}
            title={productId ? "Read the size from this product's attributes" : "Save the product first"}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {arSuggesting ? "Reading…" : "Fill from attributes"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              ["f-ar-width", "Width", "side to side", arWidth, setArWidth],
              ["f-ar-depth", "Depth", "front to back", arDepth, setArDepth],
              ["f-ar-height", "Height", "optional", arHeight, setArHeight],
            ] as const
          ).map(([id, label, hint, value, setValue]) => (
            <div key={id}>
              <label htmlFor={id} className="block text-sm font-medium mb-1">
                {label}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>
              </label>
              <div className="relative">
                <input
                  id={id}
                  type="number"
                  min="1"
                  max="500"
                  step="0.1"
                  className="w-full rounded-md border px-3 py-2 pr-10 text-sm bg-background"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="—"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cm</span>
              </div>
            </div>
          ))}
        </div>
        {arHint && <p className="text-xs text-muted-foreground">{arHint}</p>}
      </section>

      {/* Dynamic Attributes */}
      {true && (
        <section className="rounded-lg border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base">Product Attributes</h3>
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-semibold">
                  {attributes.length} defined
                </span>
                <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 text-xs font-semibold">
                  {attributes.filter((a) => a.is_active !== false).length} active
                </span>
                {variantDefiningAttrs.length > 0 && (
                  <span className="rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-300 dark:border-purple-700 px-2 py-0.5 text-xs font-semibold flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {variantDefiningAttrs.length} variant-defining
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Attributes defined for this product/category. Locked attributes are inherited by all variants; unlocked ones are customizable per variant.
              </p>
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
                onClick={() => setManageWorkbenchOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Manage Categories, Subcategories & Attributes workbench"
              >
                <FolderCog className="h-3 w-3 text-primary" /> Manage Taxonomy
              </button>
              <button
                type="button"
                onClick={() => void quickRefreshTaxonomy()}
                disabled={refreshingTaxonomy}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Non-destructively reload categories, attributes, and options without discarding your in-progress inputs"
              >
                <RefreshCw className={`h-3 w-3 ${refreshingTaxonomy ? "animate-spin text-primary" : ""}`} /> {refreshingTaxonomy ? "Syncing…" : "Sync Presets"}
              </button>
              {isEdit && activeProductId && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!activeProductId) return;
                    if (!window.confirm("Discard unsaved changes and reload product from server?")) return;
                    pendingFetchRef.current = null;
                    setLoading(true);
                    try {
                      const p = await pimService.getProductWithAttributes(activeProductId);
                      setProduct(p);
                      setCode(p.code);
                      setBrand(p.brand ?? "");
                      setName(p.name);
                      setDescription(p.description ?? "");
                      setCategoryId(p.category);
                      setSubcategoryId(p.subcategory ?? "");
                      setBasePrice(p.base_price);
                      setCostPrice(p.cost_price ?? "");
                      setArWidth(p.ar_width_cm ?? "");
                      setArDepth(p.ar_depth_cm ?? "");
                      setArHeight(p.ar_height_cm ?? "");
                      setIsPublished(p.is_published);
                      setWarrantyEnabled(p.warranty_enabled ?? true);
                      setWarrantyMonthsManufacturing(p.warranty_months_manufacturing ?? 12);
                      setWarrantyMonthsStructural(p.warranty_months_structural ?? 36);
                      setWarrantyMonthsExtendedMax(p.warranty_months_extended_max ?? 12);
                      setExtendedWarrantyCostPercentage(p.extended_warranty_cost_percentage?.toString() ?? "7.5");
                      setVariants(p.variants ?? []);
                      setLockedAttributes(new Set(p.locked_attributes ?? []));
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
                      const all = await pimService.getAllAttributes();
                      setAllAttributes(all);
                      clearDraft();
                    } catch (err) {
                      console.error("Failed to refresh product", err);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                  title="Discard unsaved changes and reload database state"
                >
                  Reset
                </button>
              )}
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
            onAddOption={handleQuickAddOption}
            templateAttributes={allAttributes}
            onToggleVariantDefining={handleToggleVariantDefining}
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
                      <input id="f-base-price-optional-set-per-variant-setb"
                        className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                        placeholder="e.g. Frame Color"
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="f-data-type" className="text-xs font-medium block mb-1">Data Type *</label>
                      <select id="f-data-type"
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

      {/* Global Related Products (Base Product Level) */}
      {isEdit && activeProductId && (
        <section className="rounded-lg border p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Base Product Links (Accessories & Services)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add accessories, raw materials, or extra services that apply globally to all variants of this product.
            </p>
          </div>
          <div className="pt-2">
            <PimProductAccessoriesPanel
              productId={activeProductId}
            />
          </div>
        </section>
      )}

      {/* Variants (edit mode only) */}
      {isEdit && activeProductId && (
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
            productId={activeProductId}
            productCode={code}
            productName={name}
            basePrice={basePrice}
            variants={variants}
            allAttributes={attributes}
            onRefresh={refreshVariants}
            lockedAttributes={lockedAttributes}
            parentAttrValues={attrValues}
            onAddOption={handleQuickAddOption}
            templateAttributes={allAttributes}
          />
        </section>
      )}

      {/* BOM & Manufacturing (edit mode, variant SKUs only) */}
      {isEdit && activeProductId && variants.length > 0 && (
        <BomManufacturingPanel productId={activeProductId} variants={variants} />
      )}

      {/* Inventory Management (base products with variants) */}
      {isEdit && activeProductId && variants.length > 0 && (
        <PimInventoryPanel variants={variants} productCode={code} onRefresh={refreshVariants} />
      )}

      {/* Media Gallery */}
      {isEdit && activeProductId && (
        <ProductMediaGallery productId={activeProductId} variants={variants} />
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
          {successMsg ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Product"}
            </>
          )}
        </button>
        
        <button
          type="button"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              router.push("/admin/pim/products");
            }
          }}
          className="inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> {variant === "drawer" ? (isEdit ? "Done / Close" : "Cancel") : "Back"}
        </button>
      </div>

      {/* Global Category & Attribute Management Modal */}
      {manageWorkbenchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
          <div className="relative w-full max-w-5xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <FolderCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground">Categories, Subcategories & Attributes Manager</h3>
                  <p className="text-xs text-muted-foreground">Manage taxonomy and preset options without leaving this product</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManageWorkbenchOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close manager"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <CategoryManageWorkbench
                initialSelectedCategoryId={categoryId ? Number(categoryId) : undefined}
                onDataChanged={() => {
                  void quickRefreshTaxonomy("Taxonomy synchronized from manager");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
