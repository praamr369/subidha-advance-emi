"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, RefreshCw, Search, SlidersHorizontal, X, Layers, ExternalLink } from "lucide-react";
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

function PimPanel() {
  const [pimProducts, setPimProducts] = useState<PimProduct[]>([]);
  const [pimCategories, setPimCategories] = useState<PimCategory[]>([]);
  const [pimLoading, setPimLoading] = useState(true);
  const [pimSearch, setPimSearch] = useState("");
  const [pimCat, setPimCat] = useState<number | "">("");

  useEffect(() => {
    Promise.all([
      pimService.getProducts({ search: pimSearch || undefined, category: pimCat || undefined }),
      pimService.getCategories(),
    ]).then(([prods, cats]) => {
      setPimProducts(Array.isArray(prods) ? prods : []);
      setPimCategories(Array.isArray(cats) ? cats : []);
    }).catch(() => {}).finally(() => setPimLoading(false));
  }, [pimSearch, pimCat]);

  return (
    <div className="space-y-4">
      {/* PIM header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Enterprise PIM — category-specific attributes, SKU variants, dynamic specs.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/pim/products/create" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Layers className="h-4 w-4" /> New PIM Product
          </Link>
          <Link href="/admin/pim/categories" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
            Categories
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

      {/* PIM product table */}
      <div className="rounded-xl border overflow-x-auto">
        {pimLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading PIM products…</div>
        ) : pimProducts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No PIM products found.{" "}
            <Link href="/admin/pim/products/create" className="text-primary underline">Create one →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">SKUs</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pimProducts.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.code}</td>
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.category_name}{p.subcategory_name ? ` / ${p.subcategory_name}` : ""}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatRupee(Number(p.base_price))}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">{p.variant_count ?? 0}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {p.is_published
                      ? <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Published</span>
                      : <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Draft</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Link href={`/admin/pim/products/${p.id}/edit`} className="inline-flex items-center gap-1 text-primary text-xs hover:underline font-medium">
                      Edit <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
        <strong>PIM products</strong> support dynamic category attributes (bed size/material, fridge liters, AC tons, etc.) and per-SKU variants.
        Subscription products above are used for EMI/Rent/Lease billing. Both systems can coexist for the same physical product.
      </div>
    </div>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"subscription" | "pim">("subscription");

  const [payload, setPayload] = useState<ProductRegisterPage>(() => emptyPage());
  const [catalogOptions, setCatalogOptions] = useState<ProductCatalogOptions>(() => emptyCatalogOptions());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
  }, [filters, page, pageSize]);

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
        <div className="space-y-1.5 min-w-[180px]">
          <div className="font-medium text-foreground leading-tight">{row.name}</div>
          <div className="text-xs text-muted-foreground">{row.product_code ?? `#${row.id}`} {row.sku ? `· SKU ${row.sku}` : "· SKU pending"}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <ItemTypeBadge value={row.item_type} />
            <StockTypeBadge value={row.stock_type} />
          </div>
          <div className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
        </div>
      ),
    },
    {
      key: "category",
      title: "Catalog",
      render: (row) => (
        <div className="space-y-1 min-w-[130px]">
          <div className="text-sm font-medium text-foreground">{label(row.category || row.category_master_name, "Uncategorized")}</div>
          <div className="text-xs text-muted-foreground">{label(row.subcategory || row.subcategory_master_name, "No subcategory")}</div>
          <div className="text-xs text-muted-foreground">{row.unit_of_measure || "PCS"}</div>
        </div>
      ),
    },
    {
      key: "description",
      title: "Description",
      render: (row) => <div className="max-w-xs text-xs text-muted-foreground">{truncate(row.description)}</div>,
    },
    {
      key: "base_price",
      title: "Price",
      align: "right",
      sortable: true,
      sortAccessor: (row) => Number(row.base_price || 0),
      render: (row) => (
        <div className="text-right space-y-0.5">
          <div className="font-semibold text-foreground">{formatRupee(row.base_price)}</div>
          {row.hsn_sac_code ? <div className="text-xs text-muted-foreground">HSN {row.hsn_sac_code}</div> : null}
          {row.gst_rate != null ? <div className="text-xs text-muted-foreground">GST {row.gst_rate}%</div> : null}
        </div>
      ),
    },
    {
      key: "capabilities",
      title: "Modes",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5 min-w-[120px]">
          <ERPStatusBadge status={row.is_emi_enabled !== false ? "AVAILABLE" : "PENDING"} label="EMI" />
          <ERPStatusBadge status={row.is_direct_sale_enabled !== false ? "AVAILABLE" : "PENDING"} label="Direct" />
          <ERPStatusBadge status={row.is_rent_enabled ? "AVAILABLE" : "PENDING"} label="Rent" />
          <ERPStatusBadge status={row.is_lease_enabled ? "AVAILABLE" : "PENDING"} label="Lease" />
        </div>
      ),
    },
    {
      key: "readiness",
      title: "Readiness",
      render: (row) => (
        <div className="flex flex-wrap gap-1.5 min-w-[160px]">
          <ERPStatusBadge status={row.inventory_ready ? "AVAILABLE" : "PENDING"} label={row.inventory_ready ? "Inventory ✓" : "Stock pending"} />
          <ERPStatusBadge status={row.image ? "AVAILABLE" : "NOT_PROVIDED"} label={row.image ? "Image ✓" : "No image"} />
          <ERPStatusBadge status={row.sku ? "AVAILABLE" : "PENDING"} label={row.sku ? "SKU ✓" : "SKU pending"} />
        </div>
      ),
    },
  ], []);

  const rangeText = payload.count ? `${payload.range_start}–${payload.range_end} of ${payload.count}` : "0 products";
  const filterCount = activeFilterCount(filters);

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Product Register"
      subtitle="Product operations register — finished goods, raw materials, accessories, services and add-ons. Filters are cached in the URL and survive page refresh."
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
          { label: "Subscription ready", value: summary.subscription_ready, detail: "EMI eligible" },
          { label: "Direct sale ready", value: summary.direct_sale_ready, detail: "Direct billing eligible" },
          { label: "Image missing", value: summary.image_missing, detail: "Catalog cleanup needed" },
        ]} />

        {/* Tab switcher — Subscription Products vs PIM Products */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("subscription")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === "subscription" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Subscription Products
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pim")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === "pim" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Layers className="h-4 w-4" /> PIM Products
          </button>
        </div>

        {/* PIM panel */}
        {activeTab === "pim" && <PimPanel />}

        {/* Subscription products section */}
        {activeTab === "subscription" && <>
        <ERPSectionShell title="Filters" description="All filters run on the full dataset. State is cached in the URL — refresh keeps your filters.">
          <form onSubmit={applyFilters} className="space-y-3">
            {/* Row 1: Search + quick dropdowns */}
            <div className="flex flex-wrap gap-2">
              <label className="relative flex-1 min-w-[200px]">
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
                  <select
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
                  <label className="text-xs font-medium text-muted-foreground">Readiness</label>
                  <select
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
                  <label className="text-xs font-medium text-muted-foreground">Capability</label>
                  <select
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
                  <label className="text-xs font-medium text-muted-foreground">Active Status</label>
                  <select
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
                  <label className="text-xs font-medium text-muted-foreground">Image</label>
                  <select
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
