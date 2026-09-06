"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search, SlidersHorizontal, X, Layers, ExternalLink, ChevronRight, ChevronDown, GitBranch, CheckCircle2, AlertCircle, Star, Package2 } from "lucide-react";
import { pimService, type PimProduct, type PimCategory } from "@/services/pim";

import ProductQuickActions from "@/components/admin/products/ProductQuickActions";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPMetricStrip from "@/components/erp/ERPMetricStrip";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell } from "@/components/ui/operations";
import { downloadCsv } from "@/lib/export/csv";
import {
  listProductRegister,
  getProductCatalogOptions,
  type ProductRecord,
  type ProductRegisterPage,
  type ProductCatalogOptions,
  ITEM_TYPE_LABELS,
  STOCK_TYPE_LABELS,
  type ProductItemType,
  type ProductStockType,
} from "@/services/products";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const ITEM_TYPE_COLORS: Record<string, string> = {
  FINISHED_GOOD: "bg-blue-50 text-blue-700 border-blue-200",
  RAW_MATERIAL: "bg-amber-50 text-amber-700 border-amber-200",
  ACCESSORY: "bg-purple-50 text-purple-700 border-purple-200",
  SERVICE: "bg-green-50 text-green-700 border-green-200",
  ADD_ON: "bg-pink-50 text-pink-700 border-pink-200",
};

const STOCK_TYPE_COLORS: Record<string, string> = {
  STOCK_ITEM: "bg-green-50 text-green-700 border-green-200",
  MADE_TO_ORDER: "bg-orange-50 text-orange-700 border-orange-200",
  NON_STOCK: "bg-gray-50 text-gray-600 border-gray-200",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function label(value: string | null | undefined, fallback: string): string {
  return (value || "").trim() || fallback;
}

function truncate(value: string | null | undefined, length = 80): string {
  const text = (value || "").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text || "—";
}

function ItemTypeBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = ITEM_TYPE_COLORS[value] ?? "bg-muted text-muted-foreground border-border";
  const lbl = ITEM_TYPE_LABELS[value as ProductItemType] ?? value;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{lbl}</span>;
}

function StockTypeBadge({ value }: { value?: string | null }) {
  if (!value) return null;
  const cls = STOCK_TYPE_COLORS[value] ?? "bg-muted text-muted-foreground border-border";
  const lbl = STOCK_TYPE_LABELS[value as ProductStockType] ?? value;
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{lbl}</span>;
}

function emptyPage(): ProductRegisterPage {
  return {
    count: 0, total_count: 0, catalog_total_count: 0, page: 1, page_size: 50,
    page_size_options: PAGE_SIZE_OPTIONS, num_pages: 0, has_next: false,
    has_previous: false, range_start: 0, range_end: 0,
    summary: {
      total_products: 0, inventory_ready: 0, stock_profile_pending: 0,
      subscription_ready: 0, direct_sale_ready: 0, rent_lease_ready: 0,
      image_missing: 0, catalog_cleanup_required: 0, total_base_value: "0.00",
    },
    results: [],
  };
}

function emptyCatalogOptions(): ProductCatalogOptions {
  return { categories: [], subcategories: [], unit_of_measure_masters: [], unit_of_measure_options: [], item_type_choices: [], stock_type_choices: [] };
}

type FilterState = {
  q: string; category: string; subcategory: string;
  item_type: string; stock_type: string;
  readiness: string; capability: string; active: string;
  inventory: string; image_status: string;
};

function filtersFromParams(params: URLSearchParams): FilterState {
  return {
    q: params.get("q") ?? "",
    category: params.get("category") ?? "",
    subcategory: params.get("subcategory") ?? "",
    item_type: params.get("item_type") ?? "",
    stock_type: params.get("stock_type") ?? "",
    readiness: params.get("readiness") ?? "",
    capability: params.get("capability") ?? "",
    active: params.get("active") ?? "",
    inventory: params.get("inventory") ?? "",
    image_status: params.get("image_status") ?? "",
  };
}

function filtersToParams(filters: FilterState, page: number, pageSize: number): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  if (pageSize !== 50) p.set("page_size", String(pageSize));
  return p;
}

function activeFilterCount(filters: FilterState): number {
  return Object.values(filters).filter(Boolean).length;
}

// ── PIM Quick Panel (inline within products page) ────────────────────────────

interface PimTreeNode {
  product: PimProduct;
  children: PimProduct[];
}

function buildPimTree(products: PimProduct[]): { roots: PimTreeNode[]; orphanChildren: PimProduct[] } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const childrenByParent = new Map<number, PimProduct[]>();
  const rootProducts: PimProduct[] = [];
  const orphanChildren: PimProduct[] = [];

  for (const p of products) {
    if (p.parent_id) {
      if (byId.has(p.parent_id)) {
        const arr = childrenByParent.get(p.parent_id) ?? [];
        arr.push(p);
        childrenByParent.set(p.parent_id, arr);
      } else {
        // Parent not in current result set (filtered out) — show as orphan root
        orphanChildren.push(p);
      }
    } else {
      rootProducts.push(p);
    }
  }

  const roots: PimTreeNode[] = rootProducts.map((p) => ({
    product: p,
    children: (childrenByParent.get(p.id) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
  }));

  return { roots, orphanChildren };
}

function PimProductRow({
  p,
  isChild = false,
  expanded,
  childCount,
  onToggle,
}: {
  p: PimProduct;
  isChild?: boolean;
  expanded?: boolean;
  childCount?: number;
  onToggle?: () => void;
}) {
  const hasChildren = !isChild && (childCount ?? 0) > 0;

  return (
    <tr className={`hover:bg-muted/30 transition-colors ${isChild ? "bg-muted/20" : ""}`}>
      {/* Code + expand toggle */}
      <td className="px-4 py-2.5">
        <div className={`flex items-center gap-1.5 ${isChild ? "pl-6" : ""}`}>
          {isChild ? (
            <GitBranch className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          ) : hasChildren ? (
            <button
              onClick={onToggle}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
        </div>
      </td>

      {/* Name + badges */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{p.name}</span>
          {!isChild && hasChildren && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
              Base Product
            </span>
          )}
          {isChild && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-1.5 py-0.5">
              Variant SKU
            </span>
          )}
        </div>
        {isChild && p.parent_code && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Under: <span className="font-mono">{p.parent_code}</span>
          </p>
        )}
      </td>

      {/* Category */}
      <td className="px-4 py-2.5 text-muted-foreground text-xs">
        {p.category_name ? (
          <>{p.category_name}{p.subcategory_name ? ` / ${p.subcategory_name}` : ""}</>
        ) : (
          <span className="text-muted-foreground/50 italic text-[11px]">—</span>
        )}
      </td>

      {/* Price */}
      <td className="px-4 py-2.5 text-right tabular-nums text-sm">
        {formatRupee(Number(p.base_price))}
      </td>

      {/* SKUs (variants) */}
      <td className="px-4 py-2.5 text-center">
        {isChild ? (
          <span className="text-xs text-muted-foreground/40">—</span>
        ) : (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {p.variant_count ?? 0}
          </span>
        )}
      </td>

      {/* Status — variant SKUs inherit their blueprint's publish status */}
      <td className="px-4 py-2.5 text-center">
        {(() => {
          const effectivePublished = p.is_published;
          if (effectivePublished) {
            return (
              <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                Published
              </span>
            );
          }
          return (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              Draft
            </span>
          );
        })()}
      </td>

      {/* Manage */}
      <td className="px-4 py-2.5">
        <div className="flex flex-col gap-1.5 items-start">
          <Link
            href={`/admin/pim/products/${p.id}/edit`}
            className="inline-flex items-center gap-1 text-primary text-xs hover:underline font-medium"
          >
            PIM Editor <ExternalLink className="h-3 w-3" />
          </Link>
          {!isChild && (
            <Link
              href={`/admin/pim/products/${p.id}/variants/publish-control`}
              className="inline-flex items-center gap-1 text-violet-600 text-xs hover:underline font-medium"
            >
              Publish control <Layers className="h-3 w-3" />
            </Link>
          )}
          {p.code && (
            <Link
              href={`/admin/products?q=${encodeURIComponent(p.code)}`}
              className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 text-xs hover:underline font-medium"
            >
              View Register <ChevronRight className="h-3 w-3" />
            </Link>
          )}
          {!isChild && p.is_published && (
            <Link
              href={`/admin/subscriptions/advance-emi/create?product_code=${encodeURIComponent(p.code)}`}
              className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs hover:underline font-medium"
            >
              <Star className="h-2.5 w-2.5" /> New Contract
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

function PimPanel() {
  const [pimProducts, setPimProducts] = useState<PimProduct[]>([]);
  const [pimCategories, setPimCategories] = useState<PimCategory[]>([]);
  const [pimLoading, setPimLoading] = useState(true);
  const [pimSearch, setPimSearch] = useState("");
  const [pimCat, setPimCat] = useState<number | "">("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [relinking, setRelinking] = useState(false);
  const [relinkResult, setRelinkResult] = useState<string | null>(null);

  const loadPimProducts = useCallback(() => {
    setPimLoading(true);
    Promise.all([
      pimService.getProducts({ search: pimSearch || undefined, category: pimCat || undefined, page_size: 200 }).then(r => r.results),
      pimService.getCategories(),
    ]).then(([prods, cats]) => {
      setPimProducts(Array.isArray(prods) ? prods : []);
      setPimCategories(Array.isArray(cats) ? cats : []);
    }).catch(() => {}).finally(() => setPimLoading(false));
  }, [pimSearch, pimCat]);

  useEffect(() => { loadPimProducts(); }, [loadPimProducts]);

  const handleRelink = useCallback(async () => {
    setRelinking(true);
    setRelinkResult(null);
    try {
      const [relink, repair] = await Promise.all([
        pimService.relinkParents(),
        pimService.repairVariantCategories(),
      ]);
      const parts = [relink.message];
      if (repair.count > 0) parts.push(repair.message);
      setRelinkResult(parts.join(" · "));
      loadPimProducts();
    } catch {
      setRelinkResult("Relink failed");
    } finally {
      setRelinking(false);
    }
  }, [loadPimProducts]);

  const { roots, orphanChildren } = useMemo(() => buildPimTree(pimProducts), [pimProducts]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const baseCount = roots.length;
  const variantSkuCount = pimProducts.filter((p) => !!p.parent_id).length;

  return (
    <div className="space-y-4">
      {/* PIM header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex gap-4 flex-wrap">
          {[
            { label: "Blueprints", value: baseCount },
            { label: "Variant SKUs", value: variantSkuCount },
            { label: "Published", value: pimProducts.filter((p) => p.is_published && !p.parent_id).length },
            { label: "Draft", value: pimProducts.filter((p) => !p.is_published && !p.parent_id).length },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border bg-background px-4 py-2.5 min-w-[90px]">
              <div className="text-lg font-bold tabular-nums">{m.value}</div>
              <div className="text-xs text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {relinkResult && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1">{relinkResult}</span>
          )}
          <button
            type="button"
            onClick={handleRelink}
            disabled={relinking}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <GitBranch className="h-4 w-4" />
            {relinking ? "Relinking…" : "Relink Orphans"}
          </button>
          <Link href="/admin/pim/categories" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
            Categories
          </Link>
          <Link href="/admin/pim/products" className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">
            <Layers className="h-4 w-4" /> Full PIM
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-xl bg-background"
            placeholder="Search PIM products…"
            value={pimSearch}
            onChange={(e) => setPimSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 text-sm border rounded-xl bg-background"
          value={pimCat}
          onChange={(e) => setPimCat(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">All Categories</option>
          {pimCategories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {/* PIM product hierarchical table */}
      <div className="rounded-xl border overflow-x-auto">
        {pimLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading PIM products…</div>
        ) : pimProducts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No PIM products found. Base products can be synced to PIM from the main register.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name / Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">SKUs</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roots.map((node) => {
                const isExpanded = expandedIds.has(node.product.id);
                return (
                  <Fragment key={node.product.id}>
                    <PimProductRow
                      p={node.product}
                      expanded={isExpanded}
                      childCount={node.children.length}
                      onToggle={() => toggleExpand(node.product.id)}
                    />
                    {isExpanded && node.children.map((child) => (
                      <PimProductRow key={child.id} p={child} isChild />
                    ))}
                  </Fragment>
                );
              })}
              {/* Orphan children — parent filtered out but child visible */}
              {orphanChildren.map((p) => (
                <PimProductRow key={p.id} p={p} isChild />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 px-4 py-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-3">
        <Layers className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Blueprint</strong> = base product with attribute schema and variant generator.
          <strong className="ml-1">Variant SKUs</strong> inherit the base product&apos;s category and are managed from the base product&apos;s PIM editor.
          Publish a blueprint to unlock all operations (subscription, direct sale, rent, lease).
          <span className="ml-2">· Click <ChevronRight className="inline h-3 w-3" /> to expand variant SKUs inline.</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"subscription" | "pim">(() => {
    return searchParams.get("tab") === "pim" ? "pim" : "subscription";
  });
  const [payload, setPayload] = useState<ProductRegisterPage>(() => emptyPage());
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>(() => emptyCatalogOptions());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Subscription products: hide variant SKUs by default (they're managed via PIM base product)
  const [showVariantSkus, setShowVariantSkus] = useState(false);

  // Filters live in URL — read them on mount and sync on change
  const [filters, setFilters] = useState<FilterState>(() => filtersFromParams(searchParams));
  const [queryInput, setQueryInput] = useState(() => searchParams.get("q") ?? "");
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? 1));
  const [pageSize, setPageSize] = useState(() => {
    const ps = Number(searchParams.get("page_size") ?? 50);
    return PAGE_SIZE_OPTIONS.includes(ps) ? ps : 50;
  });

  // Keep URL in sync with state
  const syncUrl = useCallback((nextFilters: FilterState, nextPage: number, nextPageSize: number) => {
    const params = filtersToParams(nextFilters, nextPage, nextPageSize);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, pathname]);

  // Load catalog options once
  useEffect(() => {
    getProductCatalogOptions()
      .then(setCatalogOptions)
      .catch(() => {/* non-fatal */});
  }, []);

  const rows = payload.results;
  const summary = payload.summary;

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const nextPayload = await listProductRegister({
        q: filters.q || undefined,
        category: filters.category || undefined,
        subcategory: filters.subcategory || undefined,
        item_type: filters.item_type || undefined,
        stock_type: filters.stock_type || undefined,
        readiness: filters.readiness || undefined,
        capability: filters.capability || undefined,
        active: filters.active || undefined,
        inventory: filters.inventory || undefined,
        image_status: filters.image_status || undefined,
        exclude_variant_skus: showVariantSkus ? "false" : "true",
        page,
        page_size: pageSize,
      });
      setPayload(nextPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product register.");
      if (mode === "initial") setPayload(emptyPage());
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [filters, page, pageSize, showVariantSkus]);

  useEffect(() => { void loadPage("initial"); }, [loadPage]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...filters, q: queryInput.trim() };
    setPage(1);
    setFilters(next);
    syncUrl(next, 1, pageSize);
  }

  function changeFilter(key: keyof FilterState, value: string) {
    const next = { ...filters, [key]: value };
    setPage(1);
    setFilters(next);
    syncUrl(next, 1, pageSize);
  }

  function resetFilters() {
    const blank: FilterState = { q: "", category: "", subcategory: "", item_type: "", stock_type: "", readiness: "", capability: "", active: "", inventory: "", image_status: "" };
    setQueryInput("");
    setPage(1);
    setFilters(blank);
    syncUrl(blank, 1, pageSize);
  }

  function changePage(next: number) {
    setPage(next);
    syncUrl(filters, next, pageSize);
  }

  function changePageSize(next: number) {
    setPage(1);
    setPageSize(next);
    syncUrl(filters, 1, next);
  }

  // Subcategory options filtered by selected category
  const subcategoryOptions = useMemo(() => {
    if (!filters.category) return catalogOptions.subcategories;
    return catalogOptions.subcategories.filter(s => s.category_name === filters.category);
  }, [catalogOptions.subcategories, filters.category]);

  const exportRows = useMemo(() => rows.map((row) => ({
    id: row.id,
    name: row.name,
    product_code: row.product_code ?? "",
    sku: row.sku ?? "",
    item_type: row.item_type ?? "",
    stock_type: row.stock_type ?? "",
    unit_of_measure: row.unit_of_measure ?? "",
    category: row.category ?? row.category_master_name ?? "",
    subcategory: row.subcategory ?? row.subcategory_master_name ?? "",
    base_price: row.base_price ?? "",
    image_status: row.image ? "AVAILABLE" : "NOT_PROVIDED",
    inventory_ready: row.inventory_ready ? "YES" : "NO",
    created_at: row.created_at ?? "",
  })), [rows]);

  const columns = useMemo<Column<ProductRecord>[]>(() => [
    {
      key: "name",
      title: "Product",
      sortable: true,
      render: (row) => (
        <div className="space-y-1.5 min-w-[200px]">
          <div className="font-semibold text-foreground leading-tight">{row.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="font-mono">{row.product_code ?? `#${row.id}`}</span>
            {row.sku && <><span>·</span><span className="font-mono">SKU {row.sku}</span></>}
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            <ItemTypeBadge value={row.item_type} />
            <StockTypeBadge value={row.stock_type} />
          </div>
          <div className="text-[10px] text-muted-foreground/60">{formatDateTime(row.created_at)}</div>
        </div>
      ),
    },
    {
      key: "category",
      title: "Category",
      render: (row) => (
        <div className="space-y-1 min-w-[130px]">
          <div className="text-sm font-medium">{label(row.category || row.category_master_name, "—")}</div>
          {(row.subcategory || row.subcategory_master_name) && (
            <div className="text-xs text-muted-foreground">{label(row.subcategory || row.subcategory_master_name, "")}</div>
          )}
          <div className="text-xs text-muted-foreground">{row.unit_of_measure || "PCS"}</div>
          {row.description ? (
            <div className="text-[10px] text-muted-foreground/70 max-w-[160px] truncate">
              {row.description.slice(0, 60)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "base_price",
      title: "Price",
      align: "right",
      sortable: true,
      sortAccessor: (row) => Number(row.base_price || 0),
      render: (row) => (
        <div className="text-right space-y-0.5 min-w-[90px]">
          <div className="font-bold text-foreground">{formatRupee(row.base_price)}</div>
          {row.hsn_sac_code ? <div className="text-[10px] text-muted-foreground">HSN {row.hsn_sac_code}</div> : null}
          {row.gst_rate != null ? <div className="text-[10px] text-muted-foreground">GST {row.gst_rate}%</div> : null}
        </div>
      ),
    },
    {
      key: "capabilities",
      title: "Modes",
      render: (row) => (
        <div className="flex flex-col gap-1 min-w-[90px]">
          {[
            { label: "EMI", ok: row.is_emi_enabled !== false },
            { label: "Direct", ok: row.is_direct_sale_enabled !== false },
            { label: "Rent", ok: Boolean(row.is_rent_enabled) },
            { label: "Lease", ok: Boolean(row.is_lease_enabled) },
          ].map(({ label: lbl, ok }) => (
            <div key={lbl} className="flex items-center gap-1.5">
              {ok
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                : <AlertCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
              <span className={`text-xs ${ok ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>{lbl}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "readiness",
      title: "Readiness",
      render: (row) => (
        <div className="space-y-1.5 min-w-[130px]">
          <div className="flex items-center gap-1.5">
            {row.inventory_ready
              ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              : <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
            <span className="text-xs">{row.inventory_ready ? "Inventory ready" : "Stock pending"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {row.image
              ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              : <AlertCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            <span className={`text-xs ${row.image ? "" : "text-muted-foreground/50"}`}>{row.image ? "Image ✓" : "No image"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {row.sku
              ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
              : <AlertCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
            <span className={`text-xs font-mono ${row.sku ? "" : "text-muted-foreground/50"}`}>{row.sku || "SKU pending"}</span>
          </div>
        </div>
      ),
    },
  ], []);

  const rangeText = payload.count ? `${payload.range_start}–${payload.range_end} of ${payload.count}` : "0 products";
  const filterCount = activeFilterCount(filters);

  return (
    <ERPPageShell
      eyebrow="Products"
      title="Products & Blueprints"
      subtitle="Product Register for all operations — create blueprints in PIM, publish to unlock subscriptions, inventory, and sales. Filters are URL-cached."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Products" }]}
      actions={[
        { href: "/admin/products/create", label: "Create Product", variant: "primary" },
        { href: "/admin/products/masters", label: "Manage Masters", variant: "secondary" },
        { href: "/admin/subscriptions/advance-emi/create", label: "Create Subscription", variant: "secondary" },
      ]}
      stats={[
        { label: "Total Products", value: payload.catalog_total_count || payload.count },
        { label: "Filtered", value: payload.count },
        { label: "Inventory Ready", value: summary.inventory_ready, tone: summary.inventory_ready ? "success" : "warning" },
        { label: "Image Missing", value: summary.image_missing, tone: summary.image_missing ? "warning" : "success" },
      ]}
      statusBadge={{ label: "Admin Workspace", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPMetricStrip metrics={[
          { label: "Total products", value: payload.catalog_total_count || payload.count, detail: `${rangeText} visible` },
          { label: "Total base value", value: formatRupee(summary.total_base_value), detail: "Filtered product value" },
          { label: "Inventory ready", value: summary.inventory_ready, detail: `${summary.stock_profile_pending} pending` },
          { label: "Stock active", value: summary.stock_active ?? 0, detail: "Tracked with live stock" },
          { label: "No stock yet", value: summary.stock_prepared_no_stock ?? 0, detail: "Profile ready, awaiting stock" },
          { label: "Image missing", value: summary.image_missing, detail: "Catalog cleanup needed" },
        ]} />

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("subscription")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === "subscription" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Package2 className="h-4 w-4" /> Product Register
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pim")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === "pim" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Layers className="h-4 w-4" /> PIM Blueprints
          </button>
        </div>

        {/* PIM panel */}
        {activeTab === "pim" && <PimPanel />}

        {/* Subscription products section */}
        {activeTab === "subscription" && <>
        {/* Variant SKU toggle — hidden by default since they're managed via PIM */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowVariantSkus((v) => !v); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${showVariantSkus ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-muted border-muted-foreground/20 text-muted-foreground hover:text-foreground"}`}
          >
            <GitBranch className="h-3 w-3" />
            {showVariantSkus ? "Hiding base product only" : "Show Variant SKUs"}
          </button>
          {!showVariantSkus && (
            <span className="text-xs text-muted-foreground">Variant SKUs are hidden — managed via PIM base product</span>
          )}
        </div>
        {/* Item-type segmented register — every type is a tab with a live count */}
        <nav aria-label="Product item type" className="flex flex-wrap gap-2">
          {([
            { value: "", label: "All types" },
            { value: "FINISHED_GOOD", label: ITEM_TYPE_LABELS.FINISHED_GOOD },
            { value: "RAW_MATERIAL", label: ITEM_TYPE_LABELS.RAW_MATERIAL },
            { value: "ACCESSORY", label: ITEM_TYPE_LABELS.ACCESSORY },
            { value: "SERVICE", label: ITEM_TYPE_LABELS.SERVICE },
            { value: "ADD_ON", label: ITEM_TYPE_LABELS.ADD_ON },
          ] as const).map((tab) => {
            const active = filters.item_type === tab.value;
            const tabCount = tab.value === ""
              ? (summary.item_type_counts
                  ? Object.values(summary.item_type_counts).reduce((a, b) => a + b, 0)
                  : undefined)
              : summary.item_type_counts?.[tab.value];
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => changeFilter("item_type", tab.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {typeof tabCount === "number" ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{tabCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <ERPSectionShell title="Filters" description="All filters run on the full dataset. State is cached in the URL — refresh keeps your filters.">
          <form onSubmit={applyFilters} className="space-y-3">
            {/* Row 1: Search + quick dropdowns */}
            <div className="flex flex-wrap gap-2">
              <label htmlFor="f-setqueryinput-e-target-value-placeholder" className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Search name, code, SKU, description…"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              {/* Item Type — most important new filter */}
              <select
                value={filters.item_type}
                onChange={(e) => changeFilter("item_type", e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All item types</option>
                {catalogOptions.item_type_choices.length > 0
                  ? catalogOptions.item_type_choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                  : (
                    <>
                      <option value="FINISHED_GOOD">Finished Good</option>
                      <option value="RAW_MATERIAL">Raw Material</option>
                      <option value="ACCESSORY">Accessory</option>
                      <option value="SERVICE">Service</option>
                      <option value="ADD_ON">Add-on</option>
                    </>
                  )
                }
              </select>

              {/* Category — select dropdown, not free text */}
              <select
                value={filters.category}
                onChange={(e) => {
                  const next = { ...filters, category: e.target.value, subcategory: "" };
                  setPage(1);
                  setFilters(next);
                  syncUrl(next, 1, pageSize);
                }}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All categories</option>
                {catalogOptions.categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>

              {/* Subcategory — filtered by selected category */}
              <select
                value={filters.subcategory}
                onChange={(e) => changeFilter("subcategory", e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
                disabled={!filters.category || subcategoryOptions.length === 0}
              >
                <option value="">All subcategories</option>
                {subcategoryOptions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>

              <div className="flex gap-2">
                <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition hover:bg-muted ${showAdvanced || filterCount > 0 ? "border-primary text-primary bg-primary/5" : "border-border text-foreground bg-background"}`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters{filterCount > 0 ? ` (${filterCount})` : ""}
                </button>
                {filterCount > 0 && (
                  <button type="button" onClick={resetFilters} className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted">
                    <X className="h-3.5 w-3.5" /> Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Advanced filters (expandable) */}
            {showAdvanced && (
              <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Stock Type</label>
                  <select id="f-setqueryinput-e-target-value-placeholder"
                    value={filters.stock_type}
                    onChange={(e) => changeFilter("stock_type", e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">All</option>
                    {catalogOptions.stock_type_choices.length > 0
                      ? catalogOptions.stock_type_choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                      : (
                        <>
                          <option value="STOCK_ITEM">Stock Item</option>
                          <option value="MADE_TO_ORDER">Made to Order</option>
                          <option value="NON_STOCK">Non-Stock</option>
                        </>
                      )
                    }
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="f-readiness" className="text-xs font-medium text-muted-foreground">Readiness</label>
                  <select id="f-readiness"
                    value={filters.readiness}
                    onChange={(e) => changeFilter("readiness", e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">All</option>
                    <option value="INVENTORY_READY">Inventory Ready</option>
                    <option value="STOCK_PROFILE_PENDING">Stock Profile Pending</option>
                    <option value="NO_IMAGE">No Image</option>
                    <option value="SKU_PENDING">SKU Pending</option>
                    <option value="CATALOG_CLEANUP">Catalog Cleanup</option>
                    <option value="SUBSCRIPTION_READY">Subscription Ready</option>
                    <option value="DIRECT_SALE_READY">Direct Sale Ready</option>
                    <option value="RENT_LEASE_READY">Rent/Lease Ready</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="f-capability" className="text-xs font-medium text-muted-foreground">Capability</label>
                  <select id="f-capability"
                    value={filters.capability}
                    onChange={(e) => changeFilter("capability", e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">All</option>
                    <option value="EMI">EMI</option>
                    <option value="DIRECT_SALE">Direct Sale</option>
                    <option value="RENT">Rent</option>
                    <option value="LEASE">Lease</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="f-active-status" className="text-xs font-medium text-muted-foreground">Active Status</label>
                  <select id="f-active-status"
                    value={filters.active}
                    onChange={(e) => changeFilter("active", e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">All</option>
                    <option value="true">Active only</option>
                    <option value="false">Inactive only</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="f-image" className="text-xs font-medium text-muted-foreground">Image</label>
                  <select id="f-image"
                    value={filters.image_status}
                    onChange={(e) => changeFilter("image_status", e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="">All</option>
                    <option value="AVAILABLE">Has image</option>
                    <option value="NOT_PROVIDED">No image</option>
                  </select>
                </div>
              </div>
            )}
          </form>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <select
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={refreshing || loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              <button
                type="button"
                disabled={!exportRows.length || loading}
                onClick={() => downloadCsv("product-register.csv", [
                  { key: "id", header: "id" }, { key: "name", header: "name" },
                  { key: "product_code", header: "product_code" }, { key: "sku", header: "sku" },
                  { key: "item_type", header: "item_type" }, { key: "stock_type", header: "stock_type" },
                  { key: "unit_of_measure", header: "unit_of_measure" },
                  { key: "category", header: "category" }, { key: "subcategory", header: "subcategory" },
                  { key: "base_price", header: "base_price" },
                  { key: "inventory_ready", header: "inventory_ready" },
                  { key: "image_status", header: "image_status" },
                  { key: "created_at", header: "created_at" },
                ], exportRows)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-foreground px-3 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
            <Link href="/admin/products/masters" className="text-sm text-primary hover:underline">Manage Masters →</Link>
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            Safe edit boundary: product master changes affect future onboarding only. Existing contracts keep saved pricing.
          </div>
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading product register…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load product register" description={error} onRetry={() => void loadPage("initial")} /> : null}

        {!loading && !error ? (
          <ERPSectionShell title="Product rows" description={`${rangeText}. Click any row to open detail.`}>
            {/* Pagination */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <span>{rangeText}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!payload.has_previous || page <= 1}
                  onClick={() => changePage(Math.max(page - 1, 1))}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50 hover:bg-muted"
                >
                  Previous
                </button>
                <span className="px-2">Page {payload.page} of {payload.num_pages || 1}</span>
                <button
                  type="button"
                  disabled={!payload.has_next}
                  onClick={() => changePage(page + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50 hover:bg-muted"
                >
                  Next
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <ERPEmptyState
                title="No products found"
                description="No records matched the current filters."
                action={<Link href="/admin/products/create" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95">Create Product</Link>}
              />
            ) : (
              <DataTableShell>
                <DataTable<ProductRecord>
                  rows={rows}
                  columns={columns}
                  onRowClick={(row) => router.push(`/admin/products/${row.id}`)}
                  rowActions={(row) => <ProductQuickActions product={row} onChanged={() => loadPage("refresh")} />}
                />
              </DataTableShell>
            )}
          </ERPSectionShell>
        ) : null}
        </>}
      </div>
    </ERPPageShell>
  );
}
